// Self-contained: pure crypto logic, no database.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const root = new URL('../', import.meta.url);
registerHooks({ resolve(s, c, next) { if (s.startsWith('@/')) return next(new URL(s.slice(2) + '.ts', root).href, c); return next(s, c); } });

const { computeSignature, verifyHmacSignature } = await import('../lib/hmac.ts');

const secret = 'test-secret-do-not-use-in-production';
const body = JSON.stringify({ packageId: 'plasma-complete', quantity: 1 });

function header(ts, sig) { return `t=${ts},v1=${sig}`; }

// --- valid signature ---
{
  const ts = Date.now();
  const sig = computeSignature(secret, ts, body);
  assert.equal(verifyHmacSignature(header(ts, sig), body, secret, ts), true);
}
console.log('ok: a correctly signed, fresh request verifies');

// --- tampered body is rejected (signature no longer matches) ---
{
  const ts = Date.now();
  const sig = computeSignature(secret, ts, body);
  const tamperedBody = JSON.stringify({ packageId: 'plasma-complete', quantity: 999 });
  assert.equal(verifyHmacSignature(header(ts, sig), tamperedBody, secret, ts), false);
}
console.log('ok: a tampered body (quantity changed after signing) is rejected');

// --- wrong secret is rejected ---
{
  const ts = Date.now();
  const sig = computeSignature('a-completely-different-secret', ts, body);
  assert.equal(verifyHmacSignature(header(ts, sig), body, secret, ts), false);
}
console.log('ok: a signature made with the wrong secret is rejected');

// --- expired timestamp is rejected even with a mathematically correct signature ---
{
  const ts = Date.now() - 10 * 60 * 1000; // 10 minutes ago, outside the 5-minute default tolerance
  const sig = computeSignature(secret, ts, body);
  assert.equal(verifyHmacSignature(header(ts, sig), body, secret, Date.now()), false);
}
console.log('ok: an expired (>5 min old) timestamp is rejected, even with a valid signature');

// --- a timestamp far in the future is also rejected (clock-skew abuse) ---
{
  const ts = Date.now() + 10 * 60 * 1000;
  const sig = computeSignature(secret, ts, body);
  assert.equal(verifyHmacSignature(header(ts, sig), body, secret, Date.now()), false);
}
console.log('ok: a timestamp too far in the future is rejected');

// --- malformed / missing header ---
{
  const ts = Date.now();
  assert.equal(verifyHmacSignature(null, body, secret, ts), false);
  assert.equal(verifyHmacSignature('', body, secret, ts), false);
  assert.equal(verifyHmacSignature('not-the-right-format', body, secret, ts), false);
  assert.equal(verifyHmacSignature(`t=notanumber,v1=abcd`, body, secret, ts), false);
}
console.log('ok: missing/malformed signature headers are rejected, never throw');

// --- missing secret configuration refuses instead of throwing ---
{
  const ts = Date.now();
  const sig = computeSignature(secret, ts, body);
  assert.equal(verifyHmacSignature(header(ts, sig), body, '', ts), false);
}
console.log('ok: an unconfigured (empty) secret refuses verification');

console.log('ALL PASS: test_hmac');
