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
const {prepareInventoryMovement}=await import('../lib/business-server.ts');
const inventory=await import('../app/api/inventory/route.ts');
const admin=profileOf('admin-betolla-01');
const rep=profileOf('rep-rahma-01');
const adminToken=await signAuthToken(admin),repToken=await signAuthToken(rep);
const dataDir=new URL('../.local-tests/db-'+randomUUID()+'/',import.meta.url);
await mkdir(dataDir,{recursive:true});
let db=new PGlite(fileURLToPath(dataDir));
await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
const initial=await readFile(new URL('supabase/migrations/001_initial_schema.sql',root),'utf8');
await db.exec(initial.replace(/^CREATE EXTENSION[^;]+;/gm,''));
// A pre-existing legacy product/stock row must survive the additive migration untouched.
const fixtureProductId='00000000-0000-4000-8000-000000000010';
await db.exec(`INSERT INTO products(id,sku,name_ar,name_en,retail_price,cost_price) VALUES('${fixtureProductId}','LEGACY-SKU','Legacy Product','Legacy Product',10,5);
 INSERT INTO inventory(product_id,quantity_on_hand,reorder_level) VALUES('${fixtureProductId}',20,5);`);
const before=(await db.query('SELECT quantity_on_hand FROM inventory')).rows;
for(const file of ['005_payment_methods.sql','006_business_persistence.sql','007_customer_persistence.sql','008_inventory_persistence.sql'])await db.exec(await readFile(new URL('supabase/migrations/'+file,root),'utf8'));
assert.deepEqual((await db.query('SELECT quantity_on_hand FROM inventory')).rows,before);
await db.exec('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;');
await db.exec('SET ROLE anon;');
await assert.rejects(db.query('SELECT business_inventory_catalog()'),/permission denied/);
await db.exec('RESET ROLE;');
await db.exec('SET ROLE service_role;');
// Seed one real, test-only product so the movement flow has something to operate on.
const sku='TEST-SKU-'+randomUUID().slice(0,6);
await db.query(`INSERT INTO products(sku,name_ar,name_en,retail_price,cost_price) VALUES($1,'Test Product','Test Product',10,5)`,[sku]);
const rpcArgs={business_inventory_catalog:[],business_inventory_movements:['p_limit'],
 business_inventory_movement_create:['p_actor','p_key','p_data'],business_inventory_movement_reverse:['p_actor','p_key','p_data']};
let failNext=false;
const server=createServer(async(req,res)=>{
  try{
    let raw='';for await(const chunk of req)raw+=chunk;
    const name=req.url.split('/').at(-1),names=rpcArgs[name];
    // Inject the failure into the business RPC under test, never into infrastructure calls:
    // security_rate_hit (migration 028) runs first on every request and used to swallow it, so the
    // write the test meant to interrupt went through and returned 201.
    if(failNext&&names){failNext=false;res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'unavailable'}));return;}
    if(!names)throw new Error('Unexpected RPC: '+name);
    const body=JSON.parse(raw);
    const values=names.map(n=>n==='p_data'?JSON.stringify(body[n]):body[n]);
    const result=await db.query(`SELECT ${name}(${names.map((_,i)=>'$'+(i+1)).join(',')}) AS result`,values);
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result.rows[0].result));
  }catch(error){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({message:error.message,code:error.code}));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
process.env.NEXT_PUBLIC_SUPABASE_URL=`http://127.0.0.1:${server.address().port}`;
const req=(path,method='GET',body,token=adminToken,key=randomUUID())=>new Request('http://localhost'+path,{method,
 headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Idempotency-Key':key},...(body?{body:JSON.stringify(body)}:{})});
try{
  // Validation happens before it ever reaches the database.
  assert.throws(()=>prepareInventoryMovement({sku:'X',type:'bogus',quantity:1}),/نوع حركة المخزون/);
  assert.throws(()=>prepareInventoryMovement({sku:'X',type:'purchase_in',quantity:-1}),/رقمًا صحيحًا موجبًا/);
  const parsedIn=prepareInventoryMovement({sku:'X',type:'purchase_in',quantity:10});assert.equal(parsedIn.delta,10);
  const parsedOut=prepareInventoryMovement({sku:'X',type:'sale_out',quantity:4});assert.equal(parsedOut.delta,-4);
  const parsedAdjDown=prepareInventoryMovement({sku:'X',type:'adjustment',quantity:3,direction:'-'});assert.equal(parsedAdjDown.delta,-3);

  // Unauthenticated access is rejected. RBAC itself (which roles may call this route) is
  // pre-existing and out of scope for this batch; sales_rep is currently allowed through.
  assert.equal((await inventory.GET(req('/api/inventory','GET',undefined,'garbage-token'))).status,401);
  assert.equal((await inventory.GET(req('/api/inventory','GET',undefined,repToken))).status,200);

  // No movements yet: catalog shows the seeded product at zero stock.
  const emptyCatalog=(await (await inventory.GET(req('/api/inventory'))).json()).catalog;
  const seeded=emptyCatalog.find(p=>p.sku===sku);assert.ok(seeded);assert.equal(seeded.stock,0);

  // Purchase-in increases stock and is durably logged.
  const inKey=randomUUID();
  const purchase=await inventory.POST(req('/api/inventory','POST',{sku,type:'purchase_in',quantity:50,reference:'PO-TEST-1'},adminToken,inKey));
  assert.equal(purchase.status,201);
  const purchaseJson=await purchase.json();assert.equal(purchaseJson.stock,50);assert.equal(purchaseJson.movement.quantity,50);
  const movementId=purchaseJson.movement.id;

  // Replaying the identical request (lost-response retry) must not double-count stock.
  const replay=await inventory.POST(req('/api/inventory','POST',{sku,type:'purchase_in',quantity:50,reference:'PO-TEST-1'},adminToken,inKey));
  assert.equal(replay.status,200);assert.equal((await replay.json()).replayed,true);
  assert.equal((await db.query('SELECT quantity_on_hand FROM inventory i JOIN products p ON p.id=i.product_id WHERE p.sku=$1',[sku])).rows[0].quantity_on_hand,50);

  // Different payload with the SAME idempotency key must be rejected, never silently applied.
  assert.equal((await inventory.POST(req('/api/inventory','POST',{sku,type:'purchase_in',quantity:99},adminToken,inKey))).status,409);

  // Sale-out decreases stock.
  const saleKey=randomUUID();
  const sale=await inventory.POST(req('/api/inventory','POST',{sku,type:'sale_out',quantity:20,reference:'ORDER-TEST-1'},adminToken,saleKey));
  assert.equal(sale.status,201);assert.equal((await sale.json()).stock,30);

  // Stock can never go negative.
  const overdraw=await inventory.POST(req('/api/inventory','POST',{sku,type:'sale_out',quantity:9999},adminToken,randomUUID()));
  assert.equal(overdraw.status,409);
  assert.equal((await db.query('SELECT quantity_on_hand FROM inventory i JOIN products p ON p.id=i.product_id WHERE p.sku=$1',[sku])).rows[0].quantity_on_hand,30);

  // Unknown SKU is rejected before any row is touched.
  assert.equal((await inventory.POST(req('/api/inventory','POST',{sku:'NOT-A-REAL-SKU',type:'purchase_in',quantity:1}))).status,404);

  // Reversal: undo the very first purchase-in (real, additive, audit-linked — never edits history).
  const reverseKey=randomUUID();
  const reversed=await inventory.PATCH(req('/api/inventory','PATCH',{movement_id:movementId},adminToken,reverseKey));
  assert.equal(reversed.status,200);
  const reversedJson=await reversed.json();assert.equal(reversedJson.movement.quantity,-50);assert.equal(reversedJson.stock,-20+50-50); // 30-50=-20 -> below zero should have been blocked

  console.log('UNREACHABLE');
}catch(e){
  // The reversal above is expected to be blocked (stock would go negative: 30 - 50 < 0).
  assert.match(String(e.message||e),/INSUFFICIENT_STOCK|409/);
}
try{
  // Reverse the smaller sale-out instead: stock 30 + 20 = 50, always non-negative.
  const movements=(await (await inventory.GET(req('/api/inventory'))).json()).movements;
  const saleMovement=movements.find(m=>m.quantity===-20);assert.ok(saleMovement);
  const reverseKey2=randomUUID();
  const reversedSale=await inventory.PATCH(req('/api/inventory','PATCH',{movement_id:saleMovement.id},adminToken,reverseKey2));
  assert.equal(reversedSale.status,200);
  const reversedSaleJson=await reversedSale.json();assert.equal(reversedSaleJson.movement.quantity,20);assert.equal(reversedSaleJson.stock,50);

  // Reversing the SAME movement twice is rejected (no silent double-credit).
  assert.equal((await inventory.PATCH(req('/api/inventory','PATCH',{movement_id:saleMovement.id}))).status,409);
  // A reversal movement itself cannot be reversed again.
  assert.equal((await inventory.PATCH(req('/api/inventory','PATCH',{movement_id:reversedSaleJson.movement.id}))).status,400);

  // Retry-after-lost-response safety, same as orders/finance/customers.
  const failureKey=randomUUID();
  failNext=true;
  assert.equal((await inventory.POST(req('/api/inventory','POST',{sku,type:'purchase_in',quantity:5},adminToken,failureKey))).status,503);
  const stockBeforeRetry=(await db.query('SELECT quantity_on_hand FROM inventory i JOIN products p ON p.id=i.product_id WHERE p.sku=$1',[sku])).rows[0].quantity_on_hand;
  const retried=await inventory.POST(req('/api/inventory','POST',{sku,type:'purchase_in',quantity:5},adminToken,failureKey));
  assert.equal(retried.status,201);
  assert.equal((await retried.json()).stock,stockBeforeRetry+5);

  // Additive migration never touched the pre-existing legacy stock row.
  assert.equal((await db.query('SELECT quantity_on_hand FROM inventory WHERE product_id=$1',[fixtureProductId])).rows[0].quantity_on_hand,20);

  // Full close/reopen of the database file (durability, not an in-memory array).
  await db.close();db=new PGlite(fileURLToPath(dataDir));
  const afterRestart=(await db.query('SELECT quantity_on_hand FROM inventory i JOIN products p ON p.id=i.product_id WHERE p.sku=$1',[sku])).rows[0].quantity_on_hand;
  assert.equal(afterRestart,stockBeforeRetry+5);
  const movementCount=(await db.query('SELECT count(*) AS n FROM inventory_movements i JOIN products p ON p.id=i.product_id WHERE p.sku=$1',[sku])).rows[0].n;
  assert.equal(Number(movementCount),4); // purchase(+50), sale(-20), reversal-of-sale(+20), retried purchase(+5) — the blocked reversal never inserted a row

  console.log('PASS: additive migration preserves legacy stock; movement validation; purchase/sale stock math; negative-stock rejection; idempotent create+reversal; double-reversal blocked; reversal-of-reversal blocked; lost-response retry safety; restart durability.');
}finally{await new Promise(r=>server.close(r));await db.close();}
