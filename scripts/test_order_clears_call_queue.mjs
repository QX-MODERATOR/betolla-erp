import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {readFile,mkdir} from 'node:fs/promises';
import {PGlite} from '../.local-tests/node_modules/@electric-sql/pglite/dist/index.js';

// Migration 034: business_create_order must clear next_call_date and stamp last_contact_date on
// the customer, so an ordered-for lead drops out of the dashboard count and the rep's call queue.
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
  '033_call_reminders.sql','034_order_clears_call_queue.sql'];
for(const f of files)await db.exec(await readFile(new URL('supabase/migrations/'+f,root),'utf8'));
await db.exec('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; SET ROLE service_role;');

const custId=randomUUID();
await db.query(
  `INSERT INTO customers(id,name,phone,rep_name_raw,next_call_date,last_contact_date) VALUES($1,'Test Lead','0790000001','رحمة','2026-09-20',NULL)`,
  [custId]
);

const orderData={customer_id:custId,customer_name:'Test Lead',customer_phone:'0790000001',
  total_amount:13,status:'draft',payment_method:'cash_on_delivery',items:[{name:'شامبو بلازما',qty:1,price:13}]};
await db.query('SELECT business_create_order($1,$2,$3)',['rep-rahma-01',randomUUID(),JSON.stringify(orderData)]);

const {rows}=await db.query('SELECT next_call_date,last_contact_date FROM customers WHERE id=$1',[custId]);
assert.equal(rows[0].next_call_date,null,'next_call_date must be cleared once an order is placed');
assert.ok(rows[0].last_contact_date,'last_contact_date must be stamped once an order is placed');

// A second order for a NEW customer (no prior next_call_date) should not error and should also stamp it.
const orderData2={customer_name:'Fresh Lead',customer_phone:'0790000002',
  total_amount:13,status:'draft',payment_method:'cash_on_delivery',items:[{name:'شامبو بلازما',qty:1,price:13}]};
await db.query('SELECT business_create_order($1,$2,$3)',['rep-rahma-01',randomUUID(),JSON.stringify(orderData2)]);
const {rows:freshRows}=await db.query("SELECT next_call_date,last_contact_date FROM customers WHERE phone='0790000002'");
assert.equal(freshRows.length,1);
assert.equal(freshRows[0].next_call_date,null);
assert.ok(freshRows[0].last_contact_date);

console.log('PASS test_order_clears_call_queue (business_create_order clears next_call_date and stamps last_contact_date)');
await db.close();
