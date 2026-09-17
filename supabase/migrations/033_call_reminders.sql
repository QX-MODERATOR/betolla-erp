-- Additive only: new columns/tables; call-log, customer-update and three read functions replaced
-- with the same signatures.
-- In-app call reminders (replaces the "open in Google Calendar" link):
--   * a scheduled call keeps its time as well as its date (customers.next_call_at, Amman time);
--   * business_call_reminders_claim returns calls starting within the next few minutes, each once;
--   * business_call_digest gives each rep's calls for the day (morning summary);
--   * business_task_claim makes a scheduled task run at most once per key (e.g. once per day).
-- Requires migrations 029 (ownership checks, customer_changes) and 031 (business_customer_row).
BEGIN;

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS next_call_at TIMESTAMPTZ;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS next_call_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_customers_next_call_at ON public.customers(next_call_at) WHERE next_call_at IS NOT NULL;

CREATE TABLE public.call_reminders_sent (
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  due_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, due_at)
);
CREATE TABLE public.scheduled_task_runs (
  task TEXT NOT NULL,
  run_key TEXT NOT NULL,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (task, run_key)
);
ALTER TABLE public.call_reminders_sent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_task_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.call_reminders_sent, public.scheduled_task_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.call_reminders_sent, public.scheduled_task_runs TO service_role;

-- 'HH:MM' on a date, in Amman time. NULL when either part is missing.
CREATE FUNCTION public.business_amman_at(p_date date, p_time text) RETURNS timestamptz
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
 IF p_date IS NULL OR nullif(p_time,'') IS NULL THEN RETURN NULL; END IF;
 IF p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'INVALID_TIME'; END IF;
 RETURN (p_date + p_time::time) AT TIME ZONE 'Asia/Amman';
END $$;

-- Same as migration 029, plus p_data.next_call_time (HH:MM) stored as next_call_at.
CREATE OR REPLACE FUNCTION public.business_call_log_create(p_actor text, p_key uuid, p_data jsonb, p_rep_name text) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE old_request business_requests; cust customers; log_id uuid := gen_random_uuid();
  outcome_in call_outcome_enum; next_date date; next_at timestamptz; logged_customer_id uuid;
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
 next_at := business_amman_at(next_date,p_data->>'next_call_time');
 INSERT INTO call_logs(id,customer_id,called_at,outcome,notes,next_call_date,next_call_at,rep_name)
 VALUES(log_id,cust.id,now(),outcome_in,nullif(trim(p_data->>'notes'),''),next_date,next_at,nullif(trim(p_rep_name),''));
 UPDATE customers SET last_contact_date=business_amman_today(),
   next_call_date=CASE WHEN p_data ? 'next_call_date' THEN next_date ELSE next_call_date END,
   next_call_at=CASE WHEN p_data ? 'next_call_date' THEN next_at ELSE next_call_at END,
   updated_at=now() WHERE id=cust.id;
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('call_log',p_actor,p_key,p_data,log_id);
 RETURN jsonb_build_object('customer',business_customer_document(cust.id),'log_id',log_id,'replayed',false);
END $$;

-- Same as migration 029, plus next_call_time. Editing a customer without touching the call time
-- keeps it (unless the date itself changes); the change history records next_call_at too.
CREATE OR REPLACE FUNCTION public.business_customer_update(p_actor text,p_id uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE cust customers; after customers; diff jsonb := '{}'::jsonb; scope text := nullif(trim(p_data->>'scope_rep'),'');
  new_date date; new_at timestamptz;
BEGIN
 IF coalesce(length(trim(p_actor)),0)=0 THEN RAISE EXCEPTION 'INVALID_ACTOR'; END IF;
 SELECT * INTO cust FROM customers WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
 IF p_data ? 'scope_rep' THEN
   IF scope IS NULL OR cust.rep_name_raw IS DISTINCT FROM scope THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
   IF p_data ? 'rep_name' AND nullif(trim(p_data->>'rep_name'),'') IS DISTINCT FROM scope THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 END IF;
 IF p_data ? 'phone' AND coalesce(length(trim(p_data->>'phone')),0)=0 THEN RAISE EXCEPTION 'INVALID_PHONE'; END IF;
 new_date := CASE WHEN p_data ? 'next_call_date' THEN nullif(p_data->>'next_call_date','')::date ELSE cust.next_call_date END;
 new_at := CASE
   WHEN nullif(p_data->>'next_call_time','') IS NOT NULL THEN business_amman_at(new_date,p_data->>'next_call_time')
   WHEN new_date IS NOT DISTINCT FROM cust.next_call_date THEN cust.next_call_at
   ELSE NULL END;
 UPDATE customers SET
   name=coalesce(nullif(trim(p_data->>'name'),''),name),
   phone=coalesce(nullif(trim(p_data->>'phone'),''),phone),
   city=CASE WHEN p_data ? 'city' THEN nullif(trim(p_data->>'city'),'') ELSE city END,
   address=CASE WHEN p_data ? 'address' THEN nullif(trim(p_data->>'address'),'') ELSE address END,
   notes=CASE WHEN p_data ? 'notes' THEN nullif(trim(p_data->>'notes'),'') ELSE notes END,
   rep_name_raw=CASE WHEN p_data ? 'rep_name' THEN nullif(trim(p_data->>'rep_name'),'') ELSE rep_name_raw END,
   customer_type=CASE WHEN p_data ? 'customer_type' THEN (p_data->>'customer_type')::customer_type_enum ELSE customer_type END,
   classification=CASE WHEN p_data ? 'classification' THEN (p_data->>'classification')::customer_classification_enum ELSE classification END,
   next_call_date=new_date,
   next_call_at=new_at,
   updated_at=now()
 WHERE id=p_id
 RETURNING * INTO after;
 SELECT coalesce(jsonb_object_agg(k,jsonb_build_object('from',b.v,'to',a.v)),'{}'::jsonb) INTO diff
 FROM jsonb_each(to_jsonb(cust)) b(k,v) JOIN jsonb_each(to_jsonb(after)) a(k,v) USING (k)
 WHERE k IN ('name','phone','city','address','notes','rep_name_raw','customer_type','classification','next_call_date','next_call_at')
   AND a.v IS DISTINCT FROM b.v;
 IF diff<>'{}'::jsonb THEN
   INSERT INTO customer_changes(customer_id,actor_id,changes) VALUES(p_id,p_actor,diff);
 END IF;
 RETURN jsonb_build_object('customer',business_customer_document(p_id));
END $$;

-- Read functions: same output as before plus next_call_at.
CREATE OR REPLACE FUNCTION public.business_customer_document(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT jsonb_build_object(
   'id',c.id,'legacy_id',c.legacy_id,'name',c.name,'phone',c.phone,
   'customer_type',c.customer_type,'classification',c.classification,'lead_source',c.lead_source,
   'address',coalesce(c.address,''),'city',coalesce(c.city,''),'rep_name_raw',coalesce(c.rep_name_raw,''),
   'notes',coalesce(c.notes,''),'last_contact_date',c.last_contact_date,'next_call_date',c.next_call_date,
   'next_call_at',c.next_call_at,
   'created_at',c.created_at,'updated_at',c.updated_at,
   'history',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'date',l.called_at::date,'rep',coalesce(l.rep_name,p.full_name_ar,''),'outcome',l.outcome,'notes',coalesce(l.notes,''))
      ORDER BY l.called_at DESC)
      FROM call_logs l LEFT JOIN profiles p ON p.id=l.rep_id WHERE l.customer_id=c.id),'[]'::jsonb)
 ) FROM customers c WHERE c.id=p_id
$$;

CREATE OR REPLACE FUNCTION public.business_customer_row(c customers, p_history int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT jsonb_build_object(
   'id',c.id,'legacy_id',c.legacy_id,'name',c.name,'phone',c.phone,
   'customer_type',c.customer_type,'classification',c.classification,'lead_source',c.lead_source,
   'address',coalesce(c.address,''),'city',coalesce(c.city,''),'rep_name_raw',coalesce(c.rep_name_raw,''),
   'notes',coalesce(c.notes,''),'last_contact_date',c.last_contact_date,'next_call_date',c.next_call_date,
   'next_call_at',c.next_call_at,
   'created_at',c.created_at,'updated_at',c.updated_at,
   'history',CASE WHEN p_history<=0 THEN '[]'::jsonb ELSE coalesce((
     SELECT jsonb_agg(h.doc ORDER BY h.called_at DESC) FROM (
       SELECT l.called_at,jsonb_build_object('date',l.called_at::date,'rep',coalesce(l.rep_name,p.full_name_ar,''),
         'outcome',l.outcome,'notes',coalesce(l.notes,'')) AS doc
       FROM call_logs l LEFT JOIN profiles p ON p.id=l.rep_id
       WHERE l.customer_id=c.id ORDER BY l.called_at DESC LIMIT p_history) h),'[]'::jsonb) END)
$$;

-- The call schedule is ordered by date, then time (calls without a time last within their day).
CREATE OR REPLACE FUNCTION public.business_call_queue(p_rep_scope text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(business_customer_row(c,1) ORDER BY c.next_call_date, c.next_call_at NULLS LAST, c.id),'[]'::jsonb)
 FROM customers c
 WHERE c.next_call_date IS NOT NULL AND (p_rep_scope IS NULL OR c.rep_name_raw=p_rep_scope)
$$;

CREATE OR REPLACE FUNCTION public.business_customer_list_by_rep(p_rep text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id, 'legacy_id', c.legacy_id, 'name', c.name, 'phone', c.phone,
      'customer_type', c.customer_type, 'classification', c.classification, 'lead_source', c.lead_source,
      'address', coalesce(c.address, ''), 'city', coalesce(c.city, ''), 'rep_name_raw', coalesce(c.rep_name_raw, ''),
      'notes', coalesce(c.notes, ''), 'last_contact_date', c.last_contact_date, 'next_call_date', c.next_call_date,
      'next_call_at', c.next_call_at,
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
  WHERE c.rep_name_raw = p_rep
$$;

-- Calls starting within p_lead_minutes (or up to 2 hours late, if a run was missed) that have not
-- been reminded for this exact time yet. Claiming records them, so each reminder is sent once;
-- moving the call to a new time makes a new reminder.
CREATE FUNCTION public.business_call_reminders_claim(p_lead_minutes int) RETURNS jsonb
LANGUAGE sql SET search_path = public AS $$
 WITH due AS (
   INSERT INTO call_reminders_sent(customer_id,due_at)
   SELECT c.id,c.next_call_at FROM customers c
   WHERE c.next_call_at IS NOT NULL
     AND c.next_call_at <= now()+make_interval(mins=>least(greatest(coalesce(p_lead_minutes,10),0),120))
     AND c.next_call_at >= now()-interval '2 hours'
   ON CONFLICT DO NOTHING
   RETURNING customer_id,due_at
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('customer_id',c.id,'name',c.name,'phone',c.phone,
   'rep_name',coalesce(c.rep_name_raw,''),'due_at',d.due_at) ORDER BY d.due_at),'[]'::jsonb)
 FROM due d JOIN customers c ON c.id=d.customer_id
$$;

-- Each rep's calls for p_day: scheduled that day, and overdue from earlier days.
CREATE FUNCTION public.business_call_digest(p_day date) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('rep_name',r.rep,'today',r.today,'overdue',r.overdue,'first_at',r.first_at) ORDER BY r.rep),'[]'::jsonb)
 FROM (
   SELECT coalesce(rep_name_raw,'') AS rep,
     count(*) FILTER (WHERE next_call_date=p_day) AS today,
     count(*) FILTER (WHERE next_call_date<p_day) AS overdue,
     min(next_call_at) FILTER (WHERE next_call_date=p_day) AS first_at
   FROM customers WHERE next_call_date<=p_day AND coalesce(rep_name_raw,'')<>''
   GROUP BY 1
 ) r
$$;

-- True the first time a (task, key) pair is claimed, false afterwards.
CREATE FUNCTION public.business_task_claim(p_task text, p_key text) RETURNS boolean
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 INSERT INTO scheduled_task_runs(task,run_key) VALUES(p_task,p_key) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN false; END IF;
 DELETE FROM scheduled_task_runs WHERE ran_at<now()-interval '90 days';
 DELETE FROM call_reminders_sent WHERE sent_at<now()-interval '90 days';
 RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.business_amman_at(date,text),public.business_call_reminders_claim(int),
 public.business_call_digest(date),public.business_task_claim(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_amman_at(date,text),public.business_call_reminders_claim(int),
 public.business_call_digest(date),public.business_task_claim(text,text) TO service_role;

COMMIT;
