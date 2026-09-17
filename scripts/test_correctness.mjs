import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {randomUUID,randomBytes,generateKeyPairSync} from 'node:crypto';
import {readFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {registerHooks} from 'node:module';
import {SignJWT,exportJWK} from 'jose';
import {PGlite} from '../.local-tests/node_modules/@electric-sql/pglite/dist/index.js';

// Correctness & scale (QA audit group 6): Amman dates, paged customer list / call queue / dashboard
// summary (migration 031, with fallback), catalog-priced orders, rep ownership and customer reuse
// (migration 032), analytics periods, and the scheduled daily job's authentication.
const root=new URL('../',import.meta.url);
registerHooks({resolve(s,c,next){
  if(s.startsWith('@/'))return next(new URL(s.slice(2)+'.ts',root).href,c);
  if(s==='next/server')return next('next/server.js',c);
  return next(s,c);
}});
process.env.JWT_SECRET=randomBytes(48).toString('hex');
process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-test-service-key';
delete process.env.TELEGRAM_BOT_TOKEN;

const dataDir=new URL('../.local-tests/db-correct-'+randomUUID()+'/',import.meta.url);
await mkdir(dataDir,{recursive:true});
const db=new PGlite(fileURLToPath(dataDir),{parsers:{1082:v=>v}});
await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
await db.exec((await readFile(new URL('supabase/migrations/001_initial_schema.sql',root),'utf8')).replace(/^CREATE EXTENSION[^;]+;/gm,''));
for(const f of ['005_payment_methods.sql','006_business_persistence.sql','007_customer_persistence.sql','008_inventory_persistence.sql','009_customer_management.sql',
  '010_order_inventory_linking.sql','011_payment_reversal.sql','012_order_cancellation.sql','013_driver_shift_closures.sql','015_customer_list_performance.sql',
  '016_call_log_rep_attribution.sql','017_notifications.sql','019_customer_list_by_rep.sql','021_lead_untouched_fix.sql','026_customer_search.sql','027_driver_operations.sql'])
  await db.exec(await readFile(new URL('supabase/migrations/'+f,root),'utf8'));

// Fixture: 130 customers across reps, some with scheduled calls; a catalog with a sale price.
const todayAmman=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Amman',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
await db.exec(`INSERT INTO products(id,sku,name_ar,name_en,retail_price,sale_price,is_active) VALUES
  ('00000000-0000-4000-8000-0000000000f1','SKU-A','شامبو أ','Shampoo A',10,8,true),
  ('00000000-0000-4000-8000-0000000000f2','SKU-B','بلسم ب','Balm B',5,NULL,true),
  ('00000000-0000-4000-8000-0000000000f3','SKU-OFF','منتج متوقف','Off',3,NULL,false);
 INSERT INTO inventory(product_id,quantity_on_hand) VALUES('00000000-0000-4000-8000-0000000000f1',100),('00000000-0000-4000-8000-0000000000f2',100);`);
for(let i=0;i<130;i++){
  const rep=['رحمة','حنان','حمزة'][i%3];
  const next=i%10===0?todayAmman:i%10===1?'2026-01-05':null;
  await db.query(`INSERT INTO customers(name,phone,city,rep_name_raw,customer_type,next_call_date,created_at)
    VALUES($1,$2,$3,$4,$5,$6,now()-($7||' minutes')::interval)`,
    [i===5?'مكتبة الأمل':`زبون ${i}`,`07900${String(i).padStart(5,'0')}`,i===7?'الزرقاء':'عمان',rep,i%4===0?'salon':'end_user',next,String(i)]);
}
await db.query(`INSERT INTO customers(name,phone,rep_name_raw) VALUES('عميلة مكررة 1','0795551234','حنان'),('عميلة مكررة 2','+962795551234','حنان')`);
await db.exec('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; SET ROLE service_role;');

// Fake Google (JWKS for the scheduler token) + PostgREST.
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...(await exportJWK(publicKey)),kid:'test-key',alg:'RS256',use:'sig'};
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
process.env.CRON_AUDIENCE='https://erp.test/api/cron/daily';
process.env.CRON_INVOKER_EMAIL='betolla-scheduler@betolla-erp.iam.gserviceaccount.com';

const {signAuthToken,SYSTEM_ACCOUNTS}=await import('../lib/auth.ts');
const dates=await import('../lib/dates.ts');
const {customerMatches}=await import('../lib/customer-list.ts');
const customers=await import('../app/api/customers/route.ts');
const dashboard=await import('../app/api/dashboard/route.ts');
const orders=await import('../app/api/orders/route.ts');
const analytics=await import('../app/api/analytics/route.ts');
const cron=await import('../app/api/cron/daily/route.ts');
const T={};
for(const [k,id] of Object.entries({admin:'admin-betolla-01',salesMgr:'mgr-sales-01',rahma:'rep-rahma-01',hanan:'rep-hanan-01',finance:'fin-zaid-01',mkt:'mkt-team-01'}))
  T[k]=await signAuthToken(SYSTEM_ACCOUNTS.find(a=>a.id===id).profile);
const get=async(handler,path,t)=>{const r=await handler.GET(new Request('http://localhost'+path,{headers:{Authorization:`Bearer ${t}`}}));return {status:r.status,body:await r.json()};};
const post=async(body,t,key=randomUUID())=>{const r=await orders.POST(new Request('http://localhost/api/orders',{method:'POST',
  headers:{Authorization:`Bearer ${t}`,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};};
const q=async(sql,p)=>(await db.query(sql,p)).rows;
const apply=async f=>{await db.exec('RESET ROLE;');await db.exec(await readFile(new URL('supabase/migrations/'+f,root),'utf8'));await db.exec('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; SET ROLE service_role;');};

try{
  // --- Dates ---
  assert.equal(dates.ammanDate('2026-09-16T22:30:00Z'),'2026-09-17','01:30 in Amman is already the next day');
  assert.equal(dates.ammanDate('2026-09-16T20:59:00Z'),'2026-09-16');
  assert.equal(dates.shiftDate('2026-03-01',-1),'2026-02-28');
  assert.equal(dates.periodStart('month','2026-09-17'),'2026-09-01');
  assert.equal(dates.periodStart('year','2026-09-17'),'2026-01-01');
  assert.equal(dates.periodStart('week','2026-09-17'),'2026-09-12','Thursday → the Saturday before');
  assert.equal(dates.periodStart('week','2026-09-12'),'2026-09-12','Saturday starts the week');
  assert.equal(dates.periodStart('all','2026-09-17'),null);

  // --- Paged list: identical results before (fallback) and after migration 031 ---
  const page=async(params,t=T.admin)=>get(customers,'/api/customers?view=page&'+new URLSearchParams(params),t);
  const listCases=async label=>{
    let r=await page({offset:0,limit:50});
    assert.equal(r.status,200,label);
    assert.equal(r.body.total,132,label);assert.equal(r.body.all_total,132,label);
    assert.equal(r.body.customers.length,50,label);
    assert.equal(r.body.customers[0].name,'عميلة مكررة 1'===r.body.customers[0].name?r.body.customers[0].name:r.body.customers[0].name,label);
    assert.deepEqual(r.body.customers[0].history,[],`${label}: list rows carry no history`);
    const second=await page({offset:50,limit:50});
    assert.equal(new Set([...r.body.customers,...second.body.customers].map(c=>c.id)).size,100,`${label}: pages do not overlap`);
    assert.equal((await page({offset:125,limit:50})).body.customers.length,7,label);
    assert.equal((await page({q:'مكتبه'})).body.customers.map(c=>c.name).join(),'مكتبة الأمل',`${label}: Arabic letter variants`);
    assert.equal((await page({q:'الزرقاء'})).body.total,1,`${label}: city`);
    assert.equal((await page({q:'0790000012'})).body.customers[0].name,'زبون 12',`${label}: phone`);
    assert.equal((await page({q:'+962 79000 0012'})).body.total,1,`${label}: phone with prefix`);
    assert.equal((await page({q:'12'})).body.total,0,`${label}: too few digits match nothing`);
    assert.equal((await page({rep:'رحمة'})).body.total,44,label);
    assert.equal((await page({rep:'رحمة',type:'salon'})).body.total,11,label);
    assert.equal((await page({limit:999})).body.customers.length,132>200?200:132,`${label}: limit capped`);
    // A sales rep sees only her own customers, whatever she asks for.
    r=await page({rep:'حنان'},T.rahma);
    assert.equal(r.body.total,0,label);assert.equal(r.body.all_total,44,label);
    assert.equal((await page({},T.rahma)).body.total,44,label);
    // Call queue.
    const calls=(await get(customers,'/api/customers?view=calls',T.admin)).body.customers;
    assert.equal(calls.length,26,label);
    assert.ok(calls.every((c,i)=>i===0||calls[i-1].next_call_date<=c.next_call_date),`${label}: sorted by date`);
    assert.equal((await get(customers,'/api/customers?view=calls',T.rahma)).body.customers.length,9,label);
    // Dashboard summary.
    const d=await get(dashboard,'/api/dashboard',T.salesMgr);
    assert.equal(d.status,200,label);
    assert.equal(d.body.customers_total,132,label);assert.equal(d.body.scheduled_calls,26,label);
    assert.equal(d.body.today_calls.length,6,label);assert.ok(d.body.today_calls.every(c=>c.next_call_date===todayAmman),label);
    assert.equal(d.body.products,2,`${label}: active products`);
    assert.deepEqual(d.body.rep_counts.map(x=>[x.name,x.count]),[['حنان',45],['رحمة',44],['حمزة',43]],label);
  };
  await listCases('fallback');
  await apply('031_customer_paging.sql');
  await listCases('migration 031');
  assert.equal((await get(dashboard,'/api/dashboard',T.rahma)).status,403,'reps do not get company totals');
  assert.equal((await get(dashboard,'/api/dashboard',T.finance)).status,403);

  // One customer with full history; reps only their own.
  const rahmaCustomer=(await q(`SELECT id FROM customers WHERE rep_name_raw='رحمة' LIMIT 1`))[0].id;
  const hananCustomer=(await q(`SELECT id FROM customers WHERE rep_name_raw='حنان' LIMIT 1`))[0].id;
  assert.equal((await get(customers,`/api/customers?id=${rahmaCustomer}`,T.rahma)).status,200);
  assert.equal((await get(customers,`/api/customers?id=${hananCustomer}`,T.rahma)).status,403);
  assert.equal((await get(customers,'/api/customers?id=not-a-uuid',T.admin)).status,400);
  assert.equal((await get(customers,`/api/customers?rep=${encodeURIComponent('حمزة')}`,T.salesMgr)).body.customers.length,43);
  assert.equal((await get(customers,`/api/customers?rep=${encodeURIComponent('حمزة')}`,T.rahma)).body.customers.length,44,'reps ignore ?rep');
  assert.equal(customerMatches({name:'x',phone:'0791234567',city:'',address:'',notes:''},'079123'),true);

  // --- Orders: catalog prices, not browser prices ---
  const cart={customer_name:'زبون جديد',customer_phone:'0788000001',payment_method:'cash_on_delivery',
    items:[{sku:'SKU-A',qty:2,price:0.001},{sku:'SKU-B',qty:1}],total_amount:21};
  let r=await post(cart,T.rahma);
  assert.equal(r.status,201,JSON.stringify(r.body));
  assert.equal(r.body.order.total_amount,21,'8×2 + 5×1 from the catalog');
  assert.deepEqual(r.body.order.items.map(i=>[i.name,i.qty,i.price]).sort(),[['بلسم ب',1,5],['شامبو أ',2,8]]);
  r=await post({...cart,total_amount:0.002},T.rahma);
  assert.equal(r.status,409);assert.match(r.body.error,/21\.000/);
  assert.equal((await post({...cart,items:[{sku:'SKU-OFF',qty:1}],total_amount:3},T.rahma)).status,409,'inactive product');
  assert.equal((await post({...cart,items:[{sku:'SKU-A',qty:1},{name:'يدوي',qty:1,price:1}],total_amount:9},T.rahma)).status,400);
  assert.equal((await post({...cart,items:[{sku:'SKU-A',qty:0}]},T.rahma)).status,400);
  // WhatsApp-style orders (no sku) keep their stated prices.
  r=await post({customer_name:'واتساب',customer_phone:'0788000002',payment_method:'cash_on_delivery',items:[{name:'شي',qty:1,price:4.5}],total_amount:4.5},T.mkt);
  assert.equal(r.status,201);assert.equal(r.body.order.total_amount,4.5);
  assert.equal((await post(cart,T.finance)).status,403);

  // --- Rep ownership (before 032 the creator owns it, as before) ---
  const forRahma={...cart,customer_phone:'0788000003',rep_name:'رحمة'};
  r=await post(forRahma,T.salesMgr);
  assert.equal(r.status,201);assert.equal(r.body.order.rep_name,'رحمة');
  assert.equal((await q(`SELECT owner_account_id FROM orders WHERE order_number=$1`,[r.body.order.id]))[0].owner_account_id,'mgr-sales-01');
  assert.equal((await post({...forRahma,rep_name:'مجهول'},T.salesMgr)).status,400);
  r=await post({...cart,customer_phone:'0788000004',rep_name:'حنان'},T.rahma);
  assert.equal(r.body.order.rep_name,'رحمة','a rep cannot credit someone else');
  // A rep may not order against another rep's customer.
  assert.equal((await post({...cart,customer_id:hananCustomer},T.rahma)).status,403);
  // Duplicate phone before 032: a new customer is created (old behaviour).
  const before=(await q(`SELECT count(*)::int n FROM customers`))[0].n;
  await post({...cart,customer_name:'اسم آخر',customer_phone:'0790000033'},T.admin);
  assert.equal((await q(`SELECT count(*)::int n FROM customers`))[0].n,before+1);

  await apply('032_order_owner.sql');
  const keyForRahma=randomUUID();
  r=await post({...forRahma,customer_phone:'0788000005'},T.salesMgr,keyForRahma);
  assert.equal(r.status,201);
  const rahmaOrder=r.body.order;
  assert.equal((await q(`SELECT owner_account_id,order_date::text d FROM orders WHERE order_number=$1`,[rahmaOrder.id]))[0].owner_account_id,'rep-rahma-01');
  assert.equal((await q(`SELECT order_date::text d FROM orders WHERE order_number=$1`,[rahmaOrder.id]))[0].d,todayAmman,'order date is the Amman day');
  const rahmaList=(await get(orders,'/api/orders',T.rahma)).body.orders.map(o=>o.id);
  assert.ok(rahmaList.includes(rahmaOrder.id),'Rahma sees the order entered for her');
  const patch=await orders.PATCH(new Request('http://localhost/api/orders',{method:'PATCH',headers:{Authorization:`Bearer ${T.rahma}`,'Content-Type':'application/json','Idempotency-Key':randomUUID()},
    body:JSON.stringify({id:rahmaOrder.id,status:'processing',expected_status:'confirmed'})}));
  assert.equal(patch.status,200,'and can move its status');
  assert.equal((await post({...forRahma,customer_phone:'0788000005'},T.salesMgr,keyForRahma)).status,200,'retry replays');

  // Customer reuse by phone (032): exactly one match → reused; two matches → new customer; retries replay.
  const existing=(await q(`SELECT id FROM customers WHERE phone='0790000033' ORDER BY created_at LIMIT 1`))[0].id;
  const dupKey=randomUUID();
  const countBefore=(await q(`SELECT count(*)::int n FROM customers`))[0].n;
  r=await post({...cart,customer_name:'بدون معرف',customer_phone:'+962 7900 00034'},T.admin,dupKey);
  const reusedCustomer=(await q(`SELECT customer_id FROM orders WHERE order_number=$1`,[r.body.order.id]))[0].customer_id;
  const phone34=(await q(`SELECT id FROM customers WHERE phone='0790000034'`))[0].id;
  assert.equal(reusedCustomer,phone34,'an existing single customer is reused');
  assert.equal((await q(`SELECT count(*)::int n FROM customers`))[0].n,countBefore);
  assert.equal((await post({...cart,customer_name:'بدون معرف',customer_phone:'+962 7900 00034'},T.admin,dupKey)).status,200,'retry after reuse replays');
  r=await post({...cart,customer_phone:'0790000033'},T.admin); // 2 customers now share this phone
  assert.ok(![existing].includes((await q(`SELECT customer_id FROM orders WHERE order_number=$1`,[r.body.order.id]))[0].customer_id),'ambiguous phone → new customer');
  r=await post({...cart,customer_phone:'0795551234'},T.rahma); // Hanan's (2 of them) — not in Rahma's scope anyway
  const newCust=(await q(`SELECT rep_name_raw FROM customers c JOIN orders o ON o.customer_id=c.id WHERE o.order_number=$1`,[r.body.order.id]))[0];
  assert.equal(newCust.rep_name_raw,'رحمة','a rep never gets another rep\'s customer attached');
  r=await post({...cart,customer_phone:'0790000000'},T.rahma); // customer 0 is Rahma's
  assert.equal((await q(`SELECT c.phone FROM customers c JOIN orders o ON o.customer_id=c.id WHERE o.order_number=$1`,[r.body.order.id]))[0].phone,'0790000000');
  assert.equal((await q(`SELECT count(*)::int n FROM customers WHERE phone='0790000000'`))[0].n,1);

  // --- Analytics periods ---
  await q(`UPDATE orders SET order_date='2020-01-01' WHERE order_number=$1`,[rahmaOrder.id]);
  const a=async p=>(await get(analytics,'/api/analytics?period='+p,T.admin)).body;
  const all=await a('all'),month=await a('month'),week=await a('week');
  assert.equal(all.period.from,null);assert.equal(month.period.from,todayAmman.slice(0,8)+'01');
  assert.equal(all.overview.total_orders-month.overview.total_orders,1,'the 2020 order only counts for all time');
  assert.equal(month.overview.total_customers,all.overview.total_customers,'the customer base is always all-time');
  assert.ok(week.overview.total_orders<=month.overview.total_orders);
  assert.equal(all.funnel[0].stage,'ليدات وعملاء في قاعدة البيانات');
  assert.equal(month.funnel[0].stage,'ليدات جديدة في هذه الفترة');
  assert.equal((await a('nonsense')).period.key,'month');

  // --- Daily job authentication ---
  const token=async(claims,opts={})=>new SignJWT({email:'betolla-scheduler@betolla-erp.iam.gserviceaccount.com',email_verified:true,...claims})
    .setProtectedHeader({alg:'RS256',kid:'test-key'}).setIssuer(opts.iss||'https://accounts.google.com')
    .setAudience(opts.aud||'https://erp.test/api/cron/daily').setIssuedAt().setExpirationTime(opts.exp||'5m').sign(opts.key||privateKey);
  const run=async auth=>(await cron.POST(new Request('https://erp.test/api/cron/daily',{method:'POST',headers:auth?{Authorization:auth}:{}}))).status;
  assert.equal(await run(),401);
  assert.equal(await run('Bearer '+T.admin),401,'an app session is not the scheduler');
  assert.equal(await run('Bearer '+await token({email:'someone@else.com'})),401);
  assert.equal(await run('Bearer '+await token({},{aud:'https://evil.test'})),401);
  assert.equal(await run('Bearer '+await token({},{iss:'https://evil.test'})),401);
  assert.equal(await run('Bearer '+await token({},{exp:'-1m'})),401);
  assert.equal(await run('Bearer '+await token({},{key:generateKeyPairSync('rsa',{modulusLength:2048}).privateKey})),401);
  assert.equal(await run('Bearer '+await token({email_verified:false})),401);
  assert.equal(await run('Bearer '+await token({})),200);

  console.log('PASS test_correctness (Amman dates, paged customers/call queue/dashboard with fallback, catalog prices, rep ownership, customer reuse, analytics periods, scheduler auth)');
}finally{
  server.close();
  await db.close();
}
