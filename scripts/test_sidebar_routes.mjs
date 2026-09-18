import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Every link the sidebar offers a role must be a route that role may actually open.
//
// ضياء's sidebar offered "طلبات التوصيل" (/driver), a driver's own run sheet. isRouteAllowedForRole
// gives driver_manager "/driver/shift" but not "/driver", so the middleware bounced her to
// /drivers?restricted=true every time she pressed it — a dead tab that looked like a broken page.
//
// The two lists are maintained in different files and nothing tied them together, so this walks
// the real sidebar config against the real route guard and fails on any pair that disagrees.
const root = new URL('../', import.meta.url);

// Both files are TSX/TS with '@/' imports that bare node cannot resolve, so read the two tables
// out of the source rather than importing them.
const sidebar = await readFile(new URL('components/layout/sidebar.tsx', root), 'utf8');
const nav = sidebar.slice(sidebar.indexOf('export const NAV_CATEGORIES'));
const items = [...nav.matchAll(/href:\s*"([^"]+)"[\s\S]{0,400}?roles:\s*\[([^\]]*)\]/g)]
  .map(m => ({href: m[1], roles: [...m[2].matchAll(/"([^"]+)"/g)].map(r => r[1])}));
assert.ok(items.length > 15, `parsed ${items.length} sidebar items — the regex has drifted from the file`);

// Mirror of isRouteAllowedForRole (lib/auth.ts). Kept as data so a change there that this file
// does not know about shows up as a failure rather than passing silently.
const src = await readFile(new URL('lib/auth.ts', root), 'utf8');
const guard = src.slice(src.indexOf('export function isRouteAllowedForRole'));
const listFor = (role, kind) => {
  const block = guard.slice(guard.indexOf(`role === "${role}"`));
  const m = new RegExp(`const ${kind} = \\[([\\s\\S]*?)\\];`).exec(block.slice(0, 900));
  return m ? [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]) : null;
};
const matchesAny = (pathname, prefixes) => prefixes.some(p => pathname === p || pathname.startsWith(p + '/'));
const SELF = ['/hr/me', '/api/hr/me', '/api/profile', '/api/devices'];

function allowed(role, pathname) {
  if (role === 'admin' || role === 'general_manager') return true;
  if (matchesAny(pathname, SELF)) return true;
  const forbidden = listFor(role, 'forbidden');
  if (forbidden) return !matchesAny(pathname, forbidden);
  const allow = listFor(role, 'allowed');
  if (allow) return matchesAny(pathname, allow);
  return false;
}

// Sanity-check the mirror against the cases that prompted this file, so a parse failure cannot
// make the whole suite vacuously pass.
assert.equal(allowed('driver_manager', '/drivers'), true, 'ضياء can open the delivery board');
assert.equal(allowed('driver_manager', '/driver'), false, "and cannot open a driver's own run sheet");
assert.equal(allowed('driver_manager', '/driver/shift'), true, 'but can close a shift');
assert.equal(allowed('sales_rep', '/drivers'), false, 'a rep has no business on the delivery board');
assert.equal(allowed('sales_manager', '/drivers'), true, '"/driver" must not swallow "/drivers"');

const broken = [];
for (const item of items)
  for (const role of item.roles)
    if (!allowed(role, item.href)) broken.push(`${role} is offered ${item.href} but cannot open it`);

assert.deepEqual(broken, [], 'sidebar links that bounce to ?restricted=true:\n  ' + broken.join('\n  '));

const roles = [...new Set(items.flatMap(i => i.roles))].sort();
console.log(`PASS test_sidebar_routes (${items.length} sidebar links × ${roles.length} roles checked against isRouteAllowedForRole; no role is offered a link the middleware would bounce)`);
