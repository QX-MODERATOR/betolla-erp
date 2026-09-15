-- Additive only: no backfill, deletion, or changes to existing RLS/policies.
-- Adds edit/reassignment for customers and real call-log persistence (call_logs),
-- replacing the in-memory-only /api/calls stub.
BEGIN;

-- A full-field overwrite is naturally idempotent (no ledger needed, matching
-- business_customer_create's phone-based dedup rather than a request_key ledger).
CREATE FUNCTION public.business_customer_update(p_actor text,p_id uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE cust customers;
BEGIN
 IF coalesce(length(trim(p_actor)),0)=0 THEN RAISE EXCEPTION 'INVALID_ACTOR'; END IF;
 SELECT * INTO cust FROM customers WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
 IF p_data ? 'phone' AND coalesce(length(trim(p_data->>'phone')),0)=0 THEN RAISE EXCEPTION 'INVALID_PHONE'; END IF;
 UPDATE customers SET
   name=coalesce(nullif(trim(p_data->>'name'),''),name),
   phone=coalesce(nullif(trim(p_data->>'phone'),''),phone),
   city=CASE WHEN p_data ? 'city' THEN nullif(trim(p_data->>'city'),'') ELSE city END,
   address=CASE WHEN p_data ? 'address' THEN nullif(trim(p_data->>'address'),'') ELSE address END,
   notes=CASE WHEN p_data ? 'notes' THEN nullif(trim(p_data->>'notes'),'') ELSE notes END,
   rep_name_raw=CASE WHEN p_data ? 'rep_name' THEN nullif(trim(p_data->>'rep_name'),'') ELSE rep_name_raw END,
   customer_type=CASE WHEN p_data ? 'customer_type' THEN (p_data->>'customer_type')::customer_type_enum ELSE customer_type END,
   classification=CASE WHEN p_data ? 'classification' THEN (p_data->>'classification')::customer_classification_enum ELSE classification END,
   next_call_date=CASE WHEN p_data ? 'next_call_date' THEN nullif(p_data->>'next_call_date','')::date ELSE next_call_date END,
   updated_at=now()
 WHERE id=p_id;
 RETURN jsonb_build_object('customer',business_customer_document(p_id));
END $$;

-- Every call is additive (a new row); retried submissions must not double-log,
-- so this follows the same request_key ledger pattern as orders/payments/movements.
CREATE FUNCTION public.business_call_log_create(p_actor text,p_key uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE old_request business_requests; cust customers; log_id uuid := gen_random_uuid();
  outcome_in call_outcome_enum; next_date date; logged_customer_id uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('call-log:'||p_actor||':'||p_key::text,0));
 SELECT * INTO old_request FROM business_requests WHERE operation='call_log' AND actor_id=p_actor AND request_key=p_key;
 IF FOUND THEN
   IF old_request.payload<>p_data THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   SELECT customer_id INTO logged_customer_id FROM call_logs WHERE id=old_request.result_id;
   RETURN jsonb_build_object('customer',business_customer_document(logged_customer_id),'log_id',old_request.result_id,'replayed',true);
 END IF;
 BEGIN cust.id := (p_data->>'customer_id')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END;
 SELECT * INTO cust FROM customers WHERE id=cust.id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
 BEGIN outcome_in := (p_data->>'outcome')::call_outcome_enum;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'INVALID_OUTCOME'; END;
 next_date := nullif(p_data->>'next_call_date','')::date;
 INSERT INTO call_logs(id,customer_id,called_at,outcome,notes,next_call_date)
 VALUES(log_id,cust.id,now(),outcome_in,nullif(trim(p_data->>'notes'),''),next_date);
 UPDATE customers SET last_contact_date=current_date,
   next_call_date=CASE WHEN p_data ? 'next_call_date' THEN next_date ELSE next_call_date END,
   updated_at=now() WHERE id=cust.id;
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('call_log',p_actor,p_key,p_data,log_id);
 RETURN jsonb_build_object('customer',business_customer_document(cust.id),'log_id',log_id,'replayed',false);
END $$;

-- Only the existing server identity can call these RPCs; never expose the service key.
REVOKE ALL ON FUNCTION public.business_customer_update(text,uuid,jsonb),
 public.business_call_log_create(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_customer_update(text,uuid,jsonb),
 public.business_call_log_create(text,uuid,jsonb) TO service_role;
COMMIT;
