import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {readFile,mkdir} from 'node:fs/promises';
import {PGlite} from '../.local-tests/node_modules/@electric-sql/pglite/dist/index.js';

// Migration 040: readable order and invoice numbers. 001 always said they should look like
// BET-2026-00001, but every revision of business_create_order since 006 filled them with
// 'BET-'||uuid. A BEFORE INSERT trigger now assigns them from a shared yearly counter, so no
// function body had to be rewritten and no later migration can carry an older one forward and
// silently undo it.
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
  '033_call_reminders.sql','036_order_edit_by_rep.sql','037_plasma_package_bundles.sql','038_promo_codes.sql',
  '039_promo_vip_merge.sql','040_readable_document_numbers.sql'];
for(const f of files)await db.exec(await readFile(new URL('supabase/migrations/'+f,root),'utf8'));
await db.exec('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; SET ROLE service_role;');

const one=async(sql,params=[])=>(await db.query(sql,params)).rows[0];
const idOf=async(sku)=>(await one('SELECT id FROM products WHERE sku=$1',[sku])).id;
const nameOf=async(sku)=>(await one('SELECT name_ar FROM products WHERE sku=$1',[sku])).name_ar;
for(const sku of ['PL-SHMP-500-V2-01','PL-COND-500-V2-02'])
  await db.query('INSERT INTO inventory(product_id,quantity_on_hand) VALUES($1,500) ON CONFLICT (product_id) DO UPDATE SET quantity_on_hand=500',[await idOf(sku)]);

const year=Number((await one(`SELECT EXTRACT(year FROM (now() AT TIME ZONE 'Asia/Amman'))::int y`)).y);
const customer=randomUUID();
await db.query(`INSERT INTO customers(id,name,phone,rep_name_raw) VALUES($1,'زبونة','0790001111','رحمة')`,[customer]);

const place=async()=>(await one('SELECT business_create_order($1,$2,$3) r',['rep-rahma-01',randomUUID(),
  JSON.stringify({customer_id:customer,customer_name:'x',customer_phone:'0790001111',city:'عمان',address:'y',
    payment_method:'cash_on_delivery',rep_name:'رحمة',total_amount:13,
    items:[{name:await nameOf('PL-SHMP-500-V2-01'),qty:1,price:13}]})])).r.order;

// --- The counter starts at 1 and the number reads the way 001 always said it would.
let ord=await place();
assert.equal(ord.id,`BET-${year}-00001`,'first order of the year is 00001, not BET-<uuid>');
assert.equal(ord.invoice_number,`INV-${year}-00001`);
assert.ok(ord.id.length<=14,'short enough to read down a phone line');

// --- An order and its invoice always carry the same number, so one read aloud gives you both.
for(let i=2;i<=4;i++){
  ord=await place();
  assert.equal(ord.id,`BET-${year}-${String(i).padStart(5,'0')}`);
  assert.equal(ord.invoice_number,`INV-${year}-${String(i).padStart(5,'0')}`);
  assert.equal(ord.id.slice(4),ord.invoice_number.slice(4),'the pair shares one counter value');
}

// --- Whatever a caller passes is discarded: the old 'BET-'||uuid lines still sitting in
// business_create_order and the driver functions cannot put a long number back.
const raw=randomUUID();
await db.query(`INSERT INTO orders(id,order_number,customer_id,source,status,subtotal,total_amount,order_date)
  VALUES($1::uuid,'BET-'||$1::uuid::text,$2,'manual','confirmed',5,5,current_date)`,[raw,customer]);
assert.equal((await one('SELECT order_number n FROM orders WHERE id=$1',[raw])).n,`BET-${year}-00005`,
  'the trigger names the document, not the caller');
// The whatsapp edge function now omits the column entirely; BEFORE INSERT runs ahead of NOT NULL.
const omitted=randomUUID();
await db.query(`INSERT INTO orders(id,customer_id,source,status,subtotal,total_amount,order_date)
  VALUES($1,$2,'whatsapp_automation','confirmed',5,5,current_date)`,[omitted,customer]);
assert.equal((await one('SELECT order_number n FROM orders WHERE id=$1',[omitted])).n,`BET-${year}-00006`);

// --- An invoice for an order that predates the scheme still gets a number of its own.
await db.query(`UPDATE orders SET order_number='BET-legacy-'||id::text WHERE id=$1`,[raw]);
await db.query(`INSERT INTO invoices(invoice_number,order_id,customer_id,subtotal,total_amount,due_date)
  VALUES('INV-'||$1::uuid::text,$1::uuid,$2,5,5,current_date)`,[raw,customer]);
assert.equal((await one('SELECT invoice_number n FROM invoices WHERE order_id=$1',[raw])).n,`INV-${year}-00007`);

// --- Numbers stay unique, and the counter is per year.
assert.equal(Number((await one('SELECT count(DISTINCT order_number) c FROM orders')).c),
  Number((await one('SELECT count(*) c FROM orders')).c),'order numbers are unique');
await db.query(`UPDATE document_counters SET next_value=99999 WHERE scope='order' AND year=$1`,[year]);
assert.equal((await place()).id,`BET-${year}-100000`,'past 99,999 the number grows rather than wrapping');

// --- Old rows are left exactly as they were: their numbers are printed on invoices and are the
// lookup key for business_status and business_payment.
assert.equal((await one('SELECT order_number n FROM orders WHERE id=$1',[raw])).n,'BET-legacy-'+raw,
  'existing numbers are never rewritten');

// --- The statuses a rep may no longer touch (lib/permissions.ts) are still reachable by the
// roles that kept the permission, so nothing was broken on the way past.
const {PERMISSIONS}=await import('../lib/permissions.ts');
assert.ok(!PERMISSIONS['orders.status'].includes('sales_rep'),'a rep reads the status, never moves it');
for(const role of ['admin','general_manager','sales_manager','driver_manager'])
  assert.ok(PERMISSIONS['orders.status'].includes(role),role+' still moves orders');
assert.ok(PERMISSIONS['orders.create'].includes('sales_rep'),'a rep still takes orders');
// Editing a placed order is admin's and رشا's alone since 047 (the rep answers for what she entered).
assert.ok(!PERMISSIONS['orders.edit'].includes('sales_rep'),'a rep no longer edits a placed order');

console.log(`PASS test_document_numbers (orders and invoices numbered BET-${year}-00001 / INV-${year}-00001 from one shared yearly counter; the trigger names the document so no caller and no replaced function body can put a long number back; a column omitted entirely is filled; legacy rows keep their numbers; sales reps read order status but cannot move it)`);
