import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {readFile, readdir, mkdir} from 'node:fs/promises';
import {PGlite} from '../.local-tests/node_modules/@electric-sql/pglite/dist/index.js';

// The new catalogue (migration 046, generated from scripts/inventory/new-inventory.csv).
//
// The warehouse's list replaced the catalogue, but 27 of its 62 products are ones the system
// already sold under longer names. Those must come through as the same rows — same SKU, price,
// stock and history — or the VIP price code, the free-sample codes, the plasma packages and the
// order lines that point at them all break at once. The 35 the system never had arrive with the
// sales team's price and a stock of 0, and everything not on the list stops being offered.
const root = new URL('../', import.meta.url);
const dataDir = new URL('../.local-tests/db-' + randomUUID() + '/', import.meta.url);
await mkdir(dataDir, {recursive: true});
const db = new PGlite(fileURLToPath(dataDir));
await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
await db.exec((await readFile(new URL('supabase/migrations/001_initial_schema.sql', root), 'utf8')).replace(/^CREATE EXTENSION[^;]+;/gm, ''));
const files = (await readdir(new URL('supabase/migrations/', root)))
  .filter((f) => /^\d{3}_.*\.sql$/.test(f) && f !== '001_initial_schema.sql' && f.slice(0, 3) <= '044').sort();
for (const f of files) await db.exec(await readFile(new URL('supabase/migrations/' + f, root), 'utf8'));
await db.exec('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; SET ROLE service_role;');

const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const product = (sku) => one(`SELECT p.*, i.quantity_on_hand, i.reorder_level FROM products p
  LEFT JOIN inventory i ON i.product_id = p.id WHERE p.sku = $1`, [sku]);

// Make the fixture look like production before the switch: the counts the sales team confirmed.
await db.query(`UPDATE inventory i SET quantity_on_hand = 13 FROM products p WHERE p.id = i.product_id AND p.sku = 'PL-SHMP-500-V2-01'`);
await db.query(`UPDATE inventory i SET quantity_on_hand = 19 FROM products p WHERE p.id = i.product_id AND p.sku = 'MOR-FILLER-150-V2-08'`);
const before = await product('PL-SHMP-500-V2-01');
const retiredId = (await product('EL-MC-V2-01')).id;
await db.query(`INSERT INTO inventory_movements(product_id, movement_type, quantity, reference_type) VALUES ($1, 'adjustment', 3, 'manual')`, [retiredId]);

await db.exec(await readFile(new URL('supabase/migrations/046_new_inventory.sql', root), 'utf8'));

// --- A product the system already had keeps its row and numbers, under the warehouse's name.
const shampoo = await product('PL-SHMP-500-V2-01');
assert.equal(shampoo.id, before.id, 'same row, so order lines and promo rules still point at it');
assert.equal(shampoo.name_ar, 'شامبو بلازما 500 مل');
assert.equal(Number(shampoo.retail_price), 13);
assert.equal(shampoo.quantity_on_hand, 13, 'stock carried over, not reset');
const filler = await product('MOR-FILLER-150-V2-08');
assert.equal(filler.name_ar, 'فيلر 100 مل');
assert.equal(filler.quantity_on_hand, 19);
assert.equal(Number(filler.retail_price), 43);
assert.equal((await product('PL-TREAT-100-GIFT-V2-05')).name_ar, 'ماسك بلازما 100 مل');
assert.equal(Number((await product('PL-TREAT-100-GIFT-V2-05')).retail_price), 0, 'the gift stays free');
const cat = await one(`SELECT c.slug FROM products p JOIN categories c ON c.id = p.category_id WHERE p.sku = 'MOR-FILLER-1L-V2-07'`);
assert.equal(cat.slug, 'professional-proteins', 'filler moves to the proteins, as the warehouse files it');

// --- The ones the system never had: the sales team's price, stock 0.
const lens = await one(`SELECT p.*, i.quantity_on_hand FROM products p JOIN inventory i ON i.product_id = p.id WHERE p.name_ar = 'Meral Blue (103)'`);
assert.equal(Number(lens.retail_price), 25);
assert.equal(lens.quantity_on_hand, 0);
assert.equal(lens.is_active, true);
assert.equal(Number((await one(`SELECT retail_price FROM products WHERE name_ar = 'سشوار ماك'`)).retail_price), 40);
assert.equal(Number((await one(`SELECT retail_price FROM products WHERE name_ar = 'شامبو مور ريبير لتر'`)).retail_price), 28);
assert.equal((await one(`SELECT name_en FROM products WHERE name_ar = 'شامبو ارجان ريبير 500 مل'`)).name_en, 'Shampoo Argan Repair 500ml');

// --- What is offered now: the 62, plus the two plasma packages whose bottles all survived.
const active = (await db.query(`SELECT sku FROM products WHERE is_active ORDER BY sku`)).rows.map((r) => r.sku);
assert.equal(active.length, 64);
assert.ok(active.includes('PL-PKG-DUO-V2-01') && active.includes('PL-PKG-QUAD-V2-01'));
for (const gone of ['EL-MC-V2-01', 'LENS-MED-V2-01', 'MOR-REPAIR-SET-1L-V2-01', 'PROT-THERAPY-1L-V2-13'])
  assert.equal((await product(gone)).is_active, false, gone + ' is not on the list');
assert.equal((await one(`SELECT count(*)::int n FROM inventory_movements WHERE product_id = $1`, [retiredId])).n, 1,
  'a retired product keeps its history');
const catalog = (await one('SELECT business_inventory_catalog() c')).c;
const listed = (Array.isArray(catalog) ? catalog : catalog.products ?? catalog.items).map((p) => p.sku);
assert.ok(!listed.includes('EL-MC-V2-01'), 'the catalogue no longer offers a retired product');
assert.ok(listed.includes('BT-LENS-10'));

// --- Promo codes kept working because the SKUs they name were kept.
const customer = randomUUID();
await db.query(`INSERT INTO customers(id,name,phone,rep_name_raw) VALUES ($1,'علي','0790002222','رحمة')`, [customer]);
const q = (await one('SELECT business_promo_quote($1,$2,$3,$4) q', ['VIP', customer, 'rep-rahma-01',
  JSON.stringify([{sku: 'PL-SHMP-500-V2-01', qty: 1}, {sku: 'PL-PKG-DUO-V2-01', qty: 1}])])).q;
assert.equal(q.ok, true);
assert.deepEqual(q.items.map((i) => Number(i.price)), [11, 20]);

console.log('PASS test_new_inventory (27 products kept their rows, stock and price under new names; 35 new ones at the sales team\'s price with stock 0; everything else retired with history intact; VIP and the plasma packages still work)');
