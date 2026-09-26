// Self-contained: exercises middleware.ts directly with a minimal duck-typed request object (the
// function only reads request.nextUrl.pathname, request.cookies.get(), and request.headers.get())
// — no Next.js dev server or build needed.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const root = new URL('../', import.meta.url);
registerHooks({
  resolve(s, c, next) {
    if (s.startsWith('@/')) return next(new URL(s.slice(2) + '.ts', root).href, c);
    if (s === 'next/server') return next('next/server.js', c); // bare specifier's export-map condition isn't set outside Next's own bundler
    return next(s, c);
  },
});

const { middleware } = await import('../middleware.ts');

function fakeRequest(pathname) {
  return {
    nextUrl: { pathname },
    url: 'https://betolla-erp.example' + pathname,
    cookies: { get: () => undefined },
    headers: { get: () => null },
  };
}

{
  const res = await middleware(fakeRequest('/api/orders/webhook'));
  // NextResponse.next() carries no body and no redirect/rewrite status override — critically, it
  // must NOT be the 401 JSON the middleware returns for an unauthenticated /api/* request.
  assert.notEqual(res.status, 401, '/api/orders/webhook must bypass auth entirely, like /api/leads — it is a public, HMAC-verified endpoint that verifies its own request instead');
  console.log('ok: /api/orders/webhook bypasses the auth middleware (does not return 401)');
}

{
  const res = await middleware(fakeRequest('/api/leads'));
  assert.notEqual(res.status, 401, 'sanity check: the existing public /api/leads bypass still works unchanged');
  console.log('ok: /api/leads still bypasses auth (unchanged, sanity check)');
}

{
  const res = await middleware(fakeRequest('/api/orders'));
  assert.equal(res.status, 401, 'an unrelated, unauthenticated /api/* route must still be rejected — this fix must not have widened the bypass beyond the one intended prefix');
  console.log('ok: an unrelated /api/ route (no matching bypass) is still correctly rejected with 401');
}

console.log('ALL PASS: test_orders_webhook_middleware');
