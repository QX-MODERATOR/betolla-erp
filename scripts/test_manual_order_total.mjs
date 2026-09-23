import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {readFile, readdir, mkdir} from 'node:fs/promises';
import {PGlite} from '../.local-tests/node_modules/@electric-sql/pglite/dist/index.js';

// A hand-typed order total (migration 048).
//
// "إجمالي الطلبية المستحق" used to be the lines' total and nothing else. The owner's rule: the rep may
// set the amount agreed with the customer and answers for it; once placed, admin and رشا may change
// it. The lines keep their real prices; the gap is the discount the invoice already knows how to show.
const root = new URL('../', import.meta.url);
const dataDir = new URL('../.local-tests/db-' + randomUUID() + '/', import.meta.url);
await mkdir(dataDir, {recursive: true});
const db = new PGlite(fileURLToPath(dataDir));
await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
await db.exec((await readFile(new URL('supabase/migrations/001_initial_schema.sql', root), 'utf8')).replace(/^CREATE EXTENSION[^;]+;/gm, ''));
const files = (await readdir(new URL('supabase/migrations/', root)))
  .filter((f) => /^\d{3}_.*\.sql$/.test(f) && f !== '001_initial_schema.sql' && f.slice(0, 3) <= '048').sort();
assert.ok(files.includes('048_manual_order_total.sql'));
for (const f of files) await db.exec(await readFile(new URL('supabase/migrations/' + f, root), 'utf8'));
await db.exec('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; SET ROLE service_role;');

const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const SHMP = 'PL-SHMP-500-V2-01';
const name = (await one('SELECT name_ar FROM products WHERE sku=$1', [SHMP])).name_ar;
const customer = randomUUID();
await db.query(`INSERT INTO customers(id,name,phone,rep_name_raw) VALUES($1,'زبونة','0790001111','رحمة')`, [customer]);
const place = (total, override) => one('SELECT business_create_order($1,$2,$3) r', ['rep-rahma-01', randomUUID(),
  JSON.stringify({customer_id: customer, customer_name: 'x', customer_phone: '0790001111', city: 'عمان', address: 'y',
    payment_method: 'cash_on_delivery', rep_name: 'رحمة', total_amount: total, ...(override ? {total_override: true} : {}),
    items: [{name, qty: 2, price: 13}]})]);
const money = async (orderNumber) => one(`SELECT o.total_amount::float t, o.subtotal::float s, o.discount_amount::float d,
  i.total_amount::float it, i.subtotal::float isub, i.discount_amount::float idisc,
  (SELECT sum(total_price)::float FROM order_items WHERE order_id=o.id) lines
  FROM orders o JOIN invoices i ON i.order_id=o.id WHERE o.order_number=$1`, [orderNumber]);
const edit = (id, data) => one('SELECT business_order_update($1,$2,$3,$4) r', ['admin-betolla-01', null, randomUUID(), JSON.stringify({id, ...data})]);

// --- Without the flag nothing changed: a total that disagrees with the lines is refused.
await assert.rejects(place(20), /TOTAL_MISMATCH/);
assert.equal((await place(26)).r.order.total_amount, 26);

// --- A typed total below the lines: charged 20, lines still 26, the 6 is the discount on both.
let ord = (await place(20, true)).r.order;
assert.equal(ord.total_amount, 20);
assert.deepEqual(await money(ord.id), {t: 20, s: 26, d: 6, it: 20, isub: 26, idisc: 6, lines: 26});
assert.equal(ord.invoice_discount, 6, 'the order document carries the discount the invoice prints');

// --- Above the lines: the amount due, no discount.
const up = (await place(30, true)).r.order;
assert.deepEqual(await money(up.id), {t: 30, s: 30, d: 0, it: 30, isub: 30, idisc: 0, lines: 26});

// --- Admin/رشا change the total afterwards, alone or with the lines; the history records it.
await edit(ord.id, {total_amount: 22});
assert.deepEqual(await money(ord.id), {t: 22, s: 26, d: 4, it: 22, isub: 26, idisc: 4, lines: 26});
await edit(ord.id, {items: [{name, qty: 3, price: 13}], total_amount: 35});
assert.deepEqual(await money(ord.id), {t: 35, s: 39, d: 4, it: 35, isub: 39, idisc: 4, lines: 39});
const change = await one(`SELECT changes FROM order_changes c JOIN orders o ON o.id=c.order_id WHERE o.order_number=$1 ORDER BY changed_at DESC LIMIT 1`, [ord.id]);
assert.ok(change.changes.total_amount, 'the change log shows the total moving');
// Lines changed with no total: back to the lines' total, no discount — the form resends a kept total.
await edit(ord.id, {items: [{name, qty: 1, price: 13}]});
assert.deepEqual(await money(ord.id), {t: 13, s: 13, d: 0, it: 13, isub: 13, idisc: 0, lines: 13});
await assert.rejects(edit(ord.id, {total_amount: 0}), /INVALID_AMOUNT/);
await assert.rejects(edit(ord.id, {total_amount: -5}), /INVALID_AMOUNT/);

// --- Once money has come in, the total is fixed, like the lines.
const inv = await one(`SELECT i.id FROM invoices i JOIN orders o ON o.id=i.order_id WHERE o.order_number=$1`, [ord.id]);
await db.query(`INSERT INTO payments(invoice_id,amount,payment_method) VALUES($1,5,'cash')`, [inv.id]).catch(async () =>
  db.query(`INSERT INTO payments(invoice_id,amount) VALUES($1,5)`, [inv.id]));
await assert.rejects(edit(ord.id, {total_amount: 10}), /HAS_PAYMENTS/);

// --- Source guards: both screens let the total be typed and send it the way the API expects.
const sales = await readFile(new URL('app/sales/page.tsx', root), 'utf8');
assert.ok(/total_override: true/.test(sales) && /setManualTotal\(e\.target\.value\)/.test(sales), '/sales: the total is an input');
const orders = await readFile(new URL('components/orders/orders-workspace.tsx', root), 'utf8');
assert.ok(!orders.includes('غير قابل للتعديل يدوياً'), 'the edit form no longer says the total is locked');
assert.ok(/total_amount:Math\.round\(editManualValue!\*1000\)\/1000/.test(orders), 'the edit form sends a typed total');

console.log('PASS test_manual_order_total (a total that disagrees with the lines is still refused unless typed on purpose; a typed total below the lines is charged with the gap as the discount on order and invoice, above them it is the amount due; admin/رشا change it afterwards with or without the lines and the change log records it; zero, negative and paid orders are refused; /sales and the edit form both expose the field)');
