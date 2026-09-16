import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {registerHooks} from 'node:module';
import {PGlite} from '../.local-tests/node_modules/@electric-sql/pglite/dist/index.js';

// HR module, phase 1 (migration 022). No dotenv, production connection, seed files, or company data.
const root=new URL('../',import.meta.url);
registerHooks({resolve(s,c,next){if(s.startsWith('@/'))return next(new URL(s.slice(2)+'.ts',root).href,c);return next(s,c);}});
process.env.JWT_SECRET=randomBytes(48).toString('hex');
process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-test-service-key';
const {signAuthToken,SYSTEM_ACCOUNTS,isRouteAllowedForRole}=await import('../lib/auth.ts');
const {prepareEmployeeCreate,prepareEmployeeUpdate,prepareDepartment}=await import('../lib/hr-server.ts');
const {serviceLength,daysUntil}=await import('../lib/hr.ts');
const employeesRoute=await import('../app/api/hr/employees/route.ts');
const departmentsRoute=await import('../app/api/hr/departments/route.ts');
const meRoute=await import('../app/api/hr/me/route.ts');
const profile=id=>SYSTEM_ACCOUNTS.find(a=>a.id===id).profile;
const hrToken=await signAuthToken(profile('hr-ops-01'));
const repProfile=profile('rep-rahma-01');
const repToken=await signAuthToken(repProfile);
const financeToken=await signAuthToken(profile('fin-zaid-01'));
const driverToken=await signAuthToken(profile('drv-khalid-01'));

const dataDir=new URL('../.local-tests/db-hr-'+randomUUID()+'/',import.meta.url);
await mkdir(dataDir,{recursive:true});
let db=new PGlite(fileURLToPath(dataDir));
await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
const initial=await readFile(new URL('supabase/migrations/001_initial_schema.sql',root),'utf8');
await db.exec(initial.replace(/^CREATE EXTENSION[^;]+;/gm,''));
for(const file of ['005_payment_methods.sql','006_business_persistence.sql','022_hr_core.sql'])
  await db.exec(await readFile(new URL('supabase/migrations/'+file,root),'utf8'));
await db.exec('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;');
await db.exec('SET ROLE anon;');
await assert.rejects(db.query('SELECT business_hr_employee_list(true)'),/permission denied/);
await assert.rejects(db.query('SELECT * FROM hr_employees'),/permission denied/);
await db.exec('RESET ROLE; SET ROLE service_role;');

const rpcArgs={
  business_hr_employee_document:['p_id','p_sensitive'],business_hr_employee_list:['p_sensitive'],
  business_hr_employee_by_account:['p_account'],business_hr_employee_history:['p_id'],business_hr_departments:[],
  business_hr_employee_create:['p_actor','p_key','p_data'],business_hr_employee_update:['p_actor','p_key','p_data'],
  business_hr_department_save:['p_actor','p_key','p_data'],
};
const server=createServer(async(req,res)=>{
  try{
    let raw='';for await(const chunk of req)raw+=chunk;
    const name=req.url.split('/').at(-1),names=rpcArgs[name];
    if(!names)throw new Error('Unexpected RPC: '+name);
    const body=JSON.parse(raw);
    const values=names.map(n=>n==='p_data'?JSON.stringify(body[n]):body[n]);
    const result=await db.query(`SELECT ${name}(${names.map((_,i)=>'$'+(i+1)).join(',')}) AS result`,values);
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result.rows[0].result));
  }catch(error){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({message:error.message,code:error.code}));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
process.env.NEXT_PUBLIC_SUPABASE_URL=`http://127.0.0.1:${server.address().port}`;
const req=(path,method='GET',body,token=hrToken,key=randomUUID())=>new Request('http://localhost'+path,{method,
 headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Idempotency-Key':key},...(body?{body:JSON.stringify(body)}:{})});
const json=async r=>({status:r.status,body:await r.json()});

try{
  // --- Pure helpers and validation (no database) ---
  assert.deepEqual(serviceLength('2024-01-15',null,new Date(2026,2,14)),{years:2,months:1});
  assert.equal(daysUntil('2026-09-20',new Date(2026,8,16)),4);
  assert.throws(()=>prepareEmployeeCreate({fields:{hire_date:'2026-01-01'}}),/اسم الموظف/);
  assert.throws(()=>prepareEmployeeCreate({fields:{full_name_ar:'x'}}),/تاريخ التعيين/);
  assert.throws(()=>prepareEmployeeCreate({fields:{full_name_ar:'x',hire_date:'2026-02-30'}}),/التاريخ غير صالح/);
  assert.throws(()=>prepareEmployeeCreate({fields:{full_name_ar:'x',hire_date:'2026-01-01',contract_end_date:'2025-01-01'}}),/بعد تاريخ التعيين/);
  assert.throws(()=>prepareEmployeeCreate({fields:{full_name_ar:'x',hire_date:'2026-01-01',status:'terminated'}}),/انتهاء الخدمة/);
  assert.throws(()=>prepareEmployeeCreate({fields:{full_name_ar:'x',hire_date:'2026-01-01',account_id:'not-an-account'}}),/حساب الدخول/);
  assert.throws(()=>prepareEmployeeCreate({fields:{full_name_ar:'x',hire_date:'2026-01-01',basic_salary:-5}}),/المبلغ/);
  assert.throws(()=>prepareEmployeeCreate({fields:{full_name_ar:'x',hire_date:'2026-01-01',iban:'123'}}),/IBAN/);
  assert.throws(()=>prepareEmployeeUpdate({id:randomUUID(),fields:{}}),/لا توجد تغييرات/);
  assert.throws(()=>prepareDepartment({name_ar:'قسم',code:'Bad Code'}),/رمز القسم/);
  assert.equal(prepareEmployeeCreate({fields:{full_name_ar:'x',hire_date:'2026-01-01',phone:'+962 79 123 4567',unknown:'dropped'}}).fields.phone,'0791234567');
  assert.equal('unknown' in prepareEmployeeCreate({fields:{full_name_ar:'x',hire_date:'2026-01-01',unknown:'y'}}).fields,false);

  // --- RBAC ---
  assert.equal(isRouteAllowedForRole('sales_rep','/hr/me'),true);
  assert.equal(isRouteAllowedForRole('driver','/api/hr/me'),true);
  assert.equal(isRouteAllowedForRole('sales_rep','/hr'),false);
  assert.equal(isRouteAllowedForRole('sales_manager','/hr/employees'),false);
  assert.equal(isRouteAllowedForRole('hr_operations','/hr/employees'),true);
  assert.equal((await employeesRoute.GET(req('/api/hr/employees','GET',undefined,'garbage'))).status,401);
  for(const token of [repToken,financeToken,driverToken])
    assert.equal((await employeesRoute.GET(req('/api/hr/employees','GET',undefined,token))).status,403);
  assert.equal((await employeesRoute.POST(req('/api/hr/employees','POST',{fields:{full_name_ar:'x',hire_date:'2026-01-01'}},repToken))).status,403);
  assert.equal((await departmentsRoute.GET(req('/api/hr/departments','GET',undefined,repToken))).status,403);

  // --- Departments (seeded structural defaults + create) ---
  const deps=(await json(await employeesRoute.GET(req('/api/hr/employees')))).body.departments;
  const sales=deps.find(d=>d.code==='sales');assert.ok(sales);assert.equal(sales.headcount,0);
  const depKey=randomUUID();
  const newDep=await json(await departmentsRoute.POST(req('/api/hr/departments','POST',{code:'customer_care',name_ar:'خدمة العملاء'},hrToken,depKey)));
  assert.equal(newDep.status,201);
  assert.equal((await departmentsRoute.POST(req('/api/hr/departments','POST',{code:'customer_care',name_ar:'خدمة العملاء'},hrToken,depKey))).status,200);
  assert.equal((await departmentsRoute.POST(req('/api/hr/departments','POST',{code:'customer_care',name_ar:'مكرر'}))).status,409);

  // --- Create employee: idempotent, sensitive fields, linked account ---
  const managerKey=randomUUID();
  const managerBody={fields:{full_name_ar:'مديرة اختبار',hire_date:'2024-03-01',department_id:sales.id,job_title:'مديرة',basic_salary:'900.500',national_id:'TEST-NID-1'}};
  const created=await json(await employeesRoute.POST(req('/api/hr/employees','POST',managerBody,hrToken,managerKey)));
  assert.equal(created.status,201);
  const manager=created.body.employee;
  assert.match(manager.employee_no,/^EMP-\d{4}$/);assert.equal(manager.basic_salary,900.5);assert.equal(manager.department_name,'المبيعات');
  const replay=await json(await employeesRoute.POST(req('/api/hr/employees','POST',managerBody,hrToken,managerKey)));
  assert.equal(replay.status,200);assert.equal(replay.body.replayed,true);assert.equal(replay.body.employee.id,manager.id);
  assert.equal((await employeesRoute.POST(req('/api/hr/employees','POST',{fields:{...managerBody.fields,job_title:'x'}},hrToken,managerKey))).status,409);
  assert.equal((await db.query('SELECT count(*)::int n FROM hr_employees')).rows[0].n,1);
  // Duplicate national ID is rejected with a clear conflict.
  assert.equal((await employeesRoute.POST(req('/api/hr/employees','POST',{fields:{full_name_ar:'آخر',hire_date:'2025-01-01',national_id:'TEST-NID-1'}}))).status,409);
  // Unknown department/manager references are rejected.
  assert.equal((await employeesRoute.POST(req('/api/hr/employees','POST',{fields:{full_name_ar:'آخر',hire_date:'2025-01-01',department_id:randomUUID()}}))).status,404);

  const repCreate=await json(await employeesRoute.POST(req('/api/hr/employees','POST',{fields:{
    full_name_ar:'موظفة مبيعات',hire_date:'2025-06-01',department_id:sales.id,manager_id:manager.id,
    account_id:repProfile.id,basic_salary:450,iban:'JO94 CBJO 0010 0000 0000 0131 0003 02',notes:'ملاحظة داخلية'}})));
  assert.equal(repCreate.status,201);
  const repEmp=repCreate.body.employee;
  assert.equal(repEmp.manager_name,'مديرة اختبار');assert.equal(repEmp.iban,'JO94CBJO0010000000000131000302');
  // The same login account cannot be linked twice.
  assert.equal((await employeesRoute.POST(req('/api/hr/employees','POST',{fields:{full_name_ar:'x',hire_date:'2025-01-01',account_id:repProfile.id}}))).status,409);

  // --- Update: partial, optimistic concurrency, cycle guard, termination rule, audit ---
  const upd=await json(await employeesRoute.PATCH(req('/api/hr/employees','PATCH',{id:repEmp.id,expected_updated_at:repEmp.updated_at,fields:{job_title:'مندوبة أولى',basic_salary:500}})));
  assert.equal(upd.status,200);assert.equal(upd.body.employee.job_title,'مندوبة أولى');assert.equal(upd.body.employee.basic_salary,500);
  assert.equal(upd.body.employee.iban,'JO94CBJO0010000000000131000302'); // untouched field preserved
  // A second session holding the stale version cannot overwrite.
  assert.equal((await employeesRoute.PATCH(req('/api/hr/employees','PATCH',{id:repEmp.id,expected_updated_at:repEmp.updated_at,fields:{job_title:'قديم'}}))).status,409);
  // Manager chain cycle: the manager cannot report to her own report.
  assert.equal((await employeesRoute.PATCH(req('/api/hr/employees','PATCH',{id:manager.id,fields:{manager_id:repEmp.id}}))).status,400);
  assert.equal((await employeesRoute.PATCH(req('/api/hr/employees','PATCH',{id:manager.id,fields:{manager_id:manager.id}}))).status,400);
  // Terminating without a date is rejected in SQL too (field omitted from the request).
  assert.equal((await employeesRoute.PATCH(req('/api/hr/employees','PATCH',{id:repEmp.id,fields:{status:'terminated'}}))).status,400);
  assert.equal((await employeesRoute.PATCH(req('/api/hr/employees','PATCH',{id:randomUUID(),fields:{job_title:'x'}}))).status,404);
  // A partial update can't put a contract end before the stored hire date (enforced in SQL).
  assert.equal((await employeesRoute.PATCH(req('/api/hr/employees','PATCH',{id:repEmp.id,fields:{contract_end_date:'2020-01-01'}}))).status,400);
  const detail=await json(await employeesRoute.GET(req('/api/hr/employees?id='+repEmp.id)));
  assert.equal(detail.status,200);
  assert.deepEqual(detail.body.history.map(h=>h.action),['update','create']);
  assert.deepEqual(detail.body.history[0].changes.job_title,{from:null,to:'مندوبة أولى'});
  assert.equal(detail.body.history[0].actor_id,'hr-ops-01');
  assert.equal((await employeesRoute.GET(req('/api/hr/employees?id=not-a-uuid'))).status,400);
  assert.equal((await employeesRoute.GET(req('/api/hr/employees?id='+randomUUID()))).status,404);

  // --- Self-service: own record only, salary visible, HR notes hidden ---
  const me=await json(await meRoute.GET(req('/api/hr/me','GET',undefined,repToken)));
  assert.equal(me.status,200);assert.equal(me.body.employee.id,repEmp.id);assert.equal(me.body.employee.basic_salary,500);
  assert.equal('notes' in me.body.employee,false);
  const driverMe=await json(await meRoute.GET(req('/api/hr/me','GET',undefined,driverToken)));
  assert.equal(driverMe.status,200);assert.equal(driverMe.body.employee,null);

  // Headcount reflects the department link; terminated staff drop out of it.
  const termed=await employeesRoute.PATCH(req('/api/hr/employees','PATCH',{id:repEmp.id,fields:{status:'terminated',termination_date:'2026-09-01',termination_reason:'استقالة'}}));
  assert.equal(termed.status,200);
  const after=(await json(await departmentsRoute.GET(req('/api/hr/departments')))).body.departments.find(d=>d.code==='sales');
  assert.equal(after.headcount,1);
  const statusAudit=(await json(await employeesRoute.GET(req('/api/hr/employees?id='+repEmp.id)))).body.history[0];
  assert.equal(statusAudit.action,'status_change');

  // --- Durability: close and reopen the database files ---
  await db.close();
  db=new PGlite(fileURLToPath(dataDir));
  await db.exec('SET ROLE service_role;');
  const list=(await json(await employeesRoute.GET(req('/api/hr/employees')))).body.employees;
  assert.equal(list.length,2);
  assert.equal(list.at(-1).status,'terminated'); // terminated sorted last
  assert.equal(list.find(e=>e.id===manager.id).basic_salary,900.5);
  console.log('PASS test_hr (phase 1: departments, employees, RBAC, self-service, audit, durability)');
}finally{
  server.close();
  await db.close().catch(()=>{});
}
