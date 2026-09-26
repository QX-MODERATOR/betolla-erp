// Real end-to-end test of the landing-page order path: runs every real migration (except the
// company-data seeds 002/003) against an isolated in-memory PGlite database, seeds only the four
// PLASMA components the bundle migration (037) requires, then calls business_create_order exactly
// as app/api/orders/webhook/route.ts does — a genuine Arabic order and a genuine English order,
// idempotent retry, and no duplicate customer on repeat phone.
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

async function createOrder(input, actor = 'landing-page', key = randomUUID()) {
  const validated = validateWebhookOrder(input);
  const orderData = {
    customer_name: validated.customerName, customer_phone: validated.customerPhone,
    city: validated.city, address: validated.address,
    items: [{ name: validated.itemName, qty: validated.quantity, price: validated.unitPrice }],
    total_amount: validated.totalAmount, source: 'landing_page', payment_method: 'cash_on_delivery',
    status: 'confirmed', installment_notes: validated.notes, rep_name: 'Website', reuse_phone: true,
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
console.log(`ok: real Arabic test order created — ${arResult.order.id}, total ${arResult.order.total_amount} JOD`);

// Stock was actually deducted through the bundle expansion (1 shampoo + 1 conditioner + 1 treatment + 1 serum).
const stock = await db.query(`SELECT p.sku, i.quantity_on_hand FROM inventory i JOIN products p ON p.id=i.product_id
  WHERE p.sku IN ('PL-SHMP-500-V2-01','PL-COND-500-V2-02','PL-TREAT-500-V2-03','PL-SERUM-100-V2-04') ORDER BY p.sku`);
for (const row of stock.rows) assert.equal(row.quantity_on_hand, 99, `${row.sku} should have exactly 1 unit deducted`);
console.log('ok: real order deducted real component stock via bundle expansion (99 left of each, from 100)');

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

// --- Real English test order: PLASMA Duo package, same customer phone -> reused, not duplicated ---
const enResult = await createOrder({
  packageId: 'plasma-duo', quantity: 2, fullName: 'Sara Ahmad', phone: '0791234567',
  city: 'Amman', address: '7th Circle, Queen Rania St.', notes: '', language: 'en',
});
assert.equal(enResult.order.total_amount, 40); // 20 JOD x 2, no delivery fee
assert.match(enResult.order.id, /^BET-\d{4}-\d{5}$/);
console.log(`ok: real English test order created — ${enResult.order.id}, total ${enResult.order.total_amount} JOD`);

const customers = await db.query(`SELECT count(*)::int AS n FROM customers WHERE phone='0791234567'`);
assert.equal(customers.rows[0].n, 1, 'the English order (same phone) must reuse the existing customer, never create a second one');
console.log('ok: repeat customer (same phone, different order) dedupes — exactly one customer row');

const bothOrders = await db.query(`SELECT count(*)::int AS n FROM orders o JOIN customers c ON c.id=o.customer_id WHERE c.phone='0791234567'`);
assert.equal(bothOrders.rows[0].n, 2, 'both the Arabic and English orders must be linked to that one customer');
console.log('ok: both orders linked to the single deduped customer');

console.log('ALL PASS: test_order_webhook_pglite (real Arabic + English order, real inventory deduction, real idempotency, real customer dedup)');
await db.close();
