import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {readFile, readdir, mkdir} from 'node:fs/promises';
import {PGlite} from '../.local-tests/node_modules/@electric-sql/pglite/dist/index.js';

// Selling beyond stock (migration 047) and who may change an order afterwards (lib/permissions.ts).
//
// The 35 products the new catalogue added start at 0 because nobody has counted them. The owner's
// rule: the rep enters what the customer wants and answers for it; stock may go below zero; only
// admin and رشا edit a placed order. Replacing business_status for this also had to keep packages
// honest in the two places 041 did not: confirming a draft and putting stock back.
const root = new URL('../', import.meta.url);
const dataDir = new URL('../.local-tests/db-' + randomUUID() + '/', import.meta.url);
await mkdir(dataDir, {recursive: true});
const db = new PGlite(fileURLToPath(dataDir));
await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
await db.exec((await readFile(new URL('supabase/migrations/001_initial_schema.sql', root), 'utf8')).replace(/^CREATE EXTENSION[^;]+;/gm, ''));
const files = (await readdir(new URL('supabase/migrations/', root)))
  .filter((f) => /^\d{3}_.*\.sql$/.test(f) && f !== '001_initial_schema.sql' && f.slice(0, 3) <= '047').sort();
assert.ok(files.includes('047_sell_beyond_stock.sql'));
for (const f of files) await db.exec(await readFile(new URL('supabase/migrations/' + f, root), 'utf8'));
await db.exec('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; SET ROLE service_role;');

const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const nameOf = async (sku) => (await one('SELECT name_ar FROM products WHERE sku=$1', [sku])).name_ar;
const stock = async (sku) => (await one(`SELECT i.quantity_on_hand q FROM inventory i JOIN products p ON p.id = i.product_id WHERE p.sku = $1`, [sku])).q;
const setStock = (sku, q) => db.query(`UPDATE inventory i SET quantity_on_hand = $2 FROM products p WHERE p.id = i.product_id AND p.sku = $1`, [sku, q]);
const customer = randomUUID();
await db.query(`INSERT INTO customers(id,name,phone,rep_name_raw) VALUES($1,'زبونة','0790001111','رحمة')`, [customer]);
const place = async (lines, status) => (await one('SELECT business_create_order($1,$2,$3) r', ['rep-rahma-01', randomUUID(),
  JSON.stringify({customer_id: customer, customer_name: 'x', customer_phone: '0790001111', city: 'عمان', address: 'y',
    payment_method: 'cash_on_delivery', rep_name: 'رحمة', ...(status ? {status} : {}),
    total_amount: lines.reduce((s, l) => s + l.qty * l.price, 0),
    items: await Promise.all(lines.map(async (l) => ({name: await nameOf(l.sku), qty: l.qty, price: l.price})))})])).r.order;
const move = (id, status, expected, driver) => one('SELECT business_status($1,$2,$3,$4) r',
  ['diya-drivers-01', null, randomUUID(), JSON.stringify({id, status, expected_status: expected, ...(driver ? {driver} : {})})]);

// --- A product with nothing on the shelf is sold, and the balance goes negative.
const LENS = 'BT-LENS-10', SHMP = 'PL-SHMP-500-V2-01', COND = 'PL-COND-500-V2-02', DUO = 'PL-PKG-DUO-V2-01';
assert.equal(await stock(LENS), 0);
let ord = await place([{sku: LENS, qty: 3, price: 25}]);
assert.equal(ord.status, 'confirmed');
assert.equal(await stock(LENS), -3, 'the shortfall shows as a negative balance');

// --- A package in a draft takes its bottles when confirmed, even when that goes below zero.
await setStock(SHMP, 1); await setStock(COND, 1);
ord = await place([{sku: DUO, qty: 2, price: 25}], 'draft');
assert.equal(await stock(SHMP), 1, 'a draft takes nothing');
await move(ord.id, 'confirmed', 'draft');
assert.equal(await stock(SHMP), -1);
assert.equal(await stock(COND), -1);

// --- Cancelling puts back exactly what it took: the bottles, not the package.
await move(ord.id, 'cancelled', 'confirmed');
assert.equal(await stock(SHMP), 1);
assert.equal(await stock(COND), 1);

// --- A return does the same.
ord = await place([{sku: DUO, qty: 1, price: 25}, {sku: LENS, qty: 1, price: 25}]);
assert.equal(await stock(SHMP), 0);
await move(ord.id, 'processing', 'confirmed');
await move(ord.id, 'shipped', 'processing', 'علي');
await move(ord.id, 'returned', 'shipped');
assert.equal(await stock(SHMP), 1);
assert.equal(await stock(COND), 1);
assert.equal(await stock(LENS), -3, 'the returned lens is back; the earlier sale still stands');

// --- Taking stock out by hand is still refused below zero: that is a counting mistake, not a sale.
await assert.rejects(one('SELECT business_inventory_movement_create($1,$2,$3) r', ['admin-betolla-01', randomUUID(),
  JSON.stringify({sku: SHMP, type: 'adjustment', delta: -5})]), /INSUFFICIENT_STOCK/);

// --- Only admin and رشا edit a placed order.
const {can} = await import('../lib/permissions.ts');
assert.equal(can('admin', 'orders.edit'), true);
assert.equal(can('sales_manager', 'orders.edit', 'mgr-rasha-01'), true, 'رشا');
assert.equal(can('sales_manager', 'orders.edit', 'mgr-sales-01'), false, 'the other sales manager account');
for (const role of ['sales_rep', 'marketing', 'marketing_manager', 'general_manager', 'driver_manager'])
  assert.equal(can(role, 'orders.edit', 'someone'), false, role);
assert.equal(can('sales_rep', 'orders.create'), true, 'reps still take orders');
assert.equal(can('sales_manager', 'orders.status', 'mgr-rasha-01'), true, 'the grant adds, it does not replace her role');

// --- Source guard: order entry offers everything and never disables "+" at the stock level.
const sales = await readFile(new URL('app/sales/page.tsx', root), 'utf8');
assert.ok(!/filter\(\(p\) => p\.stock > 0\)/.test(sales), 'order entry must not hide products at stock 0');
assert.ok(!/disabled=\{qty >= product\.stock\}/.test(sales), 'the + button must not stop at the stock level');
assert.ok(sales.includes('على مسؤولية المندوب'), 'a line beyond the stock warns the rep');

console.log('PASS test_sell_beyond_stock (an order for a product at stock 0 is placed and the balance goes negative; a draft package takes its bottles on confirm; cancel and return put back the bottles the order took; manual stock-out below zero is still refused; only admin and رشا edit a placed order; /sales offers every product and only warns past the stock)');
