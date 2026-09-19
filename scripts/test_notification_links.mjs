import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// A notification must open the thing it is about.
//
// Every notification linked to a list page — "/orders", "/drivers", "/calls" — so pressing one
// dropped the reader on a board with dozens of rows and no indication which one the alert meant.
// It looked like the bar did nothing. Producers now emit a deep link, the screens act on it, and
// the bell upgrades the links written before this existed by reading the order number out of the
// body, so the notifications already sitting in people's bells became openable too.
//
// This is a source-level suite on purpose: the chain is a string written in one file and read in
// another, and nothing at runtime connects them, so the thing that regresses is the pairing.
const root = new URL('../', import.meta.url);
const read = (p) => readFile(new URL(p, root), 'utf8');

// --- Producers emit a link that names the record.
const notify = await read('lib/notify.ts');
assert.match(notify, /`\/orders\?order=\$\{encodeURIComponent\(order\.id\)\}`/,
  'an order-status notification must link to that order');
assert.ok(!/notifyUser\(u, "order_status"[^)]*"\/orders"\)/.test(notify),
  'and never to the bare order list');

const ordersRoute = await read('app/api/orders/route.ts');
assert.match(ordersRoute, /`\/drivers\?order=\$\{encodeURIComponent\(result\.order\.id\)\}`/,
  'a new order waiting for a driver must link to that order');

const reminders = await read('lib/call-reminders.ts');
assert.match(reminders, /`\/calls\?customer=\$\{encodeURIComponent\(call\.customer_id\)\}`/,
  'a call reminder must link to the customer it is about');
// The daily digest covers many customers, so it correctly stays a list link.
assert.match(reminders, /'call_digest'[\s\S]{0,160}'\/calls'/, 'the digest stays a list link');

// --- The screens act on what the links carry.
const ordersWorkspace = await read('components/orders/orders-workspace.tsx');
assert.match(ordersWorkspace, /searchParams\.get\('order'\)/, 'the orders screen must read ?order=');
assert.match(ordersWorkspace, /setSelectedOrderForDetails\(match\)/, 'and open that order');
assert.match(ordersWorkspace, /setActiveTab\('all'\)/,
  'and clear the tab filter, or the named order can be filtered out of view');

const driversPage = await read('app/drivers/page.tsx');
assert.match(driversPage, /searchParams\.get\("order"\) \? "orders" : "delivery"/,
  'ضياء\'s page must open on the tab that holds the order the link names');

const callsPage = await read('app/calls/page.tsx');
assert.match(callsPage, /searchParams\.get\("customer"\)/, 'the calls screen must read ?customer=');
assert.match(callsPage, /scrollIntoView/, 'and bring that row into view');

// --- The bell resolves a target, including for links written before deep links existed.
const bellSrc = await read('components/layout/notification-bell.tsx');
assert.match(bellSrc, /router\.push\(target\)/, 'the bell navigates to the resolved target');
assert.match(bellSrc, /cursor-default/, 'and a row that opens nothing must not look clickable');

// Run the bell's own resolver against real notification shapes rather than restating its logic.
const body = bellSrc.slice(bellSrc.indexOf('const ORDER_IN_BODY'), bellSrc.indexOf('const handleItemClick'));
const targetOf = new Function('item', body.replace(/: NotificationItem\): string \| null =>/, ') =>')
  .replace('const targetOf = (item', 'const fn = (item') + '\n return fn(item);');

const cases = [
  ['a new deep link is used as written',
    {link: '/orders?order=BET-2026-00042', body: 'x — BET-2026-00042'}, '/orders?order=BET-2026-00042'],
  ['a legacy order link is upgraded from the body',
    {link: '/orders', body: 'ليلى — BET-2026-00001'}, '/orders?order=BET-2026-00001'],
  ['a legacy driver link is upgraded too',
    {link: '/drivers', body: 'ليلى — عمان — BET-2026-00007'}, '/drivers?order=BET-2026-00007'],
  ['a digest with no order named stays a list link',
    {link: '/calls', body: 'لديك 2 اتصال مجدول اليوم'}, '/calls'],
  ['an order number in the body does not hijack an unrelated link',
    {link: '/hr/leave', body: 'BET-2026-00003'}, '/hr/leave'],
  ['a notification with no link opens nothing',
    {link: null, body: 'BET-2026-00003'}, null],
];
for (const [what, item, expected] of cases)
  assert.equal(targetOf(item), expected, what);

console.log(`PASS test_notification_links (order-status, new-order and call-reminder notifications each link to the record they are about; the orders, drivers and calls screens open what the link names; the bell resolves a target and upgrades the list links written before deep links existed by reading the order number out of the body — ${cases.length} resolver cases)`);
