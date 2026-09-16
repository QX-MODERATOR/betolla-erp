-- Additive only: no backfill, deletion, or changes to existing tables/RLS/policies.
-- HR module, phase 2: HR settings, public holidays, attendance (self check-in/out
-- plus audited HR corrections), leave types, additive balance adjustments and
-- leave requests with manager/HR approval. Depends on 006 and 022.
BEGIN;

CREATE TABLE IF NOT EXISTS public.hr_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- weekend uses Postgres dow numbering (0 = Sunday ... 5 = Friday, 6 = Saturday).
INSERT INTO public.hr_settings(key,value) VALUES
  ('attendance','{"timezone":"Asia/Amman","work_start":"09:00","work_end":"17:00","grace_minutes":15,"weekend":[5]}')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.hr_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date DATE NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hr_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id),
  work_date DATE NOT NULL,
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'self' CHECK (source IN ('self','hr')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, work_date),
  CHECK (check_out IS NULL OR (check_in IS NOT NULL AND check_out > check_in))
);
CREATE INDEX IF NOT EXISTS idx_hr_attendance_date ON public.hr_attendance(work_date);

CREATE TABLE IF NOT EXISTS public.hr_leave_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  annual_days NUMERIC(5,1) NOT NULL DEFAULT 0 CHECK (annual_days >= 0),
  paid BOOLEAN NOT NULL DEFAULT true,
  requires_balance BOOLEAN NOT NULL DEFAULT true,
  gender TEXT CHECK (gender IN ('male','female')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Jordanian Labour Law defaults (editable by HR from the leave settings screen).
INSERT INTO public.hr_leave_types(code,name_ar,annual_days,paid,requires_balance,gender) VALUES
  ('annual','إجازة سنوية',14,true,true,NULL),
  ('sick','إجازة مرضية',14,true,true,NULL),
  ('unpaid','إجازة بدون راتب',0,false,false,NULL),
  ('maternity','إجازة أمومة',70,true,true,'female'),
  ('paternity','إجازة أبوة',3,true,true,'male'),
  ('bereavement','إجازة وفاة',3,true,true,NULL),
  ('hajj','إجازة حج',14,true,true,NULL)
ON CONFLICT (code) DO NOTHING;

-- Balance corrections are additive rows (carry-over, pro-rating, manual fixes), never edits.
CREATE TABLE IF NOT EXISTS public.hr_leave_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id),
  leave_type_id UUID NOT NULL REFERENCES public.hr_leave_types(id),
  year INT NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  days NUMERIC(5,1) NOT NULL CHECK (days <> 0),
  reason TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hr_leave_adjustments_emp ON public.hr_leave_adjustments(employee_id, year);

CREATE TABLE IF NOT EXISTS public.hr_leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id),
  leave_type_id UUID NOT NULL REFERENCES public.hr_leave_types(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  half_day BOOLEAN NOT NULL DEFAULT false,
  days NUMERIC(5,1) NOT NULL CHECK (days > 0),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  requested_by TEXT NOT NULL,
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  CHECK (NOT half_day OR start_date = end_date),
  CHECK (extract(year FROM start_date) = extract(year FROM end_date))
);
CREATE INDEX IF NOT EXISTS idx_hr_leave_requests_emp ON public.hr_leave_requests(employee_id, start_date);
CREATE INDEX IF NOT EXISTS idx_hr_leave_requests_status ON public.hr_leave_requests(status);

DROP TRIGGER IF EXISTS trg_hr_attendance_updated_at ON public.hr_attendance;
CREATE TRIGGER trg_hr_attendance_updated_at BEFORE UPDATE ON public.hr_attendance
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_hr_leave_types_updated_at ON public.hr_leave_types;
CREATE TRIGGER trg_hr_leave_types_updated_at BEFORE UPDATE ON public.hr_leave_types
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_hr_leave_requests_updated_at ON public.hr_leave_requests;
CREATE TRIGGER trg_hr_leave_requests_updated_at BEFORE UPDATE ON public.hr_leave_requests
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.hr_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_leave_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_leave_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_settings, public.hr_holidays, public.hr_attendance, public.hr_leave_types,
  public.hr_leave_adjustments, public.hr_leave_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.hr_settings, public.hr_holidays, public.hr_attendance, public.hr_leave_types,
  public.hr_leave_adjustments, public.hr_leave_requests TO service_role;

-- ---------------------------------------------------------------- settings / holidays

CREATE FUNCTION public.business_hr_settings() RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) FROM hr_settings
$$;

CREATE FUNCTION public.business_hr_tz() RETURNS text
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce((SELECT value->>'timezone' FROM hr_settings WHERE key='attendance'),'Asia/Amman')
$$;

CREATE FUNCTION public.business_hr_today() RETURNS date
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT (now() AT TIME ZONE business_hr_tz())::date
$$;

-- p_data is fully validated server-side (lib/hr-server.ts); this only stores it.
CREATE FUNCTION public.business_hr_settings_save(p_actor text, p_key uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE replay uuid; old_value jsonb; audit_id uuid := gen_random_uuid();
BEGIN
 replay := business_hr_replay('hr_settings',p_actor,p_key,p_data);
 IF replay IS NOT NULL THEN RETURN jsonb_build_object('settings',business_hr_settings(),'replayed',true); END IF;
 IF coalesce(p_data->>'key','') NOT IN ('attendance','payroll') OR jsonb_typeof(p_data->'value')<>'object' THEN
   RAISE EXCEPTION 'INVALID_SETTINGS'; END IF;
 SELECT value INTO old_value FROM hr_settings WHERE key=p_data->>'key' FOR UPDATE;
 INSERT INTO hr_settings(key,value) VALUES(p_data->>'key',p_data->'value')
 ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now();
 INSERT INTO hr_audit_log(id,actor_id,action,entity,entity_id,changes)
 VALUES(audit_id,p_actor,'update','settings',NULL,jsonb_build_object(p_data->>'key',jsonb_build_object('from',old_value,'to',p_data->'value')));
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('hr_settings',p_actor,p_key,p_data,audit_id);
 RETURN jsonb_build_object('settings',business_hr_settings(),'replayed',false);
END $$;

CREATE FUNCTION public.business_hr_holidays(p_year int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'date',holiday_date,'name_ar',name_ar) ORDER BY holiday_date),'[]'::jsonb)
 FROM hr_holidays WHERE p_year IS NULL OR extract(year FROM holiday_date)=p_year
$$;

-- action 'add' {date,name_ar} | 'remove' {id}. Holidays are calendar configuration, so removal deletes.
CREATE FUNCTION public.business_hr_holiday_save(p_actor text, p_key uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE replay uuid; hid uuid; old_row hr_holidays;
BEGIN
 replay := business_hr_replay('hr_holiday',p_actor,p_key,p_data);
 IF replay IS NOT NULL THEN RETURN jsonb_build_object('id',replay,'replayed',true); END IF;
 IF p_data->>'action'='add' THEN
   IF coalesce(length(trim(p_data->>'name_ar')),0)=0 OR coalesce(p_data->>'date','')='' THEN RAISE EXCEPTION 'INVALID_HOLIDAY'; END IF;
   BEGIN
     INSERT INTO hr_holidays(holiday_date,name_ar) VALUES((p_data->>'date')::date,trim(p_data->>'name_ar')) RETURNING id INTO hid;
   EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'DUPLICATE_HOLIDAY'; END;
   INSERT INTO hr_audit_log(actor_id,action,entity,entity_id,changes) VALUES(p_actor,'create','holiday',hid,p_data);
 ELSIF p_data->>'action'='remove' THEN
   DELETE FROM hr_holidays WHERE id=(p_data->>'id')::uuid RETURNING * INTO old_row;
   IF NOT FOUND THEN RAISE EXCEPTION 'HOLIDAY_NOT_FOUND'; END IF;
   hid := old_row.id;
   INSERT INTO hr_audit_log(actor_id,action,entity,entity_id,changes)
   VALUES(p_actor,'delete','holiday',hid,jsonb_build_object('date',old_row.holiday_date,'name_ar',old_row.name_ar));
 ELSE RAISE EXCEPTION 'INVALID_HOLIDAY';
 END IF;
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('hr_holiday',p_actor,p_key,p_data,hid);
 RETURN jsonb_build_object('id',hid,'replayed',false);
END $$;

-- Working days in [p_start, p_end], excluding configured weekend days and holidays.
CREATE FUNCTION public.business_hr_working_days(p_start date, p_end date) RETURNS int
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT count(*)::int
 FROM generate_series(p_start, p_end, interval '1 day') g(d)
 WHERE NOT EXISTS (SELECT 1 FROM hr_holidays h WHERE h.holiday_date=g.d::date)
   AND NOT (extract(dow FROM g.d)::int IN (
     SELECT jsonb_array_elements_text(coalesce((SELECT value->'weekend' FROM hr_settings WHERE key='attendance'),'[5]'::jsonb))::int))
$$;

-- ---------------------------------------------------------------- attendance

CREATE FUNCTION public.business_hr_attendance_document(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT jsonb_build_object('id',a.id,'employee_id',a.employee_id,'work_date',a.work_date,
   'check_in',to_char(a.check_in AT TIME ZONE business_hr_tz(),'HH24:MI'),
   'check_out',to_char(a.check_out AT TIME ZONE business_hr_tz(),'HH24:MI'),
   'worked_minutes',CASE WHEN a.check_out IS NOT NULL THEN (extract(epoch FROM a.check_out-a.check_in)/60)::int END,
   'source',a.source,'note',coalesce(a.note,''),'updated_at',a.updated_at)
 FROM hr_attendance a WHERE a.id=p_id
$$;

CREATE FUNCTION public.business_hr_attendance_range(p_from date, p_to date, p_employee uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(business_hr_attendance_document(id) ORDER BY work_date,employee_id),'[]'::jsonb)
 FROM hr_attendance
 WHERE work_date BETWEEN p_from AND p_to AND (p_employee IS NULL OR employee_id=p_employee)
$$;

-- Self-service punch. Time always comes from the database clock, never the client.
CREATE FUNCTION public.business_hr_attendance_punch(p_actor text, p_key uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE replay uuid; emp hr_employees; rec hr_attendance; today date := business_hr_today();
BEGIN
 replay := business_hr_replay('hr_punch',p_actor,p_key,p_data);
 IF replay IS NOT NULL THEN RETURN jsonb_build_object('attendance',business_hr_attendance_document(replay),'replayed',true); END IF;
 SELECT * INTO emp FROM hr_employees WHERE id=(p_data->>'employee_id')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_NOT_FOUND'; END IF;
 IF emp.status IN ('terminated','suspended') THEN RAISE EXCEPTION 'EMPLOYEE_INACTIVE'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('hr-attendance:'||emp.id::text||':'||today::text,0));
 SELECT * INTO rec FROM hr_attendance WHERE employee_id=emp.id AND work_date=today FOR UPDATE;
 IF p_data->>'action'='check_in' THEN
   IF FOUND AND rec.check_in IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_CHECKED_IN'; END IF;
   IF FOUND THEN
     UPDATE hr_attendance SET check_in=now(),source='self' WHERE id=rec.id RETURNING * INTO rec;
   ELSE
     INSERT INTO hr_attendance(employee_id,work_date,check_in,source) VALUES(emp.id,today,now(),'self') RETURNING * INTO rec;
   END IF;
 ELSIF p_data->>'action'='check_out' THEN
   IF NOT FOUND OR rec.check_in IS NULL THEN RAISE EXCEPTION 'NOT_CHECKED_IN'; END IF;
   IF rec.check_out IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_CHECKED_OUT'; END IF;
   UPDATE hr_attendance SET check_out=greatest(now(),rec.check_in+interval '1 second') WHERE id=rec.id RETURNING * INTO rec;
 ELSE RAISE EXCEPTION 'INVALID_ATTENDANCE';
 END IF;
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('hr_punch',p_actor,p_key,p_data,rec.id);
 RETURN jsonb_build_object('attendance',business_hr_attendance_document(rec.id),'replayed',false);
END $$;

-- HR correction: sets both times (local 'HH:MM' or '' for none) for one employee/day, with a mandatory reason.
CREATE FUNCTION public.business_hr_attendance_set(p_actor text, p_key uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE replay uuid; emp_id uuid; wd date; tz text := business_hr_tz(); rec hr_attendance;
  old_doc jsonb; new_in timestamptz; new_out timestamptz;
BEGIN
 replay := business_hr_replay('hr_attendance_set',p_actor,p_key,p_data);
 IF replay IS NOT NULL THEN RETURN jsonb_build_object('attendance',business_hr_attendance_document(replay),'replayed',true); END IF;
 IF coalesce(length(trim(p_data->>'reason')),0)=0 OR coalesce(p_data->>'work_date','')='' THEN RAISE EXCEPTION 'INVALID_ATTENDANCE'; END IF;
 emp_id := (p_data->>'employee_id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM hr_employees WHERE id=emp_id) THEN RAISE EXCEPTION 'EMPLOYEE_NOT_FOUND'; END IF;
 wd := (p_data->>'work_date')::date;
 IF wd > business_hr_today() THEN RAISE EXCEPTION 'ATTENDANCE_FUTURE_DATE'; END IF;
 new_in := CASE WHEN coalesce(p_data->>'check_in','')<>'' THEN (wd + (p_data->>'check_in')::time) AT TIME ZONE tz END;
 new_out := CASE WHEN coalesce(p_data->>'check_out','')<>'' THEN (wd + (p_data->>'check_out')::time) AT TIME ZONE tz END;
 IF new_out IS NOT NULL AND (new_in IS NULL OR new_out <= new_in) THEN RAISE EXCEPTION 'INVALID_ATTENDANCE'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('hr-attendance:'||emp_id::text||':'||wd::text,0));
 SELECT * INTO rec FROM hr_attendance WHERE employee_id=emp_id AND work_date=wd FOR UPDATE;
 IF FOUND THEN
   old_doc := business_hr_attendance_document(rec.id);
   UPDATE hr_attendance SET check_in=new_in,check_out=new_out,source='hr',note=nullif(trim(p_data->>'note'),'')
   WHERE id=rec.id RETURNING * INTO rec;
 ELSE
   INSERT INTO hr_attendance(employee_id,work_date,check_in,check_out,source,note)
   VALUES(emp_id,wd,new_in,new_out,'hr',nullif(trim(p_data->>'note'),'')) RETURNING * INTO rec;
 END IF;
 INSERT INTO hr_audit_log(actor_id,action,entity,entity_id,changes)
 VALUES(p_actor,'attendance_correction','employee',emp_id,jsonb_build_object('work_date',wd,'reason',trim(p_data->>'reason'),
   'check_in',jsonb_build_object('from',old_doc->'check_in','to',p_data->>'check_in'),
   'check_out',jsonb_build_object('from',old_doc->'check_out','to',p_data->>'check_out')));
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('hr_attendance_set',p_actor,p_key,p_data,rec.id);
 RETURN jsonb_build_object('attendance',business_hr_attendance_document(rec.id),'replayed',false);
END $$;

-- ---------------------------------------------------------------- leave

-- Display order: statutory defaults first (in a sensible order), custom types after.
CREATE FUNCTION public.business_hr_leave_type_rank(p_code text) RETURNS int
LANGUAGE sql IMMUTABLE AS $$
 SELECT coalesce(array_position(ARRAY['annual','sick','unpaid','maternity','paternity','bereavement','hajj'],p_code),100)
$$;

CREATE FUNCTION public.business_hr_leave_types() RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'code',code,'name_ar',name_ar,'annual_days',annual_days,
   'paid',paid,'requires_balance',requires_balance,'gender',gender,'is_active',is_active)
   ORDER BY is_active DESC,business_hr_leave_type_rank(code),name_ar),'[]'::jsonb)
 FROM hr_leave_types
$$;

CREATE FUNCTION public.business_hr_leave_type_save(p_actor text, p_key uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE replay uuid; tid uuid; old_row hr_leave_types;
BEGIN
 replay := business_hr_replay('hr_leave_type',p_actor,p_key,p_data);
 IF replay IS NOT NULL THEN RETURN jsonb_build_object('id',replay,'replayed',true); END IF;
 IF coalesce(length(trim(p_data->>'name_ar')),0)=0 THEN RAISE EXCEPTION 'INVALID_LEAVE_TYPE'; END IF;
 IF coalesce(p_data->>'id','')='' THEN
   BEGIN
     INSERT INTO hr_leave_types(code,name_ar,annual_days,paid,requires_balance,gender)
     VALUES(p_data->>'code',trim(p_data->>'name_ar'),(p_data->>'annual_days')::numeric,(p_data->>'paid')::boolean,
       (p_data->>'requires_balance')::boolean,nullif(p_data->>'gender',''))
     RETURNING id INTO tid;
   EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'DUPLICATE_LEAVE_TYPE'; END;
   INSERT INTO hr_audit_log(actor_id,action,entity,entity_id,changes) VALUES(p_actor,'create','leave_type',tid,p_data);
 ELSE
   SELECT * INTO old_row FROM hr_leave_types WHERE id=(p_data->>'id')::uuid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'LEAVE_TYPE_NOT_FOUND'; END IF;
   UPDATE hr_leave_types SET name_ar=trim(p_data->>'name_ar'),annual_days=(p_data->>'annual_days')::numeric,
     paid=(p_data->>'paid')::boolean,requires_balance=(p_data->>'requires_balance')::boolean,
     gender=nullif(p_data->>'gender',''),is_active=coalesce((p_data->>'is_active')::boolean,is_active)
   WHERE id=old_row.id RETURNING id INTO tid;
   INSERT INTO hr_audit_log(actor_id,action,entity,entity_id,changes)
   VALUES(p_actor,'update','leave_type',tid,jsonb_build_object('from',to_jsonb(old_row),'to',p_data));
 END IF;
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('hr_leave_type',p_actor,p_key,p_data,tid);
 RETURN jsonb_build_object('id',tid,'replayed',false);
END $$;

CREATE FUNCTION public.business_hr_leave_request_document(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT jsonb_build_object('id',r.id,'employee_id',r.employee_id,'employee_name',e.full_name_ar,
   'employee_no',e.employee_no,'employee_account_id',e.account_id,'department_name',coalesce(d.name_ar,''),
   'manager_id',e.manager_id,'manager_account_id',m.account_id,
   'leave_type_id',r.leave_type_id,'type_code',t.code,'type_name',t.name_ar,'paid',t.paid,
   'start_date',r.start_date,'end_date',r.end_date,'half_day',r.half_day,'days',r.days,
   'reason',coalesce(r.reason,''),'status',r.status,'requested_by',r.requested_by,
   'decided_by',r.decided_by,'decided_at',r.decided_at,'decision_note',coalesce(r.decision_note,''),
   'created_at',r.created_at,'updated_at',r.updated_at)
 FROM hr_leave_requests r
 JOIN hr_employees e ON e.id=r.employee_id
 JOIN hr_leave_types t ON t.id=r.leave_type_id
 LEFT JOIN hr_departments d ON d.id=e.department_id
 LEFT JOIN hr_employees m ON m.id=e.manager_id
 WHERE r.id=p_id
$$;

-- Filters are all optional: p_year (by start_date), p_employee, p_manager (direct reports of).
CREATE FUNCTION public.business_hr_leave_requests(p_year int, p_employee uuid, p_manager uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(business_hr_leave_request_document(r.id) ORDER BY r.start_date DESC,r.created_at DESC),'[]'::jsonb)
 FROM hr_leave_requests r JOIN hr_employees e ON e.id=r.employee_id
 WHERE (p_year IS NULL OR extract(year FROM r.start_date)=p_year)
   AND (p_employee IS NULL OR r.employee_id=p_employee)
   AND (p_manager IS NULL OR e.manager_id=p_manager)
$$;

-- Per employee x balance-tracked leave type for one year.
CREATE FUNCTION public.business_hr_leave_balances(p_year int, p_employee uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'employee_id',x.employee_id,'leave_type_id',x.type_id,'entitled',x.entitled,'adjustments',x.adj,
   'used',x.used,'pending',x.pending,'available',x.entitled+x.adj-x.used-x.pending) ORDER BY x.employee_id,business_hr_leave_type_rank(x.code)),'[]'::jsonb)
 FROM (
   SELECT e.id employee_id,t.id type_id,t.code,t.annual_days entitled,
     coalesce((SELECT sum(a.days) FROM hr_leave_adjustments a WHERE a.employee_id=e.id AND a.leave_type_id=t.id AND a.year=p_year),0) adj,
     coalesce((SELECT sum(r.days) FROM hr_leave_requests r WHERE r.employee_id=e.id AND r.leave_type_id=t.id
       AND r.status='approved' AND extract(year FROM r.start_date)=p_year),0) used,
     coalesce((SELECT sum(r.days) FROM hr_leave_requests r WHERE r.employee_id=e.id AND r.leave_type_id=t.id
       AND r.status='pending' AND extract(year FROM r.start_date)=p_year),0) pending
   FROM hr_employees e CROSS JOIN hr_leave_types t
   WHERE t.requires_balance AND t.is_active AND e.status<>'terminated'
     AND (t.gender IS NULL OR t.gender=e.gender)
     AND (p_employee IS NULL OR e.id=p_employee)
 ) x
$$;

-- Raises when approving/requesting p_days of p_type would exceed the year's balance
-- (other pending requests count as reserved; p_exclude is the request being decided).
CREATE FUNCTION public.business_hr_leave_check(p_employee uuid, p_type hr_leave_types, p_start date, p_end date,
  p_days numeric, p_exclude uuid) RETURNS void
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE yr int := extract(year FROM p_start)::int; taken numeric; adj numeric;
BEGIN
 IF EXISTS(SELECT 1 FROM hr_leave_requests WHERE employee_id=p_employee AND status IN ('pending','approved')
   AND id IS DISTINCT FROM p_exclude AND start_date<=p_end AND end_date>=p_start) THEN
   RAISE EXCEPTION 'LEAVE_OVERLAP'; END IF;
 IF p_type.requires_balance THEN
   SELECT coalesce(sum(days),0) INTO taken FROM hr_leave_requests WHERE employee_id=p_employee AND leave_type_id=p_type.id
     AND status IN ('pending','approved') AND extract(year FROM start_date)=yr AND id IS DISTINCT FROM p_exclude;
   SELECT coalesce(sum(days),0) INTO adj FROM hr_leave_adjustments WHERE employee_id=p_employee AND leave_type_id=p_type.id AND year=yr;
   IF taken + p_days > p_type.annual_days + adj THEN RAISE EXCEPTION 'INSUFFICIENT_LEAVE_BALANCE'; END IF;
 END IF;
END $$;

-- p_data: employee_id, leave_type_id, start_date, end_date, half_day, reason, auto_approve,
-- plus server-derived is_hr / actor_employee_id (never taken from the client).
CREATE FUNCTION public.business_hr_leave_request_create(p_actor text, p_key uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE replay uuid; emp hr_employees; lt hr_leave_types; s date; e date; half boolean; n numeric;
  is_hr boolean := coalesce((p_data->>'is_hr')::boolean,false); rid uuid := gen_random_uuid();
  approve boolean;
BEGIN
 replay := business_hr_replay('hr_leave_request',p_actor,p_key,p_data);
 IF replay IS NOT NULL THEN RETURN jsonb_build_object('request',business_hr_leave_request_document(replay),'replayed',true); END IF;
 SELECT * INTO emp FROM hr_employees WHERE id=(p_data->>'employee_id')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_NOT_FOUND'; END IF;
 IF NOT is_hr AND emp.id IS DISTINCT FROM nullif(p_data->>'actor_employee_id','')::uuid THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF emp.status='terminated' THEN RAISE EXCEPTION 'EMPLOYEE_INACTIVE'; END IF;
 SELECT * INTO lt FROM hr_leave_types WHERE id=(p_data->>'leave_type_id')::uuid AND is_active;
 IF NOT FOUND THEN RAISE EXCEPTION 'LEAVE_TYPE_NOT_FOUND'; END IF;
 IF lt.gender IS NOT NULL AND lt.gender IS DISTINCT FROM emp.gender THEN RAISE EXCEPTION 'LEAVE_TYPE_NOT_ELIGIBLE'; END IF;
 s := (p_data->>'start_date')::date; e := (p_data->>'end_date')::date;
 half := coalesce((p_data->>'half_day')::boolean,false);
 IF s IS NULL OR e IS NULL OR e < s OR (half AND s<>e) THEN RAISE EXCEPTION 'INVALID_LEAVE_DATES'; END IF;
 IF extract(year FROM s)<>extract(year FROM e) THEN RAISE EXCEPTION 'LEAVE_SPANS_YEARS'; END IF;
 -- Employees request ahead or for today; HR may also record past leave (e.g. sick days).
 IF NOT is_hr AND s < business_hr_today() - 30 THEN RAISE EXCEPTION 'INVALID_LEAVE_DATES'; END IF;
 n := business_hr_working_days(s,e);
 IF half THEN n := least(n,0.5); END IF;
 IF n <= 0 THEN RAISE EXCEPTION 'LEAVE_NO_WORKING_DAYS'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('hr-leave:'||emp.id::text,0));
 PERFORM business_hr_leave_check(emp.id,lt,s,e,n,NULL);
 approve := is_hr AND coalesce((p_data->>'auto_approve')::boolean,false)
   AND emp.id IS DISTINCT FROM nullif(p_data->>'actor_employee_id','')::uuid;
 INSERT INTO hr_leave_requests(id,employee_id,leave_type_id,start_date,end_date,half_day,days,reason,status,
   requested_by,decided_by,decided_at,decision_note)
 VALUES(rid,emp.id,lt.id,s,e,half,n,nullif(trim(p_data->>'reason'),''),
   CASE WHEN approve THEN 'approved' ELSE 'pending' END,p_actor,
   CASE WHEN approve THEN p_actor END,CASE WHEN approve THEN now() END,
   CASE WHEN approve THEN 'سُجّلت واعتُمدت من الموارد البشرية' END);
 INSERT INTO hr_audit_log(actor_id,action,entity,entity_id,changes)
 VALUES(p_actor,'leave_request','employee',emp.id,jsonb_build_object('request_id',rid,'type',lt.code,'start',s,'end',e,'days',n,
   'status',CASE WHEN approve THEN 'approved' ELSE 'pending' END));
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('hr_leave_request',p_actor,p_key,p_data,rid);
 RETURN jsonb_build_object('request',business_hr_leave_request_document(rid),'replayed',false);
END $$;

-- p_data: id, action (approve|reject|cancel), note, plus server-derived is_hr / actor_employee_id.
CREATE FUNCTION public.business_hr_leave_decide(p_actor text, p_key uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE replay uuid; req hr_leave_requests; emp hr_employees; lt hr_leave_types; act text := p_data->>'action';
  is_hr boolean := coalesce((p_data->>'is_hr')::boolean,false);
  me uuid := nullif(p_data->>'actor_employee_id','')::uuid; new_status text;
BEGIN
 replay := business_hr_replay('hr_leave_decide',p_actor,p_key,p_data);
 IF replay IS NOT NULL THEN RETURN jsonb_build_object('request',business_hr_leave_request_document(replay),'replayed',true); END IF;
 BEGIN
   SELECT * INTO req FROM hr_leave_requests WHERE id=(p_data->>'id')::uuid FOR UPDATE;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'LEAVE_NOT_FOUND'; END;
 IF NOT FOUND THEN RAISE EXCEPTION 'LEAVE_NOT_FOUND'; END IF;
 SELECT * INTO emp FROM hr_employees WHERE id=req.employee_id;
 IF act IN ('approve','reject') THEN
   IF req.status<>'pending' THEN RAISE EXCEPTION 'LEAVE_NOT_PENDING'; END IF;
   -- Nobody decides their own request; otherwise HR, or the employee's direct manager.
   IF me IS NOT DISTINCT FROM req.employee_id THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
   IF NOT is_hr AND (me IS NULL OR emp.manager_id IS DISTINCT FROM me) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
   IF act='approve' THEN
     SELECT * INTO lt FROM hr_leave_types WHERE id=req.leave_type_id;
     PERFORM pg_advisory_xact_lock(hashtextextended('hr-leave:'||emp.id::text,0));
     PERFORM business_hr_leave_check(emp.id,lt,req.start_date,req.end_date,req.days,req.id);
     new_status := 'approved';
   ELSE
     IF coalesce(length(trim(p_data->>'note')),0)=0 THEN RAISE EXCEPTION 'DECISION_NOTE_REQUIRED'; END IF;
     new_status := 'rejected';
   END IF;
 ELSIF act='cancel' THEN
   IF req.status NOT IN ('pending','approved') THEN RAISE EXCEPTION 'LEAVE_NOT_CANCELLABLE'; END IF;
   IF NOT is_hr THEN
     IF me IS DISTINCT FROM req.employee_id THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
     -- An employee can withdraw a pending request, or an approved one that hasn't started yet.
     IF req.status='approved' AND req.start_date <= business_hr_today() THEN RAISE EXCEPTION 'LEAVE_NOT_CANCELLABLE'; END IF;
   END IF;
   new_status := 'cancelled';
 ELSE RAISE EXCEPTION 'INVALID_LEAVE_ACTION';
 END IF;
 UPDATE hr_leave_requests SET status=new_status,decided_by=p_actor,decided_at=now(),
   decision_note=coalesce(nullif(trim(p_data->>'note'),''),decision_note)
 WHERE id=req.id;
 INSERT INTO hr_audit_log(actor_id,action,entity,entity_id,changes)
 VALUES(p_actor,'leave_'||act,'employee',emp.id,jsonb_build_object('request_id',req.id,
   'status',jsonb_build_object('from',req.status,'to',new_status),'note',p_data->>'note'));
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('hr_leave_decide',p_actor,p_key,p_data,req.id);
 RETURN jsonb_build_object('request',business_hr_leave_request_document(req.id),'replayed',false);
END $$;

CREATE FUNCTION public.business_hr_leave_adjust(p_actor text, p_key uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE replay uuid; aid uuid := gen_random_uuid(); emp_id uuid := (p_data->>'employee_id')::uuid;
  type_id uuid := (p_data->>'leave_type_id')::uuid;
BEGIN
 replay := business_hr_replay('hr_leave_adjust',p_actor,p_key,p_data);
 IF replay IS NOT NULL THEN RETURN jsonb_build_object('id',replay,'replayed',true); END IF;
 IF NOT EXISTS(SELECT 1 FROM hr_employees WHERE id=emp_id) THEN RAISE EXCEPTION 'EMPLOYEE_NOT_FOUND'; END IF;
 IF NOT EXISTS(SELECT 1 FROM hr_leave_types WHERE id=type_id AND requires_balance) THEN RAISE EXCEPTION 'LEAVE_TYPE_NOT_FOUND'; END IF;
 IF coalesce(length(trim(p_data->>'reason')),0)=0 OR coalesce((p_data->>'days')::numeric,0)=0 THEN RAISE EXCEPTION 'INVALID_ADJUSTMENT'; END IF;
 INSERT INTO hr_leave_adjustments(id,employee_id,leave_type_id,year,days,reason,actor_id)
 VALUES(aid,emp_id,type_id,(p_data->>'year')::int,(p_data->>'days')::numeric,trim(p_data->>'reason'),p_actor);
 INSERT INTO hr_audit_log(actor_id,action,entity,entity_id,changes) VALUES(p_actor,'leave_adjustment','employee',emp_id,p_data);
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('hr_leave_adjust',p_actor,p_key,p_data,aid);
 RETURN jsonb_build_object('id',aid,'replayed',false);
END $$;

CREATE FUNCTION public.business_hr_leave_adjustments(p_year int, p_employee uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'employee_id',a.employee_id,'leave_type_id',a.leave_type_id,
   'year',a.year,'days',a.days,'reason',a.reason,'actor_id',a.actor_id,'created_at',a.created_at) ORDER BY a.created_at DESC),'[]'::jsonb)
 FROM hr_leave_adjustments a WHERE a.year=p_year AND (p_employee IS NULL OR a.employee_id=p_employee)
$$;

-- Account id -> employee id, for server-side identity derivation.
CREATE FUNCTION public.business_hr_employee_id_for_account(p_account text) RETURNS uuid
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT id FROM hr_employees WHERE account_id=p_account
$$;

-- One-step onboarding of existing login accounts as employee records (skips already-linked ones).
-- p_data: hire_date, accounts:[{account_id, full_name_ar, department_code, job_title}] (server-built).
CREATE FUNCTION public.business_hr_employee_bulk_create(p_actor text, p_key uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE replay uuid; batch_id uuid := gen_random_uuid(); acc jsonb; new_id uuid; created int := 0; skipped int := 0;
BEGIN
 replay := business_hr_replay('hr_employee_bulk',p_actor,p_key,p_data);
 IF replay IS NOT NULL THEN
   RETURN jsonb_build_object('created',(SELECT count(*)::int FROM hr_audit_log WHERE action='bulk_create' AND changes->>'batch_id'=replay::text),'replayed',true);
 END IF;
 IF coalesce(p_data->>'hire_date','')='' OR jsonb_typeof(p_data->'accounts')<>'array' THEN RAISE EXCEPTION 'INVALID_EMPLOYEE'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('hr-employee-bulk',0));
 FOR acc IN SELECT * FROM jsonb_array_elements(p_data->'accounts') LOOP
   IF EXISTS(SELECT 1 FROM hr_employees WHERE account_id=acc->>'account_id') THEN
     skipped := skipped+1;
     CONTINUE;
   END IF;
   INSERT INTO hr_employees(account_id,full_name_ar,job_title,department_id,hire_date,status)
   VALUES(acc->>'account_id',acc->>'full_name_ar',nullif(acc->>'job_title',''),
     (SELECT id FROM hr_departments WHERE code=acc->>'department_code'),(p_data->>'hire_date')::date,'active')
   RETURNING id INTO new_id;
   INSERT INTO hr_audit_log(actor_id,action,entity,entity_id,changes)
   VALUES(p_actor,'bulk_create','employee',new_id,acc||jsonb_build_object('batch_id',batch_id,'hire_date',p_data->>'hire_date'));
   created := created+1;
 END LOOP;
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('hr_employee_bulk',p_actor,p_key,p_data,batch_id);
 RETURN jsonb_build_object('created',created,'skipped',skipped,'replayed',false);
END $$;

DO $$
DECLARE fn text;
BEGIN
 FOREACH fn IN ARRAY ARRAY[
   'business_hr_settings()','business_hr_tz()','business_hr_today()','business_hr_leave_type_rank(text)',
   'business_hr_settings_save(text,uuid,jsonb)','business_hr_holidays(int)','business_hr_holiday_save(text,uuid,jsonb)',
   'business_hr_working_days(date,date)','business_hr_attendance_document(uuid)',
   'business_hr_attendance_range(date,date,uuid)','business_hr_attendance_punch(text,uuid,jsonb)',
   'business_hr_attendance_set(text,uuid,jsonb)','business_hr_leave_types()','business_hr_leave_type_save(text,uuid,jsonb)',
   'business_hr_leave_request_document(uuid)','business_hr_leave_requests(int,uuid,uuid)',
   'business_hr_leave_balances(int,uuid)','business_hr_leave_check(uuid,hr_leave_types,date,date,numeric,uuid)',
   'business_hr_leave_request_create(text,uuid,jsonb)','business_hr_leave_decide(text,uuid,jsonb)',
   'business_hr_leave_adjust(text,uuid,jsonb)','business_hr_leave_adjustments(int,uuid)',
   'business_hr_employee_id_for_account(text)','business_hr_employee_bulk_create(text,uuid,jsonb)']
 LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
   EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
 END LOOP;
END $$;

COMMIT;
