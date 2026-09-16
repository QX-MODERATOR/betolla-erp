-- Additive only: no backfill, deletion, or changes to existing RLS/policies.
-- call_logs.rep_id (UUID REFERENCES profiles(id)) was never populated by
-- business_call_log_create, and even if it had been, the app's login-account
-- ids (lib/auth.ts, e.g. "rep-rahma-01") don't correspond to any profiles.id
-- row, so a rep_id-based join could never resolve a name either way. Every
-- call log's history entry has shown 'rep': '' since this RPC was written.
-- Fix: store the acting rep's display name directly at insert time (same
-- denormalized-string pattern as orders.owner_account_id from migration 006),
-- and prefer it over the profiles join when building history entries.
BEGIN;

ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS rep_name text;

DROP FUNCTION IF EXISTS public.business_call_log_create(text, uuid, jsonb);

CREATE FUNCTION public.business_call_log_create(p_actor text, p_key uuid, p_data jsonb, p_rep_name text) RETURNS jsonb
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
 INSERT INTO call_logs(id,customer_id,called_at,outcome,notes,next_call_date,rep_name)
 VALUES(log_id,cust.id,now(),outcome_in,nullif(trim(p_data->>'notes'),''),next_date,nullif(trim(p_rep_name),''));
 UPDATE customers SET last_contact_date=current_date,
   next_call_date=CASE WHEN p_data ? 'next_call_date' THEN next_date ELSE next_call_date END,
   updated_at=now() WHERE id=cust.id;
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('call_log',p_actor,p_key,p_data,log_id);
 RETURN jsonb_build_object('customer',business_customer_document(cust.id),'log_id',log_id,'replayed',false);
END $$;

REVOKE ALL ON FUNCTION public.business_call_log_create(text,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_call_log_create(text,uuid,jsonb,text) TO service_role;

CREATE OR REPLACE FUNCTION public.business_customer_document(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT jsonb_build_object(
   'id',c.id,'legacy_id',c.legacy_id,'name',c.name,'phone',c.phone,
   'customer_type',c.customer_type,'classification',c.classification,'lead_source',c.lead_source,
   'address',coalesce(c.address,''),'city',coalesce(c.city,''),'rep_name_raw',coalesce(c.rep_name_raw,''),
   'notes',coalesce(c.notes,''),'last_contact_date',c.last_contact_date,'next_call_date',c.next_call_date,
   'created_at',c.created_at,'updated_at',c.updated_at,
   'history',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'date',l.called_at::date,'rep',coalesce(l.rep_name,p.full_name_ar,''),'outcome',l.outcome,'notes',coalesce(l.notes,''))
      ORDER BY l.called_at DESC)
      FROM call_logs l LEFT JOIN profiles p ON p.id=l.rep_id WHERE l.customer_id=c.id),'[]'::jsonb)
 ) FROM customers c WHERE c.id=p_id
$$;

CREATE OR REPLACE FUNCTION public.business_customer_list() RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id, 'legacy_id', c.legacy_id, 'name', c.name, 'phone', c.phone,
      'customer_type', c.customer_type, 'classification', c.classification, 'lead_source', c.lead_source,
      'address', coalesce(c.address, ''), 'city', coalesce(c.city, ''), 'rep_name_raw', coalesce(c.rep_name_raw, ''),
      'notes', coalesce(c.notes, ''), 'last_contact_date', c.last_contact_date, 'next_call_date', c.next_call_date,
      'created_at', c.created_at, 'updated_at', c.updated_at,
      'history', coalesce(h.history, '[]'::jsonb)
    ) ORDER BY c.created_at DESC, c.id
  ), '[]'::jsonb)
  FROM customers c
  LEFT JOIN (
    SELECT l.customer_id,
           jsonb_agg(jsonb_build_object(
             'date', l.called_at::date, 'rep', coalesce(l.rep_name, p.full_name_ar, ''),
             'outcome', l.outcome, 'notes', coalesce(l.notes, '')
           ) ORDER BY l.called_at DESC) AS history
    FROM call_logs l
    LEFT JOIN profiles p ON p.id = l.rep_id
    GROUP BY l.customer_id
  ) h ON h.customer_id = c.id
$$;

COMMIT;
