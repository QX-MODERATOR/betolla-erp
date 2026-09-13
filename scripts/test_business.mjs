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
const {financeSummary}=await import('../lib/business.ts');
const {prepareOrder}=await import('../lib/business-server.ts');
const orders=await import('../app/api/orders/route.ts');
const finance=await import('../app/api/finance/route.ts');
const admin={id:'admin-betolla-01',username:'admin',name:'Test Admin',role:'admin'};
const rep={id:'rep-rahma-01',username:'rahma',name:'Test Rep',role:'sales_rep',repId:'rahma'};
const adminToken=await signAuthToken(admin),repToken=await signAuthToken(rep);
const dataDir=new URL('../.local-tests/db-'+randomUUID()+'/',import.meta.url);
await mkdir(dataDir,{recursive:true});
let db=new PGlite(fileURLToPath(dataDir));
await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
const initial=await readFile(new URL('supabase/migrations/001_initial_schema.sql',root),'utf8');
// pgcrypto/uuid-ossp are not needed: the baseline uses native gen_random_uuid().
await db.exec(initial.replace(/^CREATE EXTENSION[^;]+;/gm,''));
await db.exec(`INSERT INTO customers(id,name,phone) VALUES('00000000-0000-4000-8000-000000000001','Legacy fixture','000');
 INSERT INTO orders(id,order_number,customer_id,total_amount,status) VALUES('00000000-0000-4000-8000-000000000002','LEGACY-ORDER','00000000-0000-4000-8000-000000000001',20,'confirmed');
 INSERT INTO invoices(id,invoice_number,order_id,customer_id,total_amount) VALUES('00000000-0000-4000-8000-000000000003','LEGACY-INVOICE','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',20);
 INSERT INTO payments(invoice_id,amount) VALUES('00000000-0000-4000-8000-000000000003',3);`);
const before=(await db.query('SELECT amount FROM payments')).rows;
for(const file of ['005_payment_methods.sql','006_business_persistence.sql'])await db.exec(await readFile(new URL('supabase/migrations/'+file,root),'utf8'));
assert.deepEqual((await db.query('SELECT amount FROM payments')).rows,before);
await db.exec('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;');
await db.exec('SET ROLE anon;');
await assert.rejects(db.query('SELECT business_list(NULL)'),/permission denied/);
await db.exec('RESET ROLE;');
await db.exec('SET ROLE service_role;');
const rpcArgs={business_list:['p_scope'],business_create_order:['p_actor','p_key','p_data'],business_collect:['p_actor','p_key','p_data'],business_status:['p_actor','p_scope','p_key','p_data']};
let failNext=false,loseNext=false;
const server=createServer(async(req,res)=>{
  try{
    if(failNext){failNext=false;res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'unavailable'}));return;}
    let raw='';for await(const chunk of req)raw+=chunk;
    const name=req.url.split('/').at(-1),names=rpcArgs[name];
    if(!names)throw new Error('Unexpected RPC');
    const body=JSON.parse(raw);
    const values=names.map(n=>n==='p_data'?JSON.stringify(body[n]):body[n]);
    const result=await db.query(`SELECT ${name}(${names.map((_,i)=>'$'+(i+1)).join(',')}) AS result`,values);
    if(loseNext){loseNext=false;req.socket.destroy();return;}
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result.rows[0].result));
  }catch(error){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({message:error.message,code:error.code}));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
process.env.NEXT_PUBLIC_SUPABASE_URL=`http://127.0.0.1:${server.address().port}`;
const req=(path,method='GET',body,token=adminToken,key=randomUUID())=>new Request('http://localhost'+path,{method,
 headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Idempotency-Key':key},...(body?{body:JSON.stringify(body)}:{})});
const orderData={customer_name:'Fixture Customer',customer_phone:'0000000',total_amount:10.001,payment_method:'installment',
 items:[{name:'Fixture A',qty:2,price:5},{name:'Fixture B',qty:1,price:0.001}]};
try{
  const key=randomUUID();
  const created=await orders.POST(req('/api/orders','POST',orderData,repToken,key));assert.equal(created.status,201);
  const {order}=await created.json();assert.equal(order.items.length,2);assert.equal(order.total_amount,10.001);
  const replay=await orders.POST(req('/api/orders','POST',orderData,repToken,key));assert.equal(replay.status,200);
  assert.equal((await replay.json()).order.id,order.id);
  assert.equal((await orders.POST(req('/api/orders','POST',{...orderData,total_amount:11},repToken,key))).status,400);
  const changed={...orderData,customer_name:'Changed'};
  assert.equal((await orders.POST(req('/api/orders','POST',changed,repToken,key))).status,409);
  const repList=await (await orders.GET(req('/api/orders','GET',undefined,repToken))).json();assert.equal(repList.orders.length,1);
  assert.equal((await finance.GET(req('/api/finance','GET',undefined,repToken))).status,403);
  assert.equal((await orders.GET(req('/api/orders','GET',undefined,'invalid'))).status,401);
  let invoices=(await (await finance.GET(req('/api/finance'))).json()).invoices;
  assert.equal(invoices.find(i=>i.id==='LEGACY-INVOICE').outstanding_amount,17);
  const invoice=invoices.find(i=>i.order_id===order.id);
  const pay={invoice_id:invoice.id,amount:4.001,payment_method:'cliq',reference_number:'TEST-REF'};
  const payKey=randomUUID();
  const duplicate=await Promise.all([finance.POST(req('/api/finance','POST',pay,adminToken,payKey)),finance.POST(req('/api/finance','POST',pay,adminToken,payKey))]);
  for(const result of duplicate){assert.equal(result.status,200);const saved=(await result.json()).invoice;assert.equal(saved.paid_amount,4.001);assert.equal(saved.outstanding_amount,6);assert.equal(saved.status,'partial');}
  assert.equal((await finance.POST(req('/api/finance','POST',pay))).status,409);
  assert.equal((await finance.POST(req('/api/finance','POST',{...pay,amount:5},adminToken,payKey))).status,409);
  for(const amount of [-1,0,NaN,'Infinity',true,0.0001])assert.equal((await finance.POST(req('/api/finance','POST',{...pay,amount}))).status,400);
  assert.equal((await finance.POST(req('/api/finance','POST',{...pay,amount:7,payment_method:'cash',reference_number:''}))).status,409);
  const failureKey=randomUUID(),cash={invoice_id:invoice.id,amount:1,payment_method:'cash',reference_number:''};
  failNext=true;assert.equal((await finance.POST(req('/api/finance','POST',cash,adminToken,failureKey))).status,503);
  loseNext=true;assert.equal((await finance.POST(req('/api/finance','POST',cash,adminToken,failureKey))).status,503);
  const retry=await finance.POST(req('/api/finance','POST',cash,adminToken,failureKey));assert.equal(retry.status,200);
  assert.equal((await retry.json()).invoice.paid_amount,5.001);
  const final=await finance.POST(req('/api/finance','POST',{...cash,amount:5,payment_method:'zain_cash',reference_number:'ZAIN-TEST'}));
  const settled=(await final.json()).invoice;assert.equal(settled.paid_amount,10.001);assert.equal(settled.outstanding_amount,0);assert.equal(settled.status,'paid');
  const statusKey=randomUUID(),patch={id:order.id,expected_status:'confirmed',status:'processing'};
  assert.equal((await orders.PATCH(req('/api/orders','PATCH',patch,repToken,statusKey))).status,200);
  assert.equal((await orders.PATCH(req('/api/orders','PATCH',patch,repToken,statusKey))).status,200);
  assert.equal((await orders.PATCH(req('/api/orders','PATCH',patch,repToken))).status,409);
  assert.equal((await orders.PATCH(req('/api/orders','PATCH',{id:'LEGACY-ORDER',expected_status:'confirmed',status:'processing'},repToken))).status,403);
  for(const [previous,next] of [['processing','shipped'],['shipped','returned']])assert.equal((await orders.PATCH(req('/api/orders','PATCH',{id:order.id,expected_status:previous,status:next},repToken))).status,200);
  const held=(await (await finance.GET(req('/api/finance'))).json()).invoices.find(i=>i.id===invoice.id);
  assert.equal(held.outstanding_amount,0);assert.equal(held.credit_amount,10.001);
  assert.equal((await finance.POST(req('/api/finance','POST',cash))).status,409);
  const customerCount=(await db.query('SELECT count(*) AS n FROM customers')).rows[0].n;
  await assert.rejects(db.query('SELECT business_create_order($1,$2,$3)',[admin.id,randomUUID(),JSON.stringify({...orderData,items:[{name:'bad',qty:0}],status:'confirmed'})]),/INVALID_ITEMS/);
  assert.equal((await db.query('SELECT count(*) AS n FROM customers')).rows[0].n,customerCount);
  assert.equal(financeSummary([]).collection_rate_percent,0);
  await db.close();db=new PGlite(fileURLToPath(dataDir));
  invoices=(await (await finance.GET(req('/api/finance'))).json()).invoices;
  assert.equal(invoices.find(i=>i.id===invoice.id).paid_amount,10.001);
  assert.equal((await db.query('SELECT count(*) AS n FROM payments')).rows[0].n,4);
  const parsed=prepareOrder({rawText:'عميل تجريبي\n0790000000\nعمان\n2 شامبو بلازما\n24 د'},'Test Rep');assert.ok(parsed.items.length);
  const raw=await orders.POST(req('/api/orders','POST',{rawText:'عميل تجريبي\n0790000000\nعمان\n2 شامبو بلازما\n24 د'}));
  assert.equal(raw.status,201);assert.equal((await raw.json()).order.items[0].price,null);
  console.log('PASS: additive migrations; legacy balances; order/items/invoice atomicity; partial/full JOD payments; duplicates/conflicts; invalid/overpayments; response-loss retry; status/role checks; rollback; close/reopen persistence.');
}finally{await new Promise(r=>server.close(r));await db.close();}
