import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {readFile, mkdir} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import {PGlite} from '../.local-tests/node_modules/@electric-sql/pglite/dist/index.js';

// What a rep hands a customer and what finance chases must be the same money.
//
// They were not. The printed order statement did its own arithmetic —
// `outstanding = max(0, total - paid)` — and never looked at `collectible`, while /api/finance
// reads orders through toInvoice, which knows a cancelled or returned order is not collectible and
// that money already taken on one is a credit owed back. So a rep could print a statement
// demanding the full balance on an order the finance page showed as settled.
//
// Both now come through toInvoice. This suite pins that: the same order, read both ways, must
// state the same numbers — at every status, with and without payments.
const root = new URL('../', import.meta.url);
// lib/business.ts imports '@/lib/dates'; map '@/' to the repo root the way the other suites do.
registerHooks({resolve(spec, ctx, next) { return spec.startsWith('@/') ? next(new URL(spec.slice(2) + '.ts', root).href, ctx) : next(spec, ctx); }});
const dataDir = new URL('../.local-tests/db-' + randomUUID() + '/', import.meta.url);
await mkdir(dataDir, {recursive: true});
const db = new PGlite(fileURLToPath(dataDir));
await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
const initial = await readFile(new URL('supabase/migrations/001_initial_schema.sql', root), 'utf8');
await db.exec(initial.replace(/^CREATE EXTENSION[^;]+;/gm, ''));
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
  '039_promo_vip_merge.sql','040_readable_document_numbers.sql','041_ship_requires_driver.sql'];
for (const f of files) await db.exec(await readFile(new URL('supabase/migrations/' + f, root), 'utf8'));
await db.exec('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; SET ROLE service_role;');

const {toInvoice, financeSummary} = await import('../lib/business.ts');

const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const idOf = async (sku) => (await one('SELECT id FROM products WHERE sku=$1', [sku])).id;
const nameOf = async (sku) => (await one('SELECT name_ar FROM products WHERE sku=$1', [sku])).name_ar;
const SKU = 'PL-SHMP-500-V2-01';
await db.query('INSERT INTO inventory(product_id,quantity_on_hand) VALUES($1,999) ON CONFLICT (product_id) DO UPDATE SET quantity_on_hand=999', [await idOf(SKU)]);
const customer = randomUUID();
await db.query(`INSERT INTO customers(id,name,phone,rep_name_raw) VALUES($1,'زبونة','0790001111','رحمة')`, [customer]);

const place = async (qty = 1, price = 13) => (await one('SELECT business_create_order($1,$2,$3) r', ['mgr-sales-01', randomUUID(),
  JSON.stringify({customer_id: customer, customer_name: 'x', customer_phone: '0790001111', city: 'عمان', address: 'y',
    payment_method: 'cash_on_delivery', rep_name: 'رحمة', total_amount: qty * price,
    items: [{name: await nameOf(SKU), qty, price}]})])).r.order;
const move = (id, status, expected, driver) => one('SELECT business_status($1,$2,$3,$4) r',
  ['diya-drivers-01', null, randomUUID(), JSON.stringify({id, status, expected_status: expected, ...(driver ? {driver} : {})})]);
const pay = (invoiceNumber, amount) => one('SELECT business_collect($1,$2,$3) r',
  ['fin-01', randomUUID(), JSON.stringify({invoice_id: invoiceNumber, amount, payment_method: 'cash'})]);
const doc = async (id) => (await one('SELECT business_order_document(o.id) d FROM orders o WHERE o.order_number=$1', [id])).d;

// The money an order states. Both readers now call toInvoice, so asserting it once asserts both —
// what keeps them honest is the source guard at the end of this file, which fails if the statement
// ever goes back to doing its own arithmetic. Comparing two copies of the same call here would
// prove nothing.
const agree = (order) => {
  const inv = toInvoice(order);
  return {total: inv.total_amount, paid: inv.paid_amount, outstanding: inv.outstanding_amount, credit: inv.credit_amount};
};

// --- A plain unpaid order: both say the full amount is owed.
let ord = await place(2, 13);
let view = agree(await doc(ord.id));
assert.equal(view.total, 26);
assert.equal(view.outstanding, 26, 'nothing paid yet, so all of it is owed');
assert.equal(view.credit, 0);

// --- Part paid.
await pay(ord.invoice_number, 10);
view = agree(await doc(ord.id));
assert.equal(view.paid, 10);
assert.equal(view.outstanding, 16);

// --- Paid in full.
await pay(ord.invoice_number, 16);
view = agree(await doc(ord.id));
assert.equal(view.outstanding, 0);
assert.equal(toInvoice(await doc(ord.id)).status, 'paid');

// --- THE BUG: cancelled with money already taken. Nothing is owed, and what was paid is a credit
// back to the customer. The statement used to print the full balance as still collectible.
ord = await place(1, 40);
await pay(ord.invoice_number, 15);
await move(ord.id, 'cancelled', 'confirmed');
view = agree(await doc(ord.id));
assert.equal(view.outstanding, 0, 'a cancelled order is not collectible — the rep must not demand 25 more');
assert.equal(view.credit, 15, 'and the 15 already taken is owed back to her');
assert.equal(toInvoice(await doc(ord.id)).status, 'on_hold');

// --- Same for a returned order, which gets there by a different route.
ord = await place(1, 30);
await pay(ord.invoice_number, 30);
await move(ord.id, 'processing', 'confirmed');
await move(ord.id, 'shipped', 'processing', 'علي');
await move(ord.id, 'returned', 'shipped');
view = agree(await doc(ord.id));
assert.equal(view.outstanding, 0);
assert.equal(view.credit, 30, 'the whole payment goes back');

// --- A draft is not collectible either: it has not been agreed yet.
const draft = (await one('SELECT business_create_order($1,$2,$3) r', ['mgr-sales-01', randomUUID(),
  JSON.stringify({customer_id: customer, customer_name: 'x', customer_phone: '0790001111', city: 'عمان', address: 'y',
    payment_method: 'cash_on_delivery', rep_name: 'رحمة', status: 'draft', total_amount: 13,
    items: [{name: await nameOf(SKU), qty: 1, price: 13}]})])).r.order;
view = agree(await doc(draft.id));
assert.equal(view.outstanding, 0, 'a draft is not money owed');

// --- An order with no invoice row falls back to the order total rather than reporting zero, so a
// statement printed before the invoice exists does not claim the order is worth nothing.
const noInvoice = await doc((await place(1, 21)).id);
await db.query('DELETE FROM invoices WHERE order_id=$1', [noInvoice.db_id]);
const bare = await doc(noInvoice.id);
assert.equal(bare.invoice_number, null, 'fixture really has no invoice');
assert.equal(toInvoice(bare).total_amount, 21, 'falls back to the order total');
assert.equal(toInvoice(bare).outstanding_amount, 21, 'and is still owed');

// --- The finance summary adds up what the individual invoices say, so the page total and the row
// totals cannot drift apart.
const allOrders = (await db.query('SELECT order_number FROM orders ORDER BY created_at')).rows;
const invoices = [];
for (const r of allOrders) { const d = await doc(r.order_number); if (d.invoice_number) invoices.push(toInvoice(d)); }
const summary = financeSummary(invoices);
const byHand = (fn) => Math.round(invoices.reduce((n, i) => n + fn(i) * 1000, 0)) / 1000;
assert.equal(summary.total_collected_jd, byHand(i => i.paid_amount), 'collected is the sum of the rows');
assert.equal(summary.total_receivables_jd, byHand(i => i.outstanding_amount), 'receivables likewise');
assert.equal(summary.credit_balance_jd, byHand(i => i.credit_amount), 'and credit');
assert.ok(summary.credit_balance_jd >= 45, 'the cancelled 15 and the returned 30 are both owed back');
assert.ok(summary.total_receivables_jd >= 0);
// Nothing not collectible may appear as money to chase.
for (const i of invoices) if (!i.collectible) assert.equal(i.outstanding_amount, 0, `${i.id} is ${i.order_status} but shows receivables`);

// --- The guard that gives the assertions above their meaning: the statement must read through
// toInvoice and must not compute a balance of its own. This is what actually regressed, and a
// behavioural test cannot see it, because the component is TSX that this suite cannot render.
const statementSrc = await readFile(new URL('components/orders/order-statement.tsx', root), 'utf8');
assert.match(statementSrc, /toInvoice\(order\)/, 'the statement must read the order through toInvoice');
assert.ok(!/Math\.max\(0,\s*Math\.round\(\(total - paid\)/.test(statementSrc),
  'the statement must not compute its own outstanding balance — that is the bug this suite exists for');
assert.match(statementSrc, /invoice\.outstanding_amount/, 'and must print the outstanding toInvoice gives it');
assert.match(statementSrc, /invoice\.credit_amount/, 'and its credit');

// The two other readers of this number must keep coming through the same function.
for (const route of ['app/api/finance/route.ts', 'app/api/analytics/route.ts']) {
  const src = await readFile(new URL(route, root), 'utf8');
  assert.match(src, /toInvoice/, route + ' must read invoices through toInvoice');
}

console.log('PASS test_finance_invoice (the printed statement and the finance page read the same order through toInvoice and state the same money at every status; a cancelled or returned order shows no receivable and its payments as a credit owed back; a draft is not money owed; an order whose invoice row is missing falls back to its own total; the finance summary equals the sum of its rows)');
