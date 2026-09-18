import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {readFile,mkdir} from 'node:fs/promises';
import {PGlite} from '../.local-tests/node_modules/@electric-sql/pglite/dist/index.js';

// Migration 041: goods do not leave the building without someone named to carry them.
//
// /orders moved processing -> shipped through business_status, which never looked at the driver,
// while the real dispatch path (business_driver_dispatch, 027) only ships an order that ALREADY has
// one. Every order shipped from /orders therefore landed in a state the driver module cannot
// represent, and ضياء's page never saw the work. The rule now lives in business_status, so no path
// can put an order on the road anonymously.
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
  '039_promo_vip_merge.sql','040_readable_document_numbers.sql','041_ship_requires_driver.sql'];
for(const f of files)await db.exec(await readFile(new URL('supabase/migrations/'+f,root),'utf8'));
await db.exec('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; SET ROLE service_role;');

const one=async(sql,params=[])=>(await db.query(sql,params)).rows[0];
const idOf=async(sku)=>(await one('SELECT id FROM products WHERE sku=$1',[sku])).id;
const nameOf=async(sku)=>(await one('SELECT name_ar FROM products WHERE sku=$1',[sku])).name_ar;
const SKU='PL-SHMP-500-V2-01';
await db.query('INSERT INTO inventory(product_id,quantity_on_hand) VALUES($1,500) ON CONFLICT (product_id) DO UPDATE SET quantity_on_hand=500',[await idOf(SKU)]);
const customer=randomUUID();
await db.query(`INSERT INTO customers(id,name,phone,rep_name_raw) VALUES($1,'زبونة','0790001111','رحمة')`,[customer]);

const place=async()=>(await one('SELECT business_create_order($1,$2,$3) r',['mgr-sales-01',randomUUID(),
  JSON.stringify({customer_id:customer,customer_name:'x',customer_phone:'0790001111',city:'عمان',address:'y',
    payment_method:'cash_on_delivery',rep_name:'رحمة',total_amount:13,
    items:[{name:await nameOf(SKU),qty:1,price:13}]})])).r.order;
const move=(id,status,expected,driver)=>one('SELECT business_status($1,$2,$3,$4) r',
  ['diya-drivers-01',null,randomUUID(),JSON.stringify({id,status,expected_status:expected,...(driver?{driver}:{})})]);

// --- An order cannot go out unnamed.
let ord=await place();
await move(ord.id,'processing','confirmed');
await assert.rejects(move(ord.id,'shipped','processing'),/DRIVER_REQUIRED/,
  'processing -> shipped with no driver is refused, which is what /orders used to do freely');
assert.equal((await one('SELECT status FROM orders WHERE order_number=$1',[ord.id])).status,'processing',
  'and the order stays where it was');

// --- Naming the driver on the call ships it, and stamps it the way the driver module reads.
let res=(await move(ord.id,'shipped','processing','علي')).r;
assert.equal(res.order.status,'shipped');
assert.equal(res.order.driver,'علي','the document reports the driver');
assert.ok(res.order.shipped_at,'and when it left');
assert.equal((await one(`SELECT business_driver_of(business_details,notes) d FROM orders WHERE order_number=$1`,[ord.id])).d,'علي',
  'stored where business_driver_of reads it — the same place business_driver_dispatch writes');
assert.equal((await one(`SELECT business_details->'delivery'->>'dispatched_by' b FROM orders WHERE order_number=$1`,[ord.id])).b,'diya-drivers-01',
  'and who sent it out');

// --- A driver assigned earlier (the /drivers flow) is enough on its own.
ord=await place();
await move(ord.id,'processing','confirmed');
await db.query(`UPDATE orders SET business_details=business_details||jsonb_build_object('delivery',jsonb_build_object('driver','BX Arabia'))
  WHERE order_number=$1`,[ord.id]);
res=(await move(ord.id,'shipped','processing')).r;
assert.equal(res.order.driver,'BX Arabia','an already-assigned driver needs no second naming');

// --- Names are typed by hand, so they canonicalise the way the driver module does.
ord=await place();
await move(ord.id,'processing','confirmed');
res=(await move(ord.id,'shipped','processing','bx')).r;
assert.equal(res.order.driver,'BX Arabia','"bx" is BX Arabia');

// --- Every other transition is untouched, including the stock it moves.
ord=await place();
const before=Number((await one('SELECT quantity_on_hand q FROM inventory WHERE product_id=$1',[await idOf(SKU)])).q);
await move(ord.id,'processing','confirmed');
await move(ord.id,'cancelled','processing');
assert.equal(Number((await one('SELECT quantity_on_hand q FROM inventory WHERE product_id=$1',[await idOf(SKU)])).q),before+1,
  'cancelling still puts the stock back');
ord=await place();
await move(ord.id,'processing','confirmed');
await move(ord.id,'shipped','processing','خالد');
res=(await move(ord.id,'returned','shipped')).r;
assert.equal(res.order.status,'returned');
assert.equal(res.order.driver,'خالد','a returned order still remembers who carried it');

// --- The timeline's data: every stamp the order document now exposes.
ord=await place();
await move(ord.id,'processing','confirmed');
res=(await move(ord.id,'shipped','processing','علي')).r;
const doc=(await move(ord.id,'delivered','shipped')).r.order;
for(const field of ['created_at','confirmed_at','shipped_at','delivered_at'])
  assert.ok(doc[field],'the document carries '+field+' for the timeline');
assert.equal(doc.cancelled_at,null,'and leaves the steps it never reached empty');
assert.ok(doc.dispatched_at,'including when it was handed over');

// --- A draft that was cancelled before shipping has no driver and no shipped stamp: the timeline
// has to be able to tell "never went out" from "went out unrecorded".
ord=await place();
await move(ord.id,'cancelled','confirmed');
const killed=(await one('SELECT business_order_document(id) d FROM orders WHERE order_number=$1',[ord.id])).d;
assert.equal(killed.shipped_at,null);
assert.equal(killed.driver,null);
assert.ok(killed.cancelled_at);

console.log('PASS test_ship_requires_driver (processing -> shipped is refused without a driver and the order does not move; a driver named on the call or assigned earlier both work and canonicalise; the stamp lands where business_driver_of reads it so /orders and /drivers agree; confirm/cancel/return and their stock effects are unchanged; the order document carries the lifecycle timestamps and driver the timeline draws)');
