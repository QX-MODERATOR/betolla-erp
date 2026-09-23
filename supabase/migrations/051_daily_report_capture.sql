-- What the daily report needs that nothing recorded (2026-09-23).
--
-- The daily Google Sheet report covers every order and lead. Three of its columns had no source:
--   * why the office cancelled an order — business_status now stores business_details.cancel
--     {reason,note,by,at} when /orders sends cancel_reason (the driver's own cancel, 035, keeps
--     delivery.cancel_reason and is read as is);
--   * an operational problem behind a sale (Out of Stock / delivery delay / unavailable / price) —
--     a new business_order_issue sets or clears business_details.issue and logs it in order_changes;
--   * the customer's channel and ad campaign — stored with the order by the page (channel,
--     channel_other, campaign_id), needing no function change; read back below.
--
-- Replaces two bodies, each the newest carried forward verbatim apart from the marked lines:
--   * business_status          — 047's (sell beyond stock), plus the cancel-reason block;
--   * business_order_document  — 049's (data source, B2B/B2C), plus a second object with customer_id,
--     channel, campaign, cancel, issue, return/driver-cancel reasons and when delivery completed.
-- A later migration replacing either must start from these bodies.
--
-- ORDERING: apply after 049 (and 047). 050 touches neither function.
BEGIN;

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
 -- 051: why the office cancelled. /orders requires it; other callers (older screens, the driver's
 -- own cancel in 035, which keeps delivery.cancel_reason) may leave it out.
 IF next_state='cancelled' AND coalesce(trim(p_data->>'cancel_reason'),'')<>'' THEN
   IF p_data->>'cancel_reason' NOT IN ('price','not_interested','no_answer','duplicate','delivery_problem','unavailable','other') THEN RAISE EXCEPTION 'INVALID_CANCEL_REASON'; END IF;
   UPDATE orders SET business_details=business_details || jsonb_build_object('cancel',jsonb_build_object(
     'reason',p_data->>'cancel_reason','note',nullif(trim(coalesce(p_data->>'cancel_note','')),''),'by',p_actor,'at',now()))
   WHERE id=ord.id;
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

CREATE OR REPLACE FUNCTION public.business_order_document(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT jsonb_build_object(
   'id',o.order_number,'db_id',o.id,'status',o.status,'order_date',o.order_date,
   'customer_name',coalesce(o.business_details->>'customer_name',c.name),
   'customer_phone',coalesce(o.business_details->>'customer_phone',c.phone),
   'city',coalesce(o.delivery_city,c.city,''),'address',coalesce(o.delivery_address,c.address,''),
   'rep_name',coalesce(o.business_details->>'rep_name',c.rep_name_raw,''),
   'source',o.source,
   'data_source',o.business_details->>'data_source','customer_segment',o.business_details->>'customer_segment','payment_method',o.payment_method,'total_amount',o.total_amount,
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
   'updated_at',o.updated_at,
   -- 045: the driver's on-the-way / arrived stamps, and the state that can make them stale.
   'delivery_progress',o.business_details->'delivery'->'progress',
   'delivery_state',o.business_details->'delivery'->>'state',
   'delivery_state_at',o.business_details->'delivery'->>'state_at'
 ) || jsonb_build_object(
   -- 051: what the daily report reads. A second object, so the first stays under Postgres's
   -- 100-argument limit for jsonb_build_object.
   'customer_id',o.customer_id,
   'channel',o.business_details->>'channel','channel_other',o.business_details->>'channel_other',
   'campaign_id',o.business_details->>'campaign_id',
   'campaign_name',(SELECT m.name FROM mkt_campaigns m WHERE m.id::text=o.business_details->>'campaign_id'),
   'cancel',o.business_details->'cancel','issue',o.business_details->'issue',
   'return_reason',o.business_details->'delivery'->>'return_reason',
   'driver_cancel_reason',o.business_details->'delivery'->>'cancel_reason',
   'delivery_completed_at',o.business_details->'delivery'->>'completed_at'
 ) FROM orders o JOIN customers c ON c.id=o.customer_id
 LEFT JOIN invoices i ON i.order_id=o.id WHERE o.id=p_id
$$;

-- Tag (or clear, with an empty type) the operational problem that affected an order.
-- p_data: id (order number), type (one of the list or ''), note.
CREATE FUNCTION public.business_order_issue(p_actor text,p_key uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE old_request business_requests; ord orders; kind text := nullif(trim(coalesce(p_data->>'type','')),'');
  details jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('order-issue:'||p_actor||':'||p_key::text,0));
 SELECT * INTO old_request FROM business_requests WHERE operation='order_issue' AND actor_id=p_actor AND request_key=p_key;
 IF FOUND THEN
   IF old_request.payload<>p_data THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   RETURN jsonb_build_object('order',business_order_document(old_request.result_id),'replayed',true);
 END IF;
 IF coalesce(length(trim(p_actor)),0)=0 THEN RAISE EXCEPTION 'INVALID_ACTOR'; END IF;
 IF kind IS NOT NULL AND kind NOT IN ('out_of_stock','delivery_delay','product_unavailable','price_issue','other') THEN RAISE EXCEPTION 'INVALID_ISSUE'; END IF;
 SELECT * INTO ord FROM orders WHERE order_number=p_data->>'id' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
 details := CASE WHEN kind IS NULL THEN ord.business_details - 'issue'
   ELSE ord.business_details || jsonb_build_object('issue',jsonb_build_object('type',kind,
     'note',nullif(trim(coalesce(p_data->>'note','')),''),'by',p_actor,'at',now())) END;
 UPDATE orders SET business_details=details,updated_at=now() WHERE id=ord.id;
 IF (ord.business_details->'issue') IS DISTINCT FROM (details->'issue') THEN
   INSERT INTO order_changes(order_id,actor_id,changes) VALUES(ord.id,p_actor,
     jsonb_build_object('issue',jsonb_build_object('from',ord.business_details->'issue'->>'type','to',details->'issue'->>'type')));
 END IF;
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('order_issue',p_actor,p_key,p_data,ord.id);
 RETURN jsonb_build_object('order',business_order_document(ord.id),'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.business_order_issue(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_order_issue(text,uuid,jsonb) TO service_role;

COMMIT;
