-- Additive only: no backfill, deletion, or changes to existing tables' data/RLS/policies.
-- Moves every driver-module write (assign, dispatch, deliver, return, postpone, shift close)
-- out of lib/db.ts's direct table UPDATEs and into checked functions, so the driver pages
-- follow the same rules as business_status (migration 012):
--   * allowed transitions only, with an expected_status stale check and idempotency key;
--   * a delivery records the cash the driver actually collected as a real payment row
--     (the old code set payment_status='paid' with no payment, so Finance still showed a debt);
--   * a return puts linked stock back (the old code never restocked);
--   * dispatch ships only the listed orders of the chosen drivers (the old code shipped
--     every 'processing' order in the company);
--   * a driver can only act on orders assigned to them (enforced here via acting_driver).
-- Driver/delivery facts live in orders.business_details->'delivery' (006) instead of free-text
-- "[السائق: ...]" tags in notes; the legacy tag is still read, and removed when an order is next
-- written through these functions. "Today" is the Amman calendar day, not the UTC day.
BEGIN;

ALTER TABLE public.driver_shift_closures ADD COLUMN IF NOT EXISTS counted_cash NUMERIC(10,3);
ALTER TABLE public.driver_shift_closures ADD COLUMN IF NOT EXISTS closed_by TEXT;
ALTER TABLE public.driver_shift_closures ADD COLUMN IF NOT EXISTS reopened_by TEXT;
ALTER TABLE public.driver_shift_closures ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ;
-- Finished-today lookups first narrow by updated_at (always >= the completion time).
CREATE INDEX IF NOT EXISTS idx_orders_updated_at ON public.orders(updated_at);

CREATE FUNCTION public.business_amman_today() RETURNS date
LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'Asia/Amman')::date $$;

-- Canonical driver display name: 'خالد', 'علي', 'BX Arabia', any other trimmed name, or NULL.
CREATE FUNCTION public.business_driver_canonical(p_name text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE
   WHEN n IS NULL OR n='' OR lower(n) IN ('unassigned','null','none','all') THEN NULL
   WHEN lower(n) LIKE 'bx%' THEN 'BX Arabia'
   ELSE n END
 FROM (SELECT trim(regexp_replace(coalesce(p_name,''),'\s*\([^)]*\)\s*$','')) AS n) s
$$;

-- The structured field wins (an explicit null means "unassigned"); otherwise the innermost
-- legacy "[السائق: ...]" tag (old edits nested tags inside each other).
CREATE FUNCTION public.business_driver_of(p_details jsonb, p_notes text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
 SELECT business_driver_canonical(CASE
   WHEN coalesce(p_details->'delivery','{}'::jsonb) ? 'driver' THEN p_details->'delivery'->>'driver'
   ELSE substring(coalesce(p_notes,'') from '\[السائق:\s*(?:\[السائق:\s*)*([^\[\]]+)') END)
$$;

CREATE FUNCTION public.business_strip_driver_tag(p_notes text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE result text := coalesce(p_notes,''); i int := 0;
BEGIN
 -- Remove innermost tags first; a wrapper left behind becomes innermost on the next pass.
 WHILE strpos(result,'[السائق:')>0 AND i<20 LOOP
   result := regexp_replace(result,'\[السائق:[^\[\]]*\]','','g');
   i := i+1;
 END LOOP;
 RETURN nullif(trim(regexp_replace(result,'\s{2,}',' ','g')),'');
END $$;

-- The day an order's delivery ended (delivered/returned), in Amman time.
CREATE FUNCTION public.business_driver_done_day(o orders) RETURNS date
LANGUAGE sql STABLE AS $$
 SELECT (coalesce((o.business_details->'delivery'->>'completed_at')::timestamptz,o.delivered_at,o.updated_at)
   AT TIME ZONE 'Asia/Amman')::date
$$;

CREATE FUNCTION public.business_driver_order(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT jsonb_build_object(
   'id',o.order_number,'db_id',o.id,'status',o.status,'order_date',o.order_date,
   'customer_name',coalesce(o.business_details->>'customer_name',c.name,''),
   'phone',coalesce(o.business_details->>'customer_phone',c.phone,''),
   'city',coalesce(o.delivery_city,c.city,''),'address',coalesce(o.delivery_address,c.address,''),
   'rep_name',coalesce(o.business_details->>'rep_name',c.rep_name_raw,''),
   'items_summary',coalesce(o.business_details->>'items_summary',
      (SELECT string_agg(quantity::text||' × '||product_name_raw,' + ' ORDER BY created_at,id) FROM order_items WHERE order_id=o.id),''),
   'notes',coalesce(o.notes,''),
   'total_amount',o.total_amount,'payment_method',o.payment_method,'payment_status',o.payment_status,
   'delivery_fee',o.delivery_fee,
   'paid_amount',coalesce((SELECT sum(p.amount) FROM invoices i JOIN payments p ON p.invoice_id=i.id WHERE i.order_id=o.id),0),
   'driver',business_driver_of(o.business_details,o.notes),
   'delivery',coalesce(o.business_details->'delivery','{}'::jsonb),
   'done_day',CASE WHEN o.status IN ('delivered','returned') THEN business_driver_done_day(o) END,
   'updated_at',o.updated_at
 ) FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.id=p_id
$$;

-- Today's driver work: every open order (confirmed/processing/shipped) plus orders delivered or
-- returned on p_date. Never the full order history. p_driver limits it to one driver's orders.
CREATE FUNCTION public.business_driver_board(p_driver text, p_date date) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(business_driver_order(o.id) ORDER BY o.order_date,o.created_at,o.id),'[]'::jsonb)
 FROM orders o
 WHERE (o.status IN ('confirmed','processing','shipped')
     OR (o.status IN ('delivered','returned')
         AND o.updated_at>=(coalesce(p_date,business_amman_today())::timestamp AT TIME ZONE 'Asia/Amman')
         AND business_driver_done_day(o)=coalesce(p_date,business_amman_today())))
   AND (p_driver IS NULL OR business_driver_of(o.business_details,o.notes)=business_driver_canonical(p_driver))
$$;

-- Stock the warehouse must hand out for orders waiting to be loaded (processing, with a driver).
CREATE FUNCTION public.business_driver_stock_needed() RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.sku,'product',x.name_ar,'needed',x.needed,'available',x.available,
   'status',CASE WHEN x.available<x.needed THEN 'Low' ELSE 'OK' END) ORDER BY x.name_ar),'[]'::jsonb)
 FROM (
   SELECT p.sku,p.name_ar,sum(oi.quantity)::int AS needed,coalesce(max(inv.quantity_on_hand),0)::int AS available
   FROM orders o JOIN order_items oi ON oi.order_id=o.id JOIN products p ON p.id=oi.product_id
   LEFT JOIN inventory inv ON inv.product_id=p.id
   WHERE o.status='processing' AND business_driver_of(o.business_details,o.notes) IS NOT NULL
   GROUP BY p.sku,p.name_ar
 ) x
$$;

-- One driver-module action on one order. p_data:
--   id, expected_status, action (assign|unassign|deliver|return|postpone|remaining|resume|details),
--   driver (assign), amount (deliver: cash actually collected, >= 0), reason (return),
--   postpone_date (postpone), note (any), payment_method / cliq_includes_delivery / delivery_fee (details),
--   acting_driver (set by the server when the caller is a driver: must own the order).
CREATE FUNCTION public.business_driver_action(p_actor text,p_key uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE old_request business_requests; ord orders; inv invoices; mv record;
  act text := p_data->>'action'; cur_driver text; new_driver text; delivery jsonb;
  next_status order_status_enum; amount numeric; paid numeric := 0; pay numeric := 0;
  new_method payment_method_enum; new_fee numeric; new_pay_status payment_status_enum; pdate date;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('driver:'||p_actor||':'||p_key::text,0));
 SELECT * INTO old_request FROM business_requests WHERE operation='driver' AND actor_id=p_actor AND request_key=p_key;
 IF FOUND THEN
   IF old_request.payload<>p_data THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   RETURN jsonb_build_object('order',business_driver_order(old_request.result_id),'replayed',true);
 END IF;
 IF coalesce(length(trim(p_actor)),0)=0 THEN RAISE EXCEPTION 'INVALID_ACTOR'; END IF;
 SELECT * INTO ord FROM orders WHERE order_number=p_data->>'id' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
 cur_driver := business_driver_of(ord.business_details,ord.notes);
 IF p_data ? 'acting_driver' AND cur_driver IS DISTINCT FROM business_driver_canonical(p_data->>'acting_driver') THEN
   RAISE EXCEPTION 'FORBIDDEN';
 END IF;
 IF ord.status::text IS DISTINCT FROM p_data->>'expected_status' THEN RAISE EXCEPTION 'STALE_ORDER'; END IF;
 delivery := coalesce(ord.business_details->'delivery','{}'::jsonb) || jsonb_build_object('driver',cur_driver);
 next_status := ord.status;
 new_pay_status := ord.payment_status;

 IF act='assign' THEN
   new_driver := business_driver_canonical(p_data->>'driver');
   IF new_driver IS NULL THEN RAISE EXCEPTION 'INVALID_DRIVER'; END IF;
   IF ord.status NOT IN ('confirmed','processing','shipped') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
   IF ord.status='confirmed' THEN next_status := 'processing'; END IF;
   delivery := delivery || jsonb_build_object('driver',new_driver,'assigned_at',now(),'assigned_by',p_actor);
 ELSIF act='unassign' THEN
   -- Once shipped, the goods are physically with a driver: reassign or return instead.
   IF ord.status NOT IN ('confirmed','processing') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
   delivery := (delivery || jsonb_build_object('driver',NULL)) - 'state' - 'postpone_date';
 ELSIF act IN ('deliver','return','postpone','remaining') THEN
   IF ord.status NOT IN ('processing','shipped') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
   IF cur_driver IS NULL THEN RAISE EXCEPTION 'NO_DRIVER'; END IF;
   IF act='deliver' THEN
     BEGIN amount := (p_data->>'amount')::numeric;
     EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END;
     IF amount IS NULL OR amount<0 OR amount>=10000000 OR amount<>round(amount,3) THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
     next_status := 'delivered';
     IF amount>0 THEN
       SELECT * INTO inv FROM invoices WHERE order_id=ord.id FOR UPDATE;
       IF NOT FOUND THEN
         -- Orders created outside business_create_order have no invoice yet.
         INSERT INTO invoices(invoice_number,order_id,customer_id,subtotal,total_amount,due_date)
         VALUES('INV-'||ord.id::text,ord.id,ord.customer_id,ord.total_amount,ord.total_amount,ord.order_date)
         RETURNING * INTO inv;
       END IF;
       SELECT coalesce(sum(p.amount),0) INTO paid FROM payments p WHERE p.invoice_id=inv.id;
       -- Cash above the invoice balance (e.g. a delivery fee on a CliQ-paid order) is kept on the
       -- delivery record, never posted as an overpayment.
       pay := least(amount,greatest(inv.total_amount-paid,0));
       IF pay>0 THEN
         INSERT INTO payments(invoice_id,amount,payment_method,notes)
         VALUES(inv.id,pay,'cash','تحصيل نقدي عند التسليم - السائق '||cur_driver);
         new_pay_status := CASE WHEN paid+pay>=inv.total_amount THEN 'paid'::payment_status_enum ELSE 'partial'::payment_status_enum END;
         UPDATE invoices SET status=new_pay_status WHERE id=inv.id;
       END IF;
     END IF;
     delivery := (delivery || jsonb_build_object('collected',amount,'posted_payment',pay,
       'completed_at',now(),'completed_by',p_actor)) - 'state' - 'postpone_date' - 'return_reason';
   ELSIF act='return' THEN
     next_status := 'returned';
     -- Put back exactly what this order took from stock and has not returned yet. (The old direct
     -- writes could push a never-deducted draft into 'processing', so order_items alone is not proof.)
     FOR mv IN SELECT m.product_id,-sum(m.quantity)::int AS qty FROM inventory_movements m
       WHERE m.reference_type='order' AND m.reference_id=ord.id GROUP BY m.product_id HAVING -sum(m.quantity)>0 LOOP
       UPDATE inventory SET quantity_on_hand=quantity_on_hand+mv.qty, updated_at=now() WHERE product_id=mv.product_id;
       INSERT INTO inventory_movements(product_id,movement_type,quantity,reference_type,reference_id)
       VALUES(mv.product_id,'return_in',mv.qty,'order',ord.id);
     END LOOP;
     delivery := (delivery || jsonb_build_object('collected',0,'return_reason',nullif(trim(coalesce(p_data->>'reason','')),''),
       'completed_at',now(),'completed_by',p_actor)) - 'state' - 'postpone_date';
   ELSIF act='postpone' THEN
     IF nullif(p_data->>'postpone_date','') IS NOT NULL THEN
       BEGIN pdate := (p_data->>'postpone_date')::date;
       EXCEPTION WHEN others THEN RAISE EXCEPTION 'INVALID_DATE'; END;
       IF pdate<business_amman_today() THEN RAISE EXCEPTION 'INVALID_DATE'; END IF;
     END IF;
     delivery := delivery || jsonb_build_object('state','postponed','postpone_date',pdate,'state_at',now(),'state_by',p_actor);
   ELSE
     delivery := (delivery || jsonb_build_object('state','remaining','state_at',now(),'state_by',p_actor)) - 'postpone_date';
   END IF;
 ELSIF act='resume' THEN
   IF ord.status NOT IN ('confirmed','processing','shipped') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
   delivery := delivery - 'state' - 'postpone_date';
 ELSIF act='details' THEN
   IF ord.status NOT IN ('confirmed','processing','shipped') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
   IF nullif(p_data->>'payment_method','') IS NOT NULL THEN
     IF p_data->>'payment_method' NOT IN ('cash_on_delivery','cliq') THEN RAISE EXCEPTION 'INVALID_METHOD'; END IF;
     new_method := (p_data->>'payment_method')::payment_method_enum;
   END IF;
   IF p_data ? 'delivery_fee' AND p_data->>'delivery_fee' IS NOT NULL THEN
     BEGIN new_fee := (p_data->>'delivery_fee')::numeric;
     EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END;
     IF new_fee<0 OR new_fee>1000 OR new_fee<>round(new_fee,3) THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
   END IF;
   IF p_data ? 'cliq_includes_delivery' THEN
     IF jsonb_typeof(p_data->'cliq_includes_delivery') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'INVALID_ORDER'; END IF;
     delivery := delivery || jsonb_build_object('cliq_includes_delivery',p_data->'cliq_includes_delivery');
   END IF;
 ELSE
   RAISE EXCEPTION 'INVALID_ACTION';
 END IF;

 IF p_data ? 'note' THEN
   delivery := delivery || jsonb_build_object('note',nullif(trim(coalesce(p_data->>'note','')),''));
 END IF;

 UPDATE orders SET
   status=next_status,
   payment_status=new_pay_status,
   payment_method=coalesce(new_method,payment_method),
   delivery_fee=coalesce(new_fee,delivery_fee),
   notes=business_strip_driver_tag(notes),
   business_details=business_details || jsonb_build_object('delivery',delivery),
   shipped_at=CASE WHEN next_status IN ('shipped','delivered','returned') AND shipped_at IS NULL THEN now() ELSE shipped_at END,
   delivered_at=CASE WHEN next_status='delivered' THEN now() ELSE delivered_at END,
   updated_at=now()
 WHERE id=ord.id;
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id)
 VALUES('driver',p_actor,p_key,p_data,ord.id);
 RETURN jsonb_build_object('order',business_driver_order(ord.id),'replayed',false);
END $$;

-- Morning dispatch: ships exactly the listed orders that are still 'processing' with one of the
-- given drivers. Anything else is reported back as skipped, never forced. Re-running is harmless.
CREATE FUNCTION public.business_driver_dispatch(p_actor text,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE ord orders; order_id text; drv text; drivers text[]; shipped jsonb := '[]'::jsonb; skipped jsonb := '[]'::jsonb;
BEGIN
 IF coalesce(length(trim(p_actor)),0)=0 THEN RAISE EXCEPTION 'INVALID_ACTOR'; END IF;
 IF jsonb_typeof(p_data->'ids') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'ids')>500
   OR jsonb_typeof(p_data->'drivers') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_ORDER'; END IF;
 SELECT array_agg(business_driver_canonical(d)) INTO drivers FROM jsonb_array_elements_text(p_data->'drivers') d;
 FOR order_id IN SELECT DISTINCT x FROM jsonb_array_elements_text(p_data->'ids') x ORDER BY x LOOP
   SELECT * INTO ord FROM orders WHERE order_number=order_id FOR UPDATE;
   drv := CASE WHEN FOUND THEN business_driver_of(ord.business_details,ord.notes) END;
   IF FOUND AND ord.status='processing' AND drv IS NOT NULL AND drv=ANY(coalesce(drivers,'{}')) THEN
     UPDATE orders SET status='shipped',shipped_at=now(),updated_at=now(),notes=business_strip_driver_tag(notes),
       business_details=business_details || jsonb_build_object('delivery',
         coalesce(business_details->'delivery','{}'::jsonb) || jsonb_build_object('driver',drv,'dispatched_at',now(),'dispatched_by',p_actor))
     WHERE id=ord.id;
     shipped := shipped || to_jsonb(order_id);
   ELSE
     skipped := skipped || to_jsonb(order_id);
   END IF;
 END LOOP;
 RETURN jsonb_build_object('shipped',shipped,'skipped',skipped);
END $$;

-- A driver's day, computed from the orders themselves (never from client-sent totals).
CREATE FUNCTION public.business_driver_shift(p_driver text, p_date date) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 WITH day AS (SELECT coalesce(p_date,business_amman_today()) AS d, business_driver_canonical(p_driver) AS drv),
 done AS (
   SELECT o.status,
     coalesce((o.business_details->'delivery'->>'collected')::numeric,
       substring(coalesce(o.notes,'') from '\[المبلغ المستلم:\s*([0-9]+(?:\.[0-9]+)?)\]')::numeric,0) AS collected
   FROM orders o, day
   WHERE o.status IN ('delivered','returned') AND o.updated_at>=(day.d::timestamp AT TIME ZONE 'Asia/Amman')
     AND business_driver_done_day(o)=day.d
     AND business_driver_of(o.business_details,o.notes)=day.drv
 ),
 open AS (
   SELECT count(*) AS n FROM orders o, day
   WHERE o.status IN ('processing','shipped') AND business_driver_of(o.business_details,o.notes)=day.drv
 )
 SELECT jsonb_build_object(
   'driver',day.drv,'date',day.d,
   'delivered_count',(SELECT count(*) FROM done WHERE status='delivered'),
   'returned_count',(SELECT count(*) FROM done WHERE status='returned'),
   'open_count',(SELECT n FROM open),
   'expected_cash',(SELECT coalesce(sum(collected),0) FROM done WHERE status='delivered'),
   'closure',(SELECT jsonb_build_object('is_closed',s.is_closed,'closed_at',s.closed_at,'closed_by',s.closed_by,
       'notes',coalesce(s.notes,''),'cash_collected',s.cash_collected,'counted_cash',s.counted_cash,
       'delivered_count',s.delivered_count,'returned_count',s.returned_count,
       'reopened_by',s.reopened_by,'reopened_at',s.reopened_at)
     FROM driver_shift_closures s WHERE s.driver_name=day.drv AND s.shift_date=day.d)
 ) FROM day
$$;

-- p_data: driver, action (close|reopen), counted_cash (close), notes (close). Closing an already
-- closed shift returns it unchanged (safe to retry); totals are recomputed from the orders.
CREATE FUNCTION public.business_driver_shift_action(p_actor text,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE drv text := business_driver_canonical(p_data->>'driver'); d date := business_amman_today();
  summary jsonb; counted numeric; existing driver_shift_closures;
BEGIN
 IF coalesce(length(trim(p_actor)),0)=0 THEN RAISE EXCEPTION 'INVALID_ACTOR'; END IF;
 IF drv IS NULL THEN RAISE EXCEPTION 'INVALID_DRIVER'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('shift:'||drv||':'||d::text,0));
 SELECT * INTO existing FROM driver_shift_closures WHERE driver_name=drv AND shift_date=d FOR UPDATE;
 IF p_data->>'action'='close' THEN
   IF FOUND AND existing.is_closed THEN RETURN business_driver_shift(drv,d); END IF;
   BEGIN counted := (p_data->>'counted_cash')::numeric;
   EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END;
   IF counted IS NULL OR counted<0 OR counted>=10000000 OR counted<>round(counted,3) THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
   summary := business_driver_shift(drv,d);
   INSERT INTO driver_shift_closures(driver_name,shift_date,is_closed,closed_at,closed_by,notes,
     cash_collected,counted_cash,delivered_count,returned_count)
   VALUES(drv,d,true,now(),p_actor,coalesce(p_data->>'notes',''),(summary->>'expected_cash')::numeric,counted,
     (summary->>'delivered_count')::int,(summary->>'returned_count')::int)
   ON CONFLICT (driver_name,shift_date) DO UPDATE SET is_closed=true,closed_at=now(),closed_by=p_actor,
     notes=excluded.notes,cash_collected=excluded.cash_collected,counted_cash=excluded.counted_cash,
     delivered_count=excluded.delivered_count,returned_count=excluded.returned_count;
 ELSIF p_data->>'action'='reopen' THEN
   IF FOUND AND existing.is_closed THEN
     UPDATE driver_shift_closures SET is_closed=false,reopened_by=p_actor,reopened_at=now() WHERE id=existing.id;
   END IF;
 ELSE
   RAISE EXCEPTION 'INVALID_ACTION';
 END IF;
 RETURN business_driver_shift(drv,d);
END $$;

REVOKE ALL ON FUNCTION public.business_amman_today(),public.business_driver_canonical(text),
 public.business_driver_of(jsonb,text),public.business_strip_driver_tag(text),public.business_driver_done_day(orders),
 public.business_driver_order(uuid),public.business_driver_board(text,date),public.business_driver_stock_needed(),
 public.business_driver_action(text,uuid,jsonb),public.business_driver_dispatch(text,jsonb),
 public.business_driver_shift(text,date),public.business_driver_shift_action(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_amman_today(),public.business_driver_canonical(text),
 public.business_driver_of(jsonb,text),public.business_strip_driver_tag(text),public.business_driver_done_day(orders),
 public.business_driver_order(uuid),public.business_driver_board(text,date),public.business_driver_stock_needed(),
 public.business_driver_action(text,uuid,jsonb),public.business_driver_dispatch(text,jsonb),
 public.business_driver_shift(text,date),public.business_driver_shift_action(text,jsonb) TO service_role;

COMMIT;
