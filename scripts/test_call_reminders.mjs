import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {randomUUID,randomBytes,generateKeyPairSync} from 'node:crypto';
import {readFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {registerHooks} from 'node:module';
import {SignJWT,exportJWK} from 'jose';
import {PGlite} from '../.local-tests/node_modules/@electric-sql/pglite/dist/index.js';

// In-app call reminders (migration 033): call times are stored in Amman time, reps get a bell +
// push reminder 10 minutes before each call (once), and a morning summary (once a day).
const root=new URL('../',import.meta.url);
registerHooks({resolve(s,c,next){
  if(s.startsWith('@/'))return next(new URL(s.slice(2)+'.ts',root).href,c);
  if(s==='next/server')return next('next/server.js',c);
  return next(s,c);
}});
process.env.JWT_SECRET=randomBytes(48).toString('hex');
process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-test-service-key';
delete process.env.TELEGRAM_BOT_TOKEN;

const dataDir=new URL('../.local-tests/db-remind-'+randomUUID()+'/',import.meta.url);
await mkdir(dataDir,{recursive:true});
const db=new PGlite(fileURLToPath(dataDir),{parsers:{1082:v=>v}});
await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
await db.exec((await readFile(new URL('supabase/migrations/001_initial_schema.sql',root),'utf8')).replace(/^CREATE EXTENSION[^;]+;/gm,''));
for(const f of ['005_payment_methods.sql','006_business_persistence.sql','007_customer_persistence.sql','009_customer_management.sql','010_order_inventory_linking.sql',
  '012_order_cancellation.sql','013_driver_shift_closures.sql','015_customer_list_performance.sql','016_call_log_rep_attribution.sql','017_notifications.sql',
  '019_customer_list_by_rep.sql','021_lead_untouched_fix.sql','027_driver_operations.sql','029_customer_ownership.sql','031_customer_paging.sql'])
  await db.exec(await readFile(new URL('supabase/migrations/'+f,root),'utf8'));
await db.exec(`INSERT INTO customers(id,name,phone,rep_name_raw) VALUES
  ('00000000-0000-4000-8000-0000000000a1','عميلة رحمة','0791110001','رحمة'),
  ('00000000-0000-4000-8000-0000000000a2','عميل حمزة','0791110002','حمزة'),
  ('00000000-0000-4000-8000-0000000000a3','عميلة ثانية','0791110003','رحمة');`);
await db.exec('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; SET ROLE service_role;');

const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...(await exportJWK(publicKey)),kid:'k1',alg:'RS256',use:'sig'};
const server=createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  const path=req.url.split('?')[0];
  const reply=(status,obj)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(obj));};
  if(path==='/certs')return reply(200,{keys:[jwk]});
  if(!path.includes('/rpc/'))return reply(404,{message:'no table'});
  const name=path.split('/').at(-1);
  const body=raw?JSON.parse(raw):{};const keys=Object.keys(body);
  if(!(await db.query(`SELECT 1 FROM pg_proc WHERE proname=$1`,[name])).rows.length)return reply(404,{code:'PGRST202',message:'Could not find the function'});
  try{
    const values=keys.map(k=>Array.isArray(body[k])?body[k]:body[k]!==null&&typeof body[k]==='object'?JSON.stringify(body[k]):body[k]);
    const r=await db.query(`SELECT ${name}(${keys.map((k,i)=>`${k} => $${i+1}`).join(',')}) AS result`,values);
    reply(200,r.rows[0].result);
  }catch(e){reply(400,{message:e.message});}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
process.env.NEXT_PUBLIC_SUPABASE_URL=base;
process.env.CRON_JWKS_URL=base+'/certs';
process.env.CRON_AUDIENCE_BASE='https://erp.test';

const {signAuthToken,SYSTEM_ACCOUNTS}=await import('../lib/auth.ts');
const calls=await import('../app/api/calls/route.ts');
const customers=await import('../app/api/customers/route.ts');
const reminders=await import('../app/api/cron/reminders/route.ts');
const daily=await import('../app/api/cron/daily/route.ts');
const rahmaT=await signAuthToken(SYSTEM_ACCOUNTS.find(a=>a.id==='rep-rahma-01').profile);
const adminT=await signAuthToken(SYSTEM_ACCOUNTS.find(a=>a.id==='admin-betolla-01').profile);
const q=async(sql,p)=>(await db.query(sql,p)).rows;
const A='00000000-0000-4000-8000-0000000000a1',H='00000000-0000-4000-8000-0000000000a2',B='00000000-0000-4000-8000-0000000000a3';
const logCall=async(body,t=rahmaT)=>{const r=await calls.POST(new Request('http://localhost/api/calls',{method:'POST',
  headers:{Authorization:`Bearer ${t}`,'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify({outcome:'answered',...body})}));return {status:r.status,body:await r.json()};};
const edit=async(body,t=adminT)=>{const r=await customers.PATCH(new Request('http://localhost/api/customers',{method:'PATCH',
  headers:{Authorization:`Bearer ${t}`,'Content-Type':'application/json'},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};};
const token=async(path,claims={})=>new SignJWT({email:'betolla-scheduler@betolla-erp.iam.gserviceaccount.com',email_verified:true,...claims})
  .setProtectedHeader({alg:'RS256',kid:'k1'}).setIssuer('https://accounts.google.com').setAudience('https://erp.test'+path)
  .setIssuedAt().setExpirationTime('5m').sign(privateKey);
const cron=async(mod,path,auth)=>{const r=await mod.POST(new Request('https://erp.test'+path,{method:'POST',headers:auth?{Authorization:'Bearer '+auth}:{}}));return {status:r.status,body:await r.json()};};
const bell=async()=>q(`SELECT username,type,title,body,link FROM notifications ORDER BY created_at`);
const amman=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Amman'}).format(d);

try{
  // Before migration 033: sending a time is harmless (ignored).
  let r=await logCall({customer_id:A,next_call_date:'2030-05-01',next_call_time:'11:30'});
  assert.equal(r.status,201,JSON.stringify(r.body));
  assert.equal((await logCall({customer_id:A,next_call_date:'2030-05-01',next_call_time:'25:99'})).status,400);

  await db.exec('RESET ROLE;');
  await db.exec(await readFile(new URL('supabase/migrations/033_call_reminders.sql',root),'utf8'));
  await db.exec('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; SET ROLE anon;');
  await assert.rejects(db.query(`SELECT * FROM call_reminders_sent`),/permission denied/);
  await db.exec('RESET ROLE; SET ROLE service_role;');

  // The time is stored as an Amman moment (UTC+3 in May 2030).
  r=await logCall({customer_id:A,next_call_date:'2030-05-01',next_call_time:'11:30'});
  assert.equal(r.status,201);
  assert.equal(new Date(r.body.customer.next_call_at).toISOString(),'2030-05-01T08:30:00.000Z');
  assert.deepEqual(await q(`SELECT next_call_at IS NOT NULL t FROM call_logs ORDER BY called_at DESC LIMIT 1`),[{t:true}]);
  // No time → date-only call; time without a date is ignored.
  r=await logCall({customer_id:B,next_call_date:'2030-05-02'});
  assert.equal(r.body.customer.next_call_at,null);
  r=await logCall({customer_id:B,next_call_time:'09:00'});
  assert.equal(r.body.customer.next_call_date,'2030-05-02');assert.equal(r.body.customer.next_call_at,null);

  // Editing a customer keeps the time unless the date changes or a new time is given.
  r=await edit({id:A,notes:'x',next_call_date:'2030-05-01'});
  assert.equal(new Date(r.body.customer.next_call_at).toISOString(),'2030-05-01T08:30:00.000Z');
  r=await edit({id:A,next_call_date:'2030-05-01',next_call_time:'16:00'});
  assert.equal(new Date(r.body.customer.next_call_at).toISOString(),'2030-05-01T13:00:00.000Z');
  assert.ok((await q(`SELECT changes FROM customer_changes ORDER BY changed_at DESC LIMIT 1`))[0].changes.next_call_at,'time changes are in the history');
  r=await edit({id:A,next_call_date:'2030-05-03'});
  assert.equal(r.body.customer.next_call_at,null,'a new date without a time drops the old time');
  assert.equal((await edit({id:A,next_call_date:'2030-05-03',next_call_time:'7pm'})).status,400);

  // Call schedule shows the time and orders by it.
  await logCall({customer_id:B,next_call_date:'2030-05-03',next_call_time:'09:15'});
  const queue=(await (await customers.GET(new Request('http://localhost/api/customers?view=calls',{headers:{Authorization:`Bearer ${rahmaT}`}}))).json()).customers;
  assert.deepEqual(queue.map(c=>c.id),[B,A],'09:15 first, then the call without a time');
  assert.ok(queue[0].next_call_at);

  // --- Reminders ---
  assert.equal((await cron(reminders,'/api/cron/reminders')).status,401);
  assert.equal((await cron(reminders,'/api/cron/reminders',await token('/api/cron/daily'))).status,401,'a token for another job is refused');
  const soon=new Date(Date.now()+5*60000),later=new Date(Date.now()+30*60000),longAgo=new Date(Date.now()-3*3600000);
  const hhmm=d=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Amman',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);
  await q(`UPDATE customers SET next_call_date=$2::date,next_call_at=$3 WHERE id=$1`,[A,amman(soon),soon.toISOString()]);
  await q(`UPDATE customers SET next_call_date=$2::date,next_call_at=$3 WHERE id=$1`,[H,amman(soon),soon.toISOString()]); // حمزة has no login
  await q(`UPDATE customers SET next_call_date=$2::date,next_call_at=$3 WHERE id=$1`,[B,amman(later),later.toISOString()]);
  const before=(await bell()).length;
  r=await cron(reminders,'/api/cron/reminders',await token('/api/cron/reminders'));
  assert.equal(r.status,200);assert.equal(r.body.call_reminders_sent,1);
  let notes=(await bell()).slice(before);
  assert.equal(notes.length,1);
  assert.deepEqual({...notes[0],title:undefined},{username:'rahma.sales',type:'call_reminder',title:undefined,body:'رقم الهاتف: 0791110001',link:'/calls'});
  assert.equal(notes[0].title,`تذكير: اتصال مع عميلة رحمة الساعة ${hhmm(soon)}`);
  // Each reminder once.
  r=await cron(reminders,'/api/cron/reminders',await token('/api/cron/reminders'));
  assert.equal(r.body.call_reminders_sent,0);
  // Moving the call makes a new reminder; a call far in the past is not reminded.
  const moved=new Date(Date.now()+8*60000);
  await q(`UPDATE customers SET next_call_at=$2 WHERE id=$1`,[A,moved.toISOString()]);
  await q(`UPDATE customers SET next_call_at=$2 WHERE id=$1`,[B,longAgo.toISOString()]);
  r=await cron(reminders,'/api/cron/reminders',await token('/api/cron/reminders'));
  assert.equal(r.body.call_reminders_sent,1);
  assert.equal((await bell()).at(-1).title,`تذكير: اتصال مع عميلة رحمة الساعة ${hhmm(moved)}`);

  // --- Morning summary: once per day ---
  const today=amman(new Date());
  await q(`UPDATE customers SET next_call_date=$2::date WHERE id=$1`,[B,'2020-01-01']); // overdue
  const beforeDigest=(await bell()).length;
  r=await cron(daily,'/api/cron/daily',await token('/api/cron/daily'));
  assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.call_digests_sent,1);
  notes=(await bell()).slice(beforeDigest).filter(n=>n.type==='call_digest');
  assert.equal(notes.length,1);assert.equal(notes[0].username,'rahma.sales');
  assert.equal(notes[0].title,'لديك 1 اتصال مجدول اليوم');
  assert.match(notes[0].body,new RegExp(`أول اتصال الساعة ${hhmm(moved)}`));
  assert.match(notes[0].body,/1 اتصال متأخر/);
  r=await cron(daily,'/api/cron/daily',await token('/api/cron/daily'));
  assert.equal(r.body.call_digests_sent,0,'not twice on the same day');
  assert.deepEqual(await q(`SELECT task,run_key FROM scheduled_task_runs`),[{task:'call_digest',run_key:today}]);

  console.log('PASS test_call_reminders (Amman call times, edit rules, schedule order, reminders once per time, reps without login skipped, daily summary once)');
}finally{
  server.close();
  await db.close();
}
