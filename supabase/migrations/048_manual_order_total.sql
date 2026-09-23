-- The order total can be typed by hand.
--
-- Until now "إجمالي الطلبية المستحق" was always the sum of the lines at catalogue (or promo) price,
-- and business_create_order refused anything else (TOTAL_MISMATCH). The owner's decision
-- (2026-09-23): the rep may set the total she agreed with the customer and answers for it; once the
-- order is placed only admin and رشا change it (orders.edit, lib/permissions.ts).
--
-- The lines always keep their real prices, so stock value, best sellers and the picking list do not
-- move. The difference is recorded where the invoice already shows one:
--   total below the lines -> orders/invoices.discount_amount = lines - total, subtotal = lines;
--   total above the lines -> subtotal = total, no discount.
--
-- Replaces two bodies, each carried forward verbatim apart from the marked changes:
--   * business_create_order (038, the newest) — p_data.total_override = true skips TOTAL_MISMATCH.
--     Without the flag nothing changes, so the WhatsApp path and every other caller behave as before.
--   * business_order_update (042, the newest) — p_data.total_amount sets the total; refused once
--     the order has payments (HAS_PAYMENTS), like an item change.
--
-- ORDERING: apply after 038 and 042 (and after 047, which does not touch either function).
BEGIN;

CREATE OR REPLACE FUNCTION public.business_create_order(p_actor text,p_key uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE old_request business_requests; customer_uuid uuid; order_uuid uuid := gen_random_uuid();
  item jsonb; total numeric; order_state order_status_enum; result jsonb; priced_total numeric := 0;
  all_priced boolean := true; item_product_id uuid; item_qty int;
  owner_id text := coalesce(nullif(trim(p_data->>'owner_account_id'),''),p_actor);
  phone_core text; matches uuid[];
  manual boolean := coalesce(p_data->>'total_override','')='true';
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
 IF total IS NULL OR total<0 OR total>=10000000 OR total<>round(total,3) THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
 -- A samples-only order is genuinely worth nothing, so zero is allowed when a promo says so.
 IF total=0 AND coalesce(length(trim(p_data->>'promo_code')),0)=0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
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
   IF priced_total>total AND NOT manual THEN RAISE EXCEPTION 'TOTAL_MISMATCH'; END IF;
   item_qty := (item->>'qty')::integer;
   item_product_id := business_resolve_product(item->>'name');
   INSERT INTO order_items(order_id,product_id,product_name_raw,quantity,unit_price,total_price,price_is_known)
   VALUES(order_uuid,item_product_id,item->>'name',item_qty,coalesce((item->>'price')::numeric,0),
     coalesce((item->>'price')::numeric,0)*item_qty,item->>'price' IS NOT NULL);
   IF item_product_id IS NOT NULL AND order_state='confirmed' THEN
     PERFORM business_apply_item_stock(order_uuid,item_product_id,item_qty);
   END IF;
 END LOOP;
 IF all_priced AND priced_total<>total AND NOT manual THEN RAISE EXCEPTION 'TOTAL_MISMATCH'; END IF;
 -- A total typed by hand: the lines keep their prices, and what the customer is let off shows as
 -- a discount. A total above the lines is simply the amount due (a fee, a rounding up).
 IF manual THEN
   UPDATE orders SET subtotal=greatest(priced_total,total),discount_amount=greatest(priced_total-total,0) WHERE id=order_uuid;
 END IF;
 IF coalesce(length(trim(p_data->>'promo_code')),0)>0 THEN
   PERFORM business_promo_apply(p_actor,order_uuid,customer_uuid,p_data->>'promo_code',p_data->>'rep_name');
 END IF;
 INSERT INTO invoices(invoice_number,order_id,customer_id,subtotal,discount_amount,total_amount,due_date)
 VALUES('INV-'||order_uuid::text,order_uuid,customer_uuid,
   CASE WHEN manual THEN greatest(priced_total,total) ELSE total END,
   CASE WHEN manual THEN greatest(priced_total-total,0) ELSE 0 END,total,
   coalesce((p_data->>'due_date')::date,(p_data->>'order_date')::date,business_amman_today()));
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id)
 VALUES('order',p_actor,p_key,p_data,order_uuid);
 result := business_order_document(order_uuid);
 RETURN jsonb_build_object('order',result,'replayed',false);
END $$;

CREATE OR REPLACE FUNCTION public.business_order_update(p_actor text,p_scope text,p_key uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE old_request business_requests; ord orders; before_snap jsonb; after_snap jsonb; diff jsonb;
  item jsonb; item_qty int; item_product_id uuid; new_total numeric; details jsonb; mv record;
  already_paid numeric; manual_total numeric;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('order-edit:'||p_actor||':'||p_key::text,0));
 SELECT * INTO old_request FROM business_requests WHERE operation='order_edit' AND actor_id=p_actor AND request_key=p_key;
 IF FOUND THEN
   IF old_request.payload<>p_data THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   RETURN jsonb_build_object('order',business_order_document(old_request.result_id),'replayed',true);
 END IF;
 IF coalesce(length(trim(p_actor)),0)=0 THEN RAISE EXCEPTION 'INVALID_ACTOR'; END IF;
 SELECT * INTO ord FROM orders WHERE order_number=p_data->>'id' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
 IF p_scope IS NOT NULL AND ord.owner_account_id IS DISTINCT FROM p_scope THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF ord.status NOT IN ('draft','confirmed') THEN RAISE EXCEPTION 'ORDER_LOCKED'; END IF;
 SELECT coalesce(sum(p.amount),0) INTO already_paid FROM payments p JOIN invoices i ON i.id=p.invoice_id WHERE i.order_id=ord.id;
 IF already_paid>0 AND p_data ? 'items' THEN RAISE EXCEPTION 'HAS_PAYMENTS'; END IF;

 before_snap := jsonb_build_object('city',coalesce(ord.delivery_city,''),'address',coalesce(ord.delivery_address,''),
   'notes',coalesce(ord.notes,''),'customer_name',coalesce(ord.business_details->>'customer_name',''),
   'customer_phone',coalesce(ord.business_details->>'customer_phone',''),'total_amount',ord.total_amount,
   'items_summary',coalesce(ord.business_details->>'items_summary',
     (SELECT string_agg(quantity::text||' × '||product_name_raw,' + ') FROM order_items WHERE order_id=ord.id),''));

 details := ord.business_details;
 IF p_data ? 'customer_name' THEN details := details || jsonb_build_object('customer_name',nullif(trim(p_data->>'customer_name'),'')); END IF;
 IF p_data ? 'customer_phone' THEN details := details || jsonb_build_object('customer_phone',nullif(trim(p_data->>'customer_phone'),'')); END IF;

 new_total := ord.total_amount;
 IF p_data ? 'items' THEN
   IF jsonb_typeof(p_data->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'items')=0
     OR jsonb_array_length(p_data->'items')>200 THEN RAISE EXCEPTION 'INVALID_ITEMS'; END IF;
   -- Reverse whatever stock this order already deducted (draft never deducted anything).
   IF ord.status IN ('confirmed','processing') THEN
     FOR mv IN SELECT m.product_id,-sum(m.quantity)::int AS qty FROM inventory_movements m
       WHERE m.reference_type='order' AND m.reference_id=ord.id GROUP BY m.product_id HAVING -sum(m.quantity)>0 LOOP
       UPDATE inventory SET quantity_on_hand=quantity_on_hand+mv.qty, updated_at=now() WHERE product_id=mv.product_id;
       INSERT INTO inventory_movements(product_id,movement_type,quantity,reference_type,reference_id)
       VALUES(mv.product_id,'return_in',mv.qty,'order',ord.id);
     END LOOP;
   END IF;
   DELETE FROM order_items WHERE order_id=ord.id;
   new_total := 0;
   FOR item IN SELECT * FROM jsonb_array_elements(p_data->'items') LOOP
     IF coalesce(length(trim(item->>'name')),0)=0 OR (item->>'qty')::numeric<=0
       OR (item->>'qty')::numeric<>trunc((item->>'qty')::numeric) OR (item->>'qty') IS NULL
       OR (item->>'qty')::numeric>100000 OR (item->>'price')::numeric<0
       OR (item->>'price')::numeric>=10000000 THEN RAISE EXCEPTION 'INVALID_ITEMS'; END IF;
     item_qty := (item->>'qty')::integer;
     new_total := new_total + coalesce((item->>'price')::numeric,0)*item_qty;
     item_product_id := business_resolve_product(item->>'name');
     INSERT INTO order_items(order_id,product_id,product_name_raw,quantity,unit_price,total_price,price_is_known)
     VALUES(ord.id,item_product_id,item->>'name',item_qty,coalesce((item->>'price')::numeric,0),
       coalesce((item->>'price')::numeric,0)*item_qty,item->>'price' IS NOT NULL);
     IF item_product_id IS NOT NULL AND ord.status IN ('confirmed','processing') THEN
       PERFORM business_apply_item_stock(ord.id,item_product_id,item_qty);
     END IF;
   END LOOP;
   IF new_total<=0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
   details := details - 'items_summary';
 END IF;

 -- A total typed by hand (admin and رشا only — the API checks orders.edit). The lines stay as they
 -- are; the gap between them and the total is the discount.
 IF p_data ? 'total_amount' THEN
   manual_total := (p_data->>'total_amount')::numeric;
   IF manual_total IS NULL OR manual_total<=0 OR manual_total>=10000000 OR manual_total<>round(manual_total,3)
     THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
   IF already_paid>0 THEN RAISE EXCEPTION 'HAS_PAYMENTS'; END IF;
   IF NOT p_data ? 'items' THEN
     SELECT coalesce(sum(total_price),0) INTO new_total FROM order_items WHERE order_id=ord.id;
   END IF;
 END IF;

 UPDATE orders SET
   delivery_city=CASE WHEN p_data ? 'city' THEN nullif(trim(p_data->>'city'),'') ELSE delivery_city END,
   delivery_address=CASE WHEN p_data ? 'address' THEN nullif(trim(p_data->>'address'),'') ELSE delivery_address END,
   notes=CASE WHEN p_data ? 'notes' THEN nullif(trim(p_data->>'notes'),'') ELSE notes END,
   total_amount=CASE WHEN manual_total IS NOT NULL THEN manual_total WHEN p_data ? 'items' THEN new_total ELSE total_amount END,
   subtotal=CASE WHEN manual_total IS NOT NULL THEN greatest(new_total,manual_total) WHEN p_data ? 'items' THEN new_total ELSE subtotal END,
   discount_amount=CASE WHEN manual_total IS NOT NULL THEN greatest(new_total-manual_total,0) WHEN p_data ? 'items' THEN 0 ELSE discount_amount END,
   business_details=details,
   updated_at=now()
 WHERE id=ord.id
 RETURNING * INTO ord;

 IF p_data ? 'items' OR manual_total IS NOT NULL THEN
   UPDATE invoices SET total_amount=ord.total_amount,subtotal=ord.subtotal,discount_amount=ord.discount_amount WHERE order_id=ord.id;
 END IF;

 after_snap := jsonb_build_object('city',coalesce(ord.delivery_city,''),'address',coalesce(ord.delivery_address,''),
   'notes',coalesce(ord.notes,''),'customer_name',coalesce(ord.business_details->>'customer_name',''),
   'customer_phone',coalesce(ord.business_details->>'customer_phone',''),'total_amount',ord.total_amount,
   'items_summary',coalesce((SELECT string_agg(quantity::text||' × '||product_name_raw,' + ') FROM order_items WHERE order_id=ord.id),''));

 SELECT coalesce(jsonb_object_agg(k,jsonb_build_object('from',b.v,'to',a.v)),'{}'::jsonb) INTO diff
 FROM jsonb_each(before_snap) b(k,v) JOIN jsonb_each(after_snap) a(k,v) USING (k)
 WHERE a.v IS DISTINCT FROM b.v;
 IF diff<>'{}'::jsonb THEN
   INSERT INTO order_changes(order_id,actor_id,changes) VALUES(ord.id,p_actor,diff);
 END IF;

 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id)
 VALUES('order_edit',p_actor,p_key,p_data,ord.id);
 RETURN jsonb_build_object('order',business_order_document(ord.id),'replayed',false);
END $$;

COMMIT;
