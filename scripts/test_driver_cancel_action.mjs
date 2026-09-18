import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {readFile,mkdir} from 'node:fs/promises';
import {PGlite} from '../.local-tests/node_modules/@electric-sql/pglite/dist/index.js';

// Migration 035: business_driver_action gets a 'cancel' action, confirmed/processing only,
// reversing any deducted stock — mirrors 'return's inventory logic but ends at 'cancelled'.
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
  '033_call_reminders.sql','035_driver_cancel_action.sql'];
for(const f of files)await db.exec(await readFile(new URL('supabase/migrations/'+f,root),'utf8'));
await db.exec('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; SET ROLE service_role;');

const custId=randomUUID();
await db.query(`INSERT INTO customers(id,name,phone) VALUES($1,'Test Customer','0790000001')`,[custId]);
const productId=(await db.query("SELECT id FROM products WHERE is_active LIMIT 1")).rows[0].id;
await db.query('INSERT INTO inventory(product_id,quantity_on_hand) VALUES($1,50) ON CONFLICT (product_id) DO UPDATE SET quantity_on_hand=50',[productId]);
const orderId=randomUUID();
await db.query(
  `INSERT INTO orders(id,order_number,customer_id,status,total_amount,payment_method,order_date)
   VALUES($1,'BET-TEST-CANCEL',$2,'processing',13,'cash_on_delivery',current_date)`,
  [orderId,custId]
);
await db.query(
  `INSERT INTO order_items(order_id,product_id,product_name_raw,quantity,unit_price,total_price,price_is_known)
   VALUES($1,$2,'Test item',2,6.5,13,true)`,
  [orderId,productId]
);
await db.query(
  "INSERT INTO inventory_movements(product_id,movement_type,quantity,reference_type,reference_id) VALUES($1,'sale_out',-2,'order',$2)",
  [productId,orderId]
);
await db.query('UPDATE inventory SET quantity_on_hand=quantity_on_hand-2 WHERE product_id=$1',[productId]);

// Cancelling a shipped order must be rejected.
await db.query("UPDATE orders SET status='shipped' WHERE id=$1",[orderId]);
await assert.rejects(
  db.query('SELECT business_driver_action($1,$2,$3)',['admin-betolla-01',randomUUID(),
    JSON.stringify({id:'BET-TEST-CANCEL',action:'cancel',expected_status:'shipped'})]),
  /INVALID_STATUS/
);

// Cancelling a processing order succeeds and returns the deducted stock.
await db.query("UPDATE orders SET status='processing' WHERE id=$1",[orderId]);
await db.query('SELECT business_driver_action($1,$2,$3)',['admin-betolla-01',randomUUID(),
  JSON.stringify({id:'BET-TEST-CANCEL',action:'cancel',expected_status:'processing'})]);

const {rows:[ord]}=await db.query('SELECT status,cancelled_at FROM orders WHERE id=$1',[orderId]);
assert.equal(ord.status,'cancelled');
assert.ok(ord.cancelled_at);
const {rows:[inv]}=await db.query('SELECT quantity_on_hand FROM inventory WHERE product_id=$1',[productId]);
assert.equal(Number(inv.quantity_on_hand),50,'the 2 deducted units must be returned to stock');

console.log('PASS test_driver_cancel_action (cancel blocked once shipped, allowed pre-ship with stock reversal)');
await db.close();
