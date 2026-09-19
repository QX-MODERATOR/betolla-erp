import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';

// Who is in the marketing department and what each person may do there.
//
// Membership is by account, like BX (test_bx_ownership): رحمة (Meta orders) and حمزة (coordinator)
// are sales reps who join marketing without leaving sales, so the grant cannot be a role. And since
// 044 a marketing specialist works her own leads and orders exactly like a sales rep — same pages,
// same scoping — while the marketing manager sees every lead, like the sales manager.
const root = new URL('../', import.meta.url);
registerHooks({resolve(s, c, next) { return s.startsWith('@/') ? next(new URL(s.slice(2) + '.ts', root).href, c) : next(s, c); }});
process.env.JWT_SECRET = randomBytes(48).toString('hex');

const {MARKETING_TEAM, MARKETING_ACCOUNT_IDS, MARKETING_SIGNOFF_IDS, marketingAccess, taskMoves} = await import('../lib/marketing.ts');
const {isRouteAllowedForRole, isRouteAllowedForUser, SYSTEM_ACCOUNTS} = await import('../lib/auth.ts');
const {isOwnQueueRole, normalizeRepName, ACTIVE_SALES_REPS, MARKETING_REPS, ASSIGNABLE_REPS} = await import('../lib/reps.ts');
const {can} = await import('../lib/permissions.ts');

const account = (id) => {
  const a = SYSTEM_ACCOUNTS.find((x) => x.profile.id === id);
  assert.ok(a, 'no such account: ' + id);
  return a.profile;
};
const ammar = account('mgr-mkt-01'), hamza = account('rep-hamza-01'), rahma = account('rep-rahma-01');
const leen = account('mkt-leen-01'), hanin = account('mkt-team-01'), haneen = account('rep-haneen-01');
const salesMgr = account('mgr-sales-01'), gm = account('gm-betolla-01'), finance = account('fin-zaid-01');

// --- The roster: every member is a real login, and the people the user named hold the right jobs.
for (const m of MARKETING_TEAM) account(m.accountId);
const position = (id) => MARKETING_TEAM.find((m) => m.accountId === id)?.position;
assert.equal(position('mgr-mkt-01'), 'manager');
assert.equal(position('rep-hamza-01'), 'coordinator');
assert.equal(position('rep-rahma-01'), 'meta_orders');
assert.equal(position('mkt-leen-01'), 'specialist');
assert.equal(position('mkt-team-01'), 'specialist');
assert.deepEqual([...MARKETING_SIGNOFF_IDS].sort(), ['mgr-mkt-01', 'rep-hamza-01'], 'work for review goes to ammar and hamza');
// رحمة and حمزة stay sales reps: joining marketing took nothing away from sales.
assert.equal(rahma.role, 'sales_rep');
assert.equal(hamza.role, 'sales_rep');

// --- Standing in the department.
assert.equal(marketingAccess(ammar), 'manage');
assert.equal(marketingAccess(hamza), 'manage', 'the coordinator plans campaigns and signs off with ammar');
assert.equal(marketingAccess(rahma), 'member');
assert.equal(marketingAccess(leen), 'member');
assert.equal(marketingAccess(hanin), 'member');
assert.equal(marketingAccess(gm), 'manage', 'management covers');
assert.equal(marketingAccess(haneen), null, 'a sales rep who is not on the team is not in marketing');
assert.equal(marketingAccess(salesMgr), null);
assert.equal(marketingAccess(finance), null);
assert.equal(marketingAccess({id: 'someone-new', role: 'marketing'}), 'member', 'a new marketing login joins by role');

// --- Routes: by role for marketing logins, by account for the two sales reps, nobody else.
for (const path of ['/marketing', '/marketing/campaigns', '/marketing/tasks', '/api/marketing/campaigns', '/api/marketing/tasks']) {
  for (const who of [ammar, hamza, rahma, leen, hanin, gm])
    assert.equal(isRouteAllowedForUser(who, path), true, `${who.username} reaches ${path}`);
  for (const who of [haneen, salesMgr, finance])
    assert.equal(isRouteAllowedForUser(who, path), false, `${who.username} must not reach ${path}`);
}
assert.equal(isRouteAllowedForRole('sales_rep', '/marketing'), false, 'the role alone never opens marketing — otherwise every rep would have it');
// The account grant is narrow: it must not become a back door for the two reps.
for (const path of ['/settings', '/finance', '/hr', '/analytics', '/drivers', '/bx'])
  assert.equal(isRouteAllowedForUser(hamza, path), false, `marketing must not open ${path} for a rep`);

// --- A marketing specialist works like a sales rep: /sales, /calls, orders, her own queue.
for (const path of ['/sales', '/calls', '/customers', '/orders', '/api/calls', '/api/inventory', '/api/orders'])
  for (const who of [leen, hanin, ammar])
    assert.equal(isRouteAllowedForUser(who, path), true, `${who.username} reaches ${path}`);
for (const path of ['/finance', '/hr', '/settings', '/drivers', '/inventory'])
  assert.equal(isRouteAllowedForUser(leen, path), false, `a specialist must not open ${path}`);
assert.equal(isOwnQueueRole('marketing'), true, 'a specialist sees only her own leads and orders');
assert.equal(isOwnQueueRole('sales_rep'), true);
assert.equal(isOwnQueueRole('marketing_manager'), false, 'the manager sees everyone, like the sales manager');
for (const action of ['orders.create', 'orders.edit', 'calls.log', 'customers.edit'])
  for (const role of ['marketing', 'marketing_manager']) assert.equal(can(role, action), true, `${role} ${action}`);
for (const role of ['marketing', 'marketing_manager']) {
  assert.equal(can(role, 'orders.status'), false, `${role} does not move order status — operations does`);
  assert.equal(can(role, 'orders.dispatch'), false);
}

// --- Lead ownership by name: "لين (تسويق)" owns leads assigned to "لين".
assert.equal(normalizeRepName(leen.name), 'لين');
assert.equal(normalizeRepName(rahma.name), 'رحمة');
assert.ok(MARKETING_REPS.includes('لين') && ASSIGNABLE_REPS.includes('لين'), 'لين can be picked as a lead or order rep');
assert.ok(!ACTIVE_SALES_REPS.includes('لين'), 'but inbound leads are not round-robined to marketing');
// No two own-queue accounts may share a rep name, or one would see the other's leads.
const queues = SYSTEM_ACCOUNTS.filter((a) => isOwnQueueRole(a.profile.role)).map((a) => normalizeRepName(a.profile.name));
assert.equal(new Set(queues).size, queues.length, 'duplicate rep queue: ' + queues.join(', '));

// --- Tasks: a member works up to review; only manage closes or reopens.
assert.deepEqual(taskMoves('in_progress', 'member').sort(), ['review', 'todo']);
assert.deepEqual(taskMoves('review', 'member').sort(), ['in_progress', 'todo']);
assert.deepEqual(taskMoves('done', 'member'), []);
assert.ok(taskMoves('review', 'manage').includes('done'));
assert.deepEqual(taskMoves('done', 'manage'), ['in_progress']);

// --- The sidebar offers marketing by account too, and the API refuses anyone outside it.
const sidebar = await readFile(new URL('components/layout/sidebar.tsx', root), 'utf8');
assert.match(sidebar, /href: "\/marketing"[\s\S]{0,200}accountIds: MARKETING_ACCOUNT_IDS/, 'the marketing entry is account-gated');
assert.deepEqual([...MARKETING_ACCOUNT_IDS].sort(), MARKETING_TEAM.map((m) => m.accountId).sort());
const server = await readFile(new URL('lib/marketing-server.ts', root), 'utf8');
assert.match(server, /marketingAccess\(user\)[\s\S]{0,80}if \(!access\) throw/, 'every marketing API call checks department membership');
for (const route of ['app/api/marketing/campaigns/route.ts', 'app/api/marketing/tasks/route.ts']) {
  const src = await readFile(new URL(route, root), 'utf8');
  assert.ok((src.match(/marketingUser\(req,/g) || []).length >= 2, `${route}: GET and POST both go through marketingUser`);
}
const campaigns = await readFile(new URL('app/api/marketing/campaigns/route.ts', root), 'utf8');
assert.match(campaigns, /kind==='campaign'\)\{\s*requireManage/, 'only manage creates or edits campaigns');
assert.match(campaigns, /kind==='spend'\)\{\s*requireManage/, 'only manage records spend');
assert.match(campaigns, /kind==='void'\)\{\s*requireManage/, 'only manage voids spend');
assert.match(campaigns, /data\.scope_rep=scope/, 'a member tags only her own leads');

console.log('PASS test_marketing_access (ammar manages and حمزة coordinates; رحمة, لين and the marketing specialist are members; رحمة and حمزة join by account while staying sales reps, and no other rep gets /marketing; a specialist works her own leads and orders like a sales rep — create, edit, call, but not move status — while the manager sees all; no two queues share a rep name; members work tasks up to review and only manage closes)');
