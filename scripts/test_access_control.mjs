import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {registerHooks} from 'node:module';
import {PGlite} from '../.local-tests/node_modules/@electric-sql/pglite/dist/index.js';

// Access control by action (QA audit group 5): opening a route no longer implies being allowed to
// change things there; sales reps only touch their own leads; customer edits are recorded.
const root=new URL('../',import.meta.url);
registerHooks({resolve(s,c,next){
  if(s.startsWith('@/'))return next(new URL(s.slice(2)+'.ts',root).href,c);
  if(s==='next/server')return next('next/server.js',c);
  // lib/profile-server.ts uses extensionless relative imports.
  if(s.startsWith('./')&&c.parentURL?.startsWith(new URL('lib/',root).href)&&!/\.[a-z]+$/.test(s))return next(new URL(s+'.ts',c.parentURL).href,c);
  return next(s,c);
}});
process.env.JWT_SECRET=randomBytes(48).toString('hex');
process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-test-service-key';
delete process.env.TELEGRAM_BOT_TOKEN;
const {signAuthToken,SYSTEM_ACCOUNTS,isRouteAllowedForRole}=await import('../lib/auth.ts');
const {can,PERMISSIONS}=await import('../lib/permissions.ts');
const orders=await import('../app/api/orders/route.ts');
const inventory=await import('../app/api/inventory/route.ts');
const finance=await import('../app/api/finance/route.ts');
const customers=await import('../app/api/customers/route.ts');
const calls=await import('../app/api/calls/route.ts');
const telegram=await import('../app/api/telegram/route.ts');
const profile=await import('../app/api/profile/route.ts');

const ids={admin:'admin-betolla-01',salesMgr:'mgr-sales-01',rahma:'rep-rahma-01',hanan:'rep-hanan-01',mktMgr:'mgr-mkt-01',mkt:'mkt-team-01',
  finance:'fin-zaid-01',hr:'hr-ops-01',drvMgr:'mgr-diya-01',driver:'drv-khalid-01'};
const T={};
for(const [k,id] of Object.entries(ids)){const acc=SYSTEM_ACCOUNTS.find(a=>a.id===id);assert.ok(acc,id);T[k]=await signAuthToken(acc.profile);}

const dataDir=new URL('../.local-tests/db-acl-'+randomUUID()+'/',import.meta.url);
await mkdir(dataDir,{recursive:true});
const db=new PGlite(fileURLToPath(dataDir),{parsers:{1082:v=>v}});
await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
await db.exec((await readFile(new URL('supabase/migrations/001_initial_schema.sql',root),'utf8')).replace(/^CREATE EXTENSION[^;]+;/gm,''));
for(const f of ['005_payment_methods.sql','006_business_persistence.sql','007_customer_persistence.sql','008_inventory_persistence.sql','009_customer_management.sql',
  '010_order_inventory_linking.sql','011_payment_reversal.sql','012_order_cancellation.sql','015_customer_list_performance.sql','016_call_log_rep_attribution.sql',
  '017_notifications.sql','019_customer_list_by_rep.sql','021_lead_untouched_fix.sql'])
  await db.exec(await readFile(new URL('supabase/migrations/'+f,root),'utf8'));
await db.exec(`INSERT INTO customers(id,name,phone,rep_name_raw) VALUES
  ('00000000-0000-4000-8000-0000000000a1','عميلة رحمة','0791110001','رحمة'),
  ('00000000-0000-4000-8000-0000000000a2','عميلة حنان','0791110002','حنان');
 INSERT INTO products(id,sku,name_ar,name_en,is_active) VALUES('00000000-0000-4000-8000-0000000000f1','SKU-ACL','منتج اختبار','Test',true);
 INSERT INTO inventory(product_id,quantity_on_hand) VALUES('00000000-0000-4000-8000-0000000000f1',50);`);
await db.exec('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; SET ROLE service_role;');

// Minimal PostgREST: named-argument RPCs; table reads (profile overrides) answer 404.
const server=createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  const path=req.url.split('?')[0];
  if(!path.includes('/rpc/')){res.writeHead(404,{'Content-Type':'application/json'});res.end('{"message":"no table"}');return;}
  const name=path.split('/').at(-1);
  const body=raw?JSON.parse(raw):{};const keys=Object.keys(body);
  if(!(await db.query(`SELECT 1 FROM pg_proc WHERE proname=$1`,[name])).rows.length){
    res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({code:'PGRST202',message:'Could not find the function'}));return;}
  try{
    const values=keys.map(k=>body[k]!==null&&typeof body[k]==='object'?JSON.stringify(body[k]):body[k]);
    const r=await db.query(`SELECT ${name}(${keys.map((k,i)=>`${k} => $${i+1}`).join(',')}) AS result`,values);
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(r.rows[0].result));
  }catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({message:e.message}));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
process.env.NEXT_PUBLIC_SUPABASE_URL=`http://127.0.0.1:${server.address().port}`;

const call=async(handler,path,method,body,token)=>{
  const r=await handler(new Request('http://localhost'+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Idempotency-Key':randomUUID()},
    ...(body!==undefined?{body:JSON.stringify(body)}:{})}));
  return {status:r.status,body:await r.json()};
};
const q=async(sql,p)=>(await db.query(sql,p)).rows;
const RAHMA_LEAD='00000000-0000-4000-8000-0000000000a1',HANAN_LEAD='00000000-0000-4000-8000-0000000000a2';
const order={customer_name:'زبون',customer_phone:'0790000001',total_amount:5,payment_method:'cash_on_delivery',items:[{name:'شيء',qty:1,price:5}]};

try{
  // --- Matrix sanity ---
  assert.equal(isRouteAllowedForRole('sales_manager','/finance'),false);
  assert.equal(isRouteAllowedForRole('sales_manager','/api/finance'),false);
  assert.equal(isRouteAllowedForRole('sales_manager','/api/inventory'),true,'may still view stock');
  assert.equal(can('sales_rep','inventory.write'),false);
  assert.equal(can(undefined,'orders.create'),false);
  for(const [action,roles] of Object.entries(PERMISSIONS))
    for(const role of ['admin','general_manager'])assert.ok(roles.includes(role),`${role} ${action}`);

  // --- Orders: create = sales + marketing; status = sales + driver manager ---
  const created={};
  for(const who of ['admin','salesMgr','rahma','mktMgr','mkt']){
    const r=await call(orders.POST,'/api/orders','POST',order,T[who]);assert.equal(r.status,201,`${who} create: ${JSON.stringify(r.body)}`);created[who]=r.body.order;
  }
  for(const who of ['finance','hr','drvMgr']){
    const r=await call(orders.POST,'/api/orders','POST',order,T[who]);assert.equal(r.status,403,`${who} create`);
  }
  assert.equal((await call(orders.POST,'/api/orders','POST',order,T.driver)).status,403,'driver cannot even open /api/orders');
  const statusBody=o=>({id:o.id,status:'processing',expected_status:'confirmed'});
  for(const who of ['finance','hr','mktMgr','mkt']){
    const r=await call(orders.PATCH,'/api/orders','PATCH',statusBody(created.admin),T[who]);assert.equal(r.status,403,`${who} status`);
  }
  assert.equal((await call(orders.PATCH,'/api/orders','PATCH',statusBody(created.admin),T.drvMgr)).status,200,'driver manager moves orders');
  // A sales rep takes the order and then follows it. Confirming, processing, shipping, delivering
  // and returning are operations' calls — a rep marking her own order delivered is the one thing
  // that lets stock and cash drift without anyone noticing.
  assert.equal((await call(orders.PATCH,'/api/orders','PATCH',statusBody(created.salesMgr),T.rahma)).status,403,'rep cannot move others\' orders');
  assert.equal((await call(orders.PATCH,'/api/orders','PATCH',statusBody(created.rahma),T.rahma)).status,403,'nor her own');
  assert.equal((await call(orders.PATCH,'/api/orders','PATCH',statusBody(created.rahma),T.salesMgr)).status,200,'her manager still can');
  // Everyone who could read orders still can.
  for(const who of ['finance','hr','mkt'])assert.equal((await call(orders.GET,'/api/orders','GET',undefined,T[who])).status,200);

  // --- Inventory: view widely, write = admin/GM/driver manager ---
  const move={sku:'SKU-ACL',type:'purchase_in',quantity:3,reference:'اختبار'};
  for(const who of ['rahma','salesMgr','finance','hr']){
    assert.equal((await call(inventory.GET,'/api/inventory','GET',undefined,T[who])).status,200,`${who} views stock`);
    assert.equal((await call(inventory.POST,'/api/inventory','POST',move,T[who])).status,403,`${who} changes stock`);
  }
  let r=await call(inventory.POST,'/api/inventory','POST',move,T.drvMgr);
  assert.equal(r.status,201,JSON.stringify(r.body));
  assert.equal((await call(inventory.PATCH,'/api/inventory','PATCH',{movement_id:r.body.movement.id},T.rahma)).status,403);
  assert.equal((await call(inventory.PATCH,'/api/inventory','PATCH',{movement_id:r.body.movement.id},T.drvMgr)).status,200);
  assert.equal((await q(`SELECT quantity_on_hand FROM inventory`))[0].quantity_on_hand,50);

  // --- Finance: admin/GM/finance only ---
  assert.equal((await call(finance.GET,'/api/finance','GET',undefined,T.salesMgr)).status,403);
  assert.equal((await call(finance.GET,'/api/finance','GET',undefined,T.finance)).status,200);
  const inv=(await call(finance.GET,'/api/finance','GET',undefined,T.finance)).body.invoices.find(i=>i.order_id===created.admin.id);
  const pay={invoice_id:inv.id,amount:1,payment_method:'cash'};
  assert.equal((await call(finance.POST,'/api/finance','POST',pay,T.salesMgr)).status,403);
  r=await call(finance.POST,'/api/finance','POST',pay,T.finance);assert.equal(r.status,200,JSON.stringify(r.body));

  // --- Customers & calls, before migration 029 (the app's own ownership check) ---
  const edit=(id,data,who)=>call(customers.PATCH,'/api/customers','PATCH',{id,...data},T[who]);
  const logCall=(id,who)=>call(calls.POST,'/api/calls','POST',{customer_id:id,outcome:'answered',notes:'x'},T[who]);
  const ownershipCases=async label=>{
    assert.equal((await edit(RAHMA_LEAD,{notes:`ملاحظة ${label}`},'rahma')).status,200,`${label}: rep edits own lead`);
    assert.equal((await edit(HANAN_LEAD,{notes:'x'},'rahma')).status,403,`${label}: rep edits other lead`);
    assert.equal((await edit(RAHMA_LEAD,{rep_name:'حنان'},'rahma')).status,403,`${label}: rep reassigns`);
    assert.equal((await edit(RAHMA_LEAD,{rep_name:'رحمة'},'rahma')).status,200,`${label}: keeping herself is fine`);
    assert.equal((await edit('00000000-0000-4000-8000-0000000000ff',{notes:'x'},'rahma')).status,404);
    assert.equal((await logCall(RAHMA_LEAD,'rahma')).status,201,`${label}: rep logs own lead`);
    assert.equal((await logCall(HANAN_LEAD,'rahma')).status,403,`${label}: rep logs other lead`);
    assert.equal((await logCall(HANAN_LEAD,'salesMgr')).status,201);
    assert.equal((await logCall(HANAN_LEAD,'mkt')).status,403,`${label}: marketing cannot open calls`);
    assert.equal((await edit(HANAN_LEAD,{notes:'from hr'},'hr')).status,403,`${label}: HR has no customer access`);
  };
  await ownershipCases('app check');
  assert.equal((await q(`SELECT rep_name_raw FROM customers WHERE id=$1`,[RAHMA_LEAD]))[0].rep_name_raw,'رحمة');

  // --- Apply migration 029: the database enforces it too, and records changes ---
  await db.exec('RESET ROLE;');
  await db.exec(await readFile(new URL('supabase/migrations/029_customer_ownership.sql',root),'utf8'));
  await db.exec('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; SET ROLE anon;');
  await assert.rejects(db.query(`SELECT * FROM customer_changes`),/permission denied/);
  await db.exec('RESET ROLE; SET ROLE service_role;');
  await ownershipCases('db check');
  await assert.rejects(db.query(`SELECT business_customer_update('x','${HANAN_LEAD}','{"notes":"y","scope_rep":"رحمة"}')`),/FORBIDDEN/);
  await assert.rejects(db.query(`SELECT business_customer_update('x','${RAHMA_LEAD}','{"rep_name":"حنان","scope_rep":"رحمة"}')`),/FORBIDDEN/);
  const k=randomUUID();
  await assert.rejects(db.query(`SELECT business_call_log_create('x','${k}','{"customer_id":"${HANAN_LEAD}","outcome":"answered","scope_rep":"رحمة"}','رحمة')`),/FORBIDDEN/);

  r=await edit(RAHMA_LEAD,{rep_name:'حنان',city:'الزرقاء'},'salesMgr');
  assert.equal(r.status,200);assert.equal(r.body.customer.rep_name_raw,'حنان');
  const log=await q(`SELECT actor_id,changes FROM customer_changes WHERE customer_id=$1 ORDER BY changed_at`,[RAHMA_LEAD]);
  assert.equal(log.at(-1).actor_id,'mgr-sales-01');
  assert.deepEqual(log.at(-1).changes,{rep_name_raw:{from:'رحمة',to:'حنان'},city:{from:null,to:'الزرقاء'}});
  assert.equal(log[0].actor_id,'rep-rahma-01');assert.deepEqual(Object.keys(log[0].changes),['notes']);
  const before=log.length;
  await edit(RAHMA_LEAD,{city:'الزرقاء'},'salesMgr');
  assert.equal((await q(`SELECT count(*)::int n FROM customer_changes WHERE customer_id=$1`,[RAHMA_LEAD]))[0].n,before,'no-op edits are not logged');
  assert.equal((await edit(RAHMA_LEAD,{notes:'x'},'rahma')).status,403,'after reassignment Rahma no longer owns it');
  assert.equal((await edit(RAHMA_LEAD,{rep_name:'رحمة'},'mkt')).status,200,'marketing may reassign');

  // --- Telegram: management only ---
  assert.equal((await call(telegram.POST,'/api/telegram','POST',{title:'x',details:'y'},T.finance)).status,403);
  assert.equal((await call(telegram.POST,'/api/telegram','POST',{title:'x',details:'y'},T.rahma)).status,403);
  assert.equal((await call(telegram.POST,'/api/telegram','POST',{title:'x',details:'y'},T.admin)).status,500,'admin passes the check (no bot configured here)');
  assert.equal((await telegram.GET(new Request('http://localhost/api/telegram'))).status,401);

  // --- Profiles: colleagues' contact details are private ---
  const profiles=async who=>(await (await profile.GET(new Request('http://localhost/api/profile',{headers:{Authorization:`Bearer ${T[who]}`}}))).json()).profiles;
  let p=await profiles('rahma');
  assert.ok(p['rep-rahma-01'].phone!==undefined||p['rep-rahma-01'].email!==undefined,'own profile is complete');
  for(const [id,prof] of Object.entries(p)){
    if(id==='rep-rahma-01')continue;
    assert.deepEqual(Object.keys(prof).filter(k=>['phone','whatsapp','email','city','bio','commissionRate','monthlyTarget'].includes(k)),[],id);
    assert.ok(prof.name,id);
  }
  p=await profiles('hr');
  assert.ok(Object.values(p).some(x=>x.phone!==undefined),'HR sees contact details');
  p=await profiles('admin');
  assert.ok(Object.values(p).some(x=>x.phone!==undefined));

  console.log('PASS test_access_control (write permissions per action, rep lead ownership in app + database, change history, telegram, private profiles, finance for sales managers)');
}finally{
  server.close();
  await db.close();
}
