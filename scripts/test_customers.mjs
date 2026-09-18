import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {registerHooks} from 'node:module';
import {PGlite} from '../.local-tests/node_modules/@electric-sql/pglite/dist/index.js';

// No dotenv, production connection, seed files, or company data.
const root=new URL('../',import.meta.url);
registerHooks({resolve(s,c,next){if(s.startsWith('@/'))return next(new URL(s.slice(2)+'.ts',root).href,c);return next(s,c);}});
process.env.JWT_SECRET=randomBytes(48).toString('hex');
process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-test-service-key';
const {signAuthToken,SYSTEM_ACCOUNTS}=await import('../lib/auth.ts');
// Identities come from the account roster, not a copy of it: verifyAuthToken checks the
// token's username against SYSTEM_ACCOUNTS, so a hardcoded one silently became a 401 the
// day the accounts were renamed (bec0e73).
const profileOf=(id)=>{const a=SYSTEM_ACCOUNTS.find(x=>x.profile.id===id);
  if(!a)throw new Error('no account '+id);return a.profile;};
const {prepareLead}=await import('../lib/business-server.ts');
const leads=await import('../app/api/leads/route.ts');
const customers=await import('../app/api/customers/route.ts');
const calls=await import('../app/api/calls/route.ts');
const admin=profileOf('admin-betolla-01');
const rep=profileOf('rep-rahma-01');
const adminToken=await signAuthToken(admin),repToken=await signAuthToken(rep);
const dataDir=new URL('../.local-tests/db-'+randomUUID()+'/',import.meta.url);
await mkdir(dataDir,{recursive:true});
let db=new PGlite(fileURLToPath(dataDir));
await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
const initial=await readFile(new URL('supabase/migrations/001_initial_schema.sql',root),'utf8');
await db.exec(initial.replace(/^CREATE EXTENSION[^;]+;/gm,''));
// A pre-existing legacy customer must survive the additive migration untouched.
await db.exec(`INSERT INTO customers(id,name,phone,rep_name_raw) VALUES('00000000-0000-4000-8000-000000000001','Legacy fixture','000-legacy','Legacy Rep');`);
const before=(await db.query('SELECT id,name,phone FROM customers')).rows;
for(const file of ['005_payment_methods.sql','006_business_persistence.sql','007_customer_persistence.sql','009_customer_management.sql','016_call_log_rep_attribution.sql','019_customer_list_by_rep.sql','029_customer_ownership.sql'])await db.exec(await readFile(new URL('supabase/migrations/'+file,root),'utf8'));
assert.deepEqual((await db.query('SELECT id,name,phone FROM customers')).rows,before);
await db.exec('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;');
await db.exec('SET ROLE anon;');
await assert.rejects(db.query('SELECT business_customer_list()'),/permission denied/);
await db.exec('RESET ROLE;');
await db.exec('SET ROLE service_role;');
const rpcArgs={business_customer_list:[],business_customer_list_by_rep:['p_rep'],business_customer_document:['p_id'],business_customer_create:['p_data'],business_customer_update:['p_actor','p_id','p_data'],business_call_log_create:['p_actor','p_key','p_data','p_rep_name']};
let failNext=false;
const server=createServer(async(req,res)=>{
  try{
    let raw='';for await(const chunk of req)raw+=chunk;
    const name=req.url.split('/').at(-1),names=rpcArgs[name];
    // Inject the failure into the business RPC under test, never into infrastructure calls:
    // security_rate_hit (migration 028) runs first on every request and used to swallow it, so the
    // write the test meant to interrupt went through and returned 201.
    if(failNext&&names){failNext=false;res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'unavailable'}));return;}
    // The notification write (017) rides along with the call log and this suite does not model it;
    // letting it throw surfaced as a 503 on the request under test. The session check and rate
    // limiter (028) are deliberately NOT handled here — the auth layer already tolerates those
    // failing, and answering them changes what it decides. Unknown BUSINESS rpcs still throw.
    if(!names){
      if(name==='business_notification_create'){
        res.writeHead(200,{'Content-Type':'application/json'});res.end('null');return;
      }
      throw new Error('Unexpected RPC: '+name);
    }
    const body=JSON.parse(raw);
    const values=names.map(n=>n==='p_data'?JSON.stringify(body[n]):body[n]);
    const result=await db.query(`SELECT ${name}(${names.map((_,i)=>'$'+(i+1)).join(',')}) AS result`,values);
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result.rows[0].result));
  }catch(error){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({message:error.message,code:error.code}));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
process.env.NEXT_PUBLIC_SUPABASE_URL=`http://127.0.0.1:${server.address().port}`;
const req=(path,method='GET',body,token,key=randomUUID())=>new Request('http://localhost'+path,{method,
 headers:{...(token?{Authorization:`Bearer ${token}`}:{}),'Content-Type':'application/json','Idempotency-Key':key},...(body?{body:JSON.stringify(body)}:{})});
try{
  // Validation: missing/garbage phone is rejected before it ever reaches the database.
  assert.throws(()=>prepareLead({}),/رقم هاتف/);
  const parsed=prepareLead({phone:'+962793937385',name:'  ',source:'not-a-real-source',rep_name:'auto'});
  assert.equal(parsed.phone,'0793937385');assert.equal(parsed.lead_source,'unknown');assert.ok(parsed.name);

  // No auth required for /api/leads (public marketing/n8n intake, matches supabase/functions/ingest-lead).
  const leadBody={name:'ليد اختبار',phone:'0791112222',city:'عمان',address:'شارع تجريبي',notes:'ملاحظة',source:'social_media',rep_name:'حمزة'};
  const created=await leads.POST(req('/api/leads','POST',leadBody));assert.equal(created.status,201);
  const createdJson=await created.json();assert.equal(createdJson.success,true);assert.equal(createdJson.is_duplicate,false);
  assert.equal(createdJson.customer.phone,'0791112222');assert.equal(createdJson.customer.rep_name_raw,'حمزة');assert.deepEqual(createdJson.customer.history,[]);

  // Re-submitting the same phone number must never create a second row (idempotent by phone).
  const dup=await leads.POST(req('/api/leads','POST',{...leadBody,name:'اسم مختلف'}));assert.equal(dup.status,200);
  const dupJson=await dup.json();assert.equal(dupJson.is_duplicate,true);assert.equal(dupJson.customer.id,createdJson.customer.id);
  assert.equal((await db.query('SELECT count(*) AS n FROM customers WHERE phone=$1',['0791112222'])).rows[0].n,1);

  // Missing phone is rejected with 400, no row written.
  const invalid=await leads.POST(req('/api/leads','POST',{name:'بدون هاتف'}));assert.equal(invalid.status,400);
  const totalBefore=(await db.query('SELECT count(*) AS n FROM customers')).rows[0].n;
  assert.equal((await leads.POST(req('/api/leads','POST',{phone:''}))).status,400);
  assert.equal((await db.query('SELECT count(*) AS n FROM customers')).rows[0].n,totalBefore);

  // /api/customers requires a valid session and returns the persisted rows, newest first.
  assert.equal((await customers.GET(req('/api/customers'))).status,401);
  assert.equal((await customers.GET(req('/api/customers','GET',undefined,adminToken))).status,200);
  const list=await (await customers.GET(req('/api/customers','GET',undefined,adminToken))).json();
  assert.ok(list.customers.find(c=>c.phone==='0791112222'));
  assert.ok(list.customers.find(c=>c.phone==='000-legacy'));
  assert.equal(list.customers[0].phone,'0791112222'); // most recently created first
  // Retry-after-lost-response: the RPC layer degrades to a clean 503, never a duplicate write.
  failNext=true;
  assert.equal((await leads.POST(req('/api/leads','POST',{phone:'0798887777'}))).status,503);
  assert.equal((await db.query('SELECT count(*) AS n FROM customers WHERE phone=$1',['0798887777'])).rows[0].n,0);
  const retry=await leads.POST(req('/api/leads','POST',{phone:'0798887777'}));assert.equal(retry.status,201);
  assert.equal((await db.query('SELECT count(*) AS n FROM customers WHERE phone=$1',['0798887777'])).rows[0].n,1);

  // A rep sees only leads assigned to her (029). These fixtures belong to حمزة and "Legacy Rep",
  // so رحمة gets an empty list rather than the whole book — this suite predates that rule and used
  // to assert she saw everything. Kept after the retry block above, which counts server requests
  // and miscounts if anything else calls in between.
  const repList=await (await customers.GET(req('/api/customers','GET',undefined,repToken))).json();
  assert.ok(Array.isArray(repList.customers),'the rep-scoped list answers');
  assert.equal(repList.customers.find(c=>c.phone==='0791112222'),undefined,"another rep's lead is not hers");
  assert.equal(repList.customers.find(c=>c.phone==='000-legacy'),undefined,'nor the legacy row');

  // Edit: rep reassignment + field updates land in the DB, non-owner-safe overwrite.
  const editTarget=createdJson.customer.id;
  const editRes=await customers.PATCH(req('/api/customers','PATCH',{id:editTarget,rep_name:'صابرين',city:'الزرقاء',next_call_date:'2026-09-20'},adminToken));
  assert.equal(editRes.status,200);
  const editJson=await editRes.json();
  assert.equal(editJson.customer.rep_name_raw,'صابرين');assert.equal(editJson.customer.city,'الزرقاء');assert.equal(editJson.customer.next_call_date,'2026-09-20');
  assert.equal(editJson.customer.name,createdJson.customer.name); // untouched fields survive a partial edit
  assert.equal((await customers.PATCH(req('/api/customers','PATCH',{id:editTarget,name:'اسم بعد التعديل'},undefined))).status,401);
  assert.equal((await customers.PATCH(req('/api/customers','PATCH',{id:'00000000-0000-4000-8000-000000000099',name:'x'},adminToken))).status,404);

  // Call log: real INSERT into call_logs, not the old fake logEntry — history + next_call_date persist.
  const callKey=randomUUID();
  // Logged by an admin: since 029 a rep may only touch leads assigned to her, and this fixture
  // belongs to صابرين. The rule itself is covered in test_access_control; what matters here is that
  // the call log is a real INSERT that persists.
  const callRes=await calls.POST(req('/api/calls','POST',{customer_id:editTarget,outcome:'answered',notes:'تم الاتفاق على الطلب',next_call_date:'2026-09-25'},adminToken,callKey));
  assert.equal(callRes.status,201);
  const callJson=await callRes.json();
  assert.equal(callJson.customer.next_call_date,'2026-09-25');
  assert.equal(callJson.customer.history.length,1);assert.equal(callJson.customer.history[0].outcome,'answered');
  assert.equal((await db.query('SELECT count(*) AS n FROM call_logs WHERE customer_id=$1',[editTarget])).rows[0].n,1);

  // Idempotency: same key+payload replays without a second row; same key+different payload is rejected.
  const replay=await calls.POST(req('/api/calls','POST',{customer_id:editTarget,outcome:'answered',notes:'تم الاتفاق على الطلب',next_call_date:'2026-09-25'},adminToken,callKey));
  assert.equal(replay.status,200);assert.equal((await replay.json()).replayed,true);
  assert.equal((await db.query('SELECT count(*) AS n FROM call_logs WHERE customer_id=$1',[editTarget])).rows[0].n,1);
  const conflict=await calls.POST(req('/api/calls','POST',{customer_id:editTarget,outcome:'no_answer',notes:'مختلف'},adminToken,callKey));
  assert.equal(conflict.status,409);

  // Unknown customer / bad outcome are rejected before any row is written.
  assert.equal((await calls.POST(req('/api/calls','POST',{customer_id:'00000000-0000-4000-8000-000000000099',outcome:'answered'},adminToken))).status,404);
  assert.equal((await calls.POST(req('/api/calls','POST',{customer_id:editTarget,outcome:'not-a-real-outcome'},adminToken))).status,400);

  // Survives a full close/reopen of the database file (durability, not just an in-memory map).
  await db.close();db=new PGlite(fileURLToPath(dataDir));
  const afterRestart=(await db.query('SELECT count(*) AS n FROM customers WHERE phone IN ($1,$2,$3)',['0791112222','0798887777','000-legacy'])).rows[0].n;
  assert.equal(afterRestart,3);
  const editSurvived=(await db.query('SELECT rep_name_raw,next_call_date::text AS next_call_date FROM customers WHERE id=$1',[editTarget])).rows[0];
  assert.equal(editSurvived.rep_name_raw,'صابرين');assert.equal(editSurvived.next_call_date,'2026-09-25'); // call log's next_call_date won (later write)
  assert.equal((await db.query('SELECT count(*) AS n FROM call_logs WHERE customer_id=$1',[editTarget])).rows[0].n,1);

  console.log('PASS: additive migration preserves legacy customers; lead validation; phone-based idempotent create; auth-gated list; lost-response retry safety; restart durability.');
}finally{await new Promise(r=>server.close(r));await db.close();}
