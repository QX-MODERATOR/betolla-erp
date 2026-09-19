import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {readFile, mkdir} from 'node:fs/promises';
import {PGlite} from '../.local-tests/node_modules/@electric-sql/pglite/dist/index.js';

// The picking list (migration 043): what has to come off the shelf, as things a person can pick.
//
// An order says "بكج رباعي بلازما [شامبو + بلسم + تريتمنت + سيروم]" — one thing sold, four things to
// lift — and the same shampoo turns up in a dozen orders. Picking from the order list means
// unpacking every package in your head and keeping a running count. So the database expands each
// package into the products it ships as and sums them across every order still to be picked, with
// the stock the system actually holds beside each line.
const root = new URL('../', import.meta.url);
const dataDir = new URL('../.local-tests/db-' + randomUUID() + '/', import.meta.url);
await mkdir(dataDir, {recursive: true});
const db = new PGlite(fileURLToPath(dataDir));
await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
await db.exec((await readFile(new URL('supabase/migrations/001_initial_schema.sql', root), 'utf8')).replace(/^CREATE EXTENSION[^;]+;/gm, ''));
const files = ['002_seed_products.sql','003_seed_reps.sql','004_driver_schema.sql','005_payment_methods.sql',
  '006_business_persistence.sql','007_customer_persistence.sql','008_inventory_persistence.sql',
  '009_customer_management.sql','010_order_inventory_linking.sql','011_payment_reversal.sql',
  '012_order_cancellation.sql','013_driver_shift_closures.sql','014_profile_persistence.sql',
  '015_customer_list_performance.sql','016_call_log_rep_attribution.sql','017_notifications.sql',
  '018_calendar_reminder_dedup.sql','019_customer_list_by_rep.sql','020_product_catalog_v2.sql',
  '021_lead_untouched_fix.sql','022_hr_core.sql','023_hr_attendance_leave.sql','024_hr_payroll.sql',
  '025_hr_talent_documents.sql','026_customer_search.sql','027_driver_operations.sql','028_auth_security.sql',
  '029_customer_ownership.sql','030_push_devices.sql','031_customer_paging.sql','032_order_owner.sql',
  '033_call_reminders.sql','036_order_edit_by_rep.sql','037_plasma_package_bundles.sql','038_promo_codes.sql',
  '039_promo_vip_merge.sql','040_readable_document_numbers.sql','041_ship_requires_driver.sql',
  '042_order_edit_window.sql','043_picking_list.sql'];
for (const f of files) await db.exec(await readFile(new URL('supabase/migrations/' + f, root), 'utf8'));
await db.exec('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; SET ROLE service_role;');

const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const idOf = async (sku) => (await one('SELECT id FROM products WHERE sku=$1', [sku])).id;
const nameOf = async (sku) => (await one('SELECT name_ar FROM products WHERE sku=$1', [sku])).name_ar;
const QUAD = 'PL-PKG-QUAD-V2-01', SHMP = 'PL-SHMP-500-V2-01', COND = 'PL-COND-500-V2-02',
  TREAT = 'PL-TREAT-500-V2-03', SERUM = 'PL-SERUM-100-V2-04';
for (const sku of [QUAD, SHMP, COND, TREAT, SERUM])
  await db.query('INSERT INTO inventory(product_id,quantity_on_hand) VALUES($1,50) ON CONFLICT (product_id) DO UPDATE SET quantity_on_hand=50', [await idOf(sku)]);

const customer = randomUUID();
await db.query(`INSERT INTO customers(id,name,phone,rep_name_raw) VALUES($1,'زبونة','0790001111','رحمة')`, [customer]);
const place = async (items, total) => (await one('SELECT business_create_order($1,$2,$3) r', ['mgr-sales-01', randomUUID(),
  JSON.stringify({customer_id: customer, customer_name: 'x', customer_phone: '0790001111', city: 'عمان', address: 'y',
    payment_method: 'cash_on_delivery', rep_name: 'رحمة', total_amount: total, items})])).r.order;
const list = async (drivers = null) => (await one('SELECT business_picking_list($1) x', [drivers])).x;
const lineFor = (l, sku) => l.lines.find((x) => x.sku === sku);

// --- A package becomes the bottles it ships as. It never appears as itself.
const quadName = await nameOf(QUAD);
await place([{name: quadName, qty: 2, price: 40}], 80);
let l = await list();
assert.equal(lineFor(l, QUAD), undefined, 'the package itself is never something to pick');
for (const sku of [SHMP, COND, TREAT, SERUM])
  assert.equal(lineFor(l, sku)?.needed, 2, `two quad packages need two ${sku}`);

// --- The same product across several orders is one line with the total.
await place([{name: await nameOf(SHMP), qty: 3, price: 13}], 39);
l = await list();
assert.equal(lineFor(l, SHMP).needed, 5, '2 from the packages + 3 sold on its own = one line of 5');
assert.equal(lineFor(l, SHMP).orders, 2, 'and it says how many orders that covers');
assert.equal(lineFor(l, COND).needed, 2, 'the other bottles are unaffected');

// --- The stock beside each line is the stock inventory holds, not a guess.
const onHand = Number((await one('SELECT quantity_on_hand q FROM inventory WHERE product_id=$1', [await idOf(SHMP)])).q);
assert.equal(lineFor(l, SHMP).available, onHand, 'available is read from inventory');
assert.equal(lineFor(l, SHMP).status, 'OK');
assert.equal(lineFor(l, SHMP).short, 0);

// --- A shortage is called out, with how many are missing.
await db.query('UPDATE inventory SET quantity_on_hand=1 WHERE product_id=$1', [await idOf(SHMP)]);
l = await list();
assert.equal(lineFor(l, SHMP).status, 'Low');
assert.equal(lineFor(l, SHMP).short, 4, 'needs 5, has 1');
assert.equal(l.short_products, 1, 'and the header counts it');

// --- Totals are the sum of the lines, so the sheet cannot disagree with itself.
assert.equal(l.total_units, l.lines.reduce((n, x) => n + x.needed, 0));
assert.equal(l.total_products, l.lines.length);

// --- Scoping: BX belongs to صابرين, so ضياء's sheet must not carry BX work.
const bxOrder = await place([{name: await nameOf(SERUM), qty: 7, price: 5}], 35);
await db.query(`UPDATE orders SET business_details=business_details||jsonb_build_object('delivery',jsonb_build_object('driver','BX Arabia'))
  WHERE order_number=$1`, [bxOrder.id]);
const forDiya = await list(['خالد', 'علي']);
const forSabreen = await list(['BX Arabia']);
const everyone = await list(null);
assert.ok(lineFor(forDiya, SERUM).needed < lineFor(everyone, SERUM).needed, "ضياء's sheet leaves out the BX order");
assert.equal(lineFor(everyone, SERUM).needed - lineFor(forDiya, SERUM).needed, 7, 'exactly the BX quantity');
assert.equal(lineFor(forSabreen, SERUM).needed, 9, "صابرين's sheet has the BX order plus the unclaimed ones");

// --- Only orders that still need picking. A delivered order is off the sheet.
const before = (await list()).total_units;
const done = await place([{name: await nameOf(COND), qty: 4, price: 13}], 52);
assert.equal((await list()).total_units, before + 4, 'a new order adds to the sheet');
await db.query(`UPDATE orders SET status='delivered' WHERE order_number=$1`, [done.id]);
assert.equal((await list()).total_units, before, 'and leaves it once delivered');

// --- For sorting: every order with its packages opened, one pile per driver.
l = await list();
const quadOrder = l.orders.find((o) => o.items.some((i) => i.sku === COND) && o.items.length === 4);
assert.ok(quadOrder, 'the package order is listed with its four bottles, not the package');
assert.ok(!l.orders.some((o) => o.items.some((i) => i.sku === QUAD)), 'no order card names a package');
assert.ok(quadOrder.items.every((i) => i.quantity === 2), 'two packages -> two of each bottle in that bag');
assert.equal(l.orders.length, l.order_count);
for (const sku of [SHMP, COND, TREAT, SERUM])
  assert.equal(l.orders.flatMap((o) => o.items).filter((i) => i.sku === sku).reduce((n, i) => n + i.quantity, 0),
    lineFor(l, sku).needed, `the bags add up to the shelf total for ${sku}`);
const drivers = l.orders.map((o) => o.driver);
assert.deepEqual(drivers.filter(Boolean), [...drivers.filter(Boolean)].sort(), 'grouped by driver');
assert.ok(drivers.every((d, i) => d !== null || drivers.slice(i).every((x) => x === null)), 'unassigned orders come last');

// --- A line that never matched a product is listed, not silently dropped by the join.
const loose = await place([{name: await nameOf(COND), qty: 1, price: 13}], 13);
const looseId = (await one('SELECT id FROM orders WHERE order_number=$1', [loose.id])).id;
await db.query(`INSERT INTO order_items(order_id,product_id,product_name_raw,quantity) VALUES($1,NULL,'زيت أرغان قديم',3)`, [looseId]);
l = await list();
assert.deepEqual(l.unlinked.map((u) => [u.product, u.quantity, u.order_number]), [['زيت أرغان قديم', 3, loose.id]]);
assert.ok(l.orders.find((o) => o.order_number === loose.id).items.some((i) => i.product === 'زيت أرغان قديم' && i.sku === null),
  "and it is in its order's bag too");

// --- The document shows what the list says, and never a package.
const doc = await readFile(new URL('components/drivers/picking-list.tsx', root), 'utf8');
assert.match(doc, /line\.needed/, 'the sheet prints the quantity to pull');
assert.match(doc, /line\.available/, 'and the stock on hand beside it');
assert.match(doc, /line\.short/, 'and the shortage');
assert.match(doc, /print-area/, 'and prints as a document');
assert.ok(!/splitPackageName/.test(doc), 'it never needs to unpack a name: the database already did');
assert.match(doc, /list\.unlinked/, 'unmatched lines are printed');
assert.match(doc, /SortingSection/, 'and the per-order sorting section');

console.log(`PASS test_picking_list (a package is expanded into the products it ships as and never appears itself; the same product across several orders is one line with the total and the order count; the stock beside each line is read from inventory and a shortage says how many are missing; the totals equal the sum of the lines; the sheet is scoped so ضياء's leaves out BX and صابرين's has it; delivered orders drop off; every order is listed with its packages opened and the bags add up to the shelf totals; a line with no product is listed rather than dropped)`);
