-- Additive only: one new table; two existing functions replaced with the same signatures.
-- Customer ownership and change history (QA audit group 5):
--   * p_data.scope_rep (set by the app for sales reps) limits an edit or a call log to leads assigned
--     to that rep, and a scoped edit can never reassign the lead;
--   * every customer edit records who changed which fields, from what, to what.
-- The app also checks ownership itself, so behaviour is safe before this migration is applied.
BEGIN;

CREATE TABLE public.customer_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  changes JSONB NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_customer_changes_customer ON public.customer_changes(customer_id, changed_at DESC);
ALTER TABLE public.customer_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_changes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.customer_changes TO service_role;

CREATE OR REPLACE FUNCTION public.business_customer_update(p_actor text,p_id uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE cust customers; after customers; diff jsonb := '{}'::jsonb; scope text := nullif(trim(p_data->>'scope_rep'),'');
BEGIN
 IF coalesce(length(trim(p_actor)),0)=0 THEN RAISE EXCEPTION 'INVALID_ACTOR'; END IF;
 SELECT * INTO cust FROM customers WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
 IF p_data ? 'scope_rep' THEN
   IF scope IS NULL OR cust.rep_name_raw IS DISTINCT FROM scope THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
   IF p_data ? 'rep_name' AND nullif(trim(p_data->>'rep_name'),'') IS DISTINCT FROM scope THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 END IF;
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
 WHERE id=p_id
 RETURNING * INTO after;
 SELECT coalesce(jsonb_object_agg(k,jsonb_build_object('from',b.v,'to',a.v)),'{}'::jsonb) INTO diff
 FROM jsonb_each(to_jsonb(cust)) b(k,v) JOIN jsonb_each(to_jsonb(after)) a(k,v) USING (k)
 WHERE k IN ('name','phone','city','address','notes','rep_name_raw','customer_type','classification','next_call_date')
   AND a.v IS DISTINCT FROM b.v;
 IF diff<>'{}'::jsonb THEN
   INSERT INTO customer_changes(customer_id,actor_id,changes) VALUES(p_id,p_actor,diff);
 END IF;
 RETURN jsonb_build_object('customer',business_customer_document(p_id));
END $$;

-- Same as migration 016, plus the optional p_data.scope_rep ownership check.
CREATE OR REPLACE FUNCTION public.business_call_log_create(p_actor text, p_key uuid, p_data jsonb, p_rep_name text) RETURNS jsonb
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
 IF p_data ? 'scope_rep' AND cust.rep_name_raw IS DISTINCT FROM nullif(trim(p_data->>'scope_rep'),'') THEN
   RAISE EXCEPTION 'FORBIDDEN';
 END IF;
 BEGIN outcome_in := (p_data->>'outcome')::call_outcome_enum;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'INVALID_OUTCOME'; END;
 next_date := nullif(p_data->>'next_call_date','')::date;
 INSERT INTO call_logs(id,customer_id,called_at,outcome,notes,next_call_date,rep_name)
 VALUES(log_id,cust.id,now(),outcome_in,nullif(trim(p_data->>'notes'),''),next_date,nullif(trim(p_rep_name),''));
 UPDATE customers SET last_contact_date=current_date,
   next_call_date=CASE WHEN p_data ? 'next_call_date' THEN next_date ELSE next_call_date END,
   updated_at=now() WHERE id=cust.id;
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('call_log',p_actor,p_key,p_data,log_id);
 RETURN jsonb_build_object('customer',business_customer_document(cust.id),'log_id',log_id,'replayed',false);
END $$;

COMMIT;
