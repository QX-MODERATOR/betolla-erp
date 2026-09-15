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
const {signAuthToken}=await import('../lib/auth.ts');
const {prepareLead}=await import('../lib/business-server.ts');
const leads=await import('../app/api/leads/route.ts');
const customers=await import('../app/api/customers/route.ts');
const admin={id:'admin-betolla-01',username:'admin',name:'Test Admin',role:'admin'};
const rep={id:'rep-rahma-01',username:'rahma',name:'Test Rep',role:'sales_rep',repId:'rahma'};
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
for(const file of ['005_payment_methods.sql','006_business_persistence.sql','007_customer_persistence.sql'])await db.exec(await readFile(new URL('supabase/migrations/'+file,root),'utf8'));
assert.deepEqual((await db.query('SELECT id,name,phone FROM customers')).rows,before);
await db.exec('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;');
await db.exec('SET ROLE anon;');
await assert.rejects(db.query('SELECT business_customer_list()'),/permission denied/);
await db.exec('RESET ROLE;');
await db.exec('SET ROLE service_role;');
const rpcArgs={business_customer_list:[],business_customer_create:['p_data']};
let failNext=false;
const server=createServer(async(req,res)=>{
  try{
    if(failNext){failNext=false;res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'unavailable'}));return;}
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
const req=(path,method='GET',body,token)=>new Request('http://localhost'+path,{method,
 headers:{...(token?{Authorization:`Bearer ${token}`}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
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
  const list=await (await customers.GET(req('/api/customers','GET',undefined,repToken))).json();
  assert.ok(list.customers.find(c=>c.phone==='0791112222'));
  assert.ok(list.customers.find(c=>c.phone==='000-legacy'));
  assert.equal(list.customers[0].phone,'0791112222'); // most recently created first

  // Retry-after-lost-response: the RPC layer degrades to a clean 503, never a duplicate write.
  failNext=true;
  assert.equal((await leads.POST(req('/api/leads','POST',{phone:'0798887777'}))).status,503);
  assert.equal((await db.query('SELECT count(*) AS n FROM customers WHERE phone=$1',['0798887777'])).rows[0].n,0);
  const retry=await leads.POST(req('/api/leads','POST',{phone:'0798887777'}));assert.equal(retry.status,201);
  assert.equal((await db.query('SELECT count(*) AS n FROM customers WHERE phone=$1',['0798887777'])).rows[0].n,1);

  // Survives a full close/reopen of the database file (durability, not just an in-memory map).
  await db.close();db=new PGlite(fileURLToPath(dataDir));
  const afterRestart=(await db.query('SELECT count(*) AS n FROM customers WHERE phone IN ($1,$2,$3)',['0791112222','0798887777','000-legacy'])).rows[0].n;
  assert.equal(afterRestart,3);

  console.log('PASS: additive migration preserves legacy customers; lead validation; phone-based idempotent create; auth-gated list; lost-response retry safety; restart durability.');
}finally{await new Promise(r=>server.close(r));await db.close();}
