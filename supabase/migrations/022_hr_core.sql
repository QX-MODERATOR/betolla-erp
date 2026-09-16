-- Additive only: no backfill, deletion, or changes to existing tables/RLS/policies.
-- HR module, phase 1: departments, employee records (optionally linked to a
-- lib/auth.ts SYSTEM_ACCOUNTS login id), and an append-only HR audit trail.
-- Same style as migrations 006-008: service_role only, idempotent writes via
-- business_requests, advisory-locked, named exceptions mapped in lib/business-server.ts.
BEGIN;

CREATE TABLE IF NOT EXISTS public.hr_departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  head_employee_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS public.hr_employee_no_seq START 1;

CREATE TABLE IF NOT EXISTS public.hr_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_no TEXT NOT NULL UNIQUE DEFAULT ('EMP-' || lpad(nextval('public.hr_employee_no_seq')::text, 4, '0')),
  account_id TEXT UNIQUE,
  full_name_ar TEXT NOT NULL,
  full_name_en TEXT,
  national_id TEXT,
  nationality TEXT,
  gender TEXT CHECK (gender IN ('male','female')),
  birth_date DATE,
  marital_status TEXT CHECK (marital_status IN ('single','married','divorced','widowed')),
  phone TEXT,
  email TEXT,
  city TEXT,
  address TEXT,
  emergency_name TEXT,
  emergency_phone TEXT,
  emergency_relation TEXT,
  department_id UUID REFERENCES public.hr_departments(id),
  job_title TEXT,
  manager_id UUID REFERENCES public.hr_employees(id),
  employment_type TEXT NOT NULL DEFAULT 'full_time'
    CHECK (employment_type IN ('full_time','part_time','contract','intern','freelance')),
  hire_date DATE NOT NULL,
  probation_end_date DATE,
  contract_end_date DATE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','probation','on_leave','suspended','terminated')),
  termination_date DATE,
  termination_reason TEXT,
  -- Sensitive: only returned to HR/management projections (p_sensitive).
  basic_salary NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (basic_salary >= 0),
  bank_name TEXT,
  iban TEXT,
  ssc_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (manager_id IS NULL OR manager_id <> id),
  CHECK (probation_end_date IS NULL OR probation_end_date >= hire_date),
  CHECK (contract_end_date IS NULL OR contract_end_date >= hire_date),
  CHECK (termination_date IS NULL OR termination_date >= hire_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_employees_national_id ON public.hr_employees(national_id) WHERE national_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hr_employees_department ON public.hr_employees(department_id);
CREATE INDEX IF NOT EXISTS idx_hr_employees_manager ON public.hr_employees(manager_id);
CREATE INDEX IF NOT EXISTS idx_hr_employees_status ON public.hr_employees(status);

DO $$ BEGIN
  ALTER TABLE public.hr_departments ADD CONSTRAINT fk_hr_departments_head
    FOREIGN KEY (head_employee_id) REFERENCES public.hr_employees(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.hr_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  changes JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hr_audit_entity ON public.hr_audit_log(entity_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_hr_departments_updated_at ON public.hr_departments;
CREATE TRIGGER trg_hr_departments_updated_at BEFORE UPDATE ON public.hr_departments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_hr_employees_updated_at ON public.hr_employees;
CREATE TRIGGER trg_hr_employees_updated_at BEFORE UPDATE ON public.hr_employees
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.hr_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_departments, public.hr_employees, public.hr_audit_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.hr_employee_no_seq FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.hr_departments, public.hr_employees, public.hr_audit_log TO service_role;
GRANT USAGE ON SEQUENCE public.hr_employee_no_seq TO service_role;

-- Structural defaults that mirror the roles already defined in lib/auth.ts (not company records).
INSERT INTO public.hr_departments(code,name_ar,name_en) VALUES
  ('management','الإدارة العامة','Management'),
  ('sales','المبيعات','Sales'),
  ('marketing','التسويق','Marketing'),
  ('finance','المالية','Finance'),
  ('hr_operations','الموارد البشرية والعمليات','HR & Operations'),
  ('delivery','التوصيل واللوجستيات','Delivery & Logistics'),
  ('it','الدعم التقني','IT')
ON CONFLICT (code) DO NOTHING;

CREATE FUNCTION public.business_hr_employee_document(p_id uuid, p_sensitive boolean) RETURNS jsonb
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
   'notes',coalesce(e.notes,'')
 ) ELSE '{}'::jsonb END
 FROM hr_employees e
 LEFT JOIN hr_departments d ON d.id=e.department_id
 LEFT JOIN hr_employees m ON m.id=e.manager_id
 WHERE e.id=p_id
$$;

CREATE FUNCTION public.business_hr_employee_list(p_sensitive boolean) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(business_hr_employee_document(id,p_sensitive) ORDER BY
   (status='terminated'),full_name_ar,id),'[]'::jsonb) FROM hr_employees
$$;

CREATE FUNCTION public.business_hr_employee_by_account(p_account text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT business_hr_employee_document(id,true) FROM hr_employees WHERE account_id=p_account
$$;

CREATE FUNCTION public.business_hr_employee_history(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'actor_id',a.actor_id,'action',a.action,
   'changes',a.changes,'created_at',a.created_at) ORDER BY a.created_at DESC,a.id),'[]'::jsonb)
 FROM (SELECT * FROM hr_audit_log WHERE entity_id=p_id ORDER BY created_at DESC LIMIT 100) a
$$;

CREATE FUNCTION public.business_hr_departments() RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'code',d.code,'name_ar',d.name_ar,
   'name_en',coalesce(d.name_en,''),'head_employee_id',d.head_employee_id,'head_name',coalesce(h.full_name_ar,''),
   'is_active',d.is_active,
   'headcount',(SELECT count(*)::int FROM hr_employees e WHERE e.department_id=d.id AND e.status<>'terminated')
 ) ORDER BY d.is_active DESC,d.name_ar),'[]'::jsonb)
 FROM hr_departments d LEFT JOIN hr_employees h ON h.id=d.head_employee_id
$$;

-- Shared replay guard for every HR write. Returns the stored result id on an
-- exact replay, raises on a key reused with a different payload, NULL otherwise.
CREATE FUNCTION public.business_hr_replay(p_operation text, p_actor text, p_key uuid, p_data jsonb) RETURNS uuid
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE old_request business_requests;
BEGIN
 IF coalesce(length(trim(p_actor)),0)=0 THEN RAISE EXCEPTION 'INVALID_ACTOR'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_operation||':'||p_actor||':'||p_key::text,0));
 SELECT * INTO old_request FROM business_requests WHERE operation=p_operation AND actor_id=p_actor AND request_key=p_key;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF old_request.payload<>p_data THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
 RETURN old_request.result_id;
END $$;

-- Validates a department/manager reference and the no-cycle rule for manager chains.
CREATE FUNCTION public.business_hr_check_refs(p_employee uuid, p_department uuid, p_manager uuid) RETURNS void
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE cursor_id uuid := p_manager; depth int := 0;
BEGIN
 IF p_department IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hr_departments WHERE id=p_department) THEN
   RAISE EXCEPTION 'DEPARTMENT_NOT_FOUND'; END IF;
 IF p_manager IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hr_employees WHERE id=p_manager) THEN
   RAISE EXCEPTION 'MANAGER_NOT_FOUND'; END IF;
 WHILE cursor_id IS NOT NULL AND depth < 100 LOOP
   IF cursor_id=p_employee THEN RAISE EXCEPTION 'MANAGER_CYCLE'; END IF;
   SELECT manager_id INTO cursor_id FROM hr_employees WHERE id=cursor_id;
   depth := depth+1;
 END LOOP;
END $$;

CREATE FUNCTION public.business_hr_employee_create(p_actor text, p_key uuid, p_data jsonb) RETURNS jsonb
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
     bank_name,iban,ssc_number,notes)
   VALUES(new_id,nullif(f->>'account_id',''),trim(f->>'full_name_ar'),nullif(f->>'full_name_en',''),
     nullif(f->>'national_id',''),nullif(f->>'nationality',''),nullif(f->>'gender',''),nullif(f->>'birth_date','')::date,
     nullif(f->>'marital_status',''),nullif(f->>'phone',''),nullif(f->>'email',''),nullif(f->>'city',''),
     nullif(f->>'address',''),nullif(f->>'emergency_name',''),nullif(f->>'emergency_phone',''),
     nullif(f->>'emergency_relation',''),nullif(f->>'department_id','')::uuid,nullif(f->>'job_title',''),
     nullif(f->>'manager_id','')::uuid,coalesce(nullif(f->>'employment_type',''),'full_time'),(f->>'hire_date')::date,
     nullif(f->>'probation_end_date','')::date,nullif(f->>'contract_end_date','')::date,
     coalesce(nullif(f->>'status',''),'active'),coalesce(nullif(f->>'basic_salary','')::numeric,0),
     nullif(f->>'bank_name',''),nullif(f->>'iban',''),nullif(f->>'ssc_number',''),nullif(f->>'notes',''));
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

-- Partial update: only keys present in p_data->'fields' are touched. Optimistic
-- concurrency via expected_updated_at so two HR sessions can't silently overwrite.
CREATE FUNCTION public.business_hr_employee_update(p_actor text, p_key uuid, p_data jsonb) RETURNS jsonb
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
     notes=CASE WHEN f ? 'notes' THEN nullif(f->>'notes','') ELSE notes END
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

CREATE FUNCTION public.business_hr_department_save(p_actor text, p_key uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE replay uuid; dep_id uuid; head uuid := nullif(p_data->>'head_employee_id','')::uuid;
BEGIN
 replay := business_hr_replay('hr_department',p_actor,p_key,p_data);
 IF replay IS NOT NULL THEN RETURN jsonb_build_object('id',replay,'replayed',true); END IF;
 IF coalesce(length(trim(p_data->>'name_ar')),0)=0 THEN RAISE EXCEPTION 'INVALID_DEPARTMENT'; END IF;
 IF head IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hr_employees WHERE id=head) THEN RAISE EXCEPTION 'EMPLOYEE_NOT_FOUND'; END IF;
 IF coalesce(p_data->>'id','')='' THEN
   IF coalesce(length(trim(p_data->>'code')),0)=0 THEN RAISE EXCEPTION 'INVALID_DEPARTMENT'; END IF;
   BEGIN
     INSERT INTO hr_departments(code,name_ar,name_en,head_employee_id)
     VALUES(lower(trim(p_data->>'code')),trim(p_data->>'name_ar'),nullif(trim(p_data->>'name_en'),''),head)
     RETURNING id INTO dep_id;
   EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'DUPLICATE_DEPARTMENT'; END;
   INSERT INTO hr_audit_log(actor_id,action,entity,entity_id,changes) VALUES(p_actor,'create','department',dep_id,p_data);
 ELSE
   dep_id := (p_data->>'id')::uuid;
   UPDATE hr_departments SET name_ar=trim(p_data->>'name_ar'),name_en=nullif(trim(p_data->>'name_en'),''),
     head_employee_id=head,is_active=coalesce((p_data->>'is_active')::boolean,is_active)
   WHERE id=dep_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'DEPARTMENT_NOT_FOUND'; END IF;
   INSERT INTO hr_audit_log(actor_id,action,entity,entity_id,changes) VALUES(p_actor,'update','department',dep_id,p_data);
 END IF;
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('hr_department',p_actor,p_key,p_data,dep_id);
 RETURN jsonb_build_object('id',dep_id,'replayed',false);
END $$;

REVOKE ALL ON FUNCTION
  public.business_hr_employee_document(uuid,boolean), public.business_hr_employee_list(boolean),
  public.business_hr_employee_by_account(text), public.business_hr_employee_history(uuid),
  public.business_hr_departments(), public.business_hr_replay(text,text,uuid,jsonb),
  public.business_hr_check_refs(uuid,uuid,uuid), public.business_hr_employee_create(text,uuid,jsonb),
  public.business_hr_employee_update(text,uuid,jsonb), public.business_hr_department_save(text,uuid,jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.business_hr_employee_document(uuid,boolean), public.business_hr_employee_list(boolean),
  public.business_hr_employee_by_account(text), public.business_hr_employee_history(uuid),
  public.business_hr_departments(), public.business_hr_replay(text,text,uuid,jsonb),
  public.business_hr_check_refs(uuid,uuid,uuid), public.business_hr_employee_create(text,uuid,jsonb),
  public.business_hr_employee_update(text,uuid,jsonb), public.business_hr_department_save(text,uuid,jsonb)
TO service_role;

COMMIT;
