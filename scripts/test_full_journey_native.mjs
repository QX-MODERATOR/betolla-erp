// Real end-to-end journey against the isolated native sandbox (real PostgreSQL +
// real PostgREST + a real running Next dev server on loopback): Lead -> Customer
// (rep-assigned) -> Call log/follow-up -> Order (with a real inventory-linked
// product, so stock auto-deducts) -> Partial payment -> Full payment -> Driver
// delivery -> Reports. Run this AFTER `node scripts/local_sandbox.mjs` is up.
// No production connection is used. Re-running this script after a full sandbox
// restart (same on-disk pgdata) additionally proves the whole chain survived a
// real process restart, not just React/Node in-memory state.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from '../.local-tests/node_modules/pg/lib/index.js';

const base = 'http://127.0.0.1:3107';
const connection = { host: '127.0.0.1', port: 55439, user: 'postgres', database: 'betolla_isolated_20260913' };
const runtime = JSON.parse(await readFile('.local-tests/native-sandbox/runtime.json', 'utf8'));
const db = new pg.Client(connection);
await db.connect();
assert.equal((await db.query('SELECT name FROM sandbox_identity')).rows[0].name, connection.database);

async function login() {
  const r = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: runtime.password }), signal: AbortSignal.timeout(45000),
  });
  assert.equal(r.status, 200);
  return (await r.json()).token;
}
async function api(path, body, method, auth, key = randomUUID()) {
  const r = await fetch(base + path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { ...(auth ? { Authorization: 'Bearer ' + auth } : {}), 'Content-Type': 'application/json', ...(body ? { 'Idempotency-Key': key } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(45000),
  });
  return { status: r.status, data: await r.json() };
}

const fixturePath = '.local-tests/native-sandbox/verified-journey.json';
try {
  // 0. Previous run's whole chain must still be correct — independent SQL reads,
  //    possibly across a real sandbox restart in between runs.
  let previous;
  try { previous = JSON.parse(await readFile(fixturePath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (previous) {
    assert.equal((await db.query('SELECT phone FROM customers WHERE id=$1', [previous.customer_id])).rows[0].phone, previous.phone);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM call_logs WHERE customer_id=$1', [previous.customer_id])).rows[0].n, 1);
    const ord = (await db.query('SELECT status, payment_status FROM orders WHERE id=$1', [previous.order_db_id])).rows[0];
    assert.equal(ord.status, 'delivered');
    assert.equal(ord.payment_status, 'paid');
    assert.equal((await db.query('SELECT sum(amount) AS paid FROM payments WHERE invoice_id=(SELECT id FROM invoices WHERE order_id=$1)', [previous.order_db_id])).rows[0].paid, previous.total_amount.toFixed(3));
    assert.equal((await db.query('SELECT quantity_on_hand FROM inventory WHERE product_id=$1', [previous.product_id])).rows[0].quantity_on_hand, previous.expected_stock_after);
    console.log('PASS: previous full-journey fixture (customer, call log, order, payments, delivery, inventory deduction) all survived, possibly across a real sandbox restart.');
  }

  const token = await login();

  // 1. Real product to stock, so the order below can auto-link to real inventory.
  const sku = 'JOURNEY-' + randomUUID().slice(0, 6);
  const startingStock = 50;
  const prodIns = await db.query(
    "INSERT INTO products(sku,name_ar,name_en,retail_price,cost_price) VALUES($1,'Journey Test Product','Journey Test Product',20,10) RETURNING id",
    [sku]
  );
  const productId = prodIns.rows[0].id;
  const stockIn = await api('/api/inventory', { sku, type: 'purchase_in', quantity: startingStock, reference: 'journey fixture stock' }, 'POST', token);
  assert.equal(stockIn.status, 201, JSON.stringify(stockIn.data));
  assert.equal(stockIn.data.stock, startingStock);

  // 2. Lead -> Customer, rep-assigned (public, unauthenticated intake endpoint).
  const phone = '057' + Math.floor(1000000 + Math.random() * 8999999);
  const repName = 'صابرين';
  const leadBody = { name: 'Full Journey Fixture ' + randomUUID().slice(0, 6), phone, city: 'إربد', address: 'Test St', notes: 'journey test', source: 'social_media', rep_name: repName };
  const leadRes = await api('/api/leads', leadBody);
  assert.equal(leadRes.status, 201, JSON.stringify(leadRes.data));
  const customer = leadRes.data.customer;
  assert.equal(customer.rep_name_raw, repName);

  // 3. Call log / follow-up on the customer.
  const callRes = await api('/api/calls', { customer_id: customer.id, outcome: 'answered', notes: 'اتفقنا على تفاصيل الطلب', next_call_date: '2026-10-01' }, 'POST', token);
  assert.equal(callRes.status, 201, JSON.stringify(callRes.data));
  assert.equal(callRes.data.customer.history.length, 1);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM call_logs WHERE customer_id=$1', [customer.id])).rows[0].n, 1);

  // 4. Order for the real product (name = SKU -> exact-match auto-link), confirmed
  //    so inventory actually moves (a draft order must not touch stock).
  const qty = 5, unitPrice = 20, totalAmount = qty * unitPrice;
  const orderBody = {
    customer_id: customer.id, customer_name: customer.name, customer_phone: phone, city: 'إربد', address: 'Test St',
    items: [{ name: sku, qty, price: unitPrice }], total_amount: totalAmount, payment_method: 'cash_on_delivery', status: 'confirmed', source: 'manual',
  };
  const orderRes = await api('/api/orders', orderBody, 'POST', token);
  assert.equal(orderRes.status, 201, JSON.stringify(orderRes.data));
  const order = orderRes.data.order;
  assert.equal(order.total_amount, totalAmount);

  // 5. Inventory really deducted by the confirmed order (business_resolve_product
  //    auto-link from migration 010), not just recorded on the order row.
  const stockAfterOrder = (await db.query('SELECT quantity_on_hand FROM inventory WHERE product_id=$1', [productId])).rows[0].quantity_on_hand;
  assert.equal(stockAfterOrder, startingStock - qty);
  const movementRow = (await db.query(
    "SELECT movement_type, quantity, reference_type, reference_id FROM inventory_movements WHERE product_id=$1 ORDER BY created_at DESC LIMIT 1",
    [productId]
  )).rows[0];
  assert.equal(movementRow.movement_type, 'sale_out');
  assert.equal(Number(movementRow.quantity), -qty);
  assert.equal(movementRow.reference_type, 'order');
  assert.equal(movementRow.reference_id, order.db_id);

  // 6. Partial payment, then full remaining payment.
  const partialAmount = 30;
  const partialPay = await api('/api/finance', { invoice_id: order.invoice_number, amount: partialAmount, payment_method: 'cash', reference_number: '' }, 'POST', token);
  assert.equal(partialPay.status, 200, JSON.stringify(partialPay.data));
  const financeAfterPartial = await api('/api/finance', undefined, 'GET', token);
  const invoiceAfterPartial = financeAfterPartial.data.invoices.find((i) => i.order_id === order.id);
  assert.equal(invoiceAfterPartial.outstanding_amount, totalAmount - partialAmount);

  const remaining = totalAmount - partialAmount;
  const fullPay = await api('/api/finance', { invoice_id: order.invoice_number, amount: remaining, payment_method: 'cash', reference_number: '' }, 'POST', token);
  assert.equal(fullPay.status, 200, JSON.stringify(fullPay.data));
  const financeAfterFull = await api('/api/finance', undefined, 'GET', token);
  const invoiceAfterFull = financeAfterFull.data.invoices.find((i) => i.order_id === order.id);
  assert.equal(invoiceAfterFull.outstanding_amount, 0);
  assert.equal((await db.query('SELECT sum(amount) AS paid FROM payments WHERE invoice_id=(SELECT id FROM invoices WHERE order_id=$1)', [order.db_id])).rows[0].paid, totalAmount.toFixed(3));

  // 7. Delivery: assign a driver, mark delivered — real .from('orders').update() writes (lib/db.ts).
  const driverName = 'خالد';
  const assignRes = await fetch(base + '/api/drivers', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'assign', order_ids: [order.db_id], driver: driverName }),
  });
  assert.equal(assignRes.status, 200);
  const deliverRes = await fetch(base + '/api/drivers', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'update_order', orderId: order.db_id, driver: driverName, status: 'delivered', cashCollected: totalAmount }),
  });
  assert.equal(deliverRes.status, 200, JSON.stringify(await deliverRes.clone().json()));
  const orderRow = (await db.query('SELECT status, payment_status FROM orders WHERE id=$1', [order.db_id])).rows[0];
  assert.equal(orderRow.status, 'delivered');
  assert.equal(orderRow.payment_status, 'paid');

  // 8. Reports: the analytics endpoint recomputes live from the same tables — the
  //    new order and its delivered status must show up (monotonic checks: the
  //    sandbox DB accumulates fixtures across runs, so ">= 1", not "== 1").
  const reportsRes = await api('/api/analytics', undefined, 'GET', token);
  assert.equal(reportsRes.status, 200);
  // Orders are attributed to whoever actually created them (the acting user), not
  // the lead's assigned rep — so this order shows up under the admin account, not repName.
  const adminRepRow = reportsRes.data.reps_leaderboard.find((r) => r.name === 'مسؤول النظام التقني (System Admin)');
  assert.ok(adminRepRow && adminRepRow.orders >= 1, 'rep leaderboard did not pick up the new order');
  const deliveredStage = reportsRes.data.funnel.find((f) => f.stage === 'تم التسليم بنجاح');
  assert.ok(deliveredStage && deliveredStage.count >= 1, 'funnel did not count the delivered order');

  // 9. Second, independently-obtained session ("refresh"/new session) sees everything.
  const token2 = await login();
  const custList2 = await api('/api/customers', undefined, 'GET', token2);
  assert.ok(custList2.data.customers.some((c) => c.id === customer.id));
  const orders2 = await api('/api/orders', undefined, 'GET', token2);
  assert.ok(orders2.data.orders.some((o) => o.id === order.id));

  // 10. Persist a fixture so a later run (after a real sandbox restart) proves
  //     the entire chain — not just one domain — survived.
  await writeFile(fixturePath, JSON.stringify({
    customer_id: customer.id, phone, order_db_id: order.db_id, product_id: productId,
    total_amount: totalAmount, expected_stock_after: stockAfterOrder,
  }));

  console.log('PASS: full real journey — lead/customer -> call log -> order with real inventory auto-deduction -> partial payment -> full payment -> driver delivery -> reports reflect it -> visible from a second independent session. Real Next API -> business RPC / lib/db.ts -> PostgREST -> PostgreSQL throughout.');
} finally {
  await db.end();
}
