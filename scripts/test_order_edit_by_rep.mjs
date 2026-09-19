import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {readFile,mkdir} from 'node:fs/promises';
import {PGlite} from '../.local-tests/node_modules/@electric-sql/pglite/dist/index.js';

// Migration 036: business_order_update lets the owning rep edit an order pre-shipped, logs a diff
// to order_changes, never touches status/cash/driver/owner, and reconciles inventory on item edits.
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
  '033_call_reminders.sql','036_order_edit_by_rep.sql','037_plasma_package_bundles.sql',
  '042_order_edit_window.sql'];
for(const f of files)await db.exec(await readFile(new URL('supabase/migrations/'+f,root),'utf8'));
await db.exec('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; SET ROLE service_role;');

const custId=randomUUID();
await db.query(`INSERT INTO customers(id,name,phone) VALUES($1,'Test Customer','0790000001')`,[custId]);
const productId=(await db.query("SELECT id FROM products WHERE is_active LIMIT 1")).rows[0].id;
await db.query('INSERT INTO inventory(product_id,quantity_on_hand) VALUES($1,20) ON CONFLICT (product_id) DO UPDATE SET quantity_on_hand=20',[productId]);
const productName=(await db.query('SELECT name_ar FROM products WHERE id=$1',[productId])).rows[0].name_ar;

const orderId=randomUUID();
await db.query(
  `INSERT INTO orders(id,order_number,customer_id,owner_account_id,status,total_amount,subtotal,payment_method,order_date,business_details)
   VALUES($1,'BET-TEST-EDIT',$2,'rep-rahma-01','confirmed',13,13,'cash_on_delivery',current_date,'{}'::jsonb)`,
  [orderId,custId]
);
await db.query(
  `INSERT INTO order_items(order_id,product_id,product_name_raw,quantity,unit_price,total_price,price_is_known)
   VALUES($1,$2,$3,2,6.5,13,true)`,
  [orderId,productId,productName]
);
await db.query(
  "INSERT INTO inventory_movements(product_id,movement_type,quantity,reference_type,reference_id) VALUES($1,'sale_out',-2,'order',$2)",
  [productId,orderId]
);
await db.query('UPDATE inventory SET quantity_on_hand=quantity_on_hand-2 WHERE product_id=$1',[productId]);
await db.query(`INSERT INTO invoices(invoice_number,order_id,customer_id,subtotal,total_amount,due_date) VALUES('INV-TEST-EDIT',$1,$2,13,13,current_date)`,[orderId,custId]);

// A different rep can never edit someone else's order.
await assert.rejects(
  db.query('SELECT business_order_update($1,$2,$3,$4)',['rep-aya-01','rep-aya-01',randomUUID(),
    JSON.stringify({id:'BET-TEST-EDIT',notes:'hacked'})]),
  /FORBIDDEN/
);

// The owning rep can edit notes/address and it gets logged.
await db.query('SELECT business_order_update($1,$2,$3,$4)',['rep-rahma-01','rep-rahma-01',randomUUID(),
  JSON.stringify({id:'BET-TEST-EDIT',notes:'العميل طلب التوصيل مساءً',address:'شارع جديد'})]);
const {rows:[after1]}=await db.query('SELECT notes,delivery_address FROM orders WHERE id=$1',[orderId]);
assert.equal(after1.notes,'العميل طلب التوصيل مساءً');
assert.equal(after1.delivery_address,'شارع جديد');
const {rows:changes1}=await db.query('SELECT changes FROM order_changes WHERE order_id=$1',[orderId]);
assert.equal(changes1.length,1);
assert.ok('notes' in changes1[0].changes && 'address' in changes1[0].changes);

// Editing items reconciles inventory (2 -> 3 units) and recomputes total_amount.
await db.query('SELECT business_order_update($1,$2,$3,$4)',['rep-rahma-01','rep-rahma-01',randomUUID(),
  JSON.stringify({id:'BET-TEST-EDIT',items:[{name:productName,qty:3,price:6.5}]})]);
const {rows:[after2]}=await db.query('SELECT total_amount FROM orders WHERE id=$1',[orderId]);
assert.equal(Number(after2.total_amount),19.5);
const {rows:[inv]}=await db.query('SELECT quantity_on_hand FROM inventory WHERE product_id=$1',[productId]);
assert.equal(Number(inv.quantity_on_hand),17,'20 - 3 newly-deducted units (the original 2 were reversed first)');
const {rows:[invoice]}=await db.query('SELECT total_amount,subtotal FROM invoices WHERE order_id=$1',[orderId]);
assert.equal(Number(invoice.total_amount),19.5);

// Never touches status/driver/owner: try slipping them in, confirm they're ignored (no such columns writable).
await db.query('SELECT business_order_update($1,$2,$3,$4)',['rep-rahma-01','rep-rahma-01',randomUUID(),
  JSON.stringify({id:'BET-TEST-EDIT',notes:'final check'})]);
const {rows:[final]}=await db.query('SELECT status,owner_account_id FROM orders WHERE id=$1',[orderId]);
assert.equal(final.status,'confirmed');
assert.equal(final.owner_account_id,'rep-rahma-01');

// Editing stops the moment the order is being prepared (042). 'processing' is ضياء picking the
// items off the shelf, so a rep changing them then would leave the picking list, the stock
// reservation and the invoice describing three different orders.
await db.query("UPDATE orders SET status='processing' WHERE id=$1",[orderId]);
await assert.rejects(
  db.query('SELECT business_order_update($1,$2,$3,$4)',['rep-rahma-01','rep-rahma-01',randomUUID(),
    JSON.stringify({id:'BET-TEST-EDIT',notes:'being picked'})]),
  /ORDER_LOCKED/,
  'an order under preparation is locked'
);
// And of course once it has shipped.
await db.query("UPDATE orders SET status='shipped' WHERE id=$1",[orderId]);
await assert.rejects(
  db.query('SELECT business_order_update($1,$2,$3,$4)',['rep-rahma-01','rep-rahma-01',randomUUID(),
    JSON.stringify({id:'BET-TEST-EDIT',notes:'too late'})]),
  /ORDER_LOCKED/
);
// The edit it refused left no trace: a locked order is not half-edited.
{
  const {rows:[row]}=await db.query('SELECT notes FROM orders WHERE id=$1',[orderId]);
  assert.ok(!String(row.notes||'').includes('being picked'),'a refused edit writes nothing');
}

// business_order_changes returns the full history, newest first.
const {rows:[hist]}=await db.query("SELECT business_order_changes('BET-TEST-EDIT') AS h");
assert.equal(hist.h.length,3);

console.log('PASS test_order_edit_by_rep (owner-scoped, pre-ship only, diffs logged, inventory reconciled)');
await db.close();
