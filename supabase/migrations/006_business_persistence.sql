-- Additive only: no backfill, deletion, or changes to existing RLS/policies.
BEGIN;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS owner_account_id text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS business_details jsonb NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_orders_owner_account ON public.orders(owner_account_id);
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS price_is_known boolean NOT NULL DEFAULT true;
CREATE TABLE public.business_requests (
  operation text NOT NULL, actor_id text NOT NULL, request_key uuid NOT NULL,
  payload jsonb NOT NULL, result_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operation, actor_id, request_key)
);
ALTER TABLE public.business_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.business_requests TO service_role;

-- Private projections preserve legacy rows and keep money in NUMERIC, not floats.
CREATE FUNCTION public.business_order_document(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT jsonb_build_object(
   'id',o.order_number,'db_id',o.id,'status',o.status,'order_date',o.order_date,
   'customer_name',coalesce(o.business_details->>'customer_name',c.name),
   'customer_phone',coalesce(o.business_details->>'customer_phone',c.phone),
   'city',coalesce(o.delivery_city,c.city,''),'address',coalesce(o.delivery_address,c.address,''),
   'rep_name',coalesce(o.business_details->>'rep_name',c.rep_name_raw,''),
   'source',o.source,'payment_method',o.payment_method,'total_amount',o.total_amount,
   'items_summary',coalesce(o.business_details->>'items_summary',
      (SELECT string_agg(quantity::text || ' × ' || product_name_raw, ' + ') FROM order_items WHERE order_id=o.id),''),
   'installment_notes',o.notes,
   'items',coalesce((SELECT jsonb_agg(jsonb_build_object('name',product_name_raw,'qty',quantity,
      'price',CASE WHEN price_is_known THEN unit_price ELSE NULL END,
      'total',CASE WHEN price_is_known THEN total_price ELSE NULL END) ORDER BY created_at,id)
      FROM order_items WHERE order_id=o.id),'[]'::jsonb),
   'invoice_number',i.invoice_number,'invoice_total',i.total_amount,'invoice_subtotal',i.subtotal,
   'invoice_discount',i.discount_amount,'issued_date',i.issued_at::date,'due_date',i.due_date,
   'paid_amount',coalesce((SELECT sum(amount) FROM payments WHERE invoice_id=i.id),0),
   'collectible',o.status NOT IN ('draft','cancelled','returned'),
   'updated_at',o.updated_at
 ) FROM orders o JOIN customers c ON c.id=o.customer_id
 LEFT JOIN invoices i ON i.order_id=o.id WHERE o.id=p_id
$$;

CREATE FUNCTION public.business_list(p_scope text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(business_order_document(id) ORDER BY order_date DESC,created_at DESC,id),'[]'::jsonb)
 FROM orders WHERE p_scope IS NULL OR owner_account_id=p_scope
$$;

CREATE FUNCTION public.business_create_order(p_actor text,p_key uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE old_request business_requests; customer_uuid uuid; order_uuid uuid := gen_random_uuid();
  item jsonb; total numeric; order_state order_status_enum; result jsonb; priced_total numeric := 0;
  all_priced boolean := true;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('order:'||p_actor||':'||p_key::text,0));
 SELECT * INTO old_request FROM business_requests WHERE operation='order' AND actor_id=p_actor AND request_key=p_key;
 IF FOUND THEN
   IF old_request.payload<>p_data THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   RETURN jsonb_build_object('order',business_order_document(old_request.result_id),'replayed',true);
 END IF;
 IF coalesce(length(trim(p_actor)),0)=0 OR coalesce(length(trim(p_data->>'customer_name')),0)=0
   OR coalesce(length(trim(p_data->>'customer_phone')),0)=0 THEN RAISE EXCEPTION 'INVALID_ORDER'; END IF;
 total := (p_data->>'total_amount')::numeric;
 IF total IS NULL OR total<=0 OR total>=10000000 OR total<>round(total,3) THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
 order_state := coalesce(p_data->>'status','confirmed')::order_status_enum;
 IF order_state NOT IN ('draft','confirmed') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
 IF jsonb_typeof(p_data->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'items')=0
   OR jsonb_array_length(p_data->'items')>200 THEN RAISE EXCEPTION 'INVALID_ITEMS'; END IF;
 -- Reuse a customer only when an explicit ID is provided. Never merge people by phone.
 IF p_data->>'customer_id' IS NOT NULL THEN
   SELECT id INTO customer_uuid FROM customers WHERE id=(p_data->>'customer_id')::uuid;
   IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
 ELSE
   INSERT INTO customers(name,phone,city,address,rep_name_raw)
   VALUES(p_data->>'customer_name',p_data->>'customer_phone',p_data->>'city',p_data->>'address',p_data->>'rep_name')
   RETURNING id INTO customer_uuid;
 END IF;
 INSERT INTO orders(id,order_number,customer_id,owner_account_id,source,status,subtotal,total_amount,
   payment_method,delivery_address,delivery_city,notes,raw_whatsapp_text,order_date,business_details)
 VALUES(order_uuid,'BET-'||order_uuid::text,customer_uuid,p_actor,coalesce(p_data->>'source','manual'),order_state,total,total,
   (p_data->>'payment_method')::payment_method_enum,p_data->>'address',p_data->>'city',p_data->>'installment_notes',
   p_data->>'raw_whatsapp_text',coalesce((p_data->>'order_date')::date,current_date),p_data);
 FOR item IN SELECT * FROM jsonb_array_elements(p_data->'items') LOOP
   IF coalesce(length(trim(item->>'name')),0)=0 OR (item->>'qty')::numeric<=0
     OR (item->>'qty')::numeric<>trunc((item->>'qty')::numeric) OR (item->>'qty') IS NULL
     OR (item->>'qty')::numeric>100000 OR (item->>'price')::numeric>=10000000
     OR (item->>'price')::numeric<0 OR (item->>'price')::numeric<>round((item->>'price')::numeric,3)
     THEN RAISE EXCEPTION 'INVALID_ITEMS'; END IF;
   all_priced := all_priced AND (item->>'price' IS NOT NULL);
   priced_total := priced_total + coalesce((item->>'price')::numeric,0)*(item->>'qty')::integer;
   IF priced_total>total THEN RAISE EXCEPTION 'TOTAL_MISMATCH'; END IF;
   INSERT INTO order_items(order_id,product_name_raw,quantity,unit_price,total_price,price_is_known)
   VALUES(order_uuid,item->>'name',(item->>'qty')::integer,coalesce((item->>'price')::numeric,0),
     coalesce((item->>'price')::numeric,0)*(item->>'qty')::integer,item->>'price' IS NOT NULL);
 END LOOP;
 IF all_priced AND priced_total<>total THEN RAISE EXCEPTION 'TOTAL_MISMATCH'; END IF;
 INSERT INTO invoices(invoice_number,order_id,customer_id,subtotal,total_amount,due_date)
 VALUES('INV-'||order_uuid::text,order_uuid,customer_uuid,total,total,
   coalesce((p_data->>'due_date')::date,(p_data->>'order_date')::date,current_date));
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id)
 VALUES('order',p_actor,p_key,p_data,order_uuid);
 result := business_order_document(order_uuid);
 RETURN jsonb_build_object('order',result,'replayed',false);
END $$;

CREATE FUNCTION public.business_collect(p_actor text,p_key uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE old_request business_requests; inv invoices; ord orders; paid numeric; amount_in numeric;
  receipt_id uuid := gen_random_uuid(); method payment_method_enum; reference_in text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('payment:'||p_actor||':'||p_key::text,0));
 SELECT * INTO old_request FROM business_requests WHERE operation='payment' AND actor_id=p_actor AND request_key=p_key;
 IF FOUND THEN
   IF old_request.payload<>p_data THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   SELECT i.* INTO inv FROM invoices i JOIN payments p ON p.invoice_id=i.id WHERE p.id=old_request.result_id;
   RETURN jsonb_build_object('order',business_order_document(inv.order_id),'payment_id',old_request.result_id,'replayed',true);
 END IF;
 SELECT * INTO inv FROM invoices WHERE invoice_number=p_data->>'invoice_id';
 IF NOT FOUND THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND'; END IF;
 -- Lock order then invoice everywhere: collections and status changes serialize.
 SELECT * INTO ord FROM orders WHERE id=inv.order_id FOR UPDATE;
 SELECT * INTO inv FROM invoices WHERE id=inv.id FOR UPDATE;
 IF ord.status IN ('draft','cancelled','returned') THEN RAISE EXCEPTION 'ORDER_NOT_COLLECTIBLE'; END IF;
 amount_in := (p_data->>'amount')::numeric;
 IF amount_in IS NULL OR amount_in<=0 OR amount_in>=10000000 OR amount_in<>round(amount_in,3)
 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
 method := (p_data->>'payment_method')::payment_method_enum;
 IF method IS NULL OR method NOT IN ('cash','cash_on_delivery','cliq','zain_cash','bank_transfer') THEN RAISE EXCEPTION 'INVALID_METHOD'; END IF;
 reference_in := nullif(lower(trim(p_data->>'reference_number')),'');
 IF method IN ('cliq','zain_cash','bank_transfer') AND reference_in IS NULL THEN RAISE EXCEPTION 'REFERENCE_REQUIRED'; END IF;
 IF reference_in IS NOT NULL THEN
   PERFORM pg_advisory_xact_lock(hashtextextended('reference:'||method::text||':'||reference_in,0));
   IF EXISTS(SELECT 1 FROM payments WHERE payment_method=method AND lower(trim(reference_number))=reference_in)
     THEN RAISE EXCEPTION 'DUPLICATE_REFERENCE'; END IF;
 END IF;
 SELECT coalesce(sum(amount),0) INTO paid FROM payments WHERE invoice_id=inv.id;
 IF amount_in>inv.total_amount-paid THEN RAISE EXCEPTION 'OVERPAYMENT'; END IF;
 INSERT INTO payments(id,invoice_id,amount,payment_method,reference_number,notes)
 VALUES(receipt_id,inv.id,amount_in,method,reference_in,p_data->>'notes');
 UPDATE invoices SET status=CASE WHEN paid+amount_in=total_amount THEN 'paid'::payment_status_enum ELSE 'partial'::payment_status_enum END WHERE id=inv.id;
 UPDATE orders SET payment_status=CASE WHEN paid+amount_in=inv.total_amount THEN 'paid'::payment_status_enum ELSE 'partial'::payment_status_enum END WHERE id=ord.id;
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id)
 VALUES('payment',p_actor,p_key,p_data,receipt_id);
 RETURN jsonb_build_object('order',business_order_document(ord.id),'payment_id',receipt_id,'replayed',false);
END $$;

CREATE FUNCTION public.business_status(p_actor text,p_scope text,p_key uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE ord orders; old_request business_requests; next_state text := p_data->>'status';
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('status:'||p_actor||':'||p_key::text,0));
 SELECT * INTO old_request FROM business_requests WHERE operation='status' AND actor_id=p_actor AND request_key=p_key;
 IF FOUND THEN
   IF old_request.payload<>p_data THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   RETURN jsonb_build_object('order',business_order_document(old_request.result_id),'replayed',true);
 END IF;
 SELECT * INTO ord FROM orders WHERE order_number=p_data->>'id' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
 IF p_scope IS NOT NULL AND ord.owner_account_id IS DISTINCT FROM p_scope THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF ord.status::text IS DISTINCT FROM p_data->>'expected_status' THEN RAISE EXCEPTION 'STALE_ORDER'; END IF;
 IF NOT ((ord.status='draft' AND next_state='confirmed') OR (ord.status='confirmed' AND next_state='processing')
  OR (ord.status='processing' AND next_state='shipped') OR (ord.status='shipped' AND next_state IN ('delivered','returned')))
  OR next_state IS NULL THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
 UPDATE orders SET status=next_state::order_status_enum WHERE id=ord.id;
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id)
 VALUES('status',p_actor,p_key,p_data,ord.id);
 RETURN jsonb_build_object('order',business_order_document(ord.id),'replayed',false);
END $$;

-- Only the existing server identity can call these RPCs; never expose the service key.
REVOKE ALL ON FUNCTION public.business_order_document(uuid),public.business_list(text),
 public.business_create_order(text,uuid,jsonb),public.business_collect(text,uuid,jsonb),
 public.business_status(text,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_order_document(uuid),public.business_list(text),
 public.business_create_order(text,uuid,jsonb),public.business_collect(text,uuid,jsonb),
 public.business_status(text,text,uuid,jsonb) TO service_role;
COMMIT;
