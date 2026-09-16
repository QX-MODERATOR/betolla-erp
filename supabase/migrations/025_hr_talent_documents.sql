-- Additive only: no backfill, deletion of business data, or changes to existing RLS/policies.
-- HR module, phase 4: recruitment (openings, candidates, stage timeline, hire -> employee),
-- performance reviews (manager/HR authored, KPI snapshot, employee acknowledgement),
-- employee document register (metadata + expiry only, no files) and de-duplicated
-- expiry alerts for documents, contracts and probation periods.
-- Depends on 006, 016 (call_logs.rep_name), 022-024.
BEGIN;

-- ---------------------------------------------------------------- recruitment

CREATE TABLE IF NOT EXISTS public.hr_job_openings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  department_id UUID REFERENCES public.hr_departments(id),
  employment_type TEXT NOT NULL DEFAULT 'full_time'
    CHECK (employment_type IN ('full_time','part_time','contract','intern','freelance')),
  positions INT NOT NULL DEFAULT 1 CHECK (positions BETWEEN 1 AND 100),
  location TEXT,
  description TEXT,
  requirements TEXT,
  salary_min NUMERIC(12,3) CHECK (salary_min >= 0),
  salary_max NUMERIC(12,3) CHECK (salary_max >= 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','on_hold','closed')),
  created_by TEXT NOT NULL,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (salary_min IS NULL OR salary_max IS NULL OR salary_max >= salary_min)
);

CREATE TABLE IF NOT EXISTS public.hr_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opening_id UUID NOT NULL REFERENCES public.hr_job_openings(id),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  source TEXT NOT NULL DEFAULT 'other'
    CHECK (source IN ('referral','website','social_media','linkedin','walk_in','agency','job_board','other')),
  stage TEXT NOT NULL DEFAULT 'applied'
    CHECK (stage IN ('applied','screening','interview','offer','hired','rejected','withdrawn')),
  rating INT CHECK (rating BETWEEN 1 AND 5),
  expected_salary NUMERIC(12,3) CHECK (expected_salary >= 0),
  interview_at TIMESTAMPTZ,
  notes TEXT,
  rejection_reason TEXT,
  employee_id UUID REFERENCES public.hr_employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (opening_id, phone)
);
CREATE INDEX IF NOT EXISTS idx_hr_candidates_opening ON public.hr_candidates(opening_id, stage);

CREATE TABLE IF NOT EXISTS public.hr_candidate_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.hr_candidates(id),
  actor_id TEXT NOT NULL,
  event TEXT NOT NULL,
  from_stage TEXT,
  to_stage TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hr_candidate_events ON public.hr_candidate_events(candidate_id, created_at);

-- ---------------------------------------------------------------- performance

CREATE TABLE IF NOT EXISTS public.hr_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id),
  reviewer_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  scores JSONB NOT NULL DEFAULT '{}',
  overall NUMERIC(3,2),
  kpis JSONB NOT NULL DEFAULT '{}',
  strengths TEXT,
  improvements TEXT,
  goals TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','acknowledged')),
  submitted_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  employee_comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, period_label),
  CHECK (period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS idx_hr_reviews_status ON public.hr_reviews(status);

-- ---------------------------------------------------------------- documents & alerts

CREATE TABLE IF NOT EXISTS public.hr_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id),
  doc_type TEXT NOT NULL CHECK (doc_type IN ('national_id','passport','residency','work_permit','contract',
    'health_certificate','driving_license','vehicle_license','certificate','other')),
  title TEXT,
  doc_number TEXT,
  issue_date DATE,
  expiry_date DATE,
  notes TEXT,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expiry_date IS NULL OR issue_date IS NULL OR expiry_date >= issue_date)
);
CREATE INDEX IF NOT EXISTS idx_hr_documents_expiry ON public.hr_documents(expiry_date) WHERE NOT archived;
CREATE INDEX IF NOT EXISTS idx_hr_documents_employee ON public.hr_documents(employee_id);

-- One row per (subject, threshold, expiry date): renewing a document re-arms its alerts.
CREATE TABLE IF NOT EXISTS public.hr_alert_log (
  alert_key TEXT PRIMARY KEY,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['hr_job_openings','hr_candidates','hr_reviews','hr_documents'] LOOP
   EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON public.%1$s', t);
   EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['hr_job_openings','hr_candidates','hr_candidate_events','hr_reviews','hr_documents','hr_alert_log'] LOOP
   EXECUTE format('ALTER TABLE public.%s ENABLE ROW LEVEL SECURITY', t);
   EXECUTE format('REVOKE ALL ON public.%s FROM PUBLIC, anon, authenticated', t);
   EXECUTE format('GRANT ALL ON public.%s TO service_role', t);
 END LOOP;
END $$;

-- ================================================================ recruitment functions

CREATE FUNCTION public.business_hr_openings() RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'title',o.title,'department_id',o.department_id,
   'department_name',coalesce(d.name_ar,''),'employment_type',o.employment_type,'positions',o.positions,
   'location',coalesce(o.location,''),'description',coalesce(o.description,''),'requirements',coalesce(o.requirements,''),
   'salary_min',o.salary_min,'salary_max',o.salary_max,'status',o.status,'created_by',o.created_by,
   'closed_at',o.closed_at,'created_at',o.created_at,'updated_at',o.updated_at,
   'stage_counts',coalesce((SELECT jsonb_object_agg(stage,n) FROM (SELECT stage,count(*)::int n FROM hr_candidates c WHERE c.opening_id=o.id GROUP BY stage) x),'{}'::jsonb))
   ORDER BY (o.status='open') DESC,(o.status='on_hold') DESC,o.created_at DESC),'[]'::jsonb)
 FROM hr_job_openings o LEFT JOIN hr_departments d ON d.id=o.department_id
$$;

CREATE FUNCTION public.business_hr_candidate_document(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT jsonb_build_object('id',c.id,'opening_id',c.opening_id,'opening_title',o.title,'full_name',c.full_name,
   'phone',c.phone,'email',coalesce(c.email,''),'source',c.source,'stage',c.stage,'rating',c.rating,
   'expected_salary',c.expected_salary,'interview_at',c.interview_at,'notes',coalesce(c.notes,''),
   'rejection_reason',coalesce(c.rejection_reason,''),'employee_id',c.employee_id,
   'created_at',c.created_at,'updated_at',c.updated_at,
   'events',coalesce((SELECT jsonb_agg(jsonb_build_object('event',e.event,'from_stage',e.from_stage,'to_stage',e.to_stage,
     'note',coalesce(e.note,''),'actor_id',e.actor_id,'created_at',e.created_at) ORDER BY e.created_at,e.id)
     FROM hr_candidate_events e WHERE e.candidate_id=c.id),'[]'::jsonb))
 FROM hr_candidates c JOIN hr_job_openings o ON o.id=c.opening_id WHERE c.id=p_id
$$;

CREATE FUNCTION public.business_hr_candidates(p_opening uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(business_hr_candidate_document(id) ORDER BY updated_at DESC),'[]'::jsonb)
 FROM hr_candidates WHERE p_opening IS NULL OR opening_id=p_opening
$$;

-- p_data: {id?, title, department_id, employment_type, positions, location, description, requirements, salary_min, salary_max, status?}
CREATE FUNCTION public.business_hr_opening_save(p_actor text, p_key uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE replay uuid; oid uuid; old_row hr_job_openings; new_status text := coalesce(nullif(p_data->>'status',''),'open');
BEGIN
 replay := business_hr_replay('hr_opening',p_actor,p_key,p_data);
 IF replay IS NOT NULL THEN RETURN jsonb_build_object('id',replay,'replayed',true); END IF;
 IF coalesce(length(trim(p_data->>'title')),0)=0 THEN RAISE EXCEPTION 'INVALID_OPENING'; END IF;
 IF nullif(p_data->>'department_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hr_departments WHERE id=(p_data->>'department_id')::uuid) THEN
   RAISE EXCEPTION 'DEPARTMENT_NOT_FOUND'; END IF;
 BEGIN
   IF coalesce(p_data->>'id','')='' THEN
     INSERT INTO hr_job_openings(title,department_id,employment_type,positions,location,description,requirements,salary_min,salary_max,status,created_by)
     VALUES(trim(p_data->>'title'),nullif(p_data->>'department_id','')::uuid,p_data->>'employment_type',(p_data->>'positions')::int,
       nullif(p_data->>'location',''),nullif(p_data->>'description',''),nullif(p_data->>'requirements',''),
       nullif(p_data->>'salary_min','')::numeric,nullif(p_data->>'salary_max','')::numeric,new_status,p_actor)
     RETURNING id INTO oid;
     INSERT INTO hr_audit_log(actor_id,action,entity,entity_id,changes) VALUES(p_actor,'create','opening',oid,p_data);
   ELSE
     SELECT * INTO old_row FROM hr_job_openings WHERE id=(p_data->>'id')::uuid FOR UPDATE;
     IF NOT FOUND THEN RAISE EXCEPTION 'OPENING_NOT_FOUND'; END IF;
     UPDATE hr_job_openings SET title=trim(p_data->>'title'),department_id=nullif(p_data->>'department_id','')::uuid,
       employment_type=p_data->>'employment_type',positions=(p_data->>'positions')::int,location=nullif(p_data->>'location',''),
       description=nullif(p_data->>'description',''),requirements=nullif(p_data->>'requirements',''),
       salary_min=nullif(p_data->>'salary_min','')::numeric,salary_max=nullif(p_data->>'salary_max','')::numeric,
       status=new_status,closed_at=CASE WHEN new_status='closed' THEN coalesce(closed_at,now()) ELSE NULL END
     WHERE id=old_row.id RETURNING id INTO oid;
     INSERT INTO hr_audit_log(actor_id,action,entity,entity_id,changes)
     VALUES(p_actor,'update','opening',oid,jsonb_build_object('from',to_jsonb(old_row)-'created_at'-'updated_at','to',p_data));
   END IF;
 EXCEPTION WHEN check_violation THEN RAISE EXCEPTION 'INVALID_OPENING';
 END;
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('hr_opening',p_actor,p_key,p_data,oid);
 RETURN jsonb_build_object('id',oid,'replayed',false);
END $$;

-- p_data: create {opening_id, full_name, phone, email, source, expected_salary, notes}
--       | update {id, full_name, phone, email, source, expected_salary, notes, rating, interview_at}
--       | move {id, stage, note, rejection_reason}   (not to 'hired': use business_hr_candidate_hire)
CREATE FUNCTION public.business_hr_candidate_save(p_actor text, p_key uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE replay uuid; cand hr_candidates; op hr_job_openings; act text := p_data->>'action'; new_stage text;
BEGIN
 replay := business_hr_replay('hr_candidate',p_actor,p_key,p_data);
 IF replay IS NOT NULL THEN RETURN jsonb_build_object('candidate',business_hr_candidate_document(replay),'replayed',true); END IF;
 IF act='create' THEN
   SELECT * INTO op FROM hr_job_openings WHERE id=(p_data->>'opening_id')::uuid;
   IF NOT FOUND THEN RAISE EXCEPTION 'OPENING_NOT_FOUND'; END IF;
   IF op.status='closed' THEN RAISE EXCEPTION 'OPENING_CLOSED'; END IF;
   BEGIN
     INSERT INTO hr_candidates(opening_id,full_name,phone,email,source,expected_salary,notes)
     VALUES(op.id,trim(p_data->>'full_name'),p_data->>'phone',nullif(p_data->>'email',''),p_data->>'source',
       nullif(p_data->>'expected_salary','')::numeric,nullif(p_data->>'notes',''))
     RETURNING * INTO cand;
   EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'DUPLICATE_CANDIDATE'; END;
   INSERT INTO hr_candidate_events(candidate_id,actor_id,event,to_stage) VALUES(cand.id,p_actor,'created','applied');
 ELSE
   SELECT * INTO cand FROM hr_candidates WHERE id=(p_data->>'id')::uuid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'CANDIDATE_NOT_FOUND'; END IF;
   IF cand.stage='hired' THEN RAISE EXCEPTION 'CANDIDATE_LOCKED'; END IF;
   IF act='update' THEN
     BEGIN
       UPDATE hr_candidates SET full_name=trim(p_data->>'full_name'),phone=p_data->>'phone',email=nullif(p_data->>'email',''),
         source=p_data->>'source',expected_salary=nullif(p_data->>'expected_salary','')::numeric,notes=nullif(p_data->>'notes',''),
         rating=nullif(p_data->>'rating','')::int,interview_at=nullif(p_data->>'interview_at','')::timestamptz
       WHERE id=cand.id;
     EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'DUPLICATE_CANDIDATE'; END;
     IF nullif(p_data->>'interview_at','') IS NOT NULL
        AND nullif(p_data->>'interview_at','')::timestamptz IS DISTINCT FROM cand.interview_at THEN
       INSERT INTO hr_candidate_events(candidate_id,actor_id,event,note) VALUES(cand.id,p_actor,'interview_scheduled',p_data->>'interview_at');
     END IF;
   ELSIF act='move' THEN
     new_stage := p_data->>'stage';
     IF new_stage NOT IN ('applied','screening','interview','offer','rejected','withdrawn') OR new_stage=cand.stage THEN
       RAISE EXCEPTION 'INVALID_STAGE'; END IF;
     IF new_stage='rejected' AND coalesce(length(trim(p_data->>'rejection_reason')),0)=0 THEN RAISE EXCEPTION 'REJECTION_REASON_REQUIRED'; END IF;
     UPDATE hr_candidates SET stage=new_stage,
       rejection_reason=CASE WHEN new_stage='rejected' THEN trim(p_data->>'rejection_reason') ELSE NULL END
     WHERE id=cand.id;
     INSERT INTO hr_candidate_events(candidate_id,actor_id,event,from_stage,to_stage,note)
     VALUES(cand.id,p_actor,'stage',cand.stage,new_stage,coalesce(nullif(p_data->>'note',''),nullif(p_data->>'rejection_reason','')));
   ELSE RAISE EXCEPTION 'INVALID_STAGE';
   END IF;
 END IF;
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('hr_candidate',p_actor,p_key,p_data,cand.id);
 RETURN jsonb_build_object('candidate',business_hr_candidate_document(cand.id),'replayed',false);
END $$;

-- p_data: {candidate_id, hire_date, basic_salary, job_title, department_id, employment_type, probation_end_date}
-- Creates the employee file, marks the candidate hired, and closes the opening once all positions are filled.
CREATE FUNCTION public.business_hr_candidate_hire(p_actor text, p_key uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE replay uuid; cand hr_candidates; op hr_job_openings; emp_id uuid := gen_random_uuid(); filled int;
BEGIN
 replay := business_hr_replay('hr_candidate_hire',p_actor,p_key,p_data);
 IF replay IS NOT NULL THEN
   RETURN jsonb_build_object('employee',business_hr_employee_document(replay,true),'replayed',true);
 END IF;
 SELECT * INTO cand FROM hr_candidates WHERE id=(p_data->>'candidate_id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CANDIDATE_NOT_FOUND'; END IF;
 IF cand.stage='hired' THEN RAISE EXCEPTION 'CANDIDATE_LOCKED'; END IF;
 IF cand.stage IN ('rejected','withdrawn') THEN RAISE EXCEPTION 'INVALID_STAGE'; END IF;
 SELECT * INTO op FROM hr_job_openings WHERE id=cand.opening_id FOR UPDATE;
 IF coalesce(p_data->>'hire_date','')='' THEN RAISE EXCEPTION 'INVALID_EMPLOYEE'; END IF;
 BEGIN
   INSERT INTO hr_employees(id,full_name_ar,phone,email,department_id,job_title,employment_type,hire_date,
     probation_end_date,status,basic_salary,notes)
   VALUES(emp_id,cand.full_name,cand.phone,cand.email,
     coalesce(nullif(p_data->>'department_id','')::uuid,op.department_id),
     coalesce(nullif(trim(p_data->>'job_title'),''),op.title),
     coalesce(nullif(p_data->>'employment_type',''),op.employment_type),
     (p_data->>'hire_date')::date,nullif(p_data->>'probation_end_date','')::date,
     CASE WHEN nullif(p_data->>'probation_end_date','') IS NOT NULL THEN 'probation' ELSE 'active' END,
     coalesce(nullif(p_data->>'basic_salary','')::numeric,0),
     'تم التعيين من طلب توظيف: '||op.title);
 EXCEPTION WHEN check_violation THEN RAISE EXCEPTION 'INVALID_EMPLOYEE';
 END;
 UPDATE hr_candidates SET stage='hired',employee_id=emp_id WHERE id=cand.id;
 INSERT INTO hr_candidate_events(candidate_id,actor_id,event,from_stage,to_stage,note)
 VALUES(cand.id,p_actor,'stage',cand.stage,'hired','تعيين بتاريخ '||(p_data->>'hire_date'));
 INSERT INTO hr_audit_log(actor_id,action,entity,entity_id,changes)
 VALUES(p_actor,'hired_from_candidate','employee',emp_id,p_data || jsonb_build_object('opening',op.title));
 SELECT count(*)::int INTO filled FROM hr_candidates WHERE opening_id=op.id AND stage='hired';
 IF filled>=op.positions AND op.status<>'closed' THEN
   UPDATE hr_job_openings SET status='closed',closed_at=now() WHERE id=op.id;
 END IF;
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('hr_candidate_hire',p_actor,p_key,p_data,emp_id);
 RETURN jsonb_build_object('employee',business_hr_employee_document(emp_id,true),'opening_closed',filled>=op.positions,'replayed',false);
END $$;

-- ================================================================ performance functions

-- Objective indicators for a period. p_rep_name is the bare display name used on call logs.
CREATE FUNCTION public.business_hr_employee_kpis(p_employee uuid, p_rep_name text, p_from date, p_to date) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT jsonb_build_object(
   'orders_total',(SELECT count(*)::int FROM orders o WHERE e.account_id IS NOT NULL AND o.owner_account_id=e.account_id AND o.order_date BETWEEN p_from AND p_to),
   'orders_delivered',(SELECT count(*)::int FROM orders o WHERE e.account_id IS NOT NULL AND o.owner_account_id=e.account_id AND o.status='delivered' AND o.order_date BETWEEN p_from AND p_to),
   'orders_cancelled',(SELECT count(*)::int FROM orders o WHERE e.account_id IS NOT NULL AND o.owner_account_id=e.account_id AND o.status IN ('cancelled','returned') AND o.order_date BETWEEN p_from AND p_to),
   'sales_delivered',(SELECT coalesce(sum(o.total_amount),0) FROM orders o WHERE e.account_id IS NOT NULL AND o.owner_account_id=e.account_id AND o.status='delivered' AND o.order_date BETWEEN p_from AND p_to),
   'calls',(SELECT count(*)::int FROM call_logs c WHERE coalesce(p_rep_name,'')<>'' AND c.rep_name=p_rep_name AND c.called_at::date BETWEEN p_from AND p_to),
   'calls_with_order',(SELECT count(*)::int FROM call_logs c WHERE coalesce(p_rep_name,'')<>'' AND c.rep_name=p_rep_name AND c.outcome='order_placed' AND c.called_at::date BETWEEN p_from AND p_to),
   'attendance_days',(SELECT count(*)::int FROM hr_attendance a WHERE a.employee_id=e.id AND a.check_in IS NOT NULL AND a.work_date BETWEEN p_from AND p_to),
   'late_days',(SELECT count(*)::int FROM hr_attendance a WHERE a.employee_id=e.id AND a.check_in IS NOT NULL AND a.work_date BETWEEN p_from AND p_to
     AND (a.check_in AT TIME ZONE business_hr_tz())::time >
       ((SELECT coalesce(value->>'work_start','09:00') FROM hr_settings WHERE key='attendance')::time
        + make_interval(mins => (SELECT coalesce((value->>'grace_minutes')::int,15) FROM hr_settings WHERE key='attendance')))),
   'working_days',(SELECT count(*)::int FROM generate_series(greatest(p_from,e.hire_date),least(p_to,business_hr_today()),interval '1 day') g(d)
     WHERE business_hr_is_working_day(g.d::date)),
   'leave_days',(SELECT coalesce(sum(CASE WHEN r.half_day THEN 0.5 ELSE business_hr_working_days(greatest(r.start_date,p_from),least(r.end_date,p_to)) END),0)
     FROM hr_leave_requests r WHERE r.employee_id=e.id AND r.status='approved' AND r.start_date<=p_to AND r.end_date>=p_from))
 FROM hr_employees e WHERE e.id=p_employee
$$;

CREATE FUNCTION public.business_hr_review_document(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT jsonb_build_object('id',r.id,'employee_id',r.employee_id,'employee_name',e.full_name_ar,'employee_no',e.employee_no,
   'employee_account_id',e.account_id,'department_name',coalesce(d.name_ar,''),'job_title',coalesce(e.job_title,''),
   'manager_id',e.manager_id,'reviewer_id',r.reviewer_id,'period_label',r.period_label,'period_start',r.period_start,
   'period_end',r.period_end,'scores',r.scores,'overall',r.overall,'kpis',r.kpis,'strengths',coalesce(r.strengths,''),
   'improvements',coalesce(r.improvements,''),'goals',coalesce(r.goals,''),'status',r.status,'submitted_at',r.submitted_at,
   'acknowledged_at',r.acknowledged_at,'employee_comment',coalesce(r.employee_comment,''),
   'created_at',r.created_at,'updated_at',r.updated_at)
 FROM hr_reviews r JOIN hr_employees e ON e.id=r.employee_id LEFT JOIN hr_departments d ON d.id=e.department_id
 WHERE r.id=p_id
$$;

-- Filters optional: p_employee (own reviews), p_manager (reviews of direct reports), p_visible_only (hide drafts).
CREATE FUNCTION public.business_hr_reviews(p_employee uuid, p_manager uuid, p_visible_only boolean) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(business_hr_review_document(r.id) ORDER BY r.period_end DESC,r.updated_at DESC),'[]'::jsonb)
 FROM hr_reviews r JOIN hr_employees e ON e.id=r.employee_id
 WHERE (p_employee IS NULL OR r.employee_id=p_employee)
   AND (p_manager IS NULL OR e.manager_id=p_manager)
   AND (NOT coalesce(p_visible_only,false) OR r.status<>'draft')
$$;

-- p_data: {id?, employee_id, period_label, period_start, period_end, scores{}, overall, kpis{}, strengths, improvements,
--          goals, submit(bool), rep_names{account_id: call-log name}} + server flags is_hr / actor_employee_id.
-- The KPI snapshot is computed here at save time (not sent by the client), so retries stay identical.
-- HR may review anyone; a manager only direct reports; nobody reviews themselves. Submitted reviews are final.
CREATE FUNCTION public.business_hr_review_save(p_actor text, p_key uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE replay uuid; emp hr_employees; rev hr_reviews; rid uuid;
  is_hr boolean := coalesce((p_data->>'is_hr')::boolean,false); me uuid := nullif(p_data->>'actor_employee_id','')::uuid;
  submit boolean := coalesce((p_data->>'submit')::boolean,false); snapshot jsonb;
BEGIN
 replay := business_hr_replay('hr_review',p_actor,p_key,p_data);
 IF replay IS NOT NULL THEN RETURN jsonb_build_object('review',business_hr_review_document(replay),'replayed',true); END IF;
 IF coalesce(p_data->>'id','')<>'' THEN
   SELECT * INTO rev FROM hr_reviews WHERE id=(p_data->>'id')::uuid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'REVIEW_NOT_FOUND'; END IF;
   IF rev.status<>'draft' THEN RAISE EXCEPTION 'REVIEW_LOCKED'; END IF;
   SELECT * INTO emp FROM hr_employees WHERE id=rev.employee_id;
 ELSE
   SELECT * INTO emp FROM hr_employees WHERE id=(p_data->>'employee_id')::uuid;
   IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_NOT_FOUND'; END IF;
 END IF;
 IF me IS NOT DISTINCT FROM emp.id THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF NOT is_hr AND (me IS NULL OR emp.manager_id IS DISTINCT FROM me) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF (p_data->>'period_end')::date < (p_data->>'period_start')::date THEN RAISE EXCEPTION 'INVALID_REVIEW'; END IF;
 snapshot := business_hr_employee_kpis(emp.id,coalesce(p_data->'rep_names'->>emp.account_id,''),
   (p_data->>'period_start')::date,(p_data->>'period_end')::date);
 BEGIN
   IF rev.id IS NULL THEN
     INSERT INTO hr_reviews(employee_id,reviewer_id,period_label,period_start,period_end,scores,overall,kpis,strengths,improvements,goals,
       status,submitted_at)
     VALUES(emp.id,p_actor,trim(p_data->>'period_label'),(p_data->>'period_start')::date,(p_data->>'period_end')::date,
       p_data->'scores',nullif(p_data->>'overall','')::numeric,snapshot,
       nullif(p_data->>'strengths',''),nullif(p_data->>'improvements',''),nullif(p_data->>'goals',''),
       CASE WHEN submit THEN 'submitted' ELSE 'draft' END,CASE WHEN submit THEN now() END)
     RETURNING id INTO rid;
   ELSE
     UPDATE hr_reviews SET period_label=trim(p_data->>'period_label'),period_start=(p_data->>'period_start')::date,
       period_end=(p_data->>'period_end')::date,scores=p_data->'scores',overall=nullif(p_data->>'overall','')::numeric,
       kpis=snapshot,strengths=nullif(p_data->>'strengths',''),improvements=nullif(p_data->>'improvements',''),
       goals=nullif(p_data->>'goals',''),reviewer_id=p_actor,
       status=CASE WHEN submit THEN 'submitted' ELSE 'draft' END,submitted_at=CASE WHEN submit THEN now() END
     WHERE id=rev.id RETURNING id INTO rid;
   END IF;
 EXCEPTION
   WHEN unique_violation THEN RAISE EXCEPTION 'DUPLICATE_REVIEW';
   WHEN check_violation THEN RAISE EXCEPTION 'INVALID_REVIEW';
 END;
 INSERT INTO hr_audit_log(actor_id,action,entity,entity_id,changes)
 VALUES(p_actor,CASE WHEN submit THEN 'review_submitted' ELSE 'review_draft' END,'employee',emp.id,
   jsonb_build_object('review_id',rid,'period',p_data->>'period_label','overall',p_data->>'overall'));
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('hr_review',p_actor,p_key,p_data,rid);
 RETURN jsonb_build_object('review',business_hr_review_document(rid),'replayed',false);
END $$;

-- Employee acknowledges their own submitted review. p_data: {id, comment, actor_employee_id (server)}
CREATE FUNCTION public.business_hr_review_acknowledge(p_actor text, p_key uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE replay uuid; rev hr_reviews;
BEGIN
 replay := business_hr_replay('hr_review_ack',p_actor,p_key,p_data);
 IF replay IS NOT NULL THEN RETURN jsonb_build_object('review',business_hr_review_document(replay),'replayed',true); END IF;
 SELECT * INTO rev FROM hr_reviews WHERE id=(p_data->>'id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'REVIEW_NOT_FOUND'; END IF;
 IF rev.employee_id IS DISTINCT FROM nullif(p_data->>'actor_employee_id','')::uuid THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF rev.status<>'submitted' THEN RAISE EXCEPTION 'REVIEW_LOCKED'; END IF;
 UPDATE hr_reviews SET status='acknowledged',acknowledged_at=now(),employee_comment=nullif(trim(p_data->>'comment'),'') WHERE id=rev.id;
 INSERT INTO hr_audit_log(actor_id,action,entity,entity_id,changes)
 VALUES(p_actor,'review_acknowledged','employee',rev.employee_id,jsonb_build_object('review_id',rev.id,'period',rev.period_label));
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('hr_review_ack',p_actor,p_key,p_data,rev.id);
 RETURN jsonb_build_object('review',business_hr_review_document(rev.id),'replayed',false);
END $$;

-- ================================================================ documents & alerts

CREATE FUNCTION public.business_hr_documents(p_employee uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'employee_id',d.employee_id,'employee_name',e.full_name_ar,
   'employee_no',e.employee_no,'employee_status',e.status,'doc_type',d.doc_type,'title',coalesce(d.title,''),
   'doc_number',coalesce(d.doc_number,''),'issue_date',d.issue_date,'expiry_date',d.expiry_date,'notes',coalesce(d.notes,''),
   'archived',d.archived,'created_by',d.created_by,'updated_at',d.updated_at,
   'days_left',CASE WHEN d.expiry_date IS NOT NULL THEN d.expiry_date-business_hr_today() END)
   ORDER BY d.archived,d.expiry_date NULLS LAST,e.full_name_ar),'[]'::jsonb)
 FROM hr_documents d JOIN hr_employees e ON e.id=d.employee_id
 WHERE p_employee IS NULL OR d.employee_id=p_employee
$$;

-- p_data: {id?, employee_id, doc_type, title, doc_number, issue_date, expiry_date, notes, archived?}
CREATE FUNCTION public.business_hr_document_save(p_actor text, p_key uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE replay uuid; did uuid; old_row hr_documents;
BEGIN
 replay := business_hr_replay('hr_document',p_actor,p_key,p_data);
 IF replay IS NOT NULL THEN RETURN jsonb_build_object('id',replay,'replayed',true); END IF;
 BEGIN
   IF coalesce(p_data->>'id','')='' THEN
     IF NOT EXISTS(SELECT 1 FROM hr_employees WHERE id=(p_data->>'employee_id')::uuid) THEN RAISE EXCEPTION 'EMPLOYEE_NOT_FOUND'; END IF;
     INSERT INTO hr_documents(employee_id,doc_type,title,doc_number,issue_date,expiry_date,notes,created_by)
     VALUES((p_data->>'employee_id')::uuid,p_data->>'doc_type',nullif(p_data->>'title',''),nullif(p_data->>'doc_number',''),
       nullif(p_data->>'issue_date','')::date,nullif(p_data->>'expiry_date','')::date,nullif(p_data->>'notes',''),p_actor)
     RETURNING id INTO did;
     INSERT INTO hr_audit_log(actor_id,action,entity,entity_id,changes)
     VALUES(p_actor,'document_create','employee',(p_data->>'employee_id')::uuid,p_data || jsonb_build_object('document_id',did));
   ELSE
     SELECT * INTO old_row FROM hr_documents WHERE id=(p_data->>'id')::uuid FOR UPDATE;
     IF NOT FOUND THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND'; END IF;
     UPDATE hr_documents SET doc_type=p_data->>'doc_type',title=nullif(p_data->>'title',''),doc_number=nullif(p_data->>'doc_number',''),
       issue_date=nullif(p_data->>'issue_date','')::date,expiry_date=nullif(p_data->>'expiry_date','')::date,
       notes=nullif(p_data->>'notes',''),archived=coalesce((p_data->>'archived')::boolean,archived)
     WHERE id=old_row.id RETURNING id INTO did;
     INSERT INTO hr_audit_log(actor_id,action,entity,entity_id,changes)
     VALUES(p_actor,'document_update','employee',old_row.employee_id,jsonb_build_object('document_id',did,'doc_type',p_data->>'doc_type',
       'expiry_date',jsonb_build_object('from',old_row.expiry_date,'to',nullif(p_data->>'expiry_date','')),
       'archived',jsonb_build_object('from',old_row.archived,'to',coalesce((p_data->>'archived')::boolean,old_row.archived))));
   END IF;
 EXCEPTION WHEN check_violation THEN RAISE EXCEPTION 'INVALID_DOCUMENT';
 END;
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('hr_document',p_actor,p_key,p_data,did);
 RETURN jsonb_build_object('id',did,'replayed',false);
END $$;

-- Everything expiring within p_days (or already expired) for current employees: documents, contracts, probation.
CREATE FUNCTION public.business_hr_expiries(p_days int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 WITH t AS (SELECT business_hr_today() AS today),
 items AS (
   SELECT 'document'::text kind, d.id ref_id, d.doc_type subtype, coalesce(d.title,'') title, d.expiry_date, e.id employee_id,
     e.full_name_ar employee_name, e.account_id
   FROM hr_documents d JOIN hr_employees e ON e.id=d.employee_id
   WHERE NOT d.archived AND d.expiry_date IS NOT NULL AND e.status<>'terminated'
   UNION ALL
   SELECT 'contract', e.id, 'contract', '', e.contract_end_date, e.id, e.full_name_ar, e.account_id
   FROM hr_employees e WHERE e.contract_end_date IS NOT NULL AND e.status<>'terminated'
   UNION ALL
   SELECT 'probation', e.id, 'probation', '', e.probation_end_date, e.id, e.full_name_ar, e.account_id
   FROM hr_employees e WHERE e.probation_end_date IS NOT NULL AND e.status='probation'
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('kind',i.kind,'ref_id',i.ref_id,'subtype',i.subtype,'title',i.title,
   'expiry_date',i.expiry_date,'days_left',i.expiry_date-t.today,'employee_id',i.employee_id,
   'employee_name',i.employee_name,'employee_account_id',i.account_id) ORDER BY i.expiry_date),'[]'::jsonb)
 FROM items i CROSS JOIN t WHERE i.expiry_date <= t.today + p_days
$$;

-- Atomically claims alerts that are due and not yet sent (thresholds: 30 days, 7 days, expired).
-- Returns only newly claimed ones, so concurrent callers never double-notify.
CREATE FUNCTION public.business_hr_alerts_claim() RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE item jsonb; claimed jsonb := '[]'::jsonb; threshold text; k text;
BEGIN
 FOR item IN SELECT * FROM jsonb_array_elements(business_hr_expiries(30)) LOOP
   threshold := CASE WHEN (item->>'days_left')::int < 0 THEN 'expired'
                     WHEN (item->>'days_left')::int <= 7 THEN 'd7' ELSE 'd30' END;
   k := (item->>'kind')||':'||(item->>'ref_id')||':'||(item->>'expiry_date')||':'||threshold;
   INSERT INTO hr_alert_log(alert_key) VALUES(k) ON CONFLICT DO NOTHING;
   IF FOUND THEN claimed := claimed || (item || jsonb_build_object('threshold',threshold)); END IF;
 END LOOP;
 RETURN claimed;
END $$;

DO $$
DECLARE fn text;
BEGIN
 FOREACH fn IN ARRAY ARRAY[
   'business_hr_openings()','business_hr_candidate_document(uuid)','business_hr_candidates(uuid)',
   'business_hr_opening_save(text,uuid,jsonb)','business_hr_candidate_save(text,uuid,jsonb)',
   'business_hr_candidate_hire(text,uuid,jsonb)','business_hr_employee_kpis(uuid,text,date,date)',
   'business_hr_review_document(uuid)','business_hr_reviews(uuid,uuid,boolean)','business_hr_review_save(text,uuid,jsonb)',
   'business_hr_review_acknowledge(text,uuid,jsonb)','business_hr_documents(uuid)','business_hr_document_save(text,uuid,jsonb)',
   'business_hr_expiries(int)','business_hr_alerts_claim()']
 LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
   EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
 END LOOP;
END $$;

COMMIT;
