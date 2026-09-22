-- Talabat-style delivery progress for خالد and علي: between "خرج مع السائق" and "تم التسليم" a
-- driver now marks "بدأت التوصيل" (on the way to this customer) and "وصلت" (at the door). The rep,
-- ضياء and finance see the same steps on the order's timeline.
--
-- Stored on the order as business_details.delivery.progress = {started_at, started_by, arrived_at,
-- arrived_by}. It is written by a function of its own, business_driver_progress, so
-- business_driver_action (027 -> 035, the one that moves money and stock) is NOT replaced here and
-- keeps its newest body.
--
-- A progress stamp belongs to one delivery attempt. Postponing or marking "remaining" goes through
-- business_driver_action, which sets delivery.state/state_at and never touches progress; readers
-- (lib/driver-ops.ts deliveryProgress) therefore treat progress as current only when no state is set
-- and started_at is later than state_at. Starting again clears state and postpone_date, the same way
-- the 'resume' action does, so a postponed order can be picked up again from this screen.
--
-- Also replaces business_order_document with 041's body (the newest) plus three fields:
-- delivery_progress, delivery_state and delivery_state_at. Nothing else in it changes.
BEGIN;

CREATE OR REPLACE FUNCTION public.business_driver_progress(p_actor text,p_key uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE old_request business_requests; ord orders; act text := p_data->>'action'; cur_driver text;
  delivery jsonb; progress jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('driver_progress:'||p_actor||':'||p_key::text,0));
 SELECT * INTO old_request FROM business_requests WHERE operation='driver_progress' AND actor_id=p_actor AND request_key=p_key;
 IF FOUND THEN
   IF old_request.payload<>p_data THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   RETURN jsonb_build_object('order',business_driver_order(old_request.result_id),'replayed',true);
 END IF;
 IF coalesce(length(trim(p_actor)),0)=0 THEN RAISE EXCEPTION 'INVALID_ACTOR'; END IF;
 SELECT * INTO ord FROM orders WHERE order_number=p_data->>'id' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
 cur_driver := business_driver_of(ord.business_details,ord.notes);
 IF cur_driver IS NULL THEN RAISE EXCEPTION 'NO_DRIVER'; END IF;
 IF p_data ? 'acting_driver' AND cur_driver IS DISTINCT FROM business_driver_canonical(p_data->>'acting_driver') THEN
   RAISE EXCEPTION 'FORBIDDEN';
 END IF;
 IF ord.status::text IS DISTINCT FROM p_data->>'expected_status' THEN RAISE EXCEPTION 'STALE_ORDER'; END IF;
 -- The same statuses a driver may deliver from.
 IF ord.status NOT IN ('processing','shipped') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;

 delivery := coalesce(ord.business_details->'delivery','{}'::jsonb) || jsonb_build_object('driver',cur_driver);
 progress := coalesce(delivery->'progress','{}'::jsonb);

 IF act='start' THEN
   -- A new attempt: forget any earlier arrival, and lift a postponed/remaining mark.
   progress := jsonb_build_object('started_at',now(),'started_by',p_actor);
   delivery := (delivery || jsonb_build_object('progress',progress)) - 'state' - 'postpone_date';
 ELSIF act='arrive' THEN
   IF progress->>'started_at' IS NULL OR delivery ? 'state'
      OR (delivery->>'state_at' IS NOT NULL AND (progress->>'started_at')::timestamptz <= (delivery->>'state_at')::timestamptz) THEN
     RAISE EXCEPTION 'NOT_STARTED';
   END IF;
   progress := progress || jsonb_build_object('arrived_at',now(),'arrived_by',p_actor);
   delivery := delivery || jsonb_build_object('progress',progress);
 ELSE
   RAISE EXCEPTION 'INVALID_ACTION';
 END IF;

 UPDATE orders SET business_details=business_details || jsonb_build_object('delivery',delivery),updated_at=now()
 WHERE id=ord.id;
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id)
 VALUES('driver_progress',p_actor,p_key,p_data,ord.id);
 RETURN jsonb_build_object('order',business_driver_order(ord.id),'replayed',false);
END $$;

-- 041's business_order_document, unchanged apart from the three delivery_* fields at the end.
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
   'updated_at',o.updated_at,
   -- 045: the driver's on-the-way / arrived stamps, and the state that can make them stale.
   'delivery_progress',o.business_details->'delivery'->'progress',
   'delivery_state',o.business_details->'delivery'->>'state',
   'delivery_state_at',o.business_details->'delivery'->>'state_at'
 ) FROM orders o JOIN customers c ON c.id=o.customer_id
 LEFT JOIN invoices i ON i.order_id=o.id WHERE o.id=p_id
$$;

REVOKE ALL ON FUNCTION public.business_driver_progress(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_driver_progress(text,uuid,jsonb) TO service_role;

COMMIT;
