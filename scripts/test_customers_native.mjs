// Real end-to-end lifecycle check for customer/lead persistence against the isolated native
// sandbox (real PostgreSQL + real PostgREST + a real running Next dev server on loopback).
// Run this AFTER `node scripts/local_sandbox.mjs` is up. No production connection is used.
// Re-running this script after a full sandbox restart (same on-disk pgdata) additionally
// proves the previous run's customer survived a real process restart, not just an in-memory map.
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
async function api(path, body, method = body ? 'POST' : 'GET', auth) {
  const r = await fetch(base + path, {
    method, headers: { ...(auth ? { Authorization: 'Bearer ' + auth } : {}), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(45000),
  });
  return { status: r.status, data: await r.json() };
}

const fixturePath = '.local-tests/native-sandbox/verified-customer.json';
try {
  // 0. If a previous run of THIS script left a fixture, confirm it survived — independently of
  //    whether the sandbox process was restarted in between (real DB row + real API read).
  let previous;
  try { previous = JSON.parse(await readFile(fixturePath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (previous) {
    assert.equal((await db.query('SELECT phone, name FROM customers WHERE id=$1', [previous.db_id])).rows[0].phone, previous.phone);
    const tokenForCheck = await login();
    assert.ok((await api('/api/customers', undefined, 'GET', tokenForCheck)).data.customers.some(c => c.id === previous.db_id));
    console.log('PASS: previous-run customer fixture survived (independent SQL read + live API read, possibly across a full sandbox restart).');
  }

  // 1. Two independent authenticated sessions (simulates two browser tabs / two logins).
  // Note: JWTs are stateless and second-resolution `iat`, so two logins within the same
  // second can be byte-identical; what matters is both are independently obtained and valid.
  const tokenA = await login(), tokenB = await login();
  assert.equal((await api('/api/customers', undefined, 'GET', tokenA)).status, 200);
  assert.equal((await api('/api/customers', undefined, 'GET', tokenB)).status, 200);

  // 2. Create a lead through the real, unauthenticated /api/leads endpoint (matches the
  //    documented n8n/marketing-automation contract) with synthetic test data only.
  const phone = '059' + Math.floor(1000000 + Math.random() * 8999999);
  const leadBody = { name: 'Native E2E Fixture ' + randomUUID().slice(0, 6), phone, city: 'عمان', address: 'Test Address', notes: 'Synthetic E2E test lead', source: 'social_media', rep_name: 'حمزة' };
  const created = await api('/api/leads', leadBody);
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.is_duplicate, false);
  const customer = created.data.customer;
  assert.equal(customer.phone, phone);

  // 3. Independent SQL connection proves it is a real row, not an in-process mock.
  const row = (await db.query('SELECT id, phone, name FROM customers WHERE id=$1', [customer.id])).rows[0];
  assert.ok(row, 'customer row missing in PostgreSQL');
  assert.equal(row.phone, phone);

  // 4. "Refresh": re-fetch the list from a completely separate authenticated session (tokenB)
  //    and confirm the just-created customer is visible — this is what a browser refresh does.
  const listB = await api('/api/customers', undefined, 'GET', tokenB);
  assert.equal(listB.status, 200);
  assert.ok(listB.data.customers.some(c => c.id === customer.id), 'created customer missing from a second independent session');

  // 5. Duplicate-phone submission must NOT create a second row (idempotent lead intake).
  const dup = await api('/api/leads', { ...leadBody, name: 'Different name, same phone' });
  assert.equal(dup.status, 200);
  assert.equal(dup.data.is_duplicate, true);
  assert.equal(dup.data.customer.id, customer.id);
  const countAfterDup = (await db.query('SELECT count(*) AS n FROM customers WHERE phone=$1', [phone])).rows[0].n;
  assert.equal(countAfterDup, '1', 'duplicate phone created a second row');

  // 6. Submitting the identical phone a third time (from a fresh unrelated session context) still dedupes.
  const dup2 = await api('/api/leads', { phone, name: 'Third attempt' });
  assert.equal(dup2.data.is_duplicate, true);
  assert.equal((await db.query('SELECT count(*) AS n FROM customers WHERE phone=$1', [phone])).rows[0].n, '1');

  // 7. Logout/login: end session A, log back in fresh, confirm the customer is still readable.
  await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + tokenA } });
  const relogged = await login();
  const listAfterRelogin = await api('/api/customers', undefined, 'GET', relogged);
  assert.ok(listAfterRelogin.data.customers.some(c => c.id === customer.id));

  // 8. Unauthenticated read must be rejected (401) — customers are not publicly listable.
  assert.equal((await api('/api/customers', undefined, 'GET', undefined)).status, 401);
  assert.equal((await api('/api/customers', undefined, 'GET', 'garbage-token')).status, 401);

  // 9. Persist a fixture so a later run of this script (after a real sandbox restart) can
  //    prove the row survived a full process restart of Postgres + PostgREST + Next.
  await writeFile(fixturePath, JSON.stringify({ db_id: customer.id, phone, name: leadBody.name }));

  console.log('PASS: real Next API -> business RPC -> PostgREST -> PostgreSQL customer/lead lifecycle; independent SQL read; two authenticated sessions; refresh-equivalent re-fetch; phone-duplicate idempotency (x2); logout/login retention; unauthenticated read rejected.');
} finally {
  await db.end();
}
