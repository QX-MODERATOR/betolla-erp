import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';

// BX Arabia belongs to صابرين; every other driver belongs to ضياء.
//
// BX is a delivery company rather than someone on the payroll, and صابرين runs it while staying a
// sales rep — she keeps her leads, her own orders and /sales. That cannot be expressed as a role
// without either handing every sales rep the delivery module or taking her sales work away, so the
// grant is keyed on her account. This suite pins both halves: what she gained, and what ضياء lost.
const root = new URL('../', import.meta.url);
registerHooks({resolve(s, c, next) { return s.startsWith('@/') ? next(new URL(s.slice(2) + '.ts', root).href, c) : next(s, c); }});
process.env.JWT_SECRET = randomBytes(48).toString('hex');

const {BX_DRIVER, BX_COORDINATOR_IDS, isBxCoordinator, driversFor, mayActOnDriver} = await import('../lib/bx.ts');
const {DRIVERS} = await import('../lib/driver-ops.ts');
const {isRouteAllowedForRole, isRouteAllowedForUser, SYSTEM_ACCOUNTS} = await import('../lib/auth.ts');

const account = (id) => {
  const a = SYSTEM_ACCOUNTS.find((x) => x.profile.id === id);
  assert.ok(a, 'no such account: ' + id);
  return a.profile;
};
const sabreen = account('rep-sabreen-01');
const diya = account('mgr-diya-01');
const rahma = account('rep-rahma-01');
const gm = account('gm-betolla-01');

// --- Who she is: still a sales rep, and the only rep who coordinates BX.
assert.equal(sabreen.role, 'sales_rep', 'صابرين keeps her sales role');
assert.deepEqual(BX_COORDINATOR_IDS, [sabreen.id]);
assert.equal(isBxCoordinator(sabreen), true);
assert.equal(isBxCoordinator(rahma), false, 'no other rep coordinates BX');
assert.equal(isBxCoordinator(diya), false);

// --- The rosters. This is the move itself: BX left ضياء's board.
assert.deepEqual(driversFor(sabreen), [BX_DRIVER], 'صابرين runs BX and nothing else');
assert.ok(!driversFor(diya).includes(BX_DRIVER), 'ضياء no longer runs BX');
assert.deepEqual(driversFor(diya), DRIVERS.filter((d) => d !== BX_DRIVER), 'she keeps every other driver');
assert.deepEqual(driversFor(gm), [...DRIVERS], 'management keeps all of them as a fallback');
assert.deepEqual(driversFor(rahma), [], 'an ordinary rep runs no drivers');

// --- Acting on an order follows the roster, in both directions.
assert.equal(mayActOnDriver(sabreen, BX_DRIVER), true);
assert.equal(mayActOnDriver(sabreen, 'خالد'), false, 'صابرين cannot touch another driver\'s run');
assert.equal(mayActOnDriver(diya, 'خالد'), true);
assert.equal(mayActOnDriver(diya, BX_DRIVER), false, 'and ضياء cannot touch BX');
assert.equal(mayActOnDriver(gm, BX_DRIVER), true);
assert.equal(mayActOnDriver(rahma, BX_DRIVER), false);

// An order nobody has claimed is claimable by anyone who may assign a driver — that is the only way
// an order reaches BX at all, now that ضياء cannot send anything there.
assert.equal(mayActOnDriver(sabreen, null), true, 'صابرين can claim an unassigned order for BX');
assert.equal(mayActOnDriver(diya, null), true, 'so can ضياء, for her own drivers');
assert.equal(mayActOnDriver(rahma, null), false, 'an ordinary rep still cannot');

// --- Route access: the account-level grant, and its limits.
for (const path of ['/bx', '/api/drivers', '/api/orders']) {
  assert.equal(isRouteAllowedForUser(sabreen, path), true, `صابرين reaches ${path}`);
  assert.equal(isRouteAllowedForUser(rahma, path), path === '/api/orders',
    `another rep reaches ${path} only if her role already allowed it`);
}
assert.equal(isRouteAllowedForRole('sales_rep', '/bx'), false,
  'the role alone never opens /bx — otherwise every rep would have it');
assert.equal(isRouteAllowedForUser(diya, '/bx'), false, 'and ضياء has no reason to be there');
assert.equal(isRouteAllowedForUser(gm, '/bx'), true, 'management can cover');
// The grant is deliberately narrow: it must not become a back door into the rest of the app.
for (const path of ['/settings', '/finance', '/hr', '/analytics', '/drivers'])
  assert.equal(isRouteAllowedForUser(sabreen, path), false, `BX must not open ${path}`);

// --- The page exists and is fed by the scoped API rather than filtering in the browser.
const page = await readFile(new URL('app/bx/page.tsx', root), 'utf8');
assert.match(page, /DriversWorkspace/, 'the BX page reuses the delivery board');
assert.ok(!/filter\(.*BX Arabia/.test(page), 'and must not filter BX in the browser — the server scopes it');

// --- The API scopes what it sends and what it accepts.
const api = await readFile(new URL('app/api/drivers/route.ts', root), 'utf8');
assert.match(api, /driversFor\(user\)/, 'the board is scoped to the account');
assert.match(api, /mayActOnDriver\(user,o\.driver\)/, 'rows outside the roster are not sent');
assert.match(api, /guardDriver/, 'a named driver is checked');
assert.match(api, /guardOrders/, "and so is an order's current driver");
const ordersApi = await readFile(new URL('app/api/orders/route.ts', root), 'utf8');
assert.match(ordersApi, /mayActOnDriver\(user,driver\)/, 'shipping an order is scoped by driver too');

// --- The sidebar offers it by account, not by role.
const sidebar = await readFile(new URL('components/layout/sidebar.tsx', root), 'utf8');
assert.match(sidebar, /accountIds: \["rep-sabreen-01"\]/, 'the BX entry is account-gated');
assert.match(sidebar, /item\.accountIds\?\.includes/, 'and the filter honours it');

console.log(`PASS test_bx_ownership (BX Arabia moved to صابرين's account while she stays a sales rep: she runs BX and only BX, ضياء keeps every other driver and can no longer touch BX, management covers both; an unassigned order stays claimable so orders can still reach BX; /bx opens for her account and for no other rep, and the grant opens nothing else; the board is scoped server-side and every named driver and existing order is checked on write)`);
