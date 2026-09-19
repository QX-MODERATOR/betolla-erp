import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {registerHooks} from 'node:module';
import {PGlite} from '../.local-tests/node_modules/@electric-sql/pglite/dist/index.js';

// Driver module (migration 027): every write goes through checked functions — status transitions,
// stale checks, idempotency, real payments on delivery, restock on return, dispatch limited to the
// chosen orders/drivers, drivers limited to their own orders, shift totals computed server-side.
const root=new URL('../',import.meta.url);
registerHooks({resolve(s,c,next){if(s.startsWith('@/'))return next(new URL(s.slice(2)+'.ts',root).href,c);return next(s,c);}});
process.env.JWT_SECRET=randomBytes(48).toString('hex');
process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-test-service-key';
const {signAuthToken,SYSTEM_ACCOUNTS,isRouteAllowedForRole}=await import('../lib/auth.ts');
const {toDriverOrder,driverOfAccount,canonicalDriver}=await import('../lib/driver-ops.ts');
const {stepKey}=await import('../lib/driver-server.ts');
const drivers=await import('../app/api/drivers/route.ts');
const driver=await import('../app/api/driver/route.ts');
const orders=await import('../app/api/orders/route.ts');
const token=async id=>signAuthToken(SYSTEM_ACCOUNTS.find(a=>a.id===id).profile);
const [adminT,managerT,khalidT,aliT,bxT,hrT,financeT,repT]=await Promise.all(
  ['admin-betolla-01','mgr-diya-01','drv-khalid-01','drv-ali-01','drv-bx-01','hr-ops-01','fin-zaid-01','rep-rahma-01'].map(async id=>{
    const acc=SYSTEM_ACCOUNTS.find(a=>a.id===id);assert.ok(acc,'missing account '+id);return token(id);}));

const dataDir=new URL('../.local-tests/db-drivers-'+randomUUID()+'/',import.meta.url);
await mkdir(dataDir,{recursive:true});
const db=new PGlite(fileURLToPath(dataDir),{parsers:{1082:v=>v}});
await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
await db.exec((await readFile(new URL('supabase/migrations/001_initial_schema.sql',root),'utf8')).replace(/^CREATE EXTENSION[^;]+;/gm,''));
for(const file of ['005_payment_methods.sql','006_business_persistence.sql','010_order_inventory_linking.sql','011_payment_reversal.sql','012_order_cancellation.sql','013_driver_shift_closures.sql'])
  await db.exec(await readFile(new URL('supabase/migrations/'+file,root),'utf8'));

// Legacy rows written by the old lib/db.ts: driver only in a (nested) notes tag, no invoice.
await db.exec(`INSERT INTO customers(id,name,phone,city) VALUES('00000000-0000-4000-8000-000000000001','عميل قديم','0790001111','عمان');
 INSERT INTO orders(id,order_number,customer_id,total_amount,status,notes) VALUES
  ('00000000-0000-4000-8000-00000000000a','LEGACY-KHALID','00000000-0000-4000-8000-000000000001',30,'processing','[المنتجات: شامبو] [السائق: [السائق: خالد]]'),
  ('00000000-0000-4000-8000-00000000000b','LEGACY-UNASSIGNED','00000000-0000-4000-8000-000000000001',12,'processing','[السائق: unassigned]'),
  ('00000000-0000-4000-8000-00000000000c','LEGACY-OLD-DELIVERED','00000000-0000-4000-8000-000000000001',50,'delivered','[السائق: خالد] [المبلغ المستلم: 50]'),
  ('00000000-0000-4000-8000-00000000000d','LEGACY-CANCELLED','00000000-0000-4000-8000-000000000001',9,'cancelled','[السائق: علي]');
 UPDATE orders SET updated_at=now()-interval '20 days',delivered_at=now()-interval '20 days' WHERE order_number='LEGACY-OLD-DELIVERED';
 INSERT INTO products(id,sku,name_ar,name_en,is_active) VALUES('00000000-0000-4000-8000-0000000000f1','SKU-SHAMPOO','شامبو اختبار','Test Shampoo',true);
 INSERT INTO inventory(product_id,quantity_on_hand) VALUES('00000000-0000-4000-8000-0000000000f1',10);`);
await db.exec(await readFile(new URL('supabase/migrations/027_driver_operations.sql',root),'utf8'));
await db.exec('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;');
await db.exec('SET ROLE anon;');
await assert.rejects(db.query(`SELECT business_driver_board(NULL,NULL)`),/permission denied/);
await db.exec('RESET ROLE; SET ROLE service_role;');

const rpcArgs={business_list:['p_scope'],business_create_order:['p_actor','p_key','p_data'],business_status:['p_actor','p_scope','p_key','p_data'],
  business_driver_board:['p_driver','p_date'],business_driver_stock_needed:[],business_driver_action:['p_actor','p_key','p_data'],
  business_driver_dispatch:['p_actor','p_data'],business_driver_shift:['p_driver','p_date'],business_driver_shift_action:['p_actor','p_data'],
  business_notification_create:null};
const server=createServer(async(req,res)=>{
  try{
    let raw='';for await(const chunk of req)raw+=chunk;
    const name=req.url.split('/').at(-1),names=rpcArgs[name];
    if(names===null){res.writeHead(200,{'Content-Type':'application/json'});res.end('null');return;}
    if(!names)throw new Error('Unexpected RPC: '+name);
    const body=JSON.parse(raw);
    const values=names.map(n=>n==='p_data'?JSON.stringify(body[n]):body[n]);
    const result=await db.query(`SELECT ${name}(${names.map((_,i)=>'$'+(i+1)).join(',')}) AS result`,values);
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result.rows[0].result));
  }catch(error){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({message:error.message}));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
process.env.NEXT_PUBLIC_SUPABASE_URL=`http://127.0.0.1:${server.address().port}`;

const call=async(handler,path,method,body,t,key=randomUUID())=>{
  const r=await handler(new Request('http://localhost'+path,{method,headers:{Authorization:`Bearer ${t}`,'Content-Type':'application/json','Idempotency-Key':key},
    ...(body?{body:JSON.stringify(body)}:{})}));
  return {status:r.status,body:await r.json()};
};
const board=async(t=managerT)=>(await call(drivers.GET,'/api/drivers','GET',undefined,t)).body;
// Looked up as an admin: each board is scoped to the drivers that account runs, so ضياء's no
// longer carries BX orders at all. A helper that has to see every order must use full access.
const find=async(id,t=adminT)=>(await board(t)).orders.find(o=>o.id===id);
const q=async(sql,params)=>(await db.query(sql,params)).rows;
const stock=async()=>(await q(`SELECT quantity_on_hand FROM inventory`))[0].quantity_on_hand;

try{
  // --- Pure helpers ---
  assert.equal(driverOfAccount({role:'driver',username:'khalid.driver',name:'خالد (سائق توصيل)'}),'خالد');
  assert.equal(driverOfAccount({role:'driver',username:'bx',repId:'BX Arabia',name:'BX Arabia (شركة توصيل)'}),'BX Arabia');
  assert.equal(driverOfAccount({role:'driver',username:'someone-new',name:'مجهول'}),null); // never defaults to خالد
  assert.equal(driverOfAccount({role:'driver_manager',username:'khalid'}),null);
  assert.equal(canonicalDriver('unassigned'),null);
  assert.equal(stepKey('k','a'),stepKey('k','a'));assert.notEqual(stepKey('k','a'),stepKey('k','b'));
  assert.match(stepKey('k','a'),/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const cliq=toDriverOrder({id:'X',db_id:'x',status:'shipped',payment_method:'cliq',total_amount:10,paid_amount:10,delivery_fee:3,
    delivery:{cliq_includes_delivery:false},notes:'',customer_name:'',phone:'',city:'',address:'',rep_name:'',items_summary:''});
  assert.equal(cliq.cash_to_collect,3);
  const partlyPaid=toDriverOrder({id:'Y',db_id:'y',status:'shipped',payment_method:'cash_on_delivery',total_amount:10,paid_amount:4,delivery:{},notes:''});
  assert.equal(partlyPaid.cash_to_collect,6);

  // --- Access ---
  assert.equal(isRouteAllowedForRole('driver_manager','/api/driver'),true);
  assert.equal(isRouteAllowedForRole('sales_rep','/api/drivers'),false);
  assert.equal((await call(drivers.GET,'/api/drivers','GET',undefined,repT)).status,403);
  const hrView=await call(drivers.GET,'/api/drivers','GET',undefined,hrT);
  assert.equal(hrView.status,200);assert.equal(hrView.body.canManage,false);
  assert.equal((await call(drivers.POST,'/api/drivers','POST',{action:'assign_orders',driver:'علي',orders:[{id:'LEGACY-UNASSIGNED',status:'processing'}]},hrT)).status,403);
  assert.equal((await call(drivers.POST,'/api/drivers','POST',{action:'dispatch',orderIds:['LEGACY-KHALID'],drivers:['خالد']},financeT)).status,403);
  assert.equal((await call(drivers.POST,'/api/drivers','POST',{action:'assign_orders',driver:'علي',orders:[{id:'LEGACY-UNASSIGNED',status:'processing'}]},managerT,'not-a-uuid')).status,400);

  // --- Board: today's work only, legacy tags understood, no made-up values ---
  let b=await board();
  const ids=b.orders.map(o=>o.id);
  assert.ok(ids.includes('LEGACY-KHALID')&&ids.includes('LEGACY-UNASSIGNED'));
  assert.ok(!ids.includes('LEGACY-OLD-DELIVERED'),'finished orders from past days are not on today\'s board');
  assert.ok(!ids.includes('LEGACY-CANCELLED'),'cancelled orders are not driver work');
  assert.equal(b.orders.find(o=>o.id==='LEGACY-KHALID').driver,'خالد'); // innermost nested tag
  assert.equal(b.orders.find(o=>o.id==='LEGACY-UNASSIGNED').driver,null); // not silently خالد
  assert.equal(b.orders.find(o=>o.id==='LEGACY-KHALID').phone,'0790001111');
  assert.equal(b.reconcileOrders.length,0,'nothing is out with a driver yet');

  // Drivers only see their own orders; ?driver= is ignored for them.
  let k=await call(driver.GET,'/api/driver?driver='+encodeURIComponent('علي'),'GET',undefined,khalidT);
  assert.equal(k.status,200);assert.equal(k.body.driver.key,'خالد');
  assert.deepEqual(k.body.orders.map(o=>o.id),['LEGACY-KHALID']);
  assert.equal((await call(driver.GET,'/api/driver','GET',undefined,aliT)).body.orders.length,0);
  assert.equal((await call(driver.GET,'/api/driver','GET',undefined,managerT)).status,400); // manager must pick a driver
  assert.equal((await call(driver.GET,'/api/driver?driver=BX','GET',undefined,managerT)).body.driver.key,'BX Arabia');
  assert.equal((await call(driver.GET,'/api/driver?driver=خالد','GET',undefined,repT)).status,403);

  // --- Real order through the normal sales flow: confirmed, stock taken, invoice exists ---
  const created=await call(orders.POST,'/api/orders','POST',{customer_name:'زبون اختبار',customer_phone:'0791234567',total_amount:25,
    payment_method:'cash_on_delivery',items:[{name:'SKU-SHAMPOO',qty:2,price:12.5}]},adminT);
  assert.equal(created.status,201);
  const ORDER=created.body.order.id;
  assert.equal(await stock(),8);
  let o=await find(ORDER);
  assert.equal(o.dbStatus,'confirmed');assert.equal(o.driver,null);assert.equal(o.cash_to_collect,25);

  // Assign: confirmed -> processing; a stale status is refused; a retry with the same key replays.
  const assignKey=randomUUID();
  const assignBody={action:'assign_orders',driver:'خالد',orders:[{id:ORDER,status:'confirmed'}]};
  let r=await call(drivers.POST,'/api/drivers','POST',assignBody,managerT,assignKey);
  assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.results[0].order.dbStatus,'processing');
  r=await call(drivers.POST,'/api/drivers','POST',assignBody,managerT,assignKey);
  assert.equal(r.status,200,'same key replays instead of failing the stale check');
  r=await call(drivers.POST,'/api/drivers','POST',assignBody,managerT);
  assert.equal(r.status,409);assert.match(r.body.error,/تغيّرت حالة الطلب/);
  o=await find(ORDER);assert.equal(o.driver,'خالد');assert.equal(o.dbStatus,'processing');
  assert.equal((await q(`SELECT count(*)::int n FROM business_requests WHERE operation='driver'`))[0].n,1);

  // Unassign really clears (no 'unassigned' driver name), then reassign.
  r=await call(drivers.POST,'/api/drivers','POST',{action:'assign_orders',driver:null,orders:[{id:ORDER,status:'processing'}]},managerT);
  assert.equal(r.status,200);o=await find(ORDER);assert.equal(o.driver,null);
  r=await call(drivers.POST,'/api/drivers','POST',{action:'assign_orders',driver:'خالد',orders:[{id:ORDER,status:'processing'},{id:'LEGACY-UNASSIGNED',status:'processing'}]},managerT);
  assert.equal(r.status,200,JSON.stringify(r.body));
  // Writing a legacy order moves the driver into the structured field and drops the tag.
  assert.deepEqual(await q(`SELECT notes,business_details->'delivery'->>'driver' d FROM orders WHERE order_number='LEGACY-UNASSIGNED'`),[{notes:null,d:'خالد'}]);

  // Dispatch loads + stock needed only count processing orders with a driver.
  b=await board();
  assert.deepEqual(b.driverLoads.find(l=>l.driver==='خالد').orders.map(x=>x.id).sort(),[ORDER,'LEGACY-KHALID','LEGACY-UNASSIGNED'].sort());
  assert.deepEqual(b.inventoryNeeded,[{id:'SKU-SHAMPOO',product:'شامبو اختبار',needed:2,available:8,status:'OK'}]);

  // A driver cannot act on an order before it is theirs, nor on another driver's order.
  r=await call(driver.POST,'/api/driver','POST',{action:'update_status',orderId:ORDER,expectedStatus:'processing',status:'delivered',cashCollected:25},aliT);
  assert.equal(r.status,403);
  assert.equal((await find(ORDER)).dbStatus,'processing');

  // Dispatch ships only the listed orders of the chosen drivers.
  r=await call(drivers.POST,'/api/drivers','POST',{action:'dispatch',orderIds:[ORDER,'LEGACY-KHALID','LEGACY-CANCELLED'],drivers:['خالد']},managerT);
  assert.equal(r.status,200);
  assert.deepEqual([...r.body.shipped].sort(),[ORDER,'LEGACY-KHALID'].sort());
  assert.deepEqual(r.body.skipped,['LEGACY-CANCELLED']);
  assert.equal((await find('LEGACY-UNASSIGNED')).dbStatus,'processing','not listed -> not shipped');
  r=await call(drivers.POST,'/api/drivers','POST',{action:'dispatch',orderIds:[ORDER],drivers:['خالد']},managerT);
  assert.deepEqual(r.body.shipped,[]);
  assert.equal((await q(`SELECT status FROM orders WHERE order_number='LEGACY-CANCELLED'`))[0].status,'cancelled');
  // Shipped goods cannot be unassigned.
  r=await call(drivers.POST,'/api/drivers','POST',{action:'assign_orders',driver:null,orders:[{id:ORDER,status:'shipped'}]},managerT);
  assert.equal(r.status,409);

  // Delivered with 0 collected: 0 is recorded (not replaced by the expected amount), no payment row.
  const zeroKey=randomUUID();
  const zero={action:'update_status',orderId:'LEGACY-KHALID',expectedStatus:'shipped',status:'delivered',cashCollected:0,driverName:'علي'};
  r=await call(driver.POST,'/api/driver','POST',zero,khalidT,zeroKey);
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal(r.body.order.status,'delivered');assert.equal(r.body.order.cash_collected,0);
  assert.equal((await q(`SELECT count(*)::int n FROM invoices i JOIN orders o ON o.id=i.order_id WHERE o.order_number='LEGACY-KHALID'`))[0].n,0);
  assert.equal((await call(driver.POST,'/api/driver','POST',zero,khalidT,zeroKey)).status,200,'retry replays');
  assert.equal((await call(driver.POST,'/api/driver','POST',{...zero,cashCollected:5},khalidT,zeroKey)).status,409,'same key, different data');
  assert.equal((await call(driver.POST,'/api/driver','POST',{...zero,cashCollected:-1},khalidT)).status,400);
  assert.equal((await call(driver.POST,'/api/driver','POST',{...zero,cashCollected:undefined},khalidT)).status,400);

  // Delivered with cash: a real payment row, invoice paid, Finance no longer owed.
  r=await call(driver.POST,'/api/driver','POST',{action:'update_status',orderId:ORDER,expectedStatus:'shipped',status:'delivered',cashCollected:25},khalidT);
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.deepEqual(await q(`SELECT p.amount::float amount,p.payment_method::text m,i.status::text inv,o.payment_status::text ord,o.status::text st,o.delivered_at IS NOT NULL d
    FROM orders o JOIN invoices i ON i.order_id=o.id JOIN payments p ON p.invoice_id=i.id WHERE o.order_number=$1`,[ORDER]),
    [{amount:25,m:'cash',inv:'paid',ord:'paid',st:'delivered',d:true}]);
  const doc=(await q(`SELECT business_order_document(id) d FROM orders WHERE order_number=$1`,[ORDER]))[0].d;
  assert.equal(Number(doc.paid_amount),25);
  // A delivered order cannot be delivered/returned again.
  assert.equal((await call(driver.POST,'/api/driver','POST',{action:'update_status',orderId:ORDER,expectedStatus:'delivered',status:'returned'},khalidT)).status,400);

  // Overpayment is capped at the invoice balance (the extra stays on the delivery record).
  const second=await call(orders.POST,'/api/orders','POST',{customer_name:'زبون ٢',customer_phone:'0791234568',total_amount:12.5,
    payment_method:'cash_on_delivery',items:[{name:'SKU-SHAMPOO',qty:1,price:12.5}]},adminT);
  const SECOND=second.body.order.id;
  assert.equal(await stock(),7);
  // Assigned by an admin, not by ضياء: BX Arabia moved to صابرين's account, so the driver manager
  // can no longer send anything there. Management keeps every driver as a fallback. The split
  // itself is covered in test_bx_ownership.
  assert.equal((await call(drivers.POST,'/api/drivers','POST',{action:'assign_orders',driver:'BX',orders:[{id:SECOND,status:'confirmed'}]},managerT)).status,403,
    'ضياء may not assign to BX any more');
  await call(drivers.POST,'/api/drivers','POST',{action:'assign_orders',driver:'BX',orders:[{id:SECOND,status:'confirmed'}]},adminT);
  assert.equal((await find(SECOND)).driver,'BX Arabia');
  // Postpone (future date only), then return: stock comes back exactly once.
  assert.equal((await call(driver.POST,'/api/driver','POST',{action:'update_status',orderId:SECOND,expectedStatus:'processing',status:'postponed',postponeDate:'2020-01-01'},bxT)).status,400);
  r=await call(driver.POST,'/api/driver','POST',{action:'update_status',orderId:SECOND,expectedStatus:'processing',status:'postponed',postponeDate:'2099-01-01',notes:'الزبون مسافر'},bxT);
  assert.equal(r.status,200);assert.equal(r.body.order.status,'postponed');assert.equal(r.body.order.postpone_date,'2099-01-01');
  assert.equal(r.body.order.dbStatus,'processing');
  r=await call(driver.POST,'/api/driver','POST',{action:'update_status',orderId:SECOND,expectedStatus:'processing',status:'returned',returnReason:'رفض الاستلام'},bxT);
  assert.equal(r.status,200);assert.equal(r.body.order.status,'returned');assert.equal(r.body.order.return_reason,'رفض الاستلام');
  assert.equal(await stock(),8,'returned stock is put back');
  // Returning a legacy order that never took stock does not invent stock.
  await call(drivers.POST,'/api/drivers','POST',{action:'update_order',orderId:'LEGACY-UNASSIGNED',expectedStatus:'processing',state:'returned'},managerT);
  assert.equal(await stock(),8);

  // Manager edit dialog: details are saved (payment method, CliQ flag, fee, note) and state changes are checked.
  const third=await call(orders.POST,'/api/orders','POST',{customer_name:'زبون ٣',customer_phone:'0791234569',total_amount:40,
    payment_method:'cash_on_delivery',items:[{name:'منتج بدون ربط',qty:1,price:40}]},adminT);
  const THIRD=third.body.order.id;
  const editKey=randomUUID();
  const edit={action:'update_order',orderId:THIRD,expectedStatus:'confirmed',driver:'علي',state:'remaining',
    paymentMethod:'cliq',cliqIncludesDelivery:false,deliveryFee:3,note:'اتصل قبل الوصول'};
  r=await call(drivers.POST,'/api/drivers','POST',edit,managerT,editKey);
  assert.equal(r.status,200,JSON.stringify(r.body));
  o=r.body.order;
  assert.equal(o.driver,'علي');assert.equal(o.status,'remaining');assert.equal(o.payment_method,'cliq');
  assert.equal(o.cliq_includes_delivery,false);assert.equal(o.delivery_fee,3);assert.equal(o.cash_to_collect,3);assert.equal(o.note,'اتصل قبل الوصول');
  r=await call(drivers.POST,'/api/drivers','POST',edit,managerT,editKey);
  assert.equal(r.status,200,'the whole multi-step edit is retry-safe: '+JSON.stringify(r.body));
  assert.equal((await q(`SELECT count(*)::int n FROM business_requests WHERE operation='driver' AND payload->>'id'=$1`,[THIRD]))[0].n,3);
  r=await call(drivers.POST,'/api/drivers','POST',{...edit,expectedStatus:'processing',state:'pending',driver:'علي'},managerT);
  assert.equal(r.status,200);assert.equal(r.body.order.status,'pending');
  r=await call(drivers.POST,'/api/drivers','POST',{action:'update_order',orderId:THIRD,expectedStatus:'processing',paymentMethod:'visa'},managerT);
  assert.equal(r.status,400);

  // Reconcile: only the changed rows, each checked. Ali delivers THIRD; the page sends it with the actual cash.
  await call(drivers.POST,'/api/drivers','POST',{action:'dispatch',orderIds:[THIRD],drivers:['علي']},managerT);
  b=await board();
  const rec=b.reconcileOrders.find(x=>x.id===THIRD);
  assert.equal(rec.status,'خرج مع السائق');assert.equal(rec.dbStatus,'shipped');
  assert.ok(!b.reconcileOrders.some(x=>x.id==='LEGACY-OLD-DELIVERED'),'old history is never re-sent');
  r=await call(drivers.POST,'/api/drivers','POST',{action:'reconcile',changes:[
    {id:THIRD,dbStatus:'shipped',status:'مكتمل',actualCash:3,notes:'تم'},
    {id:ORDER,dbStatus:'delivered',status:'مرتجع'}]},financeT);
  assert.equal(r.status,409,'one row was stale/invalid');
  assert.equal(r.body.results.find(x=>x.id===THIRD).ok,true);
  assert.equal(r.body.results.find(x=>x.id===ORDER).ok,false);
  assert.equal((await find(ORDER)).status,'delivered','a delivered order is not reopened by reconcile');
  // CliQ order: the 3 JOD delivery fee is above the unpaid goods? No — invoice balance is 40, so 3 is posted.
  assert.deepEqual(await q(`SELECT p.amount::float a FROM payments p JOIN invoices i ON i.id=p.invoice_id JOIN orders o ON o.id=i.order_id WHERE o.order_number=$1`,[THIRD]),[{a:3}]);

  // --- Shift: totals from the database, counted cash stored, reopen needs a manager ---
  let s=(await call(driver.GET,'/api/driver','GET',undefined,khalidT)).body;
  assert.equal(s.shift.delivered_count,2);assert.equal(Number(s.shift.expected_cash),25);
  assert.equal(s.shiftClosure.closed,false);
  assert.ok(!s.orders.some(x=>x.id==='LEGACY-OLD-DELIVERED'));
  assert.equal((await call(driver.POST,'/api/driver','POST',{action:'close_shift',notes:'x'},khalidT)).status,400,'counted cash required');
  r=await call(driver.POST,'/api/driver','POST',{action:'close_shift',countedCash:24,notes:'نقص دينار',cashCollected:9999,driverName:'علي'},khalidT);
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.deepEqual(await q(`SELECT driver_name,is_closed,cash_collected::float c,counted_cash::float k,delivered_count,closed_by FROM driver_shift_closures`),
    [{driver_name:'خالد',is_closed:true,c:25,k:24,delivered_count:2,closed_by:'drv-khalid-01'}]);
  assert.equal((await call(driver.POST,'/api/driver','POST',{action:'close_shift',countedCash:1},khalidT)).status,200,'closing again is a no-op');
  assert.equal((await q(`SELECT counted_cash::float k FROM driver_shift_closures`))[0].k,24);
  assert.equal((await call(driver.POST,'/api/driver','POST',{action:'reopen_shift'},khalidT)).status,403);
  r=await call(driver.POST,'/api/driver','POST',{action:'reopen_shift',driverName:'خالد'},managerT);
  assert.equal(r.status,200);
  assert.deepEqual(await q(`SELECT is_closed,reopened_by FROM driver_shift_closures`),[{is_closed:false,reopened_by:'mgr-diya-01'}]);

  console.log('PASS test_drivers (checked transitions, payments, restock, scoped dispatch, driver identity, shift totals)');
}finally{
  server.close();
  await db.close();
}
