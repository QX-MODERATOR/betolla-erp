import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {readFile,mkdir} from 'node:fs/promises';
import {PGlite} from '../.local-tests/node_modules/@electric-sql/pglite/dist/index.js';

// Migration 037: the two plasma packages are sellable single line items priced on their own, but
// every stock movement lands on the component bottles — so the same shampoo can never be sold
// twice, once as itself and once inside a package.
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
  '033_call_reminders.sql','036_order_edit_by_rep.sql','037_plasma_package_bundles.sql'];
for(const f of files)await db.exec(await readFile(new URL('supabase/migrations/'+f,root),'utf8'));
await db.exec('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; SET ROLE service_role;');

const sku=async(s)=>(await db.query('SELECT id,name_ar,retail_price FROM products WHERE sku=$1',[s])).rows[0];
const QUAD=await sku('PL-PKG-QUAD-V2-01'), DUO=await sku('PL-PKG-DUO-V2-01');
const SHAMPOO=await sku('PL-SHMP-500-V2-01'), COND=await sku('PL-COND-500-V2-02');
const TREAT=await sku('PL-TREAT-500-V2-03'), SERUM=await sku('PL-SERUM-100-V2-04');

// The packages exist, active, at the prices the team sells them at.
assert.equal(Number(QUAD.retail_price),40);
assert.equal(Number(DUO.retail_price),25);

const stock=async(id)=>Number((await db.query('SELECT coalesce(quantity_on_hand,0) q FROM inventory WHERE product_id=$1',[id])).rows[0]?.q??0);
const setStock=async(id,q)=>db.query('INSERT INTO inventory(product_id,quantity_on_hand) VALUES($1,$2) ON CONFLICT (product_id) DO UPDATE SET quantity_on_hand=$2',[id,q]);
for(const p of [SHAMPOO,COND,TREAT,SERUM])await setStock(p.id,10);

// business_bundle_expand: a bundle becomes its parts, anything else stays itself.
const expand=async(id,qty)=>(await db.query('SELECT product_id,quantity FROM business_bundle_expand($1,$2) ORDER BY quantity,product_id',[id,qty])).rows;
assert.equal((await expand(QUAD.id,1)).length,4);
assert.equal((await expand(DUO.id,3)).length,2);
assert.deepEqual((await expand(DUO.id,3)).map(r=>Number(r.quantity)),[3,3]);
const plain=await expand(SHAMPOO.id,2);
assert.equal(plain.length,1);
assert.equal(plain[0].product_id,SHAMPOO.id);
assert.equal(Number(plain[0].quantity),2);

// business_bundle_buildable: the binding component decides.
const buildable=async(id)=>Number((await db.query('SELECT business_bundle_buildable($1) b',[id])).rows[0].b);
assert.equal(await buildable(QUAD.id),10);
await setStock(SERUM.id,3);
assert.equal(await buildable(QUAD.id),3,'the scarcest bottle caps the package');
assert.equal(await buildable(DUO.id),10,'the duo does not contain serum, so it is unaffected');
await setStock(SERUM.id,10);

// The catalog reports that buildable number as the package's stock, not a stock row of its own,
// and says what the package is made of. Order entry hides stock = 0, so this is what makes a
// package visible at all.
const catalog=(await db.query('SELECT business_inventory_catalog() c')).rows[0].c;
const row=(s)=>catalog.find(p=>p.sku===s);
assert.equal(row('PL-PKG-QUAD-V2-01').is_bundle,true);
assert.equal(row('PL-PKG-QUAD-V2-01').stock,10);
assert.equal(row('PL-PKG-QUAD-V2-01').components.length,4);
assert.equal(row('PL-SHMP-500-V2-01').is_bundle,false);
assert.equal(row('PL-SHMP-500-V2-01').stock,10);
assert.equal(row('PL-SHMP-500-V2-01').components.length,0);

// Ordering one package draws down one of each component, and nothing else.
const custId=randomUUID();
await db.query(`INSERT INTO customers(id,name,phone) VALUES($1,'زبونة البكج','0790005566')`,[custId]);
const order=async(name,price,qty)=>db.query('SELECT business_create_order($1,$2,$3) r',
  ['rep-rahma-01',randomUUID(),JSON.stringify({customer_id:custId,customer_name:'زبونة البكج',customer_phone:'0790005566',
    city:'عمان',address:'x',payment_method:'cash_on_delivery',total_amount:price*qty,
    items:[{name,qty,price}]})]);

await order(QUAD.name_ar,40,1);
assert.equal(await stock(SHAMPOO.id),9);
assert.equal(await stock(COND.id),9);
assert.equal(await stock(TREAT.id),9);
assert.equal(await stock(SERUM.id),9);
assert.equal(await stock(QUAD.id),0,'a bundle never holds stock of its own');

// Two duos take two shampoos and two conditioners; treatment and serum are untouched.
await order(DUO.name_ar,25,2);
assert.equal(await stock(SHAMPOO.id),7);
assert.equal(await stock(COND.id),7);
assert.equal(await stock(TREAT.id),9);
assert.equal(await stock(SERUM.id),9);

// The movements are posted against the bottles, which is what makes cancellation and the edit
// re-deduct (036) give the right things back without knowing bundles exist.
const moves=(await db.query(
  `SELECT p.sku,sum(m.quantity)::int q FROM inventory_movements m JOIN products p ON p.id=m.product_id
   WHERE m.reference_type='order' GROUP BY p.sku ORDER BY p.sku`)).rows;
assert.deepEqual(moves.map(r=>[r.sku,Number(r.q)]),[
  ['PL-COND-500-V2-02',-3],['PL-SERUM-100-V2-04',-1],['PL-SHMP-500-V2-01',-3],['PL-TREAT-500-V2-03',-1],
]);
assert.ok(!moves.some(r=>r.sku.startsWith('PL-PKG-')),'no movement is ever posted against a package');

// A package the components cannot cover is refused, and refused as a whole: the shampoo it would
// have taken is still on the shelf afterwards.
await setStock(SERUM.id,0);
await assert.rejects(order(QUAD.name_ar,40,1),/INSUFFICIENT_STOCK/);
assert.equal(await stock(SHAMPOO.id),7,'a refused package leaves every component untouched');
await setStock(SERUM.id,9);

// Editing an order into a package reverses the old lines and takes the new components (036+037).
const edited=(await db.query(
  `SELECT order_number FROM orders ORDER BY created_at DESC LIMIT 1`)).rows[0].order_number;
await db.query('SELECT business_order_update($1,$2,$3,$4) r',
  ['rep-rahma-01',null,randomUUID(),JSON.stringify({id:edited,items:[{name:QUAD.name_ar,qty:1,price:40}]})]);
// The duo order (2 × shampoo + 2 × conditioner) came back, and one quad went out.
assert.equal(await stock(SHAMPOO.id),8);
assert.equal(await stock(COND.id),8);
assert.equal(await stock(TREAT.id),8);
assert.equal(await stock(SERUM.id),8);

// The warehouse picking list names bottles, because bottles are what gets picked.
await db.query(`UPDATE orders SET status='processing', business_details=business_details||'{"delivery":{"driver":"خالد"}}'::jsonb
  WHERE order_number=$1`,[edited]);
const needed=(await db.query('SELECT business_driver_stock_needed() n')).rows[0].n;
assert.deepEqual(needed.map(r=>r.id).sort(),
  ['PL-COND-500-V2-02','PL-SERUM-100-V2-04','PL-SHMP-500-V2-01','PL-TREAT-500-V2-03']);
assert.ok(!needed.some(r=>r.id.startsWith('PL-PKG-')),'the picking list never asks for a package');

console.log('PASS test_plasma_package_bundles (packages priced as one line, stock and movements always on the component bottles, buildable count drives availability, all-or-nothing on short stock, edits and the picking list expand too)');
