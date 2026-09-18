import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {readFile,mkdir} from 'node:fs/promises';
import {PGlite} from '../.local-tests/node_modules/@electric-sql/pglite/dist/index.js';

// Migration 038: five promo codes. The database decides what a code does — the browser can ask for
// a discount but cannot grant one — and every use is recorded, so the per-customer allowance and
// the per-rep monthly cap are counted from facts.
const root=new URL('../',import.meta.url);
const dataDir=new URL('../.local-tests/db-'+randomUUID()+'/',import.meta.url);
await mkdir(dataDir,{recursive:true});
const db=new PGlite(fileURLToPath(dataDir));
await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
const initial=await readFile(new URL('supabase/migrations/001_initial_schema.sql',root),'utf8');
await db.exec(initial.replace(/^CREATE EXTENSION[^;]+;/gm,''));
const files=['002_seed_products.sql','003_seed_reps.sql','004_driver_schema.sql','005_payment_methods.sql',
  '006_business_persistence.sql','007_customer_persistence.sql','008_inventory_persistence.sql',
  '009_customer_management.sql','010_order_inventory_linking.sql','011_payment_reversal.sql',
  '012_order_cancellation.sql','013_driver_shift_closures.sql','014_profile_persistence.sql',
  '015_customer_list_performance.sql','016_call_log_rep_attribution.sql','017_notifications.sql',
  '018_calendar_reminder_dedup.sql','019_customer_list_by_rep.sql','020_product_catalog_v2.sql',
  '021_lead_untouched_fix.sql','022_hr_core.sql','023_hr_attendance_leave.sql','024_hr_payroll.sql',
  '025_hr_talent_documents.sql','026_customer_search.sql','027_driver_operations.sql','028_auth_security.sql',
  '029_customer_ownership.sql','030_push_devices.sql','031_customer_paging.sql','032_order_owner.sql',
  '033_call_reminders.sql','036_order_edit_by_rep.sql','037_plasma_package_bundles.sql','038_promo_codes.sql'];
for(const f of files)await db.exec(await readFile(new URL('supabase/migrations/'+f,root),'utf8'));
await db.exec('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; SET ROLE service_role;');

const one=async(sql,params=[])=>(await db.query(sql,params)).rows[0];
const idOf=async(sku)=>(await one('SELECT id FROM products WHERE sku=$1',[sku])).id;
const nameOf=async(sku)=>(await one('SELECT name_ar FROM products WHERE sku=$1',[sku])).name_ar;
for(const sku of ['PL-SHMP-500-V2-01','PL-COND-500-V2-02','PL-TREAT-500-V2-03','PL-SERUM-100-V2-04',
  'PL-SAMP-SHMP-15-01','PL-SAMP-COND-15-02','PL-SAMP-TREAT-15-03'])
  await db.query('INSERT INTO inventory(product_id,quantity_on_hand) VALUES($1,100) ON CONFLICT (product_id) DO UPDATE SET quantity_on_hand=100',[await idOf(sku)]);

// All five codes are seeded, short, and readable.
const codes=(await db.query('SELECT code,kind,per_rep_monthly_cap FROM promo_codes ORDER BY code')).rows;
assert.deepEqual(codes.map(c=>c.code),['Personal','Salons','VIP1','VIP2','VIP3']);
assert.ok(codes.every(c=>c.code.length<=8));
assert.equal(codes.find(c=>c.code==='Salons').per_rep_monthly_cap,5);
assert.equal(codes.find(c=>c.code==='VIP3').per_rep_monthly_cap,null);

const salon=randomUUID(), person=randomUUID(), other=randomUUID();
await db.query(`INSERT INTO customers(id,name,phone,rep_name_raw) VALUES
  ($1,'صالون راما','0790001111','رحمة'),($2,'علي','0790002222','رحمة'),($3,'صالون آخر','0790003333','رحمة')`,
  [salon,person,other]);

const quote=async(code,customer,actor,items)=>(await one('SELECT business_promo_quote($1,$2,$3,$4) q',
  [code,customer,actor,JSON.stringify(items)])).q;

// --- VIP1: two named products drop 13 -> 11, and nothing else in the basket moves.
let q=await quote('VIP1',person,'rep-rahma-01',[
  {sku:'PL-SHMP-500-V2-01',qty:2},{sku:'PL-COND-500-V2-02',qty:1},{sku:'PL-TREAT-500-V2-03',qty:1}]);
assert.equal(q.ok,true);
assert.deepEqual(q.items.map(i=>[i.sku,Number(i.price)]),[
  ['PL-SHMP-500-V2-01',11],['PL-COND-500-V2-02',11],['PL-TREAT-500-V2-03',15]]);
assert.equal(Number(q.saved),6,'2 shampoo + 1 conditioner saves 3 x 2');

// --- VIP2 / VIP3 price the packages from 037.
assert.equal(Number((await quote('VIP2',person,'rep-rahma-01',[{sku:'PL-PKG-DUO-V2-01',qty:1}])).items[0].price),20);
assert.equal(Number((await quote('VIP3',person,'rep-rahma-01',[{sku:'PL-PKG-QUAD-V2-01',qty:1}])).items[0].price),30);
// VIP2 does not discount the quad, and a code that touches nothing in the basket says so rather
// than silently doing nothing.
assert.equal((await quote('VIP2',person,'rep-rahma-01',[{sku:'PL-PKG-QUAD-V2-01',qty:1}])).error,'PROMO_NOT_APPLICABLE');

// --- Codes are typed by hand, so they match case-insensitively and trimmed.
assert.equal((await quote(' vip3 ',person,'rep-rahma-01',[{sku:'PL-PKG-QUAD-V2-01',qty:1}])).ok,true);
assert.equal((await quote('NOPE',person,'rep-rahma-01',[{sku:'PL-PKG-QUAD-V2-01',qty:1}])).error,'PROMO_NOT_FOUND');

// --- Salons: 5 of each sample, free.
q=await quote('Salons',salon,'rep-rahma-01',[
  {sku:'PL-SAMP-SHMP-15-01',qty:5},{sku:'PL-SAMP-COND-15-02',qty:5},{sku:'PL-SAMP-TREAT-15-03',qty:5}]);
assert.equal(q.ok,true);
assert.ok(q.items.every(i=>Number(i.price)===0&&i.free===true));
// A sixth of one type is over the allowance, and the refusal names which product.
const over=await quote('Salons',salon,'rep-rahma-01',[{sku:'PL-SAMP-SHMP-15-01',qty:6}]);
assert.equal(over.error,'PROMO_ALLOWANCE');
assert.equal(over.allowance,5);
// "allowed 5, used 0" alone reads like a contradiction, so the refusal names the requested amount.
assert.equal(over.requested,6);
assert.equal(over.already,0);
assert.ok(over.name.includes('شامبو'));
// Personal allows 2, not 5.
assert.equal((await quote('Personal',person,'rep-rahma-01',[{sku:'PL-SAMP-SHMP-15-01',qty:2}])).ok,true);
assert.equal((await quote('Personal',person,'rep-rahma-01',[{sku:'PL-SAMP-SHMP-15-01',qty:3}])).error,'PROMO_ALLOWANCE');

// --- Ordering with a code: the redemption is recorded and the samples leave stock.
const order=async(code,customer,items,total,actor='rep-rahma-01')=>{
  const named=[];
  for(const i of items)named.push({name:await nameOf(i.sku),qty:i.qty,price:i.price});
  return db.query('SELECT business_create_order($1,$2,$3) r',[actor,randomUUID(),JSON.stringify({
    customer_id:customer,customer_name:'x',customer_phone:'0790001111',city:'عمان',address:'y',
    payment_method:'cash_on_delivery',rep_name:'رحمة',total_amount:total,promo_code:code,items:named})]);
};
await order('Salons',salon,[{sku:'PL-SAMP-SHMP-15-01',qty:5,price:0},{sku:'PL-SAMP-COND-15-02',qty:5,price:0}],0);
const red=await one(`SELECT code,actor_id,rep_name,items FROM promo_redemptions ORDER BY redeemed_at DESC LIMIT 1`);
assert.equal(red.code,'Salons');
assert.equal(red.actor_id,'rep-rahma-01');
assert.equal(red.rep_name,'رحمة');
assert.deepEqual(red.items.map(i=>[i.sku,i.qty]),[['PL-SAMP-SHMP-15-01',5],['PL-SAMP-COND-15-02',5]]);
assert.equal(Number((await one('SELECT quantity_on_hand q FROM inventory WHERE product_id=$1',[await idOf('PL-SAMP-SHMP-15-01')])).q),95,
  'a sample handed out is a bottle gone');

// The allowance is now spent for that salon: the same rep cannot give it five more.
assert.equal((await quote('Salons',salon,'rep-rahma-01',[{sku:'PL-SAMP-SHMP-15-01',qty:1}])).error,'PROMO_ALLOWANCE');
// ...but the other two types are still open, counted per product.
assert.equal((await quote('Salons',salon,'rep-rahma-01',[{sku:'PL-SAMP-TREAT-15-03',qty:5}])).ok,true);

// --- A browser that asks for a discount it was not given is refused, and the order does not exist.
await assert.rejects(
  order('VIP3',person,[{sku:'PL-PKG-QUAD-V2-01',qty:1,price:10}],10),
  /PROMO_PRICE_MISMATCH/,
  'the stored unit price must match what the rules dictate');
assert.equal(Number((await one(`SELECT count(*) c FROM orders WHERE customer_id=$1`,[person])).c),0,
  'a refused promo takes the whole order with it');
// The honest version goes through.
await order('VIP3',person,[{sku:'PL-PKG-QUAD-V2-01',qty:1,price:30}],30);
assert.equal(Number((await one(`SELECT total_amount t FROM orders WHERE customer_id=$1`,[person])).t),30);

// --- The per-rep monthly cap counts different customers, not orders.
await db.query(`UPDATE promo_codes SET per_rep_monthly_cap=1 WHERE code='Salons'`);
assert.equal((await quote('Salons',other,'rep-rahma-01',[{sku:'PL-SAMP-SHMP-15-01',qty:1}])).error,'PROMO_REP_CAP',
  'a second salon in the same month is over a cap of one');
assert.equal((await quote('Salons',salon,'rep-rahma-01',[{sku:'PL-SAMP-TREAT-15-03',qty:1}])).ok,true,
  'the salon already served still works — the cap is on how many salons, not how many orders');
assert.equal((await quote('Salons',other,'rep-hanan-01',[{sku:'PL-SAMP-SHMP-15-01',qty:1}])).ok,true,
  'another rep has her own monthly allowance');
await db.query(`UPDATE promo_codes SET per_rep_monthly_cap=5 WHERE code='Salons'`);

// --- An inactive code stops working without being deleted, and its history survives.
await db.query(`UPDATE promo_codes SET is_active=false WHERE code='VIP1'`);
assert.equal((await quote('VIP1',person,'rep-rahma-01',[{sku:'PL-SHMP-500-V2-01',qty:1}])).error,'PROMO_INACTIVE');
await db.query(`UPDATE promo_codes SET is_active=true WHERE code='VIP1'`);

// --- Admin view and edit.
let list=(await one('SELECT business_promo_codes() c')).c;
const salons=list.find(c=>c.code==='Salons');
assert.equal(salons.per_rep_monthly_cap,5);
assert.equal(salons.redemptions_this_month,1);
assert.equal(salons.customers_this_month,1);
list=(await one('SELECT business_promo_code_update($1,$2) c',
  ['admin-betolla-01',JSON.stringify({code:'Salons',per_rep_monthly_cap:8,is_active:false})])).c;
assert.equal(list.find(c=>c.code==='Salons').per_rep_monthly_cap,8);
assert.equal(list.find(c=>c.code==='Salons').is_active,false);
await assert.rejects(one('SELECT business_promo_code_update($1,$2) c',
  ['admin-betolla-01',JSON.stringify({code:'Salons',per_rep_monthly_cap:0})]),/INVALID_QUANTITY/);
await assert.rejects(one('SELECT business_promo_code_update($1,$2) c',
  ['admin-betolla-01',JSON.stringify({code:'NOPE'})]),/PROMO_NOT_FOUND/);

// A code in use can never be deleted out from under its history.
await assert.rejects(db.query(`DELETE FROM promo_codes WHERE code='Salons'`),/promo_redemptions_code_fkey/);

console.log('PASS test_promo_codes (five codes seeded; VIP prices and sample allowances applied from the rules; allowance counted per customer per product; monthly cap counted per rep in distinct customers; a price the browser asks for but the rules do not grant takes the whole order down; inactive codes stop working; admin can set the cap)');
