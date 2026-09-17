-- Additive only: same signature as 032, one new side effect.
-- Placing an order for a customer used to leave next_call_date/last_contact_date untouched, so the
-- customer stayed in the dashboard's "scheduled calls" count and the rep's /sales call queue even
-- after she'd already been ordered for and doesn't need a follow-up call today. Clearing
-- next_call_date and stamping last_contact_date is the same signal business_call_log_create already
-- uses to drop a lead out of both places (app/page.tsx's business_dashboard_summary and
-- app/sales/page.tsx's repQueue), so no new column or query change is needed anywhere else.
BEGIN;

CREATE OR REPLACE FUNCTION public.business_create_order(p_actor text,p_key uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE old_request business_requests; customer_uuid uuid; order_uuid uuid := gen_random_uuid();
  item jsonb; total numeric; order_state order_status_enum; result jsonb; priced_total numeric := 0;
  all_priced boolean := true; item_product_id uuid; item_qty int; inv inventory;
  owner_id text := coalesce(nullif(trim(p_data->>'owner_account_id'),''),p_actor);
  phone_core text; matches uuid[];
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
   IF p_data->>'reuse_phone'='true' THEN
     phone_core := regexp_replace(regexp_replace(p_data->>'customer_phone','[^0-9]','','g'),'^(00962|962|0)','');
     IF length(phone_core)>=7 THEN
       SELECT array_agg(c.id) INTO matches FROM customers c
       WHERE regexp_replace(regexp_replace(coalesce(c.phone,''),'[^0-9]','','g'),'^(00962|962|0)','')=phone_core
         AND (p_data->>'scope_rep' IS NULL OR c.rep_name_raw=p_data->>'scope_rep');
       IF coalesce(array_length(matches,1),0)=1 THEN customer_uuid := matches[1]; END IF;
     END IF;
   END IF;
   IF customer_uuid IS NULL THEN
     INSERT INTO customers(name,phone,city,address,rep_name_raw)
     VALUES(p_data->>'customer_name',p_data->>'customer_phone',p_data->>'city',p_data->>'address',p_data->>'rep_name')
     RETURNING id INTO customer_uuid;
   END IF;
 END IF;
 -- An order means this lead has been worked: drop her from the call queue and dashboard count.
 UPDATE customers SET last_contact_date=business_amman_today(), next_call_date=NULL, updated_at=now()
 WHERE id=customer_uuid;
 INSERT INTO orders(id,order_number,customer_id,owner_account_id,source,status,subtotal,total_amount,
   payment_method,delivery_address,delivery_city,notes,raw_whatsapp_text,order_date,business_details)
 VALUES(order_uuid,'BET-'||order_uuid::text,customer_uuid,owner_id,coalesce(p_data->>'source','manual'),order_state,total,total,
   (p_data->>'payment_method')::payment_method_enum,p_data->>'address',p_data->>'city',p_data->>'installment_notes',
   p_data->>'raw_whatsapp_text',coalesce((p_data->>'order_date')::date,business_amman_today()),p_data);
 FOR item IN SELECT * FROM jsonb_array_elements(p_data->'items') LOOP
   IF coalesce(length(trim(item->>'name')),0)=0 OR (item->>'qty')::numeric<=0
     OR (item->>'qty')::numeric<>trunc((item->>'qty')::numeric) OR (item->>'qty') IS NULL
     OR (item->>'qty')::numeric>100000 OR (item->>'price')::numeric>=10000000
     OR (item->>'price')::numeric<0 OR (item->>'price')::numeric<>round((item->>'price')::numeric,3)
     THEN RAISE EXCEPTION 'INVALID_ITEMS'; END IF;
   all_priced := all_priced AND (item->>'price' IS NOT NULL);
   priced_total := priced_total + coalesce((item->>'price')::numeric,0)*(item->>'qty')::integer;
   IF priced_total>total THEN RAISE EXCEPTION 'TOTAL_MISMATCH'; END IF;
   item_qty := (item->>'qty')::integer;
   item_product_id := business_resolve_product(item->>'name');
   INSERT INTO order_items(order_id,product_id,product_name_raw,quantity,unit_price,total_price,price_is_known)
   VALUES(order_uuid,item_product_id,item->>'name',item_qty,coalesce((item->>'price')::numeric,0),
     coalesce((item->>'price')::numeric,0)*item_qty,item->>'price' IS NOT NULL);
   IF item_product_id IS NOT NULL AND order_state='confirmed' THEN
     INSERT INTO inventory(product_id,quantity_on_hand) VALUES(item_product_id,0) ON CONFLICT (product_id) DO NOTHING;
     SELECT * INTO inv FROM inventory WHERE product_id=item_product_id FOR UPDATE;
     IF inv.quantity_on_hand-item_qty<0 THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK'; END IF;
     UPDATE inventory SET quantity_on_hand=quantity_on_hand-item_qty, updated_at=now() WHERE product_id=item_product_id;
     INSERT INTO inventory_movements(product_id,movement_type,quantity,reference_type,reference_id)
     VALUES(item_product_id,'sale_out',-item_qty,'order',order_uuid);
   END IF;
 END LOOP;
 IF all_priced AND priced_total<>total THEN RAISE EXCEPTION 'TOTAL_MISMATCH'; END IF;
 INSERT INTO invoices(invoice_number,order_id,customer_id,subtotal,total_amount,due_date)
 VALUES('INV-'||order_uuid::text,order_uuid,customer_uuid,total,total,
   coalesce((p_data->>'due_date')::date,(p_data->>'order_date')::date,business_amman_today()));
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id)
 VALUES('order',p_actor,p_key,p_data,order_uuid);
 result := business_order_document(order_uuid);
 RETURN jsonb_build_object('order',result,'replayed',false);
END $$;

COMMIT;
