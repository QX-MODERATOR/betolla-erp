-- Additive only: no backfill, deletion of business data, or changes to existing RLS/policies.
-- HR module, phase 3: payroll. Recurring salary components, one-off monthly
-- adjustments, salary advances, monthly payroll runs with snapshot payslips.
-- Flow: draft (recalculable) -> approved (HR, locked numbers) -> paid (finance, final).
-- Depends on 006, 022, 023.
BEGIN;

-- Sales commission rate (% of the employee's delivered orders in the month). Sensitive.
ALTER TABLE public.hr_employees ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,2) NOT NULL DEFAULT 0;
DO $$ BEGIN
  ALTER TABLE public.hr_employees ADD CONSTRAINT chk_hr_employees_commission CHECK (commission_rate BETWEEN 0 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO public.hr_settings(key,value) VALUES
  ('payroll','{"ssc_employee_rate":7.5,"ssc_employer_rate":14.25,"ssc_max_wage":0,"daily_basis":30,"deduct_absences":false}')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.hr_salary_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id),
  kind TEXT NOT NULL CHECK (kind IN ('allowance','deduction')),
  name_ar TEXT NOT NULL,
  amount NUMERIC(12,3) NOT NULL CHECK (amount > 0),
  ssc_subject BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hr_salary_components_emp ON public.hr_salary_components(employee_id);

CREATE TABLE IF NOT EXISTS public.hr_payroll_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id),
  month TEXT NOT NULL CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  kind TEXT NOT NULL CHECK (kind IN ('bonus','overtime','deduction','income_tax')),
  amount NUMERIC(12,3) NOT NULL CHECK (amount > 0),
  note TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  voided_at TIMESTAMPTZ,
  voided_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_adjustments_month ON public.hr_payroll_adjustments(month, employee_id);

CREATE TABLE IF NOT EXISTS public.hr_advances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id),
  amount NUMERIC(12,3) NOT NULL CHECK (amount > 0),
  monthly_amount NUMERIC(12,3) NOT NULL CHECK (monthly_amount > 0),
  start_month TEXT NOT NULL CHECK (start_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','settled','cancelled')),
  actor_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (monthly_amount <= amount)
);
CREATE INDEX IF NOT EXISTS idx_hr_advances_emp ON public.hr_advances(employee_id);

CREATE TABLE IF NOT EXISTS public.hr_payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month TEXT NOT NULL UNIQUE CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid')),
  settings JSONB NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  paid_by TEXT,
  paid_at TIMESTAMPTZ,
  payment_ref TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A payslip is a frozen snapshot: names, bank details and every amount are copied at calculation time.
CREATE TABLE IF NOT EXISTS public.hr_payslips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.hr_payroll_runs(id),
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id),
  employee_no TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  department_name TEXT,
  job_title TEXT,
  bank_name TEXT,
  iban TEXT,
  ssc_number TEXT,
  employed_days INT NOT NULL,
  month_days INT NOT NULL,
  basic NUMERIC(12,3) NOT NULL,
  allowances NUMERIC(12,3) NOT NULL,
  commission NUMERIC(12,3) NOT NULL,
  commission_sales NUMERIC(14,3) NOT NULL,
  overtime NUMERIC(12,3) NOT NULL,
  bonuses NUMERIC(12,3) NOT NULL,
  gross NUMERIC(12,3) NOT NULL,
  ssc_base NUMERIC(12,3) NOT NULL,
  ssc_employee NUMERIC(12,3) NOT NULL,
  ssc_employer NUMERIC(12,3) NOT NULL,
  absent_days INT NOT NULL,
  absence_deduction NUMERIC(12,3) NOT NULL,
  unpaid_leave_days NUMERIC(5,1) NOT NULL,
  unpaid_leave_deduction NUMERIC(12,3) NOT NULL,
  advance_deduction NUMERIC(12,3) NOT NULL,
  other_deductions NUMERIC(12,3) NOT NULL,
  income_tax NUMERIC(12,3) NOT NULL,
  total_deductions NUMERIC(12,3) NOT NULL,
  net NUMERIC(12,3) NOT NULL,
  lines JSONB NOT NULL DEFAULT '[]',
  warnings JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, employee_id)
);
CREATE INDEX IF NOT EXISTS idx_hr_payslips_employee ON public.hr_payslips(employee_id);

DROP TRIGGER IF EXISTS trg_hr_salary_components_updated_at ON public.hr_salary_components;
CREATE TRIGGER trg_hr_salary_components_updated_at BEFORE UPDATE ON public.hr_salary_components
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_hr_advances_updated_at ON public.hr_advances;
CREATE TRIGGER trg_hr_advances_updated_at BEFORE UPDATE ON public.hr_advances
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_hr_payroll_runs_updated_at ON public.hr_payroll_runs;
CREATE TRIGGER trg_hr_payroll_runs_updated_at BEFORE UPDATE ON public.hr_payroll_runs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.hr_salary_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payslips ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_salary_components, public.hr_payroll_adjustments, public.hr_advances,
  public.hr_payroll_runs, public.hr_payslips FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.hr_salary_components, public.hr_payroll_adjustments, public.hr_advances,
  public.hr_payroll_runs, public.hr_payslips TO service_role;

-- The employee document now carries the commission rate in its sensitive projection.
CREATE OR REPLACE FUNCTION public.business_hr_employee_document(p_id uuid, p_sensitive boolean) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT jsonb_build_object(
   'id',e.id,'employee_no',e.employee_no,'account_id',e.account_id,
   'full_name_ar',e.full_name_ar,'full_name_en',coalesce(e.full_name_en,''),
   'nationality',coalesce(e.nationality,''),'gender',e.gender,'birth_date',e.birth_date,
   'marital_status',e.marital_status,'phone',coalesce(e.phone,''),'email',coalesce(e.email,''),
   'city',coalesce(e.city,''),'address',coalesce(e.address,''),
   'emergency_name',coalesce(e.emergency_name,''),'emergency_phone',coalesce(e.emergency_phone,''),
   'emergency_relation',coalesce(e.emergency_relation,''),
   'department_id',e.department_id,'department_name',coalesce(d.name_ar,''),
   'job_title',coalesce(e.job_title,''),'manager_id',e.manager_id,'manager_name',coalesce(m.full_name_ar,''),
   'employment_type',e.employment_type,'hire_date',e.hire_date,'probation_end_date',e.probation_end_date,
   'contract_end_date',e.contract_end_date,'status',e.status,'termination_date',e.termination_date,
   'termination_reason',coalesce(e.termination_reason,''),
   'direct_reports',(SELECT count(*)::int FROM hr_employees r WHERE r.manager_id=e.id AND r.status<>'terminated'),
   'updated_at',e.updated_at,'created_at',e.created_at
 ) || CASE WHEN p_sensitive THEN jsonb_build_object(
   'national_id',coalesce(e.national_id,''),'basic_salary',e.basic_salary,
   'bank_name',coalesce(e.bank_name,''),'iban',coalesce(e.iban,''),'ssc_number',coalesce(e.ssc_number,''),
   'notes',coalesce(e.notes,''),'commission_rate',e.commission_rate
 ) ELSE '{}'::jsonb END
 FROM hr_employees e
 LEFT JOIN hr_departments d ON d.id=e.department_id
 LEFT JOIN hr_employees m ON m.id=e.manager_id
 WHERE e.id=p_id
$$;

-- Phase-1 create/update RPCs, redefined to also persist commission_rate (the update diff audits it).
CREATE OR REPLACE FUNCTION public.business_hr_employee_create(p_actor text, p_key uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE replay uuid; new_id uuid := gen_random_uuid(); f jsonb := p_data->'fields';
BEGIN
 replay := business_hr_replay('hr_employee_create',p_actor,p_key,p_data);
 IF replay IS NOT NULL THEN
   RETURN jsonb_build_object('employee',business_hr_employee_document(replay,true),'replayed',true);
 END IF;
 IF f IS NULL OR coalesce(length(trim(f->>'full_name_ar')),0)=0 OR coalesce(f->>'hire_date','')='' THEN
   RAISE EXCEPTION 'INVALID_EMPLOYEE'; END IF;
 PERFORM business_hr_check_refs(new_id,nullif(f->>'department_id','')::uuid,nullif(f->>'manager_id','')::uuid);
 BEGIN
   INSERT INTO hr_employees(id,account_id,full_name_ar,full_name_en,national_id,nationality,gender,birth_date,
     marital_status,phone,email,city,address,emergency_name,emergency_phone,emergency_relation,department_id,
     job_title,manager_id,employment_type,hire_date,probation_end_date,contract_end_date,status,basic_salary,
     bank_name,iban,ssc_number,notes,commission_rate)
   VALUES(new_id,nullif(f->>'account_id',''),trim(f->>'full_name_ar'),nullif(f->>'full_name_en',''),
     nullif(f->>'national_id',''),nullif(f->>'nationality',''),nullif(f->>'gender',''),nullif(f->>'birth_date','')::date,
     nullif(f->>'marital_status',''),nullif(f->>'phone',''),nullif(f->>'email',''),nullif(f->>'city',''),
     nullif(f->>'address',''),nullif(f->>'emergency_name',''),nullif(f->>'emergency_phone',''),
     nullif(f->>'emergency_relation',''),nullif(f->>'department_id','')::uuid,nullif(f->>'job_title',''),
     nullif(f->>'manager_id','')::uuid,coalesce(nullif(f->>'employment_type',''),'full_time'),(f->>'hire_date')::date,
     nullif(f->>'probation_end_date','')::date,nullif(f->>'contract_end_date','')::date,
     coalesce(nullif(f->>'status',''),'active'),coalesce(nullif(f->>'basic_salary','')::numeric,0),
     nullif(f->>'bank_name',''),nullif(f->>'iban',''),nullif(f->>'ssc_number',''),nullif(f->>'notes',''),
     coalesce(nullif(f->>'commission_rate','')::numeric,0));
 EXCEPTION
   WHEN unique_violation THEN
     IF SQLERRM LIKE '%account_id%' THEN RAISE EXCEPTION 'ACCOUNT_ALREADY_LINKED'; END IF;
     RAISE EXCEPTION 'DUPLICATE_NATIONAL_ID';
   WHEN check_violation THEN RAISE EXCEPTION 'INVALID_EMPLOYEE';
 END;
 INSERT INTO hr_audit_log(actor_id,action,entity,entity_id,changes) VALUES(p_actor,'create','employee',new_id,f);
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('hr_employee_create',p_actor,p_key,p_data,new_id);
 RETURN jsonb_build_object('employee',business_hr_employee_document(new_id,true),'replayed',false);
END $$;

CREATE OR REPLACE FUNCTION public.business_hr_employee_update(p_actor text, p_key uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE replay uuid; emp hr_employees; emp_id uuid; f jsonb := coalesce(p_data->'fields','{}'::jsonb);
  old_doc jsonb; changes jsonb := '{}'; k text;
BEGIN
 replay := business_hr_replay('hr_employee_update',p_actor,p_key,p_data);
 IF replay IS NOT NULL THEN
   RETURN jsonb_build_object('employee',business_hr_employee_document(replay,true),'replayed',true);
 END IF;
 BEGIN emp_id := (p_data->>'id')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'EMPLOYEE_NOT_FOUND'; END;
 SELECT * INTO emp FROM hr_employees WHERE id=emp_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_NOT_FOUND'; END IF;
 IF p_data ? 'expected_updated_at' AND (p_data->>'expected_updated_at')::timestamptz<>emp.updated_at THEN
   RAISE EXCEPTION 'STALE_EMPLOYEE'; END IF;
 IF f ? 'full_name_ar' AND coalesce(length(trim(f->>'full_name_ar')),0)=0 THEN RAISE EXCEPTION 'INVALID_EMPLOYEE'; END IF;
 IF f ? 'hire_date' AND coalesce(f->>'hire_date','')='' THEN RAISE EXCEPTION 'INVALID_EMPLOYEE'; END IF;
 PERFORM business_hr_check_refs(emp_id,
   CASE WHEN f ? 'department_id' THEN nullif(f->>'department_id','')::uuid ELSE emp.department_id END,
   CASE WHEN f ? 'manager_id' THEN nullif(f->>'manager_id','')::uuid ELSE emp.manager_id END);
 old_doc := to_jsonb(emp);
 BEGIN
   UPDATE hr_employees SET
     account_id=CASE WHEN f ? 'account_id' THEN nullif(f->>'account_id','') ELSE account_id END,
     full_name_ar=CASE WHEN f ? 'full_name_ar' THEN trim(f->>'full_name_ar') ELSE full_name_ar END,
     full_name_en=CASE WHEN f ? 'full_name_en' THEN nullif(f->>'full_name_en','') ELSE full_name_en END,
     national_id=CASE WHEN f ? 'national_id' THEN nullif(f->>'national_id','') ELSE national_id END,
     nationality=CASE WHEN f ? 'nationality' THEN nullif(f->>'nationality','') ELSE nationality END,
     gender=CASE WHEN f ? 'gender' THEN nullif(f->>'gender','') ELSE gender END,
     birth_date=CASE WHEN f ? 'birth_date' THEN nullif(f->>'birth_date','')::date ELSE birth_date END,
     marital_status=CASE WHEN f ? 'marital_status' THEN nullif(f->>'marital_status','') ELSE marital_status END,
     phone=CASE WHEN f ? 'phone' THEN nullif(f->>'phone','') ELSE phone END,
     email=CASE WHEN f ? 'email' THEN nullif(f->>'email','') ELSE email END,
     city=CASE WHEN f ? 'city' THEN nullif(f->>'city','') ELSE city END,
     address=CASE WHEN f ? 'address' THEN nullif(f->>'address','') ELSE address END,
     emergency_name=CASE WHEN f ? 'emergency_name' THEN nullif(f->>'emergency_name','') ELSE emergency_name END,
     emergency_phone=CASE WHEN f ? 'emergency_phone' THEN nullif(f->>'emergency_phone','') ELSE emergency_phone END,
     emergency_relation=CASE WHEN f ? 'emergency_relation' THEN nullif(f->>'emergency_relation','') ELSE emergency_relation END,
     department_id=CASE WHEN f ? 'department_id' THEN nullif(f->>'department_id','')::uuid ELSE department_id END,
     job_title=CASE WHEN f ? 'job_title' THEN nullif(f->>'job_title','') ELSE job_title END,
     manager_id=CASE WHEN f ? 'manager_id' THEN nullif(f->>'manager_id','')::uuid ELSE manager_id END,
     employment_type=CASE WHEN f ? 'employment_type' THEN f->>'employment_type' ELSE employment_type END,
     hire_date=CASE WHEN f ? 'hire_date' THEN (f->>'hire_date')::date ELSE hire_date END,
     probation_end_date=CASE WHEN f ? 'probation_end_date' THEN nullif(f->>'probation_end_date','')::date ELSE probation_end_date END,
     contract_end_date=CASE WHEN f ? 'contract_end_date' THEN nullif(f->>'contract_end_date','')::date ELSE contract_end_date END,
     status=CASE WHEN f ? 'status' THEN f->>'status' ELSE status END,
     termination_date=CASE WHEN f ? 'termination_date' THEN nullif(f->>'termination_date','')::date ELSE termination_date END,
     termination_reason=CASE WHEN f ? 'termination_reason' THEN nullif(f->>'termination_reason','') ELSE termination_reason END,
     basic_salary=CASE WHEN f ? 'basic_salary' THEN coalesce(nullif(f->>'basic_salary','')::numeric,0) ELSE basic_salary END,
     bank_name=CASE WHEN f ? 'bank_name' THEN nullif(f->>'bank_name','') ELSE bank_name END,
     iban=CASE WHEN f ? 'iban' THEN nullif(f->>'iban','') ELSE iban END,
     ssc_number=CASE WHEN f ? 'ssc_number' THEN nullif(f->>'ssc_number','') ELSE ssc_number END,
     notes=CASE WHEN f ? 'notes' THEN nullif(f->>'notes','') ELSE notes END,
     commission_rate=CASE WHEN f ? 'commission_rate' THEN coalesce(nullif(f->>'commission_rate','')::numeric,0) ELSE commission_rate END
   WHERE id=emp_id RETURNING * INTO emp;
 EXCEPTION
   WHEN unique_violation THEN
     IF SQLERRM LIKE '%account_id%' THEN RAISE EXCEPTION 'ACCOUNT_ALREADY_LINKED'; END IF;
     RAISE EXCEPTION 'DUPLICATE_NATIONAL_ID';
   WHEN check_violation THEN RAISE EXCEPTION 'INVALID_EMPLOYEE';
 END;
 -- A terminated employee must always carry a termination date.
 IF emp.status='terminated' AND emp.termination_date IS NULL THEN RAISE EXCEPTION 'TERMINATION_DATE_REQUIRED'; END IF;
 -- Audit only real before/after differences (never a full row dump).
 FOR k IN SELECT jsonb_object_keys(to_jsonb(emp)) LOOP
   IF k NOT IN ('updated_at','created_at') AND (old_doc->k) IS DISTINCT FROM (to_jsonb(emp)->k) THEN
     changes := changes || jsonb_build_object(k,jsonb_build_object('from',old_doc->k,'to',to_jsonb(emp)->k));
   END IF;
 END LOOP;
 IF changes<>'{}'::jsonb THEN
   INSERT INTO hr_audit_log(actor_id,action,entity,entity_id,changes)
   VALUES(p_actor,CASE WHEN changes ? 'status' THEN 'status_change' ELSE 'update' END,'employee',emp_id,changes);
 END IF;
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('hr_employee_update',p_actor,p_key,p_data,emp_id);
 RETURN jsonb_build_object('employee',business_hr_employee_document(emp_id,true),'replayed',false);
END $$;

-- ---------------------------------------------------------------- helpers

CREATE FUNCTION public.business_hr_is_working_day(p_day date) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT NOT EXISTS (SELECT 1 FROM hr_holidays WHERE holiday_date=p_day)
   AND NOT (extract(dow FROM p_day)::int IN (
     SELECT jsonb_array_elements_text(coalesce((SELECT value->'weekend' FROM hr_settings WHERE key='attendance'),'[5]'::jsonb))::int))
$$;

CREATE FUNCTION public.business_hr_month_open(p_month text) RETURNS void
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM hr_payroll_runs WHERE month=p_month AND status IN ('approved','paid')) THEN
   RAISE EXCEPTION 'PAYROLL_LOCKED'; END IF;
END $$;

-- Amount of an advance already recovered through approved/paid payslips (optionally excluding one run).
CREATE FUNCTION public.business_hr_advance_repaid(p_advance uuid, p_exclude_run uuid) RETURNS numeric
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(sum((l->>'amount')::numeric),0)
 FROM hr_payslips p JOIN hr_payroll_runs r ON r.id=p.run_id
 CROSS JOIN LATERAL jsonb_array_elements(p.lines) l
 WHERE r.status IN ('approved','paid') AND r.id IS DISTINCT FROM p_exclude_run
   AND l->>'type'='advance' AND l->>'ref'=p_advance::text
$$;

-- ---------------------------------------------------------------- calculation

-- (Re)builds every payslip of a draft run from current data. Payslips of a draft are derived data.
CREATE FUNCTION public.business_hr_payroll_calc(p_run uuid) RETURNS void
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE run hr_payroll_runs; cfg jsonb; m_start date; m_end date; dim int; today date := business_hr_today();
  e record; emp_from date; emp_to date; factor numeric; lines jsonb; warnings jsonb;
  v_basic numeric; v_allow numeric; v_ssc_allow numeric; v_comm numeric; v_sales numeric; v_ot numeric; v_bonus numeric;
  v_other numeric; v_tax numeric; v_gross numeric; v_daily numeric; v_absent int; v_absent_ded numeric;
  v_unpaid numeric; v_unpaid_ded numeric; v_base numeric; v_ssc_e numeric; v_ssc_r numeric; v_adv numeric;
  v_total_ded numeric; v_net numeric; c record; a record; adv record; remaining numeric; take numeric; lr record;
  full_allow numeric;
BEGIN
 SELECT * INTO run FROM hr_payroll_runs WHERE id=p_run FOR UPDATE;
 IF run.status<>'draft' THEN RAISE EXCEPTION 'PAYROLL_LOCKED'; END IF;
 cfg := coalesce((SELECT value FROM hr_settings WHERE key='payroll'),'{}'::jsonb);
 m_start := (run.month||'-01')::date;
 m_end := (m_start + interval '1 month' - interval '1 day')::date;
 dim := extract(day FROM m_end)::int;
 DELETE FROM hr_payslips WHERE run_id=run.id;

 FOR e IN
   SELECT emp.*, coalesce(d.name_ar,'') dept FROM hr_employees emp LEFT JOIN hr_departments d ON d.id=emp.department_id
   WHERE emp.hire_date<=m_end AND (emp.termination_date IS NULL OR emp.termination_date>=m_start)
   ORDER BY emp.full_name_ar
 LOOP
   emp_from := greatest(e.hire_date,m_start);
   emp_to := least(coalesce(e.termination_date,m_end),m_end);
   CONTINUE WHEN emp_from>emp_to;
   factor := (emp_to-emp_from+1)::numeric/dim;
   lines := '[]'::jsonb; warnings := '[]'::jsonb;

   v_basic := round(e.basic_salary*factor,3);
   lines := lines || jsonb_build_object('type','basic','label','الراتب الأساسي','amount',v_basic);

   v_allow := 0; v_ssc_allow := 0; full_allow := 0; v_other := 0;
   FOR c IN SELECT * FROM hr_salary_components WHERE employee_id=e.id AND is_active ORDER BY kind,created_at LOOP
     IF c.kind='allowance' THEN
       v_allow := v_allow + round(c.amount*factor,3);
       full_allow := full_allow + c.amount;
       IF c.ssc_subject THEN v_ssc_allow := v_ssc_allow + round(c.amount*factor,3); END IF;
       lines := lines || jsonb_build_object('type','allowance','label',c.name_ar,'amount',round(c.amount*factor,3),'ref',c.id);
     ELSE
       v_other := v_other + round(c.amount*factor,3);
       lines := lines || jsonb_build_object('type','deduction','label',c.name_ar,'amount',round(c.amount*factor,3),'ref',c.id);
     END IF;
   END LOOP;

   v_sales := 0; v_comm := 0;
   IF e.account_id IS NOT NULL AND e.commission_rate>0 THEN
     SELECT coalesce(sum(total_amount),0) INTO v_sales FROM orders
     WHERE owner_account_id=e.account_id AND status='delivered' AND order_date BETWEEN emp_from AND emp_to;
     v_comm := round(v_sales*e.commission_rate/100,3);
     IF v_comm>0 THEN
       lines := lines || jsonb_build_object('type','commission','label','عمولة مبيعات '||e.commission_rate||'% من '||v_sales,'amount',v_comm);
     END IF;
   END IF;

   v_ot := 0; v_bonus := 0; v_tax := 0;
   FOR a IN SELECT * FROM hr_payroll_adjustments WHERE employee_id=e.id AND month=run.month AND voided_at IS NULL ORDER BY created_at LOOP
     IF a.kind='overtime' THEN v_ot := v_ot + a.amount;
     ELSIF a.kind='bonus' THEN v_bonus := v_bonus + a.amount;
     ELSIF a.kind='income_tax' THEN v_tax := v_tax + a.amount;
     ELSE v_other := v_other + a.amount;
     END IF;
     lines := lines || jsonb_build_object('type',a.kind,'label',a.note,'amount',a.amount,'ref',a.id);
   END LOOP;

   v_gross := v_basic + v_allow + v_comm + v_ot + v_bonus;

   -- Daily rate uses the full (un-prorated) fixed monthly pay.
   v_daily := (e.basic_salary + full_allow) / greatest(coalesce((cfg->>'daily_basis')::numeric,30),1);

   v_unpaid := 0;
   FOR lr IN SELECT r.* FROM hr_leave_requests r JOIN hr_leave_types t ON t.id=r.leave_type_id
     WHERE r.employee_id=e.id AND r.status='approved' AND NOT t.paid AND r.start_date<=emp_to AND r.end_date>=emp_from LOOP
     v_unpaid := v_unpaid + CASE WHEN lr.half_day THEN 0.5
       ELSE business_hr_working_days(greatest(lr.start_date,emp_from),least(lr.end_date,emp_to)) END;
   END LOOP;
   v_unpaid_ded := round(v_daily*v_unpaid,3);
   IF v_unpaid_ded>0 THEN
     lines := lines || jsonb_build_object('type','unpaid_leave','label','إجازة بدون راتب ('||v_unpaid||' يوم)','amount',v_unpaid_ded);
   END IF;

   -- Absent = past working days with no check-in and no approved leave.
   SELECT count(*)::int INTO v_absent
   FROM generate_series(emp_from, least(emp_to, today-1), interval '1 day') g(d)
   WHERE business_hr_is_working_day(g.d::date)
     AND NOT EXISTS(SELECT 1 FROM hr_attendance at WHERE at.employee_id=e.id AND at.work_date=g.d::date AND at.check_in IS NOT NULL)
     AND NOT EXISTS(SELECT 1 FROM hr_leave_requests r WHERE r.employee_id=e.id AND r.status='approved'
       AND r.start_date<=g.d::date AND r.end_date>=g.d::date);
   v_absent_ded := CASE WHEN coalesce((cfg->>'deduct_absences')::boolean,false) THEN round(v_daily*v_absent,3) ELSE 0 END;
   IF v_absent_ded>0 THEN
     lines := lines || jsonb_build_object('type','absence','label','غياب ('||v_absent||' يوم)','amount',v_absent_ded);
   END IF;

   -- Social security: basic + SSC-subject allowances, optionally capped. Not applied to freelancers.
   v_base := 0; v_ssc_e := 0; v_ssc_r := 0;
   IF e.employment_type<>'freelance' THEN
     v_base := v_basic + v_ssc_allow;
     IF coalesce((cfg->>'ssc_max_wage')::numeric,0)>0 THEN v_base := least(v_base,(cfg->>'ssc_max_wage')::numeric); END IF;
     v_ssc_e := round(v_base*coalesce((cfg->>'ssc_employee_rate')::numeric,7.5)/100,3);
     v_ssc_r := round(v_base*coalesce((cfg->>'ssc_employer_rate')::numeric,14.25)/100,3);
     IF v_ssc_e>0 THEN
       lines := lines || jsonb_build_object('type','ssc','label','الضمان الاجتماعي ('||coalesce(cfg->>'ssc_employee_rate','7.5')||'%)','amount',v_ssc_e);
     END IF;
     IF coalesce(e.ssc_number,'')='' AND v_ssc_e>0 THEN warnings := warnings || '"NO_SSC_NUMBER"'::jsonb; END IF;
   END IF;

   -- Advances: recover up to the monthly installment, never more than what's left.
   v_adv := 0;
   FOR adv IN SELECT * FROM hr_advances WHERE employee_id=e.id AND status='active' AND start_month<=run.month ORDER BY created_at LOOP
     remaining := adv.amount - business_hr_advance_repaid(adv.id,run.id);
     take := least(adv.monthly_amount,greatest(remaining,0));
     IF take>0 THEN
       v_adv := v_adv + take;
       lines := lines || jsonb_build_object('type','advance','label','قسط سلفة ('||adv.reason||')','amount',take,'ref',adv.id);
     END IF;
   END LOOP;

   v_total_ded := v_ssc_e + v_absent_ded + v_unpaid_ded + v_adv + v_other + v_tax;
   v_net := v_gross - v_total_ded;
   IF v_net<0 THEN warnings := warnings || '"NEGATIVE_NET"'::jsonb; END IF;
   IF e.basic_salary=0 THEN warnings := warnings || '"NO_SALARY"'::jsonb; END IF;
   IF coalesce(e.iban,'')='' THEN warnings := warnings || '"NO_IBAN"'::jsonb; END IF;
   IF e.status='terminated' THEN warnings := warnings || '"FINAL_SETTLEMENT"'::jsonb; END IF;
   IF e.status='suspended' THEN warnings := warnings || '"SUSPENDED"'::jsonb; END IF;

   INSERT INTO hr_payslips(run_id,employee_id,employee_no,employee_name,department_name,job_title,bank_name,iban,ssc_number,
     employed_days,month_days,basic,allowances,commission,commission_sales,overtime,bonuses,gross,ssc_base,ssc_employee,
     ssc_employer,absent_days,absence_deduction,unpaid_leave_days,unpaid_leave_deduction,advance_deduction,other_deductions,
     income_tax,total_deductions,net,lines,warnings)
   VALUES(run.id,e.id,e.employee_no,e.full_name_ar,e.dept,e.job_title,e.bank_name,e.iban,e.ssc_number,
     emp_to-emp_from+1,dim,v_basic,v_allow,v_comm,v_sales,v_ot,v_bonus,v_gross,v_base,v_ssc_e,
     v_ssc_r,v_absent,v_absent_ded,v_unpaid,v_unpaid_ded,v_adv,v_other,
     v_tax,v_total_ded,v_net,lines,warnings);
 END LOOP;
 UPDATE hr_payroll_runs SET calculated_at=now(),settings=cfg WHERE id=run.id;
END $$;

-- Recalculate whatever draft runs exist (after inputs that feed payroll change).
CREATE FUNCTION public.business_hr_payroll_refresh_drafts(p_month text) RETURNS void
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE rid uuid;
BEGIN
 FOR rid IN SELECT id FROM hr_payroll_runs WHERE status='draft' AND (p_month IS NULL OR month=p_month) LOOP
   PERFORM business_hr_payroll_calc(rid);
 END LOOP;
END $$;

-- ---------------------------------------------------------------- read models

CREATE FUNCTION public.business_hr_payslip_document(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT to_jsonb(p) - 'created_at' || jsonb_build_object('month',r.month,'run_status',r.status,'paid_at',r.paid_at,
   'employee_account_id',e.account_id)
 FROM hr_payslips p JOIN hr_payroll_runs r ON r.id=p.run_id JOIN hr_employees e ON e.id=p.employee_id WHERE p.id=p_id
$$;

CREATE FUNCTION public.business_hr_payroll_run_summary(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT jsonb_build_object('id',r.id,'month',r.month,'status',r.status,'settings',r.settings,
   'created_by',r.created_by,'calculated_at',r.calculated_at,'approved_by',r.approved_by,'approved_at',r.approved_at,
   'paid_by',r.paid_by,'paid_at',r.paid_at,'payment_ref',coalesce(r.payment_ref,''),'notes',coalesce(r.notes,''),
   'updated_at',r.updated_at,'created_at',r.created_at,
   'totals',(SELECT jsonb_build_object('count',count(*)::int,'gross',coalesce(sum(gross),0),'net',coalesce(sum(net),0),
     'ssc_employee',coalesce(sum(ssc_employee),0),'ssc_employer',coalesce(sum(ssc_employer),0),
     'deductions',coalesce(sum(total_deductions),0),'commission',coalesce(sum(commission),0),
     'employer_cost',coalesce(sum(gross+ssc_employer),0),
     'warnings',coalesce(sum(jsonb_array_length(warnings)),0)::int) FROM hr_payslips WHERE run_id=r.id))
 FROM hr_payroll_runs r WHERE r.id=p_id
$$;

CREATE FUNCTION public.business_hr_payroll_runs() RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(business_hr_payroll_run_summary(id) ORDER BY month DESC),'[]'::jsonb) FROM hr_payroll_runs
$$;

CREATE FUNCTION public.business_hr_payroll_run(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT business_hr_payroll_run_summary(p_id) || jsonb_build_object('payslips',
   coalesce((SELECT jsonb_agg(business_hr_payslip_document(id) ORDER BY employee_name,id) FROM hr_payslips WHERE run_id=p_id),'[]'::jsonb))
 WHERE EXISTS(SELECT 1 FROM hr_payroll_runs WHERE id=p_id)
$$;

-- Employee's own payslips: only once HR has approved the run.
CREATE FUNCTION public.business_hr_payslips_for_employee(p_employee uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(business_hr_payslip_document(p.id) ORDER BY r.month DESC),'[]'::jsonb)
 FROM hr_payslips p JOIN hr_payroll_runs r ON r.id=p.run_id
 WHERE p.employee_id=p_employee AND r.status IN ('approved','paid')
$$;

CREATE FUNCTION public.business_hr_salary_components(p_employee uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'employee_id',employee_id,'kind',kind,'name_ar',name_ar,
   'amount',amount,'ssc_subject',ssc_subject,'is_active',is_active,'updated_at',updated_at)
   ORDER BY is_active DESC,kind,created_at),'[]'::jsonb)
 FROM hr_salary_components WHERE p_employee IS NULL OR employee_id=p_employee
$$;

CREATE FUNCTION public.business_hr_payroll_adjustments(p_month text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'employee_id',a.employee_id,'employee_name',e.full_name_ar,
   'month',a.month,'kind',a.kind,'amount',a.amount,'note',a.note,'actor_id',a.actor_id,
   'voided',a.voided_at IS NOT NULL,'created_at',a.created_at) ORDER BY a.created_at DESC),'[]'::jsonb)
 FROM hr_payroll_adjustments a JOIN hr_employees e ON e.id=a.employee_id WHERE a.month=p_month
$$;

CREATE FUNCTION public.business_hr_advances(p_employee uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',v.id,'employee_id',v.employee_id,'employee_name',e.full_name_ar,
   'amount',v.amount,'monthly_amount',v.monthly_amount,'start_month',v.start_month,'reason',v.reason,
   'status',v.status,'repaid',business_hr_advance_repaid(v.id,NULL),
   'remaining',v.amount-business_hr_advance_repaid(v.id,NULL),'created_at',v.created_at)
   ORDER BY (v.status='active') DESC,v.created_at DESC),'[]'::jsonb)
 FROM hr_advances v JOIN hr_employees e ON e.id=v.employee_id
 WHERE p_employee IS NULL OR v.employee_id=p_employee
$$;

-- ---------------------------------------------------------------- writes

-- p_data: {month}. Creates the month's draft run, or recalculates an existing draft.
CREATE FUNCTION public.business_hr_payroll_generate(p_actor text, p_key uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE replay uuid; mon text := p_data->>'month'; run hr_payroll_runs;
BEGIN
 replay := business_hr_replay('hr_payroll_generate',p_actor,p_key,p_data);
 IF replay IS NOT NULL THEN RETURN jsonb_build_object('run',business_hr_payroll_run(replay),'replayed',true); END IF;
 IF mon IS NULL OR mon !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'INVALID_PAYROLL'; END IF;
 IF (mon||'-01')::date > date_trunc('month',business_hr_today())::date THEN RAISE EXCEPTION 'PAYROLL_FUTURE_MONTH'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('hr-payroll:'||mon,0));
 SELECT * INTO run FROM hr_payroll_runs WHERE month=mon FOR UPDATE;
 IF FOUND AND run.status<>'draft' THEN RAISE EXCEPTION 'PAYROLL_LOCKED'; END IF;
 IF NOT FOUND THEN
   INSERT INTO hr_payroll_runs(month,created_by) VALUES(mon,p_actor) RETURNING * INTO run;
   INSERT INTO hr_audit_log(actor_id,action,entity,entity_id,changes) VALUES(p_actor,'payroll_create','payroll',run.id,p_data);
 END IF;
 PERFORM business_hr_payroll_calc(run.id);
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('hr_payroll_generate',p_actor,p_key,p_data,run.id);
 RETURN jsonb_build_object('run',business_hr_payroll_run(run.id),'replayed',false);
END $$;

-- p_data: {id, action: approve|reopen|pay, note, payment_ref, expected_net, expected_count} + server flags is_hr/is_finance.
-- Approve recalculates first; if the numbers moved since HR reviewed them, the run stays a draft
-- (with the fresh numbers saved) and {changed:true} is returned instead.
CREATE FUNCTION public.business_hr_payroll_transition(p_actor text, p_key uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE replay uuid; run hr_payroll_runs; act text := p_data->>'action'; totals jsonb;
  is_hr boolean := coalesce((p_data->>'is_hr')::boolean,false);
  is_fin boolean := coalesce((p_data->>'is_finance')::boolean,false);
BEGIN
 replay := business_hr_replay('hr_payroll_transition',p_actor,p_key,p_data);
 IF replay IS NOT NULL THEN RETURN jsonb_build_object('run',business_hr_payroll_run(replay),'changed',false,'replayed',true); END IF;
 BEGIN
   SELECT * INTO run FROM hr_payroll_runs WHERE id=(p_data->>'id')::uuid FOR UPDATE;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'PAYROLL_NOT_FOUND'; END;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYROLL_NOT_FOUND'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('hr-payroll:'||run.month,0));

 IF act='approve' THEN
   IF NOT is_hr THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
   IF run.status<>'draft' THEN RAISE EXCEPTION 'PAYROLL_BAD_STATUS'; END IF;
   PERFORM business_hr_payroll_calc(run.id);
   totals := business_hr_payroll_run_summary(run.id)->'totals';
   IF (totals->>'count')::int=0 THEN RAISE EXCEPTION 'PAYROLL_EMPTY'; END IF;
   IF (totals->>'net')::numeric IS DISTINCT FROM (p_data->>'expected_net')::numeric
      OR (totals->>'count')::int IS DISTINCT FROM (p_data->>'expected_count')::int THEN
     -- Not recorded in business_requests: a retry with the same key must re-evaluate.
     RETURN jsonb_build_object('run',business_hr_payroll_run(run.id),'changed',true,'replayed',false);
   END IF;
   IF EXISTS(SELECT 1 FROM hr_payslips WHERE run_id=run.id AND net<0) THEN RAISE EXCEPTION 'PAYROLL_NEGATIVE_NET'; END IF;
   UPDATE hr_payroll_runs SET status='approved',approved_by=p_actor,approved_at=now(),
     notes=coalesce(nullif(trim(p_data->>'note'),''),notes) WHERE id=run.id;
 ELSIF act='reopen' THEN
   IF NOT is_hr THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
   IF run.status<>'approved' THEN RAISE EXCEPTION 'PAYROLL_BAD_STATUS'; END IF;
   IF coalesce(length(trim(p_data->>'note')),0)=0 THEN RAISE EXCEPTION 'PAYROLL_NOTE_REQUIRED'; END IF;
   UPDATE hr_payroll_runs SET status='draft',approved_by=NULL,approved_at=NULL,notes=trim(p_data->>'note') WHERE id=run.id;
   PERFORM business_hr_payroll_calc(run.id);
 ELSIF act='pay' THEN
   IF NOT is_fin THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
   IF run.status<>'approved' THEN RAISE EXCEPTION 'PAYROLL_BAD_STATUS'; END IF;
   UPDATE hr_payroll_runs SET status='paid',paid_by=p_actor,paid_at=now(),
     payment_ref=nullif(trim(p_data->>'payment_ref'),''),
     notes=coalesce(nullif(trim(p_data->>'note'),''),notes) WHERE id=run.id;
   UPDATE hr_advances v SET status='settled'
   WHERE v.status='active' AND v.amount - business_hr_advance_repaid(v.id,NULL) <= 0;
 ELSE RAISE EXCEPTION 'INVALID_PAYROLL';
 END IF;
 INSERT INTO hr_audit_log(actor_id,action,entity,entity_id,changes)
 VALUES(p_actor,'payroll_'||act,'payroll',run.id,jsonb_build_object('month',run.month,'from',run.status,
   'note',p_data->>'note','payment_ref',p_data->>'payment_ref'));
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('hr_payroll_transition',p_actor,p_key,p_data,run.id);
 RETURN jsonb_build_object('run',business_hr_payroll_run(run.id),'changed',false,'replayed',false);
END $$;

-- p_data: add {employee_id, kind, name_ar, amount, ssc_subject} | update {id, name_ar, amount, ssc_subject, is_active}
CREATE FUNCTION public.business_hr_component_save(p_actor text, p_key uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE replay uuid; cid uuid; old_row hr_salary_components;
BEGIN
 replay := business_hr_replay('hr_component',p_actor,p_key,p_data);
 IF replay IS NOT NULL THEN RETURN jsonb_build_object('id',replay,'replayed',true); END IF;
 IF coalesce(p_data->>'id','')='' THEN
   IF NOT EXISTS(SELECT 1 FROM hr_employees WHERE id=(p_data->>'employee_id')::uuid) THEN RAISE EXCEPTION 'EMPLOYEE_NOT_FOUND'; END IF;
   INSERT INTO hr_salary_components(employee_id,kind,name_ar,amount,ssc_subject)
   VALUES((p_data->>'employee_id')::uuid,p_data->>'kind',trim(p_data->>'name_ar'),(p_data->>'amount')::numeric,
     coalesce((p_data->>'ssc_subject')::boolean,false))
   RETURNING id INTO cid;
   INSERT INTO hr_audit_log(actor_id,action,entity,entity_id,changes)
   VALUES(p_actor,'component_create','employee',(p_data->>'employee_id')::uuid,p_data || jsonb_build_object('component_id',cid));
 ELSE
   SELECT * INTO old_row FROM hr_salary_components WHERE id=(p_data->>'id')::uuid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'COMPONENT_NOT_FOUND'; END IF;
   UPDATE hr_salary_components SET name_ar=trim(p_data->>'name_ar'),amount=(p_data->>'amount')::numeric,
     ssc_subject=coalesce((p_data->>'ssc_subject')::boolean,ssc_subject),
     is_active=coalesce((p_data->>'is_active')::boolean,is_active)
   WHERE id=old_row.id RETURNING id INTO cid;
   INSERT INTO hr_audit_log(actor_id,action,entity,entity_id,changes)
   VALUES(p_actor,'component_update','employee',old_row.employee_id,jsonb_build_object('component_id',cid,
     'name_ar',old_row.name_ar,'amount',jsonb_build_object('from',old_row.amount,'to',(p_data->>'amount')::numeric),
     'is_active',jsonb_build_object('from',old_row.is_active,'to',coalesce((p_data->>'is_active')::boolean,old_row.is_active))));
 END IF;
 PERFORM business_hr_payroll_refresh_drafts(NULL);
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('hr_component',p_actor,p_key,p_data,cid);
 RETURN jsonb_build_object('id',cid,'replayed',false);
END $$;

-- p_data: add {employee_id, month, kind, amount, note} | void {id}
CREATE FUNCTION public.business_hr_adjustment_save(p_actor text, p_key uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE replay uuid; aid uuid; row_ hr_payroll_adjustments;
BEGIN
 replay := business_hr_replay('hr_payroll_adjustment',p_actor,p_key,p_data);
 IF replay IS NOT NULL THEN RETURN jsonb_build_object('id',replay,'replayed',true); END IF;
 IF p_data->>'action'='add' THEN
   PERFORM business_hr_month_open(p_data->>'month');
   IF NOT EXISTS(SELECT 1 FROM hr_employees WHERE id=(p_data->>'employee_id')::uuid) THEN RAISE EXCEPTION 'EMPLOYEE_NOT_FOUND'; END IF;
   INSERT INTO hr_payroll_adjustments(employee_id,month,kind,amount,note,actor_id)
   VALUES((p_data->>'employee_id')::uuid,p_data->>'month',p_data->>'kind',(p_data->>'amount')::numeric,trim(p_data->>'note'),p_actor)
   RETURNING * INTO row_;
   INSERT INTO hr_audit_log(actor_id,action,entity,entity_id,changes)
   VALUES(p_actor,'payroll_adjustment','employee',row_.employee_id,p_data || jsonb_build_object('adjustment_id',row_.id));
 ELSIF p_data->>'action'='void' THEN
   SELECT * INTO row_ FROM hr_payroll_adjustments WHERE id=(p_data->>'id')::uuid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'ADJUSTMENT_NOT_FOUND'; END IF;
   IF row_.voided_at IS NOT NULL THEN RAISE EXCEPTION 'ADJUSTMENT_ALREADY_VOIDED'; END IF;
   PERFORM business_hr_month_open(row_.month);
   UPDATE hr_payroll_adjustments SET voided_at=now(),voided_by=p_actor WHERE id=row_.id;
   INSERT INTO hr_audit_log(actor_id,action,entity,entity_id,changes)
   VALUES(p_actor,'payroll_adjustment_void','employee',row_.employee_id,jsonb_build_object('adjustment_id',row_.id,
     'kind',row_.kind,'amount',row_.amount,'month',row_.month,'note',row_.note));
 ELSE RAISE EXCEPTION 'INVALID_PAYROLL';
 END IF;
 aid := row_.id;
 PERFORM business_hr_payroll_refresh_drafts(row_.month);
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('hr_payroll_adjustment',p_actor,p_key,p_data,aid);
 RETURN jsonb_build_object('id',aid,'replayed',false);
END $$;

-- p_data: create {employee_id, amount, monthly_amount, start_month, reason} | cancel {id}
CREATE FUNCTION public.business_hr_advance_save(p_actor text, p_key uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE replay uuid; row_ hr_advances; emp hr_employees;
BEGIN
 replay := business_hr_replay('hr_advance',p_actor,p_key,p_data);
 IF replay IS NOT NULL THEN RETURN jsonb_build_object('id',replay,'replayed',true); END IF;
 IF p_data->>'action'='create' THEN
   SELECT * INTO emp FROM hr_employees WHERE id=(p_data->>'employee_id')::uuid;
   IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_NOT_FOUND'; END IF;
   IF emp.status='terminated' THEN RAISE EXCEPTION 'EMPLOYEE_INACTIVE'; END IF;
   PERFORM business_hr_month_open(p_data->>'start_month');
   INSERT INTO hr_advances(employee_id,amount,monthly_amount,start_month,reason,actor_id)
   VALUES(emp.id,(p_data->>'amount')::numeric,(p_data->>'monthly_amount')::numeric,p_data->>'start_month',trim(p_data->>'reason'),p_actor)
   RETURNING * INTO row_;
   INSERT INTO hr_audit_log(actor_id,action,entity,entity_id,changes)
   VALUES(p_actor,'advance_create','employee',emp.id,p_data || jsonb_build_object('advance_id',row_.id));
 ELSIF p_data->>'action'='cancel' THEN
   SELECT * INTO row_ FROM hr_advances WHERE id=(p_data->>'id')::uuid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'ADVANCE_NOT_FOUND'; END IF;
   IF row_.status<>'active' THEN RAISE EXCEPTION 'ADVANCE_NOT_ACTIVE'; END IF;
   UPDATE hr_advances SET status='cancelled' WHERE id=row_.id;
   INSERT INTO hr_audit_log(actor_id,action,entity,entity_id,changes)
   VALUES(p_actor,'advance_cancel','employee',row_.employee_id,jsonb_build_object('advance_id',row_.id,
     'amount',row_.amount,'repaid',business_hr_advance_repaid(row_.id,NULL),'reason',p_data->>'reason'));
 ELSE RAISE EXCEPTION 'INVALID_PAYROLL';
 END IF;
 PERFORM business_hr_payroll_refresh_drafts(NULL);
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('hr_advance',p_actor,p_key,p_data,row_.id);
 RETURN jsonb_build_object('id',row_.id,'replayed',false);
END $$;

DO $$
DECLARE fn text;
BEGIN
 FOREACH fn IN ARRAY ARRAY[
   'business_hr_is_working_day(date)','business_hr_month_open(text)','business_hr_advance_repaid(uuid,uuid)',
   'business_hr_payroll_calc(uuid)','business_hr_payroll_refresh_drafts(text)','business_hr_payslip_document(uuid)',
   'business_hr_payroll_run_summary(uuid)','business_hr_payroll_runs()','business_hr_payroll_run(uuid)',
   'business_hr_payslips_for_employee(uuid)','business_hr_salary_components(uuid)',
   'business_hr_payroll_adjustments(text)','business_hr_advances(uuid)','business_hr_payroll_generate(text,uuid,jsonb)',
   'business_hr_payroll_transition(text,uuid,jsonb)','business_hr_component_save(text,uuid,jsonb)',
   'business_hr_adjustment_save(text,uuid,jsonb)','business_hr_advance_save(text,uuid,jsonb)']
 LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
   EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
 END LOOP;
END $$;

COMMIT;
