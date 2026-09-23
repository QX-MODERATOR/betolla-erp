-- The employee ID (الرقم الوظيفي) is set by HR.
--
-- employee_no has been generated since 022 (EMP-0001, EMP-0002, ...) and nothing could change it.
-- The company numbers its staff itself, so HR now types each employee's ID: when adding someone
-- (left empty, the next EMP-xxxx is used as before) and on an existing file. It stays unique
-- (DUPLICATE_EMPLOYEE_NO) and is letters, digits and . _ / - only, at most 30 (INVALID_EMPLOYEE_NO).
-- Only the HR account may send it; /api/hr/employees refuses it from anyone else (lib/hr.ts
-- canSetEmployeeNo). Every screen, export and new payslip already shows employee_no; payslips
-- already issued keep the number frozen on them.
--
-- Replaces business_hr_employee_create and business_hr_employee_update, 024's bodies (the newest)
-- carried forward verbatim apart from the lines marked by the employee_no checks.
--
-- ORDERING: apply after 024.
BEGIN;

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
 -- The employee ID HR assigns; left empty, the next EMP-xxxx as before.
 IF coalesce(trim(f->>'employee_no'),'')='' THEN f := f - 'employee_no'; END IF;
 IF f ? 'employee_no' AND trim(coalesce(f->>'employee_no','')) !~ '^[A-Za-z0-9._/-]{1,30}$' THEN
   RAISE EXCEPTION 'INVALID_EMPLOYEE_NO'; END IF;
 PERFORM business_hr_check_refs(new_id,nullif(f->>'department_id','')::uuid,nullif(f->>'manager_id','')::uuid);
 BEGIN
   INSERT INTO hr_employees(id,employee_no,account_id,full_name_ar,full_name_en,national_id,nationality,gender,birth_date,
     marital_status,phone,email,city,address,emergency_name,emergency_phone,emergency_relation,department_id,
     job_title,manager_id,employment_type,hire_date,probation_end_date,contract_end_date,status,basic_salary,
     bank_name,iban,ssc_number,notes,commission_rate)
   VALUES(new_id,coalesce(trim(f->>'employee_no'),'EMP-'||lpad(nextval('public.hr_employee_no_seq')::text,4,'0')),nullif(f->>'account_id',''),trim(f->>'full_name_ar'),nullif(f->>'full_name_en',''),
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
     IF SQLERRM LIKE '%employee_no%' THEN RAISE EXCEPTION 'DUPLICATE_EMPLOYEE_NO'; END IF;
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
 IF f ? 'employee_no' AND trim(coalesce(f->>'employee_no','')) !~ '^[A-Za-z0-9._/-]{1,30}$' THEN
   RAISE EXCEPTION 'INVALID_EMPLOYEE_NO'; END IF;
 PERFORM business_hr_check_refs(emp_id,
   CASE WHEN f ? 'department_id' THEN nullif(f->>'department_id','')::uuid ELSE emp.department_id END,
   CASE WHEN f ? 'manager_id' THEN nullif(f->>'manager_id','')::uuid ELSE emp.manager_id END);
 old_doc := to_jsonb(emp);
 BEGIN
   UPDATE hr_employees SET
     employee_no=CASE WHEN f ? 'employee_no' THEN trim(f->>'employee_no') ELSE employee_no END,
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
     IF SQLERRM LIKE '%employee_no%' THEN RAISE EXCEPTION 'DUPLICATE_EMPLOYEE_NO'; END IF;
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

COMMIT;
