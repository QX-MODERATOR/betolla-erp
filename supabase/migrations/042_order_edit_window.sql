-- An order stops being editable the moment it is being prepared.
--
-- business_order_update accepted edits at 'processing' as well as draft and confirmed. But
-- 'processing' is ضياء picking the items off the shelf: a rep changing the quantities at that
-- moment leaves the picking list, the stock reservation and the invoice describing three different
-- orders, and nobody finds out until the driver is at the door. The window is now draft and
-- confirmed only, which is also where the browser stops offering the button.
--
-- It raises ORDER_LOCKED rather than INVALID_STATUS so the app can say why: "the order is being
-- prepared and can no longer be edited" is actionable, "invalid status" is not.
--
-- The body below is 037's, carried forward verbatim apart from that one check — this function is
-- replaced by 036 and 037 already, and retyping it is how earlier work gets silently dropped.
--
-- ORDERING: apply after 041.
BEGIN;

CREATE OR REPLACE FUNCTION public.business_order_update(p_actor text,p_scope text,p_key uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE old_request business_requests; ord orders; before_snap jsonb; after_snap jsonb; diff jsonb;
  item jsonb; item_qty int; item_product_id uuid; new_total numeric; details jsonb; mv record;
  already_paid numeric;
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

 UPDATE orders SET
   delivery_city=CASE WHEN p_data ? 'city' THEN nullif(trim(p_data->>'city'),'') ELSE delivery_city END,
   delivery_address=CASE WHEN p_data ? 'address' THEN nullif(trim(p_data->>'address'),'') ELSE delivery_address END,
   notes=CASE WHEN p_data ? 'notes' THEN nullif(trim(p_data->>'notes'),'') ELSE notes END,
   total_amount=CASE WHEN p_data ? 'items' THEN new_total ELSE total_amount END,
   subtotal=CASE WHEN p_data ? 'items' THEN new_total ELSE subtotal END,
   business_details=details,
   updated_at=now()
 WHERE id=ord.id
 RETURNING * INTO ord;

 IF p_data ? 'items' THEN
   UPDATE invoices SET total_amount=new_total,subtotal=new_total WHERE order_id=ord.id;
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

-- Stocking a bundle directly is a trap: the row would be written and then ignored, because a
-- bundle's availability is computed from its components. Say so instead of accepting the entry.
-- Identical to 008 apart from that one check.
CREATE OR REPLACE FUNCTION public.business_inventory_movement_create(p_actor text,p_key uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE old_request business_requests; prod products; inv inventory; delta int; mtype inventory_movement_type_enum;
  movement_id uuid := gen_random_uuid(); new_stock int;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('inventory:'||p_actor||':'||p_key::text,0));
 SELECT * INTO old_request FROM business_requests WHERE operation='inventory' AND actor_id=p_actor AND request_key=p_key;
 IF FOUND THEN
   IF old_request.payload<>p_data THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   RETURN jsonb_build_object('movement',business_inventory_movement_document(old_request.result_id),'replayed',true);
 END IF;
 IF coalesce(length(trim(p_data->>'sku')),0)=0 THEN RAISE EXCEPTION 'INVALID_MOVEMENT'; END IF;
 SELECT * INTO prod FROM products WHERE sku=p_data->>'sku' AND is_active;
 IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
 IF EXISTS (SELECT 1 FROM product_bundles WHERE bundle_product_id=prod.id) THEN RAISE EXCEPTION 'PRODUCT_IS_BUNDLE'; END IF;
 BEGIN
   mtype := (p_data->>'type')::inventory_movement_type_enum;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'INVALID_MOVEMENT';
 END;
 delta := (p_data->>'delta')::int;
 IF delta IS NULL OR delta=0 OR delta<-1000000 OR delta>1000000 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
 INSERT INTO inventory(product_id,quantity_on_hand) VALUES(prod.id,0) ON CONFLICT (product_id) DO NOTHING;
 SELECT * INTO inv FROM inventory WHERE product_id=prod.id FOR UPDATE;
 IF inv.quantity_on_hand+delta<0 THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK'; END IF;
 new_stock := inv.quantity_on_hand+delta;
 UPDATE inventory SET quantity_on_hand=new_stock, updated_at=now() WHERE product_id=prod.id;
 INSERT INTO inventory_movements(id,product_id,movement_type,quantity,reference_type,notes)
 VALUES(movement_id,prod.id,mtype,delta,nullif(trim(p_data->>'reference'),''),nullif(trim(p_data->>'notes'),''));
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('inventory',p_actor,p_key,p_data,movement_id);
 RETURN jsonb_build_object('movement',business_inventory_movement_document(movement_id),'stock',new_stock,'replayed',false);
END $$;

-- The warehouse picks bottles, not packages, so the "stock needed" list expands bundles too.
CREATE OR REPLACE FUNCTION public.business_driver_stock_needed() RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.sku,'product',x.name_ar,'needed',x.needed,'available',x.available,
   'status',CASE WHEN x.available<x.needed THEN 'Low' ELSE 'OK' END) ORDER BY x.name_ar),'[]'::jsonb)
 FROM (
   SELECT p.sku,p.name_ar,sum(parts.quantity)::int AS needed,coalesce(max(inv.quantity_on_hand),0)::int AS available
   FROM orders o
   JOIN order_items oi ON oi.order_id=o.id
   CROSS JOIN LATERAL business_bundle_expand(oi.product_id,oi.quantity) parts
   JOIN products p ON p.id=parts.product_id
   LEFT JOIN inventory inv ON inv.product_id=p.id
   WHERE o.status='processing' AND business_driver_of(o.business_details,o.notes) IS NOT NULL
   GROUP BY p.sku,p.name_ar
 ) x
$$;

COMMIT;
