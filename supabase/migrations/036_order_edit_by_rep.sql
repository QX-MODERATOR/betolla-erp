-- Additive only: one new table, one new RPC. Lets the rep who owns an order edit it after
-- creation (customer wants to change something) while it's still draft/confirmed/processing —
-- never once shipped, matching the same boundary business_status and 035's cancel action use.
-- Never touches status, cash_collected, driver, owner_account_id, or payment_method: those stay
-- exclusively controlled by business_status/business_driver_action, so an edit can never be used
-- to quietly move money or reassign ownership. Every edit is diffed and logged to order_changes,
-- mirroring customer_changes (029_customer_ownership.sql) so Diya can see exactly what changed.
BEGIN;

CREATE TABLE public.order_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  changes JSONB NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_changes_order ON public.order_changes(order_id, changed_at DESC);
ALTER TABLE public.order_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_changes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.order_changes TO service_role;

CREATE FUNCTION public.business_order_update(p_actor text,p_scope text,p_key uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE old_request business_requests; ord orders; before_snap jsonb; after_snap jsonb; diff jsonb;
  item jsonb; item_qty int; item_product_id uuid; new_total numeric; details jsonb; mv record; inv inventory;
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
 -- Same "not once shipped" boundary as cancellation: once goods/cash are moving, edits stop.
 IF ord.status NOT IN ('draft','confirmed','processing') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
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
       INSERT INTO inventory(product_id,quantity_on_hand) VALUES(item_product_id,0) ON CONFLICT (product_id) DO NOTHING;
       SELECT * INTO inv FROM inventory WHERE product_id=item_product_id FOR UPDATE;
       IF inv.quantity_on_hand-item_qty<0 THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK'; END IF;
       UPDATE inventory SET quantity_on_hand=quantity_on_hand-item_qty, updated_at=now() WHERE product_id=item_product_id;
       INSERT INTO inventory_movements(product_id,movement_type,quantity,reference_type,reference_id)
       VALUES(item_product_id,'sale_out',-item_qty,'order',ord.id);
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

-- Diya's change-history view for an order (most recent first), keyed by order_number like every
-- other order-facing RPC (business_status, business_order_update), not the internal uuid.
CREATE FUNCTION public.business_order_changes(p_order_number text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('actor_id',oc.actor_id,'changes',oc.changes,'changed_at',oc.changed_at)
   ORDER BY oc.changed_at DESC),'[]'::jsonb)
 FROM order_changes oc JOIN orders o ON o.id=oc.order_id WHERE o.order_number=p_order_number
$$;

REVOKE ALL ON FUNCTION public.business_order_update(text,text,uuid,jsonb),
  public.business_order_changes(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_order_update(text,text,uuid,jsonb),
  public.business_order_changes(text) TO service_role;

COMMIT;
