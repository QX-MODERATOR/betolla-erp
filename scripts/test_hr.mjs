import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {registerHooks} from 'node:module';
import {PGlite} from '../.local-tests/node_modules/@electric-sql/pglite/dist/index.js';

// HR module, phases 1-4 (migrations 022-025). No dotenv, production connection, seed files, or company data.
const root=new URL('../',import.meta.url);
registerHooks({resolve(s,c,next){if(s.startsWith('@/'))return next(new URL(s.slice(2)+'.ts',root).href,c);return next(s,c);}});
process.env.JWT_SECRET=randomBytes(48).toString('hex');
process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-test-service-key';
const {signAuthToken,SYSTEM_ACCOUNTS,isRouteAllowedForRole}=await import('../lib/auth.ts');
const {prepareEmployeeCreate,prepareEmployeeUpdate,prepareDepartment}=await import('../lib/hr-server.ts');
const hrLib=await import('../lib/hr.ts');
const {serviceLength,daysUntil}=hrLib;
const employeesRoute=await import('../app/api/hr/employees/route.ts');
const departmentsRoute=await import('../app/api/hr/departments/route.ts');
const meRoute=await import('../app/api/hr/me/route.ts');
const meLeaveRoute=await import('../app/api/hr/me/leave/route.ts');
const meAttendanceRoute=await import('../app/api/hr/me/attendance/route.ts');
const leaveRoute=await import('../app/api/hr/leave/route.ts');
const attendanceRoute=await import('../app/api/hr/attendance/route.ts');
const settingsRoute=await import('../app/api/hr/settings/route.ts');
const profile=id=>SYSTEM_ACCOUNTS.find(a=>a.id===id).profile;
const hrToken=await signAuthToken(profile('hr-ops-01'));
const repProfile=profile('rep-rahma-01');
const repToken=await signAuthToken(repProfile);
const financeToken=await signAuthToken(profile('fin-zaid-01'));
const driverToken=await signAuthToken(profile('drv-khalid-01'));

const dataDir=new URL('../.local-tests/db-hr-'+randomUUID()+'/',import.meta.url);
await mkdir(dataDir,{recursive:true});
let db=new PGlite(fileURLToPath(dataDir),{parsers:{1082:v=>v}});
await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
const initial=await readFile(new URL('supabase/migrations/001_initial_schema.sql',root),'utf8');
await db.exec(initial.replace(/^CREATE EXTENSION[^;]+;/gm,''));
// Schema part of migration 016 (its RPCs need unrelated earlier migrations), required by 025's KPIs.
await db.exec('ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS rep_name text;');
for(const file of ['005_payment_methods.sql','006_business_persistence.sql','017_notifications.sql','022_hr_core.sql','023_hr_attendance_leave.sql','024_hr_payroll.sql','025_hr_talent_documents.sql'])
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
  business_notification_create:['p_username','p_type','p_title','p_body','p_link'],
  business_hr_settings:[],business_hr_today:[],business_hr_holidays:['p_year'],
  business_hr_settings_save:['p_actor','p_key','p_data'],business_hr_holiday_save:['p_actor','p_key','p_data'],
  business_hr_attendance_range:['p_from','p_to','p_employee'],business_hr_attendance_punch:['p_actor','p_key','p_data'],
  business_hr_attendance_set:['p_actor','p_key','p_data'],business_hr_leave_types:[],
  business_hr_leave_type_save:['p_actor','p_key','p_data'],business_hr_leave_requests:['p_year','p_employee','p_manager'],
  business_hr_leave_balances:['p_year','p_employee'],business_hr_leave_request_create:['p_actor','p_key','p_data'],
  business_hr_leave_decide:['p_actor','p_key','p_data'],business_hr_leave_adjust:['p_actor','p_key','p_data'],
  business_hr_leave_adjustments:['p_year','p_employee'],business_hr_employee_id_for_account:['p_account'],business_hr_employee_bulk_create:['p_actor','p_key','p_data'],
  business_hr_payroll_run:['p_id'],business_hr_payroll_runs:[],business_hr_payroll_adjustments:['p_month'],
  business_hr_salary_components:['p_employee'],business_hr_advances:['p_employee'],business_hr_payslips_for_employee:['p_employee'],
  business_hr_payroll_generate:['p_actor','p_key','p_data'],business_hr_payroll_transition:['p_actor','p_key','p_data'],
  business_hr_component_save:['p_actor','p_key','p_data'],business_hr_adjustment_save:['p_actor','p_key','p_data'],
  business_hr_advance_save:['p_actor','p_key','p_data'],
  business_hr_openings:[],business_hr_candidates:['p_opening'],business_hr_opening_save:['p_actor','p_key','p_data'],
  business_hr_candidate_save:['p_actor','p_key','p_data'],business_hr_candidate_hire:['p_actor','p_key','p_data'],
  business_hr_employee_kpis:['p_employee','p_rep_name','p_from','p_to'],business_hr_reviews:['p_employee','p_manager','p_visible_only'],
  business_hr_review_save:['p_actor','p_key','p_data'],business_hr_review_acknowledge:['p_actor','p_key','p_data'],
  business_hr_documents:['p_employee'],business_hr_document_save:['p_actor','p_key','p_data'],
  business_hr_expiries:['p_days'],business_hr_alerts_claim:[],
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
  // Profile API is self-service for every role (handler limits edits to your own profile).
  for(const role of ['sales_rep','marketing','finance','hr_operations','driver_manager','driver'])
    assert.equal(isRouteAllowedForRole(role,'/api/profile'),true,role);
  assert.equal(isRouteAllowedForRole('driver','/api/customers'),false);
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
  db=new PGlite(fileURLToPath(dataDir),{parsers:{1082:v=>v}});
  await db.exec('SET ROLE service_role;');
  const list=(await json(await employeesRoute.GET(req('/api/hr/employees')))).body.employees;
  assert.equal(list.length,2);
  assert.equal(list.at(-1).status,'terminated'); // terminated sorted last
  assert.equal(list.find(e=>e.id===manager.id).basic_salary,900.5);

  // =============================== Phase 2: attendance & leave ===============================
  const {leaveWorkingDays,dayStatus,addDays,dowOf,isLate,DEFAULT_ATTENDANCE_SETTINGS}=hrLib;
  const hananProfile=profile('rep-hanan-01'),mgrProfile=profile('mgr-sales-01');
  const hananToken=await signAuthToken(hananProfile),mgrToken=await signAuthToken(mgrProfile);
  const create=async fields=>(await json(await employeesRoute.POST(req('/api/hr/employees','POST',{fields})))).body.employee;
  const boss=await create({full_name_ar:'مديرة المبيعات',hire_date:'2024-01-01',gender:'female',account_id:mgrProfile.id});
  const staff=await create({full_name_ar:'حنان',hire_date:'2025-01-01',gender:'female',manager_id:boss.id,account_id:hananProfile.id});
  const man=await create({full_name_ar:'موظف',hire_date:'2025-01-01',gender:'male'});

  // --- Settings: validated, HR only ---
  const setReq=(body,token=hrToken)=>settingsRoute.POST(req('/api/hr/settings','POST',body,token));
  const goodSettings={kind:'attendance',timezone:'Asia/Amman',work_start:'09:00',work_end:'17:00',grace_minutes:10,weekend:[6,5]};
  assert.equal((await setReq(goodSettings,repToken)).status,403);
  assert.equal((await setReq({...goodSettings,work_end:'08:00'})).status,400);
  assert.equal((await setReq({...goodSettings,timezone:'Mars/Olympus'})).status,400);
  assert.equal((await setReq({...goodSettings,weekend:[5,5]})).status,400);
  const saved=await json(await setReq(goodSettings));
  assert.equal(saved.status,200);assert.deepEqual(saved.body.settings.attendance.weekend,[5,6]);
  const settings={...DEFAULT_ATTENDANCE_SETTINGS,...saved.body.settings.attendance};

  // Test dates: a Sunday-Saturday week next year, with a public holiday on its Thursday.
  const nextYear=new Date().getFullYear()+1;
  let sunday=`${nextYear}-03-01`;while(dowOf(sunday)!==0)sunday=addDays(sunday,1);
  const saturday=addDays(sunday,6),thursday=addDays(sunday,4);
  assert.equal((await setReq({kind:'holiday',action:'add',date:thursday,name_ar:'عطلة اختبار'})).status,200);
  assert.equal((await setReq({kind:'holiday',action:'add',date:thursday,name_ar:'مكرر'})).status,409);
  const holidayList=(await json(await settingsRoute.GET(req('/api/hr/settings?year='+nextYear)))).body.holidays;
  assert.equal(holidayList.length,1);
  const holidays=new Set(holidayList.map(h=>h.date));
  assert.equal(leaveWorkingDays(sunday,saturday,false,settings.weekend,holidays),4);
  assert.equal(leaveWorkingDays(thursday,thursday,true,settings.weekend,holidays),0);

  // --- Employee requests leave (self-service) -> manager + HR notified ---
  const selfLeave=(body,token=hananToken,key)=>meLeaveRoute.POST(req('/api/hr/me/leave','POST',body,token,key));
  const leaveTypes=(await json(await leaveRoute.GET(req('/api/hr/leave?year='+nextYear)))).body.types;
  const annual=leaveTypes.find(t=>t.code==='annual'),maternity=leaveTypes.find(t=>t.code==='maternity'),sick=leaveTypes.find(t=>t.code==='sick');
  const leaveKey=randomUUID();
  const firstReq=await json(await selfLeave({leave_type_id:annual.id,start_date:sunday,end_date:saturday,reason:'سفر'},hananToken,leaveKey));
  assert.equal(firstReq.status,201);
  const leave1=firstReq.body.request;
  assert.equal(leave1.days,4);assert.equal(leave1.status,'pending');assert.equal(leave1.employee_id,staff.id);
  // Retried request is not duplicated; nor are its notifications.
  assert.equal((await json(await selfLeave({leave_type_id:annual.id,start_date:sunday,end_date:saturday,reason:'سفر'},hananToken,leaveKey))).body.replayed,true);
  const notes=(await db.query(`SELECT username FROM notifications WHERE type='hr_leave_request' ORDER BY username`)).rows.map(r=>r.username);
  assert.deepEqual(notes,['hr.areej','sales.manager']);
  // A client-supplied employee_id / auto_approve / is_hr is ignored on the self route.
  const spoof=await json(await selfLeave({employee_id:man.id,auto_approve:true,is_hr:true,leave_type_id:sick.id,start_date:addDays(sunday,7),end_date:addDays(sunday,7)}));
  assert.equal(spoof.status,201);assert.equal(spoof.body.request.employee_id,staff.id);assert.equal(spoof.body.request.status,'pending');
  // Overlap, gender eligibility, dates, and balance are all enforced.
  assert.equal((await selfLeave({leave_type_id:sick.id,start_date:addDays(sunday,1),end_date:addDays(sunday,2)})).status,409);
  assert.equal((await leaveRoute.POST(req('/api/hr/leave','POST',{kind:'request',employee_id:man.id,leave_type_id:maternity.id,start_date:sunday,end_date:sunday}))).status,400);
  assert.equal((await selfLeave({leave_type_id:annual.id,start_date:saturday,end_date:saturday})).status,400); // weekend only
  assert.equal((await selfLeave({leave_type_id:annual.id,start_date:`${nextYear-2}-01-04`,end_date:`${nextYear-2}-01-04`})).status,400); // far past
  assert.equal((await selfLeave({leave_type_id:annual.id,start_date:`${nextYear}-12-30`,end_date:`${nextYear+1}-01-02`})).status,400); // spans years
  const sunday2=addDays(sunday,14);
  assert.equal(leaveWorkingDays(sunday2,addDays(sunday2,14),false,settings.weekend,holidays),11);
  assert.equal((await selfLeave({leave_type_id:annual.id,start_date:sunday2,end_date:addDays(sunday2,14)})).status,409); // 4 pending + 11 > 14
  assert.equal((await meLeaveRoute.POST(req('/api/hr/me/leave','POST',{leave_type_id:annual.id,start_date:sunday2,end_date:sunday2},driverToken))).status,404); // unlinked account

  // --- Decisions: not self, not a stranger; the direct manager can ---
  const decide=(body,token,key)=>meLeaveRoute.PATCH(req('/api/hr/me/leave','PATCH',body,token,key));
  assert.equal((await decide({id:leave1.id,action:'approve'},hananToken)).status,403);
  assert.equal((await decide({id:leave1.id,action:'approve'},repToken)).status,403); // rahma is not her manager
  assert.equal((await decide({id:leave1.id,action:'reject'},mgrToken)).status,400); // reason required
  const approved=await json(await decide({id:leave1.id,action:'approve',note:'موافق'},mgrToken));
  assert.equal(approved.status,200);assert.equal(approved.body.request.status,'approved');assert.equal(approved.body.request.decided_by,'mgr-sales-01');
  assert.equal((await decide({id:leave1.id,action:'approve'},mgrToken)).status,409);
  assert.equal((await db.query(`SELECT count(*)::int n FROM notifications WHERE type='hr_leave_decision' AND username='hanan.sales'`)).rows[0].n,1);
  // Manager's self-service view lists only open team requests.
  const mgrMe=(await json(await meRoute.GET(req('/api/hr/me','GET',undefined,mgrToken)))).body;
  assert.deepEqual(mgrMe.teamRequests.map(r=>r.id),[spoof.body.request.id]);
  // HR rejects the spoof attempt with a reason.
  const rejected=await json(await leaveRoute.PATCH(req('/api/hr/leave','PATCH',{id:spoof.body.request.id,action:'reject',note:'مكرر'})));
  assert.equal(rejected.body.request.status,'rejected');

  // --- Balances and additive adjustments ---
  const balanceOf=async()=>(await json(await leaveRoute.GET(req('/api/hr/leave?year='+nextYear)))).body.balances
    .find(b=>b.employee_id===staff.id&&b.leave_type_id===annual.id);
  let bal=await balanceOf();
  assert.deepEqual([bal.entitled,bal.used,bal.pending,bal.available],[14,4,0,10]);
  const adjust=body=>leaveRoute.POST(req('/api/hr/leave','POST',{kind:'adjustment',employee_id:staff.id,leave_type_id:annual.id,year:nextYear,...body}));
  assert.equal((await adjust({days:2})).status,400);
  assert.equal((await adjust({days:0.3,reason:'x'})).status,400);
  assert.equal((await adjust({days:2,reason:'ترحيل رصيد'})).status,201);
  bal=await balanceOf();assert.equal(bal.available,12);
  // Male employee has no maternity balance row; female staff does.
  const allBalances=(await json(await leaveRoute.GET(req('/api/hr/leave?year='+nextYear)))).body.balances;
  assert.equal(allBalances.some(b=>b.employee_id===man.id&&b.leave_type_id===maternity.id),false);
  assert.equal(allBalances.some(b=>b.employee_id===staff.id&&b.leave_type_id===maternity.id),true);
  // Now the 11-day request fits (14 + 2 - 4 = 12).
  assert.equal((await selfLeave({leave_type_id:annual.id,start_date:sunday2,end_date:addDays(sunday2,14)})).status,201);
  // Employee may cancel an approved leave that hasn't started.
  assert.equal((await json(await decide({id:leave1.id,action:'cancel'},hananToken))).body.request.status,'cancelled');
  assert.equal((await decide({id:leave1.id,action:'cancel'},hananToken)).status,409);

  // Leave types: HR edits entitlement; duplicate codes rejected.
  assert.equal((await leaveRoute.POST(req('/api/hr/leave','POST',{kind:'type',code:'annual',name_ar:'مكرر',annual_days:1}))).status,409);
  assert.equal((await leaveRoute.POST(req('/api/hr/leave','POST',{kind:'type',id:annual.id,name_ar:'إجازة سنوية',annual_days:21,paid:true,requires_balance:true,gender:''}))).status,200);
  bal=await balanceOf();assert.equal(bal.entitled,21);
  assert.equal((await leaveRoute.POST(req('/api/hr/leave','POST',{kind:'type',code:'study',name_ar:'دراسية',annual_days:7.5}))).status,200);

  // --- Attendance: self punch ---
  const punch=(action,token=hananToken,key)=>meAttendanceRoute.POST(req('/api/hr/me/attendance','POST',{action},token,key));
  const punchKey=randomUUID();
  const inRes=await json(await punch('check_in',hananToken,punchKey));
  assert.equal(inRes.status,200);assert.match(inRes.body.attendance.check_in,/^\d\d:\d\d$/);assert.equal(inRes.body.attendance.source,'self');
  assert.equal((await json(await punch('check_in',hananToken,punchKey))).body.replayed,true);
  assert.equal((await punch('check_in')).status,409);
  assert.equal((await punch('check_out',mgrToken)).status,409); // boss never checked in
  assert.equal((await punch('bogus')).status,400);
  const outRes=await json(await punch('check_out'));
  assert.equal(outRes.status,200);assert.ok(outRes.body.attendance.check_out);
  assert.equal((await punch('check_out')).status,409);
  assert.equal((await punch('check_in',driverToken)).status,404);
  assert.equal((await punch('check_in',repToken)).status,409); // rahma's record is terminated
  const hananMe=(await json(await meRoute.GET(req('/api/hr/me','GET',undefined,hananToken)))).body;
  assert.equal(hananMe.todayRecord.id,inRes.body.attendance.id);
  assert.ok(hananMe.balances.length>0);assert.equal(hananMe.types.some(t=>t.code==='paternity'),false);

  // --- Attendance: HR corrections (reason required, audited, no future dates) ---
  const today=hananMe.today;
  let pastDay=addDays(today,-1);
  while(settings.weekend.includes(dowOf(pastDay)))pastDay=addDays(pastDay,-1);
  const correct=body=>attendanceRoute.POST(req('/api/hr/attendance','POST',{employee_id:staff.id,work_date:pastDay,...body}));
  assert.equal((await correct({check_in:'09:40',check_out:'17:00'})).status,400);
  assert.equal((await correct({check_in:'09:40',check_out:'09:00',reason:'x'})).status,400);
  assert.equal((await correct({check_in:'',check_out:'17:00',reason:'x'})).status,400);
  assert.equal((await attendanceRoute.POST(req('/api/hr/attendance','POST',{employee_id:staff.id,work_date:addDays(today,2),check_in:'09:00',reason:'x'}))).status,400);
  assert.equal((await attendanceRoute.POST(req('/api/hr/attendance','POST',{employee_id:staff.id,work_date:pastDay,check_in:'09:00',reason:'x'},repToken))).status,403);
  const fixed=await json(await correct({check_in:'09:40',check_out:'17:00',reason:'نسيت التسجيل',note:'بصمة يدوية'}));
  assert.equal(fixed.status,200);
  assert.deepEqual([fixed.body.attendance.check_in,fixed.body.attendance.check_out,fixed.body.attendance.worked_minutes,fixed.body.attendance.source],['09:40','17:00',440,'hr']);
  assert.equal(isLate('09:40',settings),true);assert.equal(isLate('09:10',settings),false);
  // Correcting again overwrites the day (still one row) and records from/to.
  assert.equal((await json(await correct({check_in:'09:05',check_out:'17:00',reason:'تصحيح'}))).body.attendance.check_in,'09:05');
  assert.equal((await db.query('SELECT count(*)::int n FROM hr_attendance WHERE employee_id=$1 AND work_date=$2',[staff.id,pastDay])).rows[0].n,1);
  const staffHistory=(await json(await employeesRoute.GET(req('/api/hr/employees?id='+staff.id)))).body.history;
  const lastFix=staffHistory.find(h=>h.action==='attendance_correction');
  assert.deepEqual(lastFix.changes.check_in,{from:'09:40',to:'09:05'});
  assert.ok(staffHistory.some(h=>h.action==='leave_request'));assert.ok(staffHistory.some(h=>h.action==='leave_approve'));

  // HR records a past sick day directly as approved; the monthly sheet sees both.
  let sickDay=addDays(pastDay,-1);
  while(settings.weekend.includes(dowOf(sickDay)))sickDay=addDays(sickDay,-1);
  const sickRes=await json(await leaveRoute.POST(req('/api/hr/leave','POST',{kind:'request',employee_id:staff.id,leave_type_id:sick.id,start_date:sickDay,end_date:sickDay,auto_approve:true})));
  assert.equal(sickRes.status,201);assert.equal(sickRes.body.request.status,'approved');
  const sheet=(await json(await attendanceRoute.GET(req('/api/hr/attendance?month='+pastDay.slice(0,7))))).body;
  assert.equal(sheet.today,today);
  assert.ok(sheet.records.some(r=>r.employee_id===staff.id&&r.work_date===pastDay));
  assert.equal('basic_salary' in sheet.employees[0],false); // attendance sheet never ships salaries
  if(sickDay.slice(0,7)===pastDay.slice(0,7))assert.ok(sheet.leaves.some(l=>l.id===sickRes.body.request.id));
  assert.equal((await attendanceRoute.GET(req('/api/hr/attendance?month=2026-13'))).status,400);
  const statusArgs={today,settings,holidays:new Set(),hireDate:'2025-01-01'};
  assert.equal(dayStatus({...statusArgs,date:pastDay,record:{check_in:'09:05',check_out:'17:00'}}),'present');
  assert.equal(dayStatus({...statusArgs,date:pastDay,record:{check_in:'09:30',check_out:'17:00'}}),'late');
  assert.equal(dayStatus({...statusArgs,date:pastDay,record:{check_in:'09:00',check_out:null}}),'incomplete');
  assert.equal(dayStatus({...statusArgs,date:pastDay,onLeave:true}),'leave');
  assert.equal(dayStatus({...statusArgs,date:pastDay}),'absent');
  assert.equal(dayStatus({...statusArgs,date:today}),settings.weekend.includes(dowOf(today))?'weekend':'pending');
  assert.equal(dayStatus({...statusArgs,date:'2024-12-31'}),'none');

  // --- Header status endpoint ---
  const status=(await json(await meAttendanceRoute.GET(req('/api/hr/me/attendance','GET',undefined,hananToken)))).body;
  assert.equal(status.linked,true);assert.equal(status.record.id,inRes.body.attendance.id);
  assert.equal((await json(await meAttendanceRoute.GET(req('/api/hr/me/attendance','GET',undefined,driverToken)))).body.linked,false);

  // --- One-step onboarding of all login accounts ---
  const allIds=SYSTEM_ACCOUNTS.map(a=>a.profile.id);
  const bulk=body=>employeesRoute.POST(req('/api/hr/employees','POST',{kind:'bulk_accounts',...body}));
  assert.equal((await bulk({hire_date:'2026-01-01',account_ids:['nope']})).status,400);
  assert.equal((await bulk({hire_date:'',account_ids:allIds})).status,400);
  assert.equal((await employeesRoute.POST(req('/api/hr/employees','POST',{kind:'bulk_accounts',hire_date:'2026-01-01',account_ids:allIds},repToken))).status,403);
  const linkedBefore=(await db.query('SELECT count(*)::int n FROM hr_employees WHERE account_id IS NOT NULL')).rows[0].n;
  const bulkKey=randomUUID();
  const bulkRes=await json(await employeesRoute.POST(req('/api/hr/employees','POST',{kind:'bulk_accounts',hire_date:'2026-01-01',account_ids:allIds},hrToken,bulkKey)));
  assert.equal(bulkRes.status,200);
  assert.deepEqual([bulkRes.body.created,bulkRes.body.skipped],[allIds.length-linkedBefore,linkedBefore]);
  assert.equal((await json(await employeesRoute.POST(req('/api/hr/employees','POST',{kind:'bulk_accounts',hire_date:'2026-01-01',account_ids:allIds},hrToken,bulkKey)))).body.replayed,true);
  assert.equal((await db.query('SELECT count(*)::int n FROM hr_employees WHERE account_id IS NOT NULL')).rows[0].n,allIds.length);
  const driverFile=(await db.query(`SELECT e.full_name_ar,e.job_title,d.code FROM hr_employees e JOIN hr_departments d ON d.id=e.department_id WHERE account_id='drv-khalid-01'`)).rows[0];
  assert.deepEqual(driverFile,{full_name_ar:'خالد',job_title:'سائق توصيل',code:'delivery'});
  // Every account can now use self-service, drivers included.
  assert.equal((await punch('check_in',driverToken)).status,200);
  assert.equal((await json(await meRoute.GET(req('/api/hr/me','GET',undefined,driverToken)))).body.employee.full_name_ar,'خالد');

  // --- Durability of phase 2 data ---
  await db.close();
  db=new PGlite(fileURLToPath(dataDir),{parsers:{1082:v=>v}});
  await db.exec('SET ROLE service_role;');
  bal=await balanceOf();
  assert.deepEqual([bal.entitled,bal.adjustments,bal.used,bal.pending],[21,2,0,11]);
  assert.equal((await db.query('SELECT count(*)::int n FROM hr_attendance')).rows[0].n,3);
  // =============================== Phase 3: payroll ===============================
  const payrollRoute=await import('../app/api/hr/payroll/route.ts');
  const mePayslipsRoute=await import('../app/api/hr/me/payslips/route.ts');
  const pay=(body,token=hrToken,key)=>payrollRoute.POST(req('/api/hr/payroll','POST',body,token,key));
  const MONTH='2025-02';

  // Access: HR full, finance read + pay only, others none.
  assert.equal((await payrollRoute.GET(req('/api/hr/payroll','GET',undefined,repToken))).status,403);
  assert.equal((await payrollRoute.GET(req('/api/hr/payroll','GET',undefined,mgrToken))).status,403);
  const finList=await json(await payrollRoute.GET(req('/api/hr/payroll','GET',undefined,financeToken)));
  assert.equal(finList.status,200);assert.equal('employees' in finList.body,false);assert.equal(finList.body.settings.payroll.ssc_employee_rate,7.5);
  assert.equal((await pay({kind:'generate',month:MONTH},financeToken)).status,403);
  assert.equal((await payrollRoute.GET(req('/api/hr/payroll?adjustments='+MONTH,'GET',undefined,financeToken))).status,403);

  // Settings validation.
  assert.equal((await pay({kind:'settings',ssc_employee_rate:150,ssc_employer_rate:14.25,daily_basis:30})).status,400);
  assert.equal((await pay({kind:'settings',ssc_employee_rate:7.5,ssc_employer_rate:14.25,daily_basis:10})).status,400);

  // Inputs for Hanan (staff): salary, commission rate (audited), components, adjustments, advance, unpaid leave, orders.
  const staffNow=(await json(await employeesRoute.GET(req('/api/hr/employees?id='+staff.id)))).body.employee;
  assert.equal((await employeesRoute.PATCH(req('/api/hr/employees','PATCH',{id:staff.id,fields:{commission_rate:150}}))).status,400);
  const setPay=await json(await employeesRoute.PATCH(req('/api/hr/employees','PATCH',{id:staff.id,expected_updated_at:staffNow.updated_at,fields:{basic_salary:600,commission_rate:2}})));
  assert.equal(setPay.status,200);assert.equal(setPay.body.employee.commission_rate,2);
  const rateAudit=(await json(await employeesRoute.GET(req('/api/hr/employees?id='+staff.id)))).body.history[0];
  assert.deepEqual(rateAudit.changes.commission_rate,{from:0,to:2});
  const comp=body=>pay({kind:'component',employee_id:staff.id,...body});
  assert.equal((await comp({component_kind:'allowance',name_ar:'بدل',amount:0})).status,400);
  assert.equal((await comp({component_kind:'bonus',name_ar:'بدل',amount:5})).status,400);
  assert.equal((await comp({component_kind:'allowance',name_ar:'بدل مواصلات',amount:50,ssc_subject:true})).status,200);
  const phone=await json(await comp({component_kind:'allowance',name_ar:'بدل هاتف',amount:20}));
  assert.equal((await comp({component_kind:'deduction',name_ar:'تأمين صحي',amount:10})).status,200);
  const temp=await json(await comp({component_kind:'allowance',name_ar:'بدل مؤقت',amount:999}));
  assert.equal((await pay({kind:'component',id:temp.body.id,name_ar:'بدل مؤقت',amount:999,is_active:false})).status,200); // deactivated -> ignored
  const adj=body=>pay({kind:'adjustment',action:'add',employee_id:staff.id,month:MONTH,...body});
  assert.equal((await adj({adjustment_kind:'bonus',amount:100})).status,400); // note required
  assert.equal((await adj({adjustment_kind:'bonus',amount:100,note:'مكافأة أداء'})).status,200);
  assert.equal((await adj({adjustment_kind:'overtime',amount:30,note:'ساعات إضافية'})).status,200);
  assert.equal((await adj({adjustment_kind:'income_tax',amount:15,note:'ضريبة دخل'})).status,200);
  const advance=body=>pay({kind:'advance',action:'create',employee_id:staff.id,...body});
  assert.equal((await advance({amount:100,monthly_amount:200,start_month:MONTH,reason:'x'})).status,400);
  assert.equal((await advance({amount:300,monthly_amount:100,start_month:MONTH,reason:'ظرف عائلي'})).status,200);
  const unpaid=leaveTypes.find(t=>t.code==='unpaid');
  assert.equal((await leaveRoute.POST(req('/api/hr/leave','POST',{kind:'request',employee_id:staff.id,leave_type_id:unpaid.id,start_date:'2025-02-02',end_date:'2025-02-02',auto_approve:true}))).status,201);
  const customerId=(await db.query(`INSERT INTO customers(name,phone,customer_type,classification) VALUES('عميل اختبار','0790000999','end_user','customer') RETURNING id`)).rows[0].id;
  let orderNo=0;
  const order=async(status,date,total)=>db.query(`INSERT INTO orders(order_number,customer_id,owner_account_id,status,total_amount,order_date) VALUES($1,$2,$3,$4,$5,$6)`,
    ['HR-TEST-'+(++orderNo),customerId,hananProfile.id,status,total,date]);
  await order('delivered','2025-02-10',600);await order('delivered','2025-02-20',400);
  await order('cancelled','2025-02-11',500);await order('delivered','2025-03-01',700);

  // Future months can't be run.
  assert.equal((await pay({kind:'generate',month:`${nextYear}-01`})).status,400);
  const genKey=randomUUID();
  const gen=await json(await pay({kind:'generate',month:MONTH},hrToken,genKey));
  assert.equal(gen.status,200);
  let run=gen.body.run;
  assert.equal(run.status,'draft');
  // Employed in Feb 2025: the phase-1 manager (2024), boss (2024), staff and man (2025-01). Not the 2025-06 hire.
  assert.equal(run.totals.count,4);
  const slipOf=r=>r.payslips.find(p=>p.employee_id===staff.id);
  let slip=slipOf(run);
  assert.deepEqual(
    [slip.basic,slip.allowances,slip.commission_sales,slip.commission,slip.overtime,slip.bonuses,slip.gross],
    [600,70,1000,20,30,100,820]);
  assert.deepEqual([slip.ssc_base,slip.ssc_employee,slip.ssc_employer],[650,48.75,92.625]);
  assert.deepEqual([slip.unpaid_leave_days,slip.unpaid_leave_deduction,slip.absent_days,slip.absence_deduction],[1,22.333,19,0]);
  assert.deepEqual([slip.advance_deduction,slip.other_deductions,slip.income_tax,slip.total_deductions,slip.net],[100,10,15,196.083,623.917]);
  assert.deepEqual(slip.warnings.sort(),['NO_IBAN','NO_SSC_NUMBER']);
  assert.equal(slip.employee_account_id,hananProfile.id);
  assert.ok(slip.lines.some(l=>l.type==='advance'&&l.amount===100));
  // Retry returns the same run; regenerate keeps one run per month.
  assert.equal((await json(await pay({kind:'generate',month:MONTH},hrToken,genKey))).body.replayed,true);
  assert.equal((await json(await pay({kind:'generate',month:MONTH}))).body.run.id,run.id);
  assert.equal((await db.query('SELECT count(*)::int n FROM hr_payroll_runs')).rows[0].n,1);

  // Changing an input auto-recalculates the draft; voiding restores it.
  const extra=await json(await adj({adjustment_kind:'deduction',amount:23.917,note:'خصم إتلاف'}));
  run=(await json(await payrollRoute.GET(req('/api/hr/payroll?id='+run.id)))).body.run;
  assert.equal(slipOf(run).net,600);
  assert.equal((await pay({kind:'adjustment',action:'void',id:extra.body.id})).status,200);
  assert.equal((await pay({kind:'adjustment',action:'void',id:extra.body.id})).status,409);
  run=(await json(await payrollRoute.GET(req('/api/hr/payroll?id='+run.id)))).body.run;
  assert.equal(slipOf(run).net,623.917);
  // Absence deduction only when enabled.
  assert.equal((await pay({kind:'settings',ssc_employee_rate:7.5,ssc_employer_rate:14.25,ssc_max_wage:'',daily_basis:30,deduct_absences:true})).status,200);
  run=(await json(await pay({kind:'generate',month:MONTH}))).body.run;
  assert.equal(slipOf(run).absence_deduction,424.333); // 19 x 22.333...
  assert.equal((await pay({kind:'settings',ssc_employee_rate:7.5,ssc_employer_rate:14.25,ssc_max_wage:600,daily_basis:30,deduct_absences:false})).status,200);
  run=(await json(await pay({kind:'generate',month:MONTH}))).body.run;
  assert.deepEqual([slipOf(run).ssc_base,slipOf(run).ssc_employee],[600,45]); // capped wage
  assert.equal((await pay({kind:'settings',ssc_employee_rate:7.5,ssc_employer_rate:14.25,ssc_max_wage:0,daily_basis:30,deduct_absences:false})).status,200);
  run=(await json(await pay({kind:'generate',month:MONTH}))).body.run;
  assert.equal(slipOf(run).net,623.917);
  // Employees can't see draft payslips.
  assert.equal((await json(await mePayslipsRoute.GET(req('/api/hr/me/payslips','GET',undefined,hananToken)))).body.payslips.length,0);

  // Approval: stale numbers -> no approval, fresh numbers returned. Finance can't approve; HR can't pay.
  const approveBody={kind:'transition',id:run.id,action:'approve'};
  assert.equal((await pay({...approveBody})).status,400);
  const stale=await json(await pay({...approveBody,expected_net:1,expected_count:run.totals.count}));
  assert.equal(stale.status,200);assert.equal(stale.body.changed,true);assert.equal(stale.body.run.status,'draft');
  assert.equal((await pay({...approveBody,expected_net:run.totals.net,expected_count:run.totals.count},financeToken)).status,403);
  const approved2=await json(await pay({...approveBody,expected_net:run.totals.net,expected_count:run.totals.count}));
  assert.equal(approved2.status,200);assert.equal(approved2.body.changed,false);assert.equal(approved2.body.run.status,'approved');
  assert.equal((await db.query(`SELECT count(*)::int n FROM notifications WHERE type='hr_payroll' AND username='zaid'`)).rows[0].n,1);
  // Locked month: no inputs, no regeneration.
  assert.equal((await adj({adjustment_kind:'bonus',amount:5,note:'متأخر'})).status,409);
  assert.equal((await pay({kind:'generate',month:MONTH})).status,409);
  assert.equal((await pay({kind:'advance',action:'create',employee_id:staff.id,amount:50,monthly_amount:50,start_month:MONTH,reason:'x'})).status,409);
  const mine=(await json(await mePayslipsRoute.GET(req('/api/hr/me/payslips','GET',undefined,hananToken)))).body;
  assert.equal(mine.payslips.length,1);assert.equal(mine.payslips[0].net,623.917);assert.equal(mine.advances[0].remaining,200);
  assert.equal((await pay({kind:'transition',id:run.id,action:'pay'})).status,403);
  // Reopen needs a reason; re-approve; finance pays.
  assert.equal((await pay({kind:'transition',id:run.id,action:'reopen'})).status,400);
  assert.equal((await json(await pay({kind:'transition',id:run.id,action:'reopen',note:'تصحيح بدل'}))).body.run.status,'draft');
  assert.equal((await json(await mePayslipsRoute.GET(req('/api/hr/me/payslips','GET',undefined,hananToken)))).body.payslips.length,0);
  assert.equal((await pay({kind:'component',id:phone.body.id,name_ar:'بدل هاتف',amount:25})).status,200);
  run=(await json(await payrollRoute.GET(req('/api/hr/payroll?id='+run.id)))).body.run;
  assert.equal(slipOf(run).net,628.75);
  assert.equal((await json(await pay({...approveBody,expected_net:run.totals.net,expected_count:run.totals.count}))).body.run.status,'approved');
  assert.equal((await pay({kind:'transition',id:run.id,action:'pay'},financeToken)).status,200);
  const paidRun=(await json(await payrollRoute.GET(req('/api/hr/payroll?id='+run.id,'GET',undefined,financeToken)))).body.run;
  assert.equal(paidRun.status,'paid');assert.equal(paidRun.paid_by,'fin-zaid-01');
  assert.equal((await pay({kind:'transition',id:run.id,action:'pay'},financeToken)).status,409);
  assert.equal((await pay({kind:'transition',id:run.id,action:'reopen',note:'x'})).status,409);
  assert.equal((await db.query(`SELECT count(*)::int n FROM notifications WHERE type='hr_payroll' AND username='hanan.sales'`)).rows[0].n,1);
  // Paid numbers are frozen: later salary changes don't touch them.
  assert.equal((await employeesRoute.PATCH(req('/api/hr/employees','PATCH',{id:staff.id,fields:{basic_salary:900}}))).status,200);
  assert.equal(slipOf((await json(await payrollRoute.GET(req('/api/hr/payroll?id='+run.id)))).body.run).basic,600);

  // Advances progress across paid runs; the next month recovers the next installment.
  const advList=(await json(await payrollRoute.GET(req('/api/hr/payroll?employee='+staff.id)))).body;
  assert.equal(advList.advances[0].repaid,100);assert.equal(advList.advances[0].status,'active');
  assert.equal(advList.components.filter(c=>c.is_active).length,3);
  const march=(await json(await pay({kind:'generate',month:'2025-03'}))).body.run;
  assert.equal(slipOf(march).advance_deduction,100);
  // A negative net blocks approval.
  assert.equal((await pay({kind:'adjustment',action:'add',employee_id:man.id,month:'2025-03',adjustment_kind:'deduction',amount:50,note:'خصم'})).status,200);
  const march2=(await json(await payrollRoute.GET(req('/api/hr/payroll?id='+march.id)))).body.run;
  assert.ok(march2.payslips.find(p=>p.employee_id===man.id).warnings.includes('NEGATIVE_NET'));
  assert.equal((await pay({kind:'transition',id:march.id,action:'approve',expected_net:march2.totals.net,expected_count:march2.totals.count})).status,409);
  // Cancelling an advance stops recovery.
  assert.equal((await pay({kind:'advance',action:'cancel',id:advList.advances[0].id,reason:'تنازل'})).status,200);
  assert.equal((await pay({kind:'advance',action:'cancel',id:advList.advances[0].id})).status,409);
  assert.equal(slipOf((await json(await payrollRoute.GET(req('/api/hr/payroll?id='+march.id)))).body.run).advance_deduction,0);

  // Durability of payroll data.
  await db.close();
  db=new PGlite(fileURLToPath(dataDir),{parsers:{1082:v=>v}});
  await db.exec('SET ROLE service_role;');
  const runsAfter=(await json(await payrollRoute.GET(req('/api/hr/payroll')))).body.runs;
  assert.deepEqual(runsAfter.map(r=>[r.month,r.status]),[['2025-03','draft'],['2025-02','paid']]);
  // =============================== Phase 4: recruitment, performance, documents ===============================
  const recruitRoute=await import('../app/api/hr/recruitment/route.ts');
  const reviewsRoute=await import('../app/api/hr/reviews/route.ts');
  const meReviewsRoute=await import('../app/api/hr/me/reviews/route.ts');
  const documentsRoute=await import('../app/api/hr/documents/route.ts');
  const alertsRoute=await import('../app/api/hr/alerts/route.ts');
  const recruit=(body,token=hrToken,key)=>recruitRoute.POST(req('/api/hr/recruitment','POST',body,token,key));

  // --- Recruitment ---
  assert.equal((await recruitRoute.GET(req('/api/hr/recruitment','GET',undefined,repToken))).status,403);
  assert.equal((await recruit({kind:'opening',title:''})).status,400);
  assert.equal((await recruit({kind:'opening',title:'مندوبة',salary_min:500,salary_max:400})).status,400);
  const openingRes=await json(await recruit({kind:'opening',title:'مندوبة مبيعات',department_id:sales.id,positions:1,salary_min:400,salary_max:550}));
  assert.equal(openingRes.status,200);
  const openingId=openingRes.body.id;
  const cand=body=>recruit({kind:'candidate',action:'create',opening_id:openingId,...body});
  assert.equal((await cand({full_name:'',phone:'0791111111'})).status,400);
  const c1=await json(await cand({full_name:'مرشحة أولى',phone:'+962 79 111 1111',source:'linkedin',expected_salary:450}));
  assert.equal(c1.status,200);assert.equal(c1.body.candidate.phone,'0791111111');assert.equal(c1.body.candidate.stage,'applied');
  assert.equal((await cand({full_name:'مكرر',phone:'0791111111'})).status,409);
  const c2=(await json(await cand({full_name:'مرشحة ثانية',phone:'0792222222'}))).body.candidate;
  const move=(id,stage,extra={})=>recruit({kind:'candidate',action:'move',id,stage,...extra});
  assert.equal((await move(c1.body.candidate.id,'screening')).status,200);
  assert.equal((await move(c1.body.candidate.id,'screening')).status,400); // same stage
  assert.equal((await move(c1.body.candidate.id,'hired')).status,400);     // hiring has its own flow
  assert.equal((await move(c2.id,'rejected')).status,400);                 // reason required
  assert.equal((await move(c2.id,'rejected',{rejection_reason:'خبرة غير كافية'})).status,200);
  const updCand=body=>recruit({kind:'candidate',action:'update',id:c1.body.candidate.id,full_name:'مرشحة أولى',phone:'0791111111',source:'linkedin',...body});
  assert.equal((await updCand({interview_at:'2026-10-01T10:00'})).status,400); // must carry a timezone
  assert.equal((await updCand({rating:6})).status,400);
  const updated=await json(await updCand({rating:4,interview_at:'2026-10-01T07:00:00.000Z',notes:'انطباع جيد'}));
  assert.equal(updated.body.candidate.rating,4);
  assert.deepEqual(updated.body.candidate.events.map(e=>e.event),['created','stage','interview_scheduled']);
  assert.equal((await move(c1.body.candidate.id,'offer',{note:'عرض 480'})).status,200);
  assert.equal((await recruit({kind:'hire',candidate_id:c2.id,hire_date:'2026-10-01'})).status,400); // rejected candidate
  assert.equal((await recruit({kind:'hire',candidate_id:c1.body.candidate.id,hire_date:'2026-10-01',probation_end_date:'2026-09-01'})).status,400);
  const hireKey=randomUUID();
  const hireBody={kind:'hire',candidate_id:c1.body.candidate.id,hire_date:'2026-10-01',probation_end_date:'2026-12-31',basic_salary:480};
  const hired=await json(await recruit(hireBody,hrToken,hireKey));
  assert.equal(hired.status,201);
  assert.deepEqual([hired.body.employee.full_name_ar,hired.body.employee.job_title,hired.body.employee.department_id,hired.body.employee.status,hired.body.employee.basic_salary],
    ['مرشحة أولى','مندوبة مبيعات',sales.id,'probation',480]);
  assert.equal(hired.body.opening_closed,true);
  assert.equal((await json(await recruit(hireBody,hrToken,hireKey))).body.replayed,true);
  assert.equal((await recruit({...hireBody})).status,409);
  assert.equal((await updCand({rating:5})).status,409); // hired candidates are locked
  assert.equal((await cand({full_name:'متأخرة',phone:'0793333333'})).status,409); // opening closed
  const recruitList=(await json(await recruitRoute.GET(req('/api/hr/recruitment')))).body;
  const opening=recruitList.openings.find(o=>o.id===openingId);
  assert.equal(opening.status,'closed');assert.deepEqual(opening.stage_counts,{hired:1,rejected:1});
  assert.equal((await db.query('SELECT count(*)::int n FROM hr_employees WHERE full_name_ar=$1',['مرشحة أولى'])).rows[0].n,1);

  // --- Performance: KPIs from real orders, call logs, attendance and leave ---
  await db.query(`INSERT INTO call_logs(customer_id,called_at,outcome,rep_name) VALUES($1,'2025-02-05T09:00:00Z','order_placed','حنان'),($1,'2025-03-05T09:00:00Z','no_answer','حنان'),($1,'2025-03-06T09:00:00Z','answered','رحمة')`,[customerId]);
  const q1={from:'2025-01-01',to:'2025-03-31'};
  const kpis=(await json(await reviewsRoute.GET(req(`/api/hr/reviews?kpis=${staff.id}&from=${q1.from}&to=${q1.to}`)))).body.kpis;
  assert.deepEqual(
    [kpis.orders_total,kpis.orders_delivered,kpis.orders_cancelled,kpis.sales_delivered,kpis.calls,kpis.calls_with_order,kpis.attendance_days,kpis.leave_days],
    [4,3,1,1700,2,1,0,1]);
  assert.equal(kpis.working_days,leaveWorkingDays(q1.from,q1.to,false,settings.weekend,new Set()));
  assert.equal((await reviewsRoute.GET(req(`/api/hr/reviews?kpis=${staff.id}&from=${q1.to}&to=${q1.from}`))).status,400);

  // Manager self-service: sees direct reports only.
  const mgrReviews=(await json(await meReviewsRoute.GET(req('/api/hr/me/reviews','GET',undefined,mgrToken)))).body;
  assert.deepEqual(mgrReviews.reports.map(r=>r.id),[staff.id]);
  assert.equal((await meReviewsRoute.GET(req(`/api/hr/me/reviews?kpis=${staff.id}&from=${q1.from}&to=${q1.to}`,'GET',undefined,mgrToken))).status,200);
  assert.equal((await meReviewsRoute.GET(req(`/api/hr/me/reviews?kpis=${man.id}&from=${q1.from}&to=${q1.to}`,'GET',undefined,mgrToken))).status,403);
  const allFive=Object.fromEntries(['quality','productivity','teamwork','communication','punctuality','initiative'].map((k,i)=>[k,i<3?5:4]));
  const reviewBase={employee_id:staff.id,period_label:'2025-Q1',period_start:q1.from,period_end:q1.to};
  const mgrSave=(body,token=mgrToken,key)=>meReviewsRoute.POST(req('/api/hr/me/reviews','POST',body,token,key));
  assert.equal((await mgrSave({...reviewBase,scores:{quality:5}},repToken)).status,403); // rahma isn't her manager
  assert.equal((await mgrSave({...reviewBase,employee_id:man.id,scores:{quality:3}})).status,403);
  assert.equal((await mgrSave({...reviewBase,scores:{quality:9}})).status,400);
  assert.equal((await mgrSave({...reviewBase,scores:{quality:5},submit:true})).status,400); // all criteria needed
  const draftKey=randomUUID();
  const draft=await json(await mgrSave({...reviewBase,scores:{quality:5,teamwork:4},strengths:'التزام'},mgrToken,draftKey));
  assert.equal(draft.status,200);assert.equal(draft.body.review.status,'draft');assert.equal(draft.body.review.overall,4.5);
  assert.equal(draft.body.review.kpis.sales_delivered,1700); // snapshot taken by the database
  assert.equal((await json(await mgrSave({...reviewBase,scores:{quality:5,teamwork:4},strengths:'التزام'},mgrToken,draftKey))).body.replayed,true);
  assert.equal((await mgrSave({...reviewBase,scores:{quality:1}})).status,409); // same employee + period
  assert.equal((await json(await meReviewsRoute.GET(req('/api/hr/me/reviews','GET',undefined,hananToken)))).body.mine.length,0); // drafts hidden
  const submitted=await json(await mgrSave({id:draft.body.review.id,period_label:'2025-Q1',period_start:q1.from,period_end:q1.to,scores:allFive,goals:'رفع المبيعات 10%',submit:true}));
  assert.equal(submitted.body.review.status,'submitted');assert.equal(submitted.body.review.overall,4.5);
  assert.equal((await mgrSave({id:draft.body.review.id,period_label:'2025-Q1',period_start:q1.from,period_end:q1.to,scores:allFive})).status,409);
  assert.equal((await db.query(`SELECT count(*)::int n FROM notifications WHERE type='hr_review' AND username='hanan.sales'`)).rows[0].n,1);
  // HR can't review its own file; HR can review others.
  const hrSelfId=(await db.query(`SELECT id FROM hr_employees WHERE account_id='hr-ops-01'`)).rows[0].id;
  assert.equal((await reviewsRoute.POST(req('/api/hr/reviews','POST',{...reviewBase,employee_id:hrSelfId,scores:allFive}))).status,403);
  assert.equal((await reviewsRoute.POST(req('/api/hr/reviews','POST',{...reviewBase,employee_id:man.id,scores:allFive,submit:true}))).status,200);
  assert.equal((await reviewsRoute.GET(req('/api/hr/reviews','GET',undefined,mgrToken))).status,403);
  // Acknowledgement by the reviewed employee only.
  const ack=(body,token)=>meReviewsRoute.PATCH(req('/api/hr/me/reviews','PATCH',body,token));
  assert.equal((await ack({id:draft.body.review.id},mgrToken)).status,403);
  const acked=await json(await ack({id:draft.body.review.id,comment:'شكرًا'},hananToken));
  assert.equal(acked.body.review.status,'acknowledged');assert.equal(acked.body.review.employee_comment,'شكرًا');
  assert.equal((await ack({id:draft.body.review.id},hananToken)).status,409);
  const hananReviews=(await json(await meReviewsRoute.GET(req('/api/hr/me/reviews','GET',undefined,hananToken)))).body;
  assert.equal(hananReviews.mine.length,1);assert.equal(hananReviews.reports.length,0);
  assert.equal((await json(await reviewsRoute.GET(req('/api/hr/reviews')))).body.reviews.length,2);

  // --- Documents & expiry alerts ---
  const doc=(body,token=hrToken)=>documentsRoute.POST(req('/api/hr/documents','POST',body,token));
  assert.equal((await doc({employee_id:staff.id,doc_type:'passport'},repToken)).status,403);
  assert.equal((await doc({employee_id:staff.id,doc_type:'visa'})).status,400);
  assert.equal((await doc({employee_id:staff.id,doc_type:'passport',issue_date:'2026-01-01',expiry_date:'2025-01-01'})).status,400);
  const hrNotesBefore=(await db.query(`SELECT count(*)::int n FROM notifications WHERE type='hr_expiry'`)).rows[0].n;
  const residency=(await json(await doc({employee_id:staff.id,doc_type:'residency',doc_number:'R-1',expiry_date:addDays(today,5),notes:'داخلي'}))).body.id;
  await doc({employee_id:staff.id,doc_type:'passport',expiry_date:addDays(today,20)});
  await doc({employee_id:staff.id,doc_type:'national_id',doc_number:'NID'});
  const health=(await json(await doc({employee_id:staff.id,doc_type:'health_certificate',expiry_date:addDays(today,-3)}))).body.id;
  await doc({employee_id:staff.id,doc_type:'contract',expiry_date:addDays(today,200)});
  // 3 due items x (HR + the employee herself) = 6 notifications, sent while saving.
  assert.equal((await db.query(`SELECT count(*)::int n FROM notifications WHERE type='hr_expiry'`)).rows[0].n-hrNotesBefore,6);
  const alerts=(await json(await alertsRoute.GET(req('/api/hr/alerts')))).body;
  assert.equal(alerts.sent,0); // already claimed; never sent twice
  const docAlerts=alerts.expiries.filter(x=>x.kind==='document');
  assert.deepEqual(docAlerts.map(x=>[x.subtype,x.days_left]),[['health_certificate',-3],['residency',5],['passport',20]]);
  assert.equal((await alertsRoute.GET(req('/api/hr/alerts','GET',undefined,repToken))).status,403);
  // Hired candidate's probation end shows up once it's within the window.
  assert.ok((await json(await alertsRoute.GET(req('/api/hr/alerts?days=365')))).body.expiries.some(x=>x.kind==='probation'&&x.employee_id===hired.body.employee.id));
  // Renewal: moving the expiry date re-arms the reminder for the new date only.
  const renew=exp=>doc({id:residency,doc_type:'residency',doc_number:'R-1',expiry_date:exp,notes:'داخلي'});
  assert.equal((await renew(addDays(today,400))).status,200);
  assert.equal((await json(await alertsRoute.GET(req('/api/hr/alerts')))).body.expiries.some(x=>x.ref_id===residency),false);
  await renew(addDays(today,6));
  assert.equal((await db.query(`SELECT count(*)::int n FROM notifications WHERE type='hr_expiry'`)).rows[0].n-hrNotesBefore,8);
  // Archived documents stop alerting and disappear from the employee's own view.
  assert.equal((await doc({id:health,doc_type:'health_certificate',expiry_date:addDays(today,-3),archived:true})).status,200);
  assert.equal((await json(await alertsRoute.GET(req('/api/hr/alerts')))).body.expiries.some(x=>x.ref_id===health),false);
  const hananMe2=(await json(await meRoute.GET(req('/api/hr/me','GET',undefined,hananToken)))).body;
  assert.equal(hananMe2.documents.length,4);
  assert.ok(hananMe2.documents.every(d=>d.notes===''));
  const register=(await json(await documentsRoute.GET(req('/api/hr/documents?employee='+staff.id)))).body.documents;
  assert.equal(register.length,5);assert.equal(register.find(d=>d.id===residency).notes,'داخلي');
  const staffHistory4=(await json(await employeesRoute.GET(req('/api/hr/employees?id='+staff.id)))).body.history.map(h=>h.action);
  assert.ok(staffHistory4.includes('document_create')&&staffHistory4.includes('review_submitted')&&staffHistory4.includes('review_acknowledged'));

  // --- Durability of phase 4 data ---
  await db.close();
  db=new PGlite(fileURLToPath(dataDir),{parsers:{1082:v=>v}});
  await db.exec('SET ROLE service_role;');
  const after4=(await json(await recruitRoute.GET(req('/api/hr/recruitment')))).body;
  assert.equal(after4.candidates.length,2);
  assert.equal((await json(await reviewsRoute.GET(req('/api/hr/reviews')))).body.reviews.find(r=>r.employee_id===staff.id).status,'acknowledged');
  console.log('PASS test_hr (phases 1-4: records, attendance, leave, payroll, recruitment, reviews, documents, alerts, durability)');
}finally{
  server.close();
  await db.close().catch(()=>{});
}
