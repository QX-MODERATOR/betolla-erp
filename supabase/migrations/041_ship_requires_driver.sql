-- An order cannot leave for delivery without a driver, and the order document carries its own
-- lifecycle timestamps.
--
-- THE BUG
-- /orders moved processing -> shipped through business_status, which never looked at the driver.
-- The real dispatch path, business_driver_dispatch (027), only ships an order that ALREADY has a
-- driver assigned. So every order shipped from /orders landed in a state the driver module cannot
-- represent: status='shipped' with no business_details.delivery.driver. At the time of writing all
-- 15 shipped/delivered/returned orders in production had no driver recorded — the driver module had
-- effectively never been used for dispatch, and ضياء's page never saw the work.
--
-- Making the picker mandatory in the browser is not the fix; it is the last mile of it. The rule
-- belongs here, where every path has to obey it.
--
-- WHAT CHANGES
--   * business_status refuses processing -> shipped unless a driver is assigned, and accepts one in
--     p_data->>'driver' to assign on the way. It writes the same business_details.delivery shape
--     business_driver_dispatch writes, so an order shipped from /orders is indistinguishable from
--     one dispatched from /drivers and appears on the driver's day either way.
--   * business_order_document exposes confirmed_at/shipped_at/delivered_at/cancelled_at and the
--     assigned driver. The columns have been populated since 012; nothing ever surfaced them, so
--     the app could not draw a timeline.
--
-- Every other transition and every existing validation is preserved exactly.
--
-- ORDERING: apply after 040. Carries forward business_status from 012 and
-- business_order_document from 011 — the newest bodies of each.
BEGIN;

-- Same as 011, plus the lifecycle stamps and the driver. Reading the driver through
-- business_driver_of (027) means an order tagged the old way in notes still reports correctly.
CREATE OR REPLACE FUNCTION public.business_order_document(p_id uuid) RETURNS jsonb
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
   'payments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'amount',p.amount,'payment_method',p.payment_method,
      'reference_number',coalesce(p.reference_number,''),'notes',coalesce(p.notes,''),'is_reversal',p.is_reversal,
      'reversed_payment_id',p.reversed_payment_id,'received_at',p.received_at) ORDER BY p.received_at,p.id)
      FROM payments p WHERE p.invoice_id=i.id),'[]'::jsonb),
   'collectible',o.status NOT IN ('draft','cancelled','returned'),
   -- The order's own history, for the shipment timeline. created_at is when the order was taken.
   'created_at',o.created_at,'confirmed_at',o.confirmed_at,'shipped_at',o.shipped_at,
   'delivered_at',o.delivered_at,'cancelled_at',o.cancelled_at,
   'driver',business_driver_of(o.business_details,o.notes),
   'dispatched_at',o.business_details->'delivery'->>'dispatched_at',
   'updated_at',o.updated_at
 ) FROM orders o JOIN customers c ON c.id=o.customer_id
 LEFT JOIN invoices i ON i.order_id=o.id WHERE o.id=p_id
$$;

-- An order taken over the phone is born 'confirmed' — business_create_order inserts it that way and
-- it never passes through the draft -> confirmed transition that stamps confirmed_at. So the column
-- was null for almost every order and the timeline had no confirmation time to show. Stamped here
-- on insert, for the same reason 040 numbers documents in a trigger: no function body to rewrite,
-- and nothing for a later migration to carry forward and undo.
CREATE FUNCTION public.business_stamp_new_order() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF NEW.status='confirmed' AND NEW.confirmed_at IS NULL THEN NEW.confirmed_at := now(); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_orders_stamp BEFORE INSERT ON public.orders
 FOR EACH ROW EXECUTE FUNCTION public.business_stamp_new_order();
REVOKE ALL ON FUNCTION public.business_stamp_new_order() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_stamp_new_order() TO service_role;

-- Same as 012, with the driver rule added at the processing -> shipped edge.
CREATE OR REPLACE FUNCTION public.business_status(p_actor text,p_scope text,p_key uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE ord orders; old_request business_requests; next_state text := p_data->>'status'; oi order_items; inv inventory;
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
