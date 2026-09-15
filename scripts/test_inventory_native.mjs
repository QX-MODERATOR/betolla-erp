// Real end-to-end lifecycle check for inventory movement persistence against the isolated
// native sandbox (real PostgreSQL + real PostgREST + a real running Next dev server on
// loopback). Run this AFTER `node scripts/local_sandbox.mjs` is up. No production connection.
// Re-running after a full sandbox restart (same on-disk pgdata) proves the previous run's
// stock level and movement history survived a real process restart, not just an in-memory array.
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

const fixturePath = '.local-tests/native-sandbox/verified-inventory.json';
try {
  const token = await login();

  // 0. Ensure a real, test-only product exists (never touch a real seeded catalog SKU).
  let previous;
  try { previous = JSON.parse(await readFile(fixturePath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }

  let sku, productId;
  if (previous) {
    // Confirm the previous run's product/stock survived — independently via SQL and live API.
    const row = (await db.query('SELECT p.sku, i.quantity_on_hand FROM products p JOIN inventory i ON i.product_id=p.id WHERE p.id=$1', [previous.product_id])).rows[0];
    assert.ok(row, 'fixture product row missing after restart');
    assert.equal(row.quantity_on_hand, previous.expected_stock);
    sku = row.sku; productId = previous.product_id;
    const catalog = (await api('/api/inventory', undefined, 'GET', token)).data.catalog;
    assert.ok(catalog.find(p => p.sku === sku && p.stock === previous.expected_stock));
    console.log('PASS: previous-run inventory fixture (product + stock level) survived a full sandbox restart, confirmed via SQL and live API.');
  } else {
    sku = 'E2E-TEST-' + randomUUID().slice(0, 6);
    const insert = await db.query(
      "INSERT INTO products(sku,name_ar,name_en,retail_price,cost_price) VALUES($1,'Native E2E Test Product','Native E2E Test Product',10,5) RETURNING id",
      [sku]
    );
    productId = insert.rows[0].id;
  }

  // 1. Purchase-in through the real, authenticated /api/inventory endpoint.
  const purchase = await api('/api/inventory', { sku, type: 'purchase_in', quantity: 40, reference: 'Native E2E purchase' }, 'POST', token);
  assert.equal(purchase.status, 201, JSON.stringify(purchase.data));
  const movementId = purchase.data.movement.id;
  assert.equal(purchase.data.stock, (previous ? previous.expected_stock : 0) + 40);
  let expectedStock = purchase.data.stock;

  // 2. Independent SQL connection proves it's a real row.
  const row1 = (await db.query('SELECT quantity_on_hand FROM inventory WHERE product_id=$1', [productId])).rows[0];
  assert.equal(row1.quantity_on_hand, expectedStock);

  // 3. "Refresh": re-fetch from a second, independently-obtained session.
  const token2 = await login();
  const catalog2 = (await api('/api/inventory', undefined, 'GET', token2)).data.catalog;
  assert.equal(catalog2.find(p => p.sku === sku).stock, expectedStock);

  // 4. Sale-out decreases stock; verify via SQL again.
  const sale = await api('/api/inventory', { sku, type: 'sale_out', quantity: 15, reference: 'Native E2E sale' }, 'POST', token);
  assert.equal(sale.status, 201);
  expectedStock -= 15;
  assert.equal(sale.data.stock, expectedStock);
  assert.equal((await db.query('SELECT quantity_on_hand FROM inventory WHERE product_id=$1', [productId])).rows[0].quantity_on_hand, expectedStock);

  // 5. Retrying the exact same request with the SAME Idempotency-Key must replay, not double-apply.
  const retryKey = randomUUID();
  const smallPurchaseBody = { sku, type: 'purchase_in', quantity: 3, reference: 'Native E2E retry-safety' };
  const firstAttempt = await api('/api/inventory', smallPurchaseBody, 'POST', token, retryKey);
  assert.equal(firstAttempt.status, 201);
  expectedStock += 3;
  assert.equal(firstAttempt.data.stock, expectedStock);
  const replayAttempt = await api('/api/inventory', smallPurchaseBody, 'POST', token, retryKey);
  assert.equal(replayAttempt.status, 200);
  assert.equal(replayAttempt.data.replayed, true);
  assert.equal((await db.query('SELECT quantity_on_hand FROM inventory WHERE product_id=$1', [productId])).rows[0].quantity_on_hand, expectedStock);

  // 6. Reverse the sale-out; stock should return to pre-sale level.
  const reverse = await api('/api/inventory', { movement_id: sale.data.movement.id }, 'PATCH', token);
  assert.equal(reverse.status, 200, JSON.stringify(reverse.data));
  expectedStock += 15;
  assert.equal(reverse.data.stock, expectedStock);

  // 7. Reversing the same movement twice is rejected.
  const doubleReverse = await api('/api/inventory', { movement_id: sale.data.movement.id }, 'PATCH', token);
  assert.equal(doubleReverse.status, 409);

  // 8. Logout/login, confirm the movement history and stock are still visible.
  await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
  const relogged = await login();
  const finalCatalog = (await api('/api/inventory', undefined, 'GET', relogged)).data.catalog;
  assert.equal(finalCatalog.find(p => p.sku === sku).stock, expectedStock);
  const finalMovements = (await api('/api/inventory', undefined, 'GET', relogged)).data.movements;
  assert.ok(finalMovements.some(m => m.id === movementId));

  // 9. Persist a fixture so a later run (after a real sandbox restart) can prove survival.
  await writeFile(fixturePath, JSON.stringify({ product_id: productId, expected_stock: expectedStock }));

  console.log('PASS: real Next API -> business RPC -> PostgREST -> PostgreSQL inventory movement lifecycle; independent SQL read; second-session refresh; purchase/sale stock math; reversal restores stock; double-reversal blocked; logout/login retention.');
} finally {
  await db.end();
}
