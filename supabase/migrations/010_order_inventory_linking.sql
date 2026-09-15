-- Additive only: no backfill, deletion, or changes to existing RLS/policies.
-- Links order fulfillment to real stock: resolves each order item's product
-- (when unambiguous), and posts sale_out/return_in inventory_movements at the
-- moment an order actually becomes a committed sale or is returned, instead of
-- leaving order_items.product_id permanently null and inventory untouched.
-- CREATE OR REPLACE extends the 006 functions' bodies in place; every existing
-- validation/error path is preserved unchanged, only inventory linkage is added.
BEGIN;

-- Exact match (sku/name) first; otherwise a single unambiguous partial-name
-- match. Multiple candidates or no candidates both resolve to NULL — callers
-- must never guess wrong, since a wrong guess would misreport real stock.
CREATE FUNCTION public.business_resolve_product(p_name text) RETURNS uuid
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE clean text := trim(coalesce(p_name,'')); found_id uuid; match_count int;
BEGIN
 IF length(clean)<2 THEN RETURN NULL; END IF;
 SELECT id INTO found_id FROM products
   WHERE is_active AND (sku=clean OR lower(name_ar)=lower(clean) OR lower(name_en)=lower(clean)) LIMIT 1;
 IF FOUND THEN RETURN found_id; END IF;
 IF length(clean)<4 THEN RETURN NULL; END IF;
 SELECT count(*),(array_agg(id))[1] INTO match_count,found_id FROM products
   WHERE is_active AND (name_ar ILIKE '%'||clean||'%' OR clean ILIKE '%'||name_ar||'%' OR name_en ILIKE '%'||clean||'%');
 IF match_count=1 THEN RETURN found_id; END IF;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.business_create_order(p_actor text,p_key uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE old_request business_requests; customer_uuid uuid; order_uuid uuid := gen_random_uuid();
  item jsonb; total numeric; order_state order_status_enum; result jsonb; priced_total numeric := 0;
  all_priced boolean := true; item_product_id uuid; item_qty int; inv inventory;
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
   coalesce((p_data->>'due_date')::date,(p_data->>'order_date')::date,current_date));
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id)
 VALUES('order',p_actor,p_key,p_data,order_uuid);
 result := business_order_document(order_uuid);
 RETURN jsonb_build_object('order',result,'replayed',false);
END $$;

CREATE OR REPLACE FUNCTION public.business_status(p_actor text,p_scope text,p_key uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE ord orders; old_request business_requests; next_state text := p_data->>'status'; oi order_items; inv inventory;
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
 IF ord.status='draft' AND next_state='confirmed' THEN
   FOR oi IN SELECT * FROM order_items WHERE order_id=ord.id AND product_id IS NOT NULL LOOP
     INSERT INTO inventory(product_id,quantity_on_hand) VALUES(oi.product_id,0) ON CONFLICT (product_id) DO NOTHING;
     SELECT * INTO inv FROM inventory WHERE product_id=oi.product_id FOR UPDATE;
     IF inv.quantity_on_hand-oi.quantity<0 THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK'; END IF;
     UPDATE inventory SET quantity_on_hand=quantity_on_hand-oi.quantity, updated_at=now() WHERE product_id=oi.product_id;
     INSERT INTO inventory_movements(product_id,movement_type,quantity,reference_type,reference_id)
     VALUES(oi.product_id,'sale_out',-oi.quantity,'order',ord.id);
   END LOOP;
 ELSIF ord.status='shipped' AND next_state='returned' THEN
   FOR oi IN SELECT * FROM order_items WHERE order_id=ord.id AND product_id IS NOT NULL LOOP
     UPDATE inventory SET quantity_on_hand=quantity_on_hand+oi.quantity, updated_at=now() WHERE product_id=oi.product_id;
     INSERT INTO inventory_movements(product_id,movement_type,quantity,reference_type,reference_id)
     VALUES(oi.product_id,'return_in',oi.quantity,'order',ord.id);
   END LOOP;
 END IF;
 UPDATE orders SET status=next_state::order_status_enum WHERE id=ord.id;
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id)
 VALUES('status',p_actor,p_key,p_data,ord.id);
 RETURN jsonb_build_object('order',business_order_document(ord.id),'replayed',false);
END $$;

-- Only the existing server identity can call these RPCs; never expose the service key.
REVOKE ALL ON FUNCTION public.business_resolve_product(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_resolve_product(text) TO service_role;
COMMIT;
