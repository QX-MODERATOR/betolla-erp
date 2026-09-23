import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {readFile, readdir, mkdir} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import {PGlite} from '../.local-tests/node_modules/@electric-sql/pglite/dist/index.js';

// What the daily report needs that nothing recorded (migration 051 + the order builder).
//
// The report shows, per order, how the customer reached us (and the ad campaign), why an order was
// cancelled, and any operational problem behind it. Before 051 the channel stopped at "sales", an
// office cancellation kept no reason, and problems like Out of Stock were nowhere.
const root = new URL('../', import.meta.url);
registerHooks({resolve(s, c, next) { if (s.startsWith('@/')) return next(new URL(s.slice(2) + '.ts', root).href, c); return next(s, c); }});
const {prepareOrder} = await import('../lib/business-server.ts');
const {CUSTOMER_CHANNELS, CANCEL_REASONS, ORDER_ISSUES} = await import('../lib/order-meta.ts');
const {can} = await import('../lib/permissions.ts');

// --- The API: مصدر العميل is required on /sales; Ads need a campaign; "other" needs words.
const base = {customer_name: 'زبونة', customer_phone: '0790000001', total_amount: 13, payment_method: 'cash_on_delivery',
  items: [{name: 'شامبو', qty: 1, price: 13}], source: 'sales', data_source: 'data_center', customer_segment: 'B2C'};
const CAMPAIGN = randomUUID();
const fails = (extra, re) => assert.throws(() => prepareOrder({...base, ...extra}, 'رحمة'), re);
fails({}, /اختر مصدر العميل/);
fails({channel: 'tiktok'}, /مصدر العميل غير صالح/);
fails({channel: 'plasma_ads'}, /الحملة الإعلانية/);
fails({channel: 'other'}, /«غيره»/);
let p = prepareOrder({...base, channel: 'argan_ads', campaign_id: CAMPAIGN}, 'رحمة');
assert.deepEqual([p.channel, p.campaign_id], ['argan_ads', CAMPAIGN]);
p = prepareOrder({...base, channel: 'phone_sales', campaign_id: CAMPAIGN}, 'رحمة');
assert.ok(!('campaign_id' in p), 'a campaign is kept only for an Ads channel');
p = prepareOrder({...base, channel: 'other', channel_other: 'معرض الربيع'}, 'رحمة');
assert.equal(p.channel_other, 'معرض الربيع');
assert.ok(!('channel' in prepareOrder({...base, source: 'whatsapp', data_source: undefined, customer_segment: undefined}, 'رحمة')),
  'WhatsApp/n8n orders are not asked');
assert.deepEqual(Object.keys(CUSTOMER_CHANNELS),
  ['plasma_ads', 'argan_ads', 'organic', 'whatsapp', 'phone_sales', 'old_customer', 'event', 'other']);

// --- The database.
const dataDir = new URL('../.local-tests/db-' + randomUUID() + '/', import.meta.url);
await mkdir(dataDir, {recursive: true});
const db = new PGlite(fileURLToPath(dataDir));
await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
await db.exec((await readFile(new URL('supabase/migrations/001_initial_schema.sql', root), 'utf8')).replace(/^CREATE EXTENSION[^;]+;/gm, ''));
const files = (await readdir(new URL('supabase/migrations/', root)))
  .filter((f) => /^\d{3}_.*\.sql$/.test(f) && f !== '001_initial_schema.sql' && f.slice(0, 3) <= '051').sort();
assert.ok(files.includes('051_daily_report_capture.sql'));
for (const f of files) await db.exec(await readFile(new URL('supabase/migrations/' + f, root), 'utf8'));
await db.exec('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; SET ROLE service_role;');
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const name = (await one(`SELECT name_ar FROM products WHERE sku='PL-SHMP-500-V2-01'`)).name_ar;
await db.query(`INSERT INTO mkt_campaigns(id,code,name,channel,start_date,created_by) VALUES($1,'ARG-SEP','Argan سبتمبر','facebook','2026-09-01','mgr-mkt-01')`, [CAMPAIGN]);
const place = async (extra) => (await one('SELECT business_create_order($1,$2,$3) r', ['rep-rahma-01', randomUUID(), JSON.stringify({
  customer_name: 'x', customer_phone: '0790001111', city: 'عمان', address: 'y', payment_method: 'cash_on_delivery', rep_name: 'رحمة',
  total_amount: 13, items: [{name, qty: 1, price: 13}], ...extra})])).r.order;
const status = (id, s, expected, extra = {}) => one('SELECT business_status($1,$2,$3,$4) r',
  ['mgr-sales-01', null, randomUUID(), JSON.stringify({id, status: s, expected_status: expected, ...extra})]);
const issue = (id, type, note = '') => one('SELECT business_order_issue($1,$2,$3) r', ['mgr-diya-01', randomUUID(), JSON.stringify({id, type, note})]);

// The channel and campaign come back on the order document, with who the customer is.
let doc = await place({source: 'sales', data_source: 'data_center', customer_segment: 'B2C', channel: 'argan_ads', campaign_id: CAMPAIGN});
assert.deepEqual([doc.channel, doc.campaign_id, doc.campaign_name], ['argan_ads', CAMPAIGN, 'Argan سبتمبر']);
assert.ok(doc.customer_id, 'the document names the customer, so the report can tell new from repeat');
assert.ok('delivery_state' in doc && 'data_source' in doc && 'invoice_discount' in doc, "049's fields are all still there");

// Cancelling with a reason keeps it; a bad reason is refused and changes nothing.
await assert.rejects(status(doc.id, 'cancelled', 'confirmed', {cancel_reason: 'moon'}), /INVALID_CANCEL_REASON/);
assert.equal((await one('SELECT status FROM orders WHERE order_number=$1', [doc.id])).status, 'confirmed');
doc = (await status(doc.id, 'cancelled', 'confirmed', {cancel_reason: 'price', cancel_note: 'وجدت أرخص'})).r.order;
assert.deepEqual([doc.status, doc.cancel.reason, doc.cancel.note, doc.cancel.by], ['cancelled', 'price', 'وجدت أرخص', 'mgr-sales-01']);
// Other callers may still cancel without a reason (the driver's own cancel keeps delivery.cancel_reason).
const plain = await place({});
assert.equal((await status(plain.id, 'cancelled', 'confirmed')).r.order.cancel, null);

// The operational problem: set, change, clear — each logged; unknown types refused.
const o = await place({});
await assert.rejects(issue(o.id, 'aliens'), /INVALID_ISSUE/);
doc = (await issue(o.id, 'out_of_stock', 'نفد الشامبو')).r.order;
assert.deepEqual([doc.issue.type, doc.issue.note, doc.issue.by], ['out_of_stock', 'نفد الشامبو', 'mgr-diya-01']);
doc = (await issue(o.id, 'delivery_delay')).r.order;
assert.equal(doc.issue.type, 'delivery_delay');
doc = (await issue(o.id, '')).r.order;
assert.equal(doc.issue, null);
const log = (await db.query(`SELECT changes FROM order_changes c JOIN orders x ON x.id=c.order_id WHERE x.order_number=$1 ORDER BY c.changed_at`, [o.id])).rows
  .map((r) => [r.changes.issue.from, r.changes.issue.to]);
assert.deepEqual(log, [[null, 'out_of_stock'], ['out_of_stock', 'delivery_delay'], ['delivery_delay', null]]);
assert.deepEqual(Object.keys(ORDER_ISSUES), ['out_of_stock', 'delivery_delay', 'product_unavailable', 'price_issue', 'other']);
assert.ok(Object.keys(CANCEL_REASONS).includes('price'));

// --- Who tags problems; the screens ask for what the report needs.
for (const role of ['admin', 'general_manager', 'sales_manager', 'driver_manager']) assert.equal(can(role, 'orders.issue'), true, role);
for (const role of ['sales_rep', 'marketing', 'finance', 'driver']) assert.equal(can(role, 'orders.issue'), false, role);
const api = await readFile(new URL('app/api/orders/route.ts', root), 'utf8');
assert.ok(api.includes("if(!isCancelReason(body.cancel_reason))throw new BusinessError('اختر سبب إلغاء الطلب.');"), 'the API refuses a cancel without a reason');
const sales = await readFile(new URL('app/sales/page.tsx', root), 'utf8');
assert.ok(sales.includes('id="order-channel"') && sales.includes('يرجى اختيار مصدر العميل.'), '/sales asks مصدر العميل and will not save without it');
assert.ok(sales.includes('if (meta.previous_orders > 0) setOrderChannel((current) => current || "old_customer");'), 'a returning customer is suggested as Old Customer');
const orders = await readFile(new URL('components/orders/orders-workspace.tsx', root), 'utf8');
assert.ok(orders.includes('id="cancel-reason"') && orders.includes("void changeStatus(id,'cancelled',undefined,extra);"), '/orders cancels only with a reason');

console.log('PASS test_daily_report_capture (مصدر العميل is required on /sales with a campaign for Ads and words for "other"; the order document carries channel, campaign, customer and keeps 049\'s fields; an office cancel keeps its reason and a bad one is refused; operational problems are set, changed and cleared with a log; only management, the sales manager and ضياء tag them; /sales and /orders ask for it all)');
