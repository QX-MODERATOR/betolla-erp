-- Additive only: same signature as 027's business_driver_action, one new action.
-- The driver-ops board (app/drivers/page.tsx) had no cancel action at all — only
-- deliver/return/postpone/remaining/resume — so a confirmed/processing order could never be
-- cancelled from there (only from the separate admin /orders lifecycle view, via business_status).
-- 'cancel' here mirrors 'return's inventory-reversal (confirmed/processing orders already had
-- stock deducted; a draft never did) and follows the same "not once shipped" boundary already
-- used by 'unassign' and by business_status's own cancellation rule (012_order_cancellation.sql).
-- Note: this migration number may collide with a concurrently-developed 035 — check
-- supabase/migrations/ before applying and renumber if needed; no other migration depends on this one.
BEGIN;

CREATE OR REPLACE FUNCTION public.business_driver_action(p_actor text,p_key uuid,p_data jsonb) RETURNS jsonb
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
 ELSIF act='cancel' THEN
   -- Same boundary as unassign: once shipped, the only way back is deliver/return, never cancel.
   IF ord.status NOT IN ('confirmed','processing') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
   next_status := 'cancelled';
   FOR mv IN SELECT m.product_id,-sum(m.quantity)::int AS qty FROM inventory_movements m
     WHERE m.reference_type='order' AND m.reference_id=ord.id GROUP BY m.product_id HAVING -sum(m.quantity)>0 LOOP
     UPDATE inventory SET quantity_on_hand=quantity_on_hand+mv.qty, updated_at=now() WHERE product_id=mv.product_id;
     INSERT INTO inventory_movements(product_id,movement_type,quantity,reference_type,reference_id)
     VALUES(mv.product_id,'return_in',mv.qty,'order',ord.id);
   END LOOP;
   delivery := (delivery || jsonb_build_object('cancel_reason',nullif(trim(coalesce(p_data->>'reason','')),''),
     'completed_at',now(),'completed_by',p_actor)) - 'state' - 'postpone_date';
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
   cancelled_at=CASE WHEN next_status='cancelled' THEN now() ELSE cancelled_at END,
   updated_at=now()
 WHERE id=ord.id;
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id)
 VALUES('driver',p_actor,p_key,p_data,ord.id);
 RETURN jsonb_build_object('order',business_driver_order(ord.id),'replayed',false);
END $$;

COMMIT;
