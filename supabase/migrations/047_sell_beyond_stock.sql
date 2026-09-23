-- Orders are no longer refused for want of stock.
--
-- The new catalogue (046) brought in 35 products nobody has counted yet, all at stock 0. With the
-- old rule none of them could be sold until someone typed a number in, and the rule was already
-- being worked around by reps writing the order elsewhere. The owner's decision: the rep enters
-- what the customer wants and answers for it, stock may go below zero, and once the order is
-- placed only admin and رشا may change it (lib/permissions.ts). A negative balance is the signal
-- that the shelf and the system disagree; the picking list already says how many are missing.
--
-- Manual stock movements (business_inventory_movement_create) keep INSUFFICIENT_STOCK: taking
-- out of the warehouse what the system says is not there is a counting mistake, not a sale.
--
-- Replaces two bodies:
--   * business_apply_item_stock (037) — every order path deducts through it: create (038),
--     edit (042) and now confirm. Same body without the check.
--   * business_status (041) — the body below is 041's with three changes, all in the stock block:
--       - draft -> confirmed deducts through business_apply_item_stock, so a package in a draft
--         takes its bottles (it deducted the package row itself, which has no stock);
--       - cancel and return reverse the order's own inventory_movements, as 037 intended and
--         business_order_update already does. 041 re-added order_items quantities by product, so a
--         cancelled package put nothing back on the shelf;
--       - no stock check.
--     Everything else — transitions, DRIVER_REQUIRED and its stamp — is 041's, verbatim.
--
-- ORDERING: apply after 041 and 042. 045 does not touch either function.
BEGIN;

CREATE OR REPLACE FUNCTION public.business_apply_item_stock(p_order uuid, p_product_id uuid, p_qty int) RETURNS void
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE part record;
BEGIN
 FOR part IN SELECT * FROM business_bundle_expand(p_product_id, p_qty) LOOP
   INSERT INTO inventory(product_id,quantity_on_hand) VALUES(part.product_id,0) ON CONFLICT (product_id) DO NOTHING;
   UPDATE inventory SET quantity_on_hand=quantity_on_hand-part.quantity, updated_at=now() WHERE product_id=part.product_id;
   INSERT INTO inventory_movements(product_id,movement_type,quantity,reference_type,reference_id)
   VALUES(part.product_id,'sale_out',-part.quantity,'order',p_order);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.business_status(p_actor text,p_scope text,p_key uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE ord orders; old_request business_requests; next_state text := p_data->>'status'; oi order_items; mv record;
  want_driver text; has_driver text;
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

 -- Goods do not leave the building without someone named to carry them. The driver may already be
 -- assigned (the /drivers flow) or be named on this call (the /orders flow); either way the order
 -- is stamped the way business_driver_dispatch stamps it, so both pages see the same thing.
 IF ord.status='processing' AND next_state='shipped' THEN
   has_driver := business_driver_of(ord.business_details,ord.notes);
   want_driver := business_driver_canonical(p_data->>'driver');
   IF want_driver IS NULL THEN want_driver := has_driver; END IF;
   IF want_driver IS NULL THEN RAISE EXCEPTION 'DRIVER_REQUIRED'; END IF;
   UPDATE orders SET updated_at=now(),notes=business_strip_driver_tag(notes),
     business_details=business_details || jsonb_build_object('delivery',
       coalesce(business_details->'delivery','{}'::jsonb) || jsonb_build_object(
         'driver',want_driver,'dispatched_at',now(),'dispatched_by',p_actor))
   WHERE id=ord.id;
 END IF;

 IF ord.status='draft' AND next_state='confirmed' THEN
   FOR oi IN SELECT * FROM order_items WHERE order_id=ord.id AND product_id IS NOT NULL LOOP
     PERFORM business_apply_item_stock(ord.id,oi.product_id,oi.quantity);
   END LOOP;
 ELSIF (ord.status='shipped' AND next_state='returned')
    OR (next_state='cancelled' AND ord.status IN ('confirmed','processing')) THEN
   -- Put back exactly what this order took, product by product (a package took its bottles).
   -- A draft never took anything, so it has nothing to reverse.
   FOR mv IN SELECT m.product_id,-sum(m.quantity)::int AS qty FROM inventory_movements m
     WHERE m.reference_type='order' AND m.reference_id=ord.id GROUP BY m.product_id HAVING -sum(m.quantity)>0 LOOP
     UPDATE inventory SET quantity_on_hand=quantity_on_hand+mv.qty, updated_at=now() WHERE product_id=mv.product_id;
     INSERT INTO inventory_movements(product_id,movement_type,quantity,reference_type,reference_id)
     VALUES(mv.product_id,'return_in',mv.qty,'order',ord.id);
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
