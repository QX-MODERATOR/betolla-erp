-- Additive only: no backfill, deletion, or changes to existing RLS/policies.
-- Completes the order lifecycle: adds the missing cancellation path (the
-- order_status_enum and orders.cancelled_at column already existed for this,
-- unused) and starts populating confirmed_at/shipped_at/delivered_at/
-- cancelled_at, which existed since 001 but were never written by 006's
-- business_status. CREATE OR REPLACE, same signature; every existing
-- transition/validation/error path is preserved unchanged.
BEGIN;

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
 -- A cancellation is only meaningful before an order ships: once goods are on
 -- the way, the only way back is the existing shipped->returned path.
 IF NOT ((ord.status='draft' AND next_state IN ('confirmed','cancelled'))
  OR (ord.status='confirmed' AND next_state IN ('processing','cancelled'))
  OR (ord.status='processing' AND next_state IN ('shipped','cancelled'))
  OR (ord.status='shipped' AND next_state IN ('delivered','returned')))
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
 ELSIF next_state='cancelled' AND ord.status IN ('confirmed','processing') THEN
   -- Only confirmed/processing orders ever had stock deducted; a draft never did.
   FOR oi IN SELECT * FROM order_items WHERE order_id=ord.id AND product_id IS NOT NULL LOOP
     UPDATE inventory SET quantity_on_hand=quantity_on_hand+oi.quantity, updated_at=now() WHERE product_id=oi.product_id;
     INSERT INTO inventory_movements(product_id,movement_type,quantity,reference_type,reference_id)
     VALUES(oi.product_id,'return_in',oi.quantity,'order',ord.id);
   END LOOP;
 END IF;
 UPDATE orders SET status=next_state::order_status_enum,
   confirmed_at=CASE WHEN next_state='confirmed' THEN now() ELSE confirmed_at END,
   shipped_at=CASE WHEN next_state='shipped' THEN now() ELSE shipped_at END,
   delivered_at=CASE WHEN next_state='delivered' THEN now() ELSE delivered_at END,
   cancelled_at=CASE WHEN next_state='cancelled' THEN now() ELSE cancelled_at END
 WHERE id=ord.id;
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id)
 VALUES('status',p_actor,p_key,p_data,ord.id);
 RETURN jsonb_build_object('order',business_order_document(ord.id),'replayed',false);
END $$;

COMMIT;
