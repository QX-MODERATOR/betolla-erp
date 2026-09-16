// REAL cloud persistence E2E against the actual configured Betolla Supabase
// project (reads real values from .env.local — never logs them). No mocks, no
// local sandbox: businessRpc() below makes real network calls to real Supabase.
// All test rows are clearly tagged (CLOUD-E2E- prefix) and deleted at the end
// via direct, by-id REST calls (service role) in FK-safe order. Never touches
// any row it didn't create itself.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

const root = new URL('../', import.meta.url);
registerHooks({
  resolve(s, c, next) {
    if (s.startsWith('@/')) return next(new URL(s.slice(2) + '.ts', root).href, c);
    if (s === 'next/server') return next('next/server.js', c);
    if ((s.startsWith('./') || s.startsWith('../')) && !/\.[a-z]+$/i.test(s)) {
      try { return next(s + '.ts', c); } catch { /* fall through */ }
    }
    return next(s, c);
  },
});

function loadEnv(path) {
  const raw = readFileSync(path, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let value = t.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
}
loadEnv('.env.local');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env.local');

const { signAuthToken } = await import('../lib/auth.ts');
const { authenticateUser } = await import('../lib/auth-password.ts');
const leadsRoute = await import('../app/api/leads/route.ts');
const customersRoute = await import('../app/api/customers/route.ts');
const callsRoute = await import('../app/api/calls/route.ts');
const ordersRoute = await import('../app/api/orders/route.ts');
const financeRoute = await import('../app/api/finance/route.ts');
const driversRoute = await import('../app/api/drivers/route.ts');
const inventoryRoute = await import('../app/api/inventory/route.ts');
const analyticsRoute = await import('../app/api/analytics/route.ts');

// At real data scale (this project's `customers` table has 45k+ rows) reads
// through business_customer_list can intermittently 503 under load even after
// being optimized to a single set-based query (see migration 015's comments).
// Reads carry no idempotency risk, so retry a couple of times before failing —
// matches the retry now built into lib/business-client.ts's loadBusiness().
async function callWithRetry(routeHandler, request) {
  const delays = [400, 1200];
  for (let attempt = 0; ; attempt++) {
    const res = await routeHandler(request);
    if (res.status !== 503 || attempt === delays.length) return res;
    await new Promise((r) => setTimeout(r, delays[attempt]));
  }
}

const req = (path, method = 'GET', body, token, key = randomUUID()) => new Request('http://localhost' + path, {
  method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', 'Idempotency-Key': key },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

// Independent read straight from PostgREST — never trusts the app's own returned objects alone.
async function restGet(table, filter) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, { headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY } });
  if (!r.ok) throw new Error(`REST GET ${table} failed: ${r.status} ${await r.text()}`);
  return r.json();
}
async function restDelete(table, filter) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, { method: 'DELETE', headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, Prefer: 'return=minimal' } });
  if (!r.ok && r.status !== 404) throw new Error(`REST DELETE ${table} failed: ${r.status} ${await r.text()}`);
}
async function restPost(table, data) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: 'POST', headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(data) });
  if (!r.ok) throw new Error(`REST POST ${table} failed: ${r.status} ${await r.text()}`);
  return r.json();
}

const TAG = 'CLOUD-E2E-' + randomUUID().slice(0, 8);
const created = { customerId: null, orderDbId: null, productId: null };

try {
  // --- Login (gm — unrestricted access, not the disputed admin credential) ---
  const gmProfile = await authenticateUser('gm', process.env.BETOLLA_ACCOUNT_PASSWORD_2);
  assert.ok(gmProfile, 'gm login failed against real Supabase-backed auth — check BETOLLA_ACCOUNT_PASSWORD_2 in .env.local');
  assert.equal(gmProfile.role, 'general_manager');
  const token = await signAuthToken(gmProfile);
  console.log('Login (gm): PASS');

  // 1. Real test product (created directly — /api/inventory only records movements
  //    against an existing product, matching the real app's own contract), then
  //    stock it through the real, authenticated app API.
  const sku = TAG + '-SKU';
  const [productRow] = await restPost('products', { sku, name_ar: TAG + ' منتج اختبار', name_en: TAG + ' Test Product', retail_price: 10, cost_price: 5 });
  created.productId = productRow.id;
  const stockIn = await inventoryRoute.POST(req('/api/inventory', 'POST', { sku, type: 'purchase_in', quantity: 50, reference: TAG }, token));
  const stockInData = await stockIn.json();
  assert.equal(stockIn.status, 201, JSON.stringify(stockInData));
  const invAfterStock = (await restGet('inventory', `product_id=eq.${created.productId}&select=quantity_on_hand`))[0];
  assert.equal(invAfterStock.quantity_on_hand, 50);
  console.log('Inventory: real product created + stocked via real API -> PASS (write, independent REST re-read confirmed)');

  // 2. Lead -> Customer (public endpoint, no auth).
  const phone = '059' + Math.floor(1000000 + Math.random() * 8999999);
  const leadBody = { name: TAG + ' عميل اختبار', phone, city: 'عمان', address: 'Cloud E2E Test Address', notes: TAG, source: 'social_media', rep_name: 'حمزة' };
  const leadRes = await leadsRoute.POST(req('/api/leads', 'POST', leadBody));
  const leadData = await leadRes.json();
  assert.equal(leadRes.status, 201, JSON.stringify(leadData));
  created.customerId = leadData.customer.id;
  const customerRow = (await restGet('customers', `id=eq.${created.customerId}&select=id,phone,rep_name_raw`))[0];
  assert.equal(customerRow.phone, phone);
  assert.equal(customerRow.rep_name_raw, 'حمزة');
  console.log('Customer/Lead: write -> independent REST re-read -> PASS');

  // 3. Call log / follow-up.
  const callRes = await callsRoute.POST(req('/api/calls', 'POST', { customer_id: created.customerId, outcome: 'answered', notes: TAG, next_call_date: '2026-10-05' }, token));
  const callData = await callRes.json();
  assert.equal(callRes.status, 201, JSON.stringify(callData));
  const callLogRow = (await restGet('call_logs', `customer_id=eq.${created.customerId}&select=id,outcome,rep_name`))[0];
  assert.equal(callLogRow.outcome, 'answered');
  console.log('Call log / follow-up: write -> independent REST re-read -> PASS');

  // 4. Order referencing the real test product (auto inventory link), confirmed.
  const qty = 4, unitPrice = 10, totalAmount = qty * unitPrice;
  const orderRes = await ordersRoute.POST(req('/api/orders', 'POST', {
    customer_id: created.customerId, customer_name: leadData.customer.name, customer_phone: phone, city: 'عمان', address: 'Cloud E2E Test Address',
    items: [{ name: sku, qty, price: unitPrice }], total_amount: totalAmount, payment_method: 'cash_on_delivery', status: 'confirmed', source: 'manual',
  }, token));
  const orderData = await orderRes.json();
  assert.equal(orderRes.status, 201, JSON.stringify(orderData));
  const order = orderData.order;
  created.orderDbId = order.db_id;
  const orderRow = (await restGet('orders', `id=eq.${order.db_id}&select=id,total_amount,status`))[0];
  assert.equal(Number(orderRow.total_amount), totalAmount);
  assert.equal(orderRow.status, 'confirmed');
  console.log('Order: write -> independent REST re-read -> PASS');

  // 5. Inventory really deducted.
  const invRow = (await restGet('inventory', `product_id=eq.${created.productId}&select=quantity_on_hand`))[0];
  assert.equal(invRow.quantity_on_hand, 50 - qty);
  console.log('Inventory deduction: independent REST re-read confirms real stock movement -> PASS');

  // 6. Partial payment, then full remaining.
  const partial = 15;
  const partialRes = await financeRoute.POST(req('/api/finance', 'POST', { invoice_id: order.invoice_number, amount: partial, payment_method: 'cash', reference_number: '' }, token));
  assert.equal(partialRes.status, 200, JSON.stringify(await partialRes.clone().json()));
  const remaining = totalAmount - partial;
  const fullRes = await financeRoute.POST(req('/api/finance', 'POST', { invoice_id: order.invoice_number, amount: remaining, payment_method: 'cash', reference_number: '' }, token));
  assert.equal(fullRes.status, 200, JSON.stringify(await fullRes.clone().json()));
  const invoiceRow = (await restGet('invoices', `order_id=eq.${order.db_id}&select=id,status`))[0];
  const paidSum = await restGet('payments', `invoice_id=eq.${invoiceRow.id}&select=amount`);
  const totalPaid = paidSum.reduce((s, p) => s + Number(p.amount), 0);
  assert.equal(totalPaid, totalAmount);
  console.log('Partial + full payment: write -> independent REST re-read -> PASS (total paid = order total)');

  // 7. Driver assignment + delivery.
  const driverName = 'خالد';
  const assignRes = await driversRoute.POST(req('/api/drivers', 'POST', { action: 'assign', order_ids: [order.db_id], driver: driverName }, token));
  assert.equal(assignRes.status, 200);
  const deliverRes = await driversRoute.POST(req('/api/drivers', 'POST', { action: 'update_order', orderId: order.db_id, driver: driverName, status: 'delivered', cashCollected: totalAmount }, token));
  assert.equal(deliverRes.status, 200, JSON.stringify(await deliverRes.clone().json()));
  const finalOrderRow = (await restGet('orders', `id=eq.${order.db_id}&select=status,payment_status`))[0];
  assert.equal(finalOrderRow.status, 'delivered');
  console.log('Driver / Delivery: write -> independent REST re-read -> PASS');

  // 8. Reports/analytics recompute live from the same tables.
  const reportsRes = await callWithRetry(analyticsRoute.GET, req('/api/analytics', 'GET', undefined, token));
  assert.equal(reportsRes.status, 200, JSON.stringify(await reportsRes.clone().json()));
  console.log('Reports/Analytics: live endpoint responds 200 over real data -> PASS');

  // 9. Refresh persistence: re-fetch the customer list and confirm the new row is there.
  const refreshRes = await callWithRetry(customersRoute.GET, req('/api/customers', 'GET', undefined, token));
  const refreshData = await refreshRes.json();
  assert.ok(refreshData.customers, 'customers.GET failed even after retry: ' + JSON.stringify(refreshData));
  assert.ok(refreshData.customers.some((c) => c.id === created.customerId));
  console.log('Refresh persistence (re-fetch list): PASS');

  // 10. Logout/login: discard token, log back in fresh, confirm still visible.
  const relogProfile = await authenticateUser('gm', process.env.BETOLLA_ACCOUNT_PASSWORD_2);
  const relogToken = await signAuthToken(relogProfile);
  const afterReloginRes = await callWithRetry(customersRoute.GET, req('/api/customers', 'GET', undefined, relogToken));
  const afterRelogin = await afterReloginRes.json();
  assert.ok(afterRelogin.customers, 'customers.GET failed even after retry: ' + JSON.stringify(afterRelogin));
  assert.ok(afterRelogin.customers.some((c) => c.id === created.customerId));
  console.log('Logout/Login persistence: PASS');

  // 11. New session: a third, independently-obtained token.
  const sessionProfile = await authenticateUser('gm', process.env.BETOLLA_ACCOUNT_PASSWORD_2);
  const sessionToken = await signAuthToken(sessionProfile);
  const ordersInNewSessionRes = await callWithRetry(ordersRoute.GET, req('/api/orders', 'GET', undefined, sessionToken));
  const ordersInNewSession = await ordersInNewSessionRes.json();
  assert.ok(ordersInNewSession.orders, 'orders.GET failed even after retry: ' + JSON.stringify(ordersInNewSession));
  assert.ok(ordersInNewSession.orders.some((o) => o.id === order.id));
  console.log('New session persistence: PASS');

  console.log('\nCLOUD E2E: ALL STEPS PASSED against the real Betolla Supabase project.');
} finally {
  // Cleanup: only the rows this run created, in FK-safe order, by exact id.
  console.log('\nCleaning up test records...');
  if (created.orderDbId) {
    const invoiceRows = await restGet('invoices', `order_id=eq.${created.orderDbId}&select=id`);
    for (const inv of invoiceRows) await restDelete('payments', `invoice_id=eq.${inv.id}`);
    await restDelete('invoices', `order_id=eq.${created.orderDbId}`);
    await restDelete('order_items', `order_id=eq.${created.orderDbId}`);
    await restDelete('orders', `id=eq.${created.orderDbId}`);
  }
  if (created.customerId) {
    await restDelete('call_logs', `customer_id=eq.${created.customerId}`);
    await restDelete('customers', `id=eq.${created.customerId}`);
  }
  if (created.productId) {
    await restDelete('inventory_movements', `product_id=eq.${created.productId}`);
    await restDelete('inventory', `product_id=eq.${created.productId}`);
    await restDelete('products', `id=eq.${created.productId}`);
  }
  console.log('Cleanup done — only records tagged ' + TAG + ' were removed.');
}
