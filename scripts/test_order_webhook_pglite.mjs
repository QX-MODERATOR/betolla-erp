// Real end-to-end test of the landing-page order path: runs every real migration (except the
// company-data seeds 002/003) against an isolated in-memory PGlite database, seeds only the four
// PLASMA components the bundle migration (037) requires, then calls business_create_order exactly
// as app/api/orders/webhook/route.ts does — a genuine Arabic order and a genuine English order,
// idempotent retry, no duplicate customer on repeat phone, no inventory deducted until staff
// confirms the (draft) order, and customer field-overwrite safety.
//
// One-time setup (like every other PGlite suite here, .local-tests/node_modules is gitignored):
//   cd .local-tests && npm install @electric-sql/pglite
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { registerHooks } from 'node:module';
import { PGlite } from '../.local-tests/node_modules/@electric-sql/pglite/dist/index.js';

const root = new URL('../', import.meta.url);
registerHooks({ resolve(s, c, next) { if (s.startsWith('@/')) return next(new URL(s.slice(2) + '.ts', root).href, c); return next(s, c); } });
const { validateWebhookOrder } = await import('../lib/order-webhook.ts');
const dataDir = new URL('.local-tests/db-orders-' + randomUUID() + '/', root);
await mkdir(dataDir, { recursive: true });
const db = new PGlite(fileURLToPath(dataDir));

await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;`);

const files = (await readdir(new URL('supabase/migrations/', root)))
  .filter((f) => /^\d+.*\.sql$/.test(f) && !/^00[23]_/.test(f))
  .sort();
for (const file of files) {
  const sql = await readFile(new URL('supabase/migrations/' + file, root), 'utf8');
  await db.exec(sql.replace(/^CREATE EXTENSION[^;]+;/gm, ''));
}
console.log(`ok: applied ${files.length} migrations (excluding company seeds 002/003)`);

// Minimal seed migration 037's bundle needs: the plasma category and its four component products.
// Deliberately NOT the full 002 seed (that is company data, excluded from tests by convention).
// Migration 037 itself requires the four component SKUs to already exist (it raises
// PLASMA_COMPONENTS_MISSING otherwise) — since all 49 migrations above applied cleanly, an earlier
// migration (020_product_catalog_v2) already seeded them and the category, and 037 already built
// the bundle products + product_bundles rows. Only inventory stock still needs seeding (it starts
// at 0), and only for the four real components — the bundle's own "stock" is computed from them.
const bundleCheck = await db.query(`SELECT sku FROM products WHERE sku='PL-PKG-QUAD-V2-01'`);
assert.equal(bundleCheck.rows.length, 1, 'plasma quad bundle product must exist after migration 037');
await db.exec(`
  INSERT INTO inventory (product_id, quantity_on_hand)
    SELECT id, 100 FROM products WHERE sku IN ('PL-SHMP-500-V2-01','PL-COND-500-V2-02','PL-TREAT-500-V2-03','PL-SERUM-100-V2-04')
    ON CONFLICT (product_id) DO UPDATE SET quantity_on_hand=100;
`);
console.log('ok: plasma bundle products exist (from migration 020+037); component stock seeded to 100 each');

await db.exec('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;');
await db.exec('SET ROLE service_role;');

const componentStock = async () => {
  const r = await db.query(`SELECT p.sku, i.quantity_on_hand AS qty FROM inventory i JOIN products p ON p.id=i.product_id
    WHERE p.sku IN ('PL-SHMP-500-V2-01','PL-COND-500-V2-02','PL-TREAT-500-V2-03','PL-SERUM-100-V2-04') ORDER BY p.sku`);
  return Object.fromEntries(r.rows.map((row) => [row.sku, row.qty]));
};

// Mirrors app/api/orders/webhook/route.ts's orderData construction exactly.
async function createOrder(input, actor = 'landing-page', key = randomUUID()) {
  const validated = validateWebhookOrder(input);
  const orderData = {
    customer_name: validated.customerName, customer_phone: validated.customerPhone,
    city: validated.city, address: validated.address,
    items: [{ name: validated.itemName, qty: validated.quantity, price: validated.unitPrice }],
    total_amount: validated.totalAmount, source: 'plasma-landing-page', payment_method: 'cash_on_delivery',
    // draft: an unattended landing-page submission is not staff-reviewed yet, so it must not
    // deduct real inventory (business_create_order only does that for status='confirmed').
    status: 'draft', installment_notes: validated.notes, rep_name: 'Website', reuse_phone: true,
  };
  const result = await db.query(`SELECT business_create_order($1,$2,$3) AS r`, [actor, key, JSON.stringify(orderData)]);
  return result.rows[0].r;
}

// --- Real Arabic test order: PLASMA Complete package ---
const arKey = randomUUID();
const arResult = await createOrder({
  packageId: 'plasma-complete', quantity: 1, fullName: 'سارة أحمد', phone: '0791234567',
  city: 'عمّان', address: 'الدوار السابع، شارع الملكة رانيا', notes: 'اتصلي قبل الوصول', language: 'ar',
}, 'landing-page', arKey);
assert.equal(arResult.replayed, false);
assert.match(arResult.order.id, /^BET-\d{4}-\d{5}$/, 'ERP order number should be the readable BET-YYYY-NNNNN format');
assert.equal(arResult.order.total_amount, 30);
assert.equal(arResult.order.customer_name, 'سارة أحمد');
assert.equal(arResult.order.status, 'draft');
console.log(`ok: real Arabic test order created — ${arResult.order.id}, total ${arResult.order.total_amount} JOD, status=draft`);

// --- No inventory moves for an unreviewed (draft) landing-page order ---
let stock = await componentStock();
for (const [sku, qty] of Object.entries(stock)) assert.equal(qty, 100, `${sku} must be untouched while the order is still draft (got ${qty})`);
console.log('ok: a draft landing-page order deducts NO real inventory (100 left of each, unchanged)');

// --- Staff reviews and confirms the order (the existing business_status RPC) -> THEN stock moves ---
const confirmResult = await db.query(`SELECT business_status($1,$2,$3,$4) AS r`, [
  'rep-review', null, randomUUID(),
  JSON.stringify({ id: arResult.order.id, status: 'confirmed', expected_status: 'draft' }),
]);
assert.equal(confirmResult.rows[0].r.order.status, 'confirmed');
stock = await componentStock();
for (const [sku, qty] of Object.entries(stock)) assert.equal(qty, 99, `${sku} should have exactly 1 unit deducted after staff confirms (got ${qty})`);
console.log('ok: once staff confirms the draft (business_status: draft -> confirmed), real component stock deducts (99 left of each)');

// --- Idempotent retry: same key, same payload -> replays, no duplicate order ---
const arRetry = await createOrder({
  packageId: 'plasma-complete', quantity: 1, fullName: 'سارة أحمد', phone: '0791234567',
  city: 'عمّان', address: 'الدوار السابع، شارع الملكة رانيا', notes: 'اتصلي قبل الوصول', language: 'ar',
}, 'landing-page', arKey);
assert.equal(arRetry.replayed, true);
assert.equal(arRetry.order.id, arResult.order.id);
const orderCount = await db.query(`SELECT count(*)::int AS n FROM orders WHERE customer_id=(SELECT customer_id FROM orders WHERE order_number=$1)`, [arResult.order.id]);
assert.equal(orderCount.rows[0].n, 1, 'a retried sync with the same Idempotency-Key must not create a second order');
console.log('ok: retried sync (same Idempotency-Key) replays instead of duplicating');

// --- Real English test order: PLASMA Duo package, same customer phone, a DIFFERENT name/city/
// address on the order -> the existing customer is reused (not duplicated) and the ORIGINAL
// customer record is never overwritten by the new order's data. Note: the ERP does not currently
// fill in missing/blank fields on an existing customer from a later order either — neither
// business_create_order's reuse_phone path nor business_customer_create (021) touch any customer
// field but last_contact_date/next_call_date on a phone match — so this test documents and locks
// in the actual, current, safe behavior (never overwrite) rather than a fill-in-blanks behavior
// that does not exist anywhere in this codebase today (flagged separately, not invented here).
const enResult = await createOrder({
  packageId: 'plasma-duo', quantity: 2, fullName: 'Completely Different Name', phone: '0791234567',
  city: 'Zarqa', address: 'A totally different address', notes: '', language: 'en',
});
assert.equal(enResult.order.total_amount, 40); // 20 JOD x 2, no delivery fee
assert.match(enResult.order.id, /^BET-\d{4}-\d{5}$/);
console.log(`ok: real English test order created — ${enResult.order.id}, total ${enResult.order.total_amount} JOD`);

const customers = await db.query(`SELECT count(*)::int AS n, (array_agg(name))[1] AS name, (array_agg(city))[1] AS city
  FROM customers WHERE phone='0791234567'`);
assert.equal(customers.rows[0].n, 1, 'the English order (same phone) must reuse the existing customer, never create a second one');
assert.equal(customers.rows[0].name, 'سارة أحمد', "the ORIGINAL customer name must survive — a later order's different name must never overwrite it");
assert.equal(customers.rows[0].city, 'عمّان', "the ORIGINAL customer city must survive — a later order's different city must never overwrite it");
console.log('ok: repeat customer (same phone) dedupes to exactly one row, and its original name/city are never overwritten by a later order');

const bothOrders = await db.query(`SELECT count(*)::int AS n FROM orders o JOIN customers c ON c.id=o.customer_id WHERE c.phone='0791234567'`);
assert.equal(bothOrders.rows[0].n, 2, 'both the Arabic and English orders must be linked to that one customer');
console.log('ok: both orders linked to the single deduped customer');

console.log('ALL PASS: test_order_webhook_pglite (real Arabic + English order, draft status with zero inventory impact until confirmed, real idempotency, real customer dedup + no-overwrite)');
await db.close();
