import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {readFile, readdir, mkdir} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import {PGlite} from '../.local-tests/node_modules/@electric-sql/pglite/dist/index.js';

// مصدر البيانات and B2B/B2C on every /sales order (lib/order-meta.ts, migration 049).
//
// The company wants to see its own data (the CRM numbers it hands the reps) turning into sales. So
// a customer picked from that list is always "Data Center" and the rep cannot change it; only a
// customer the rep adds herself may be marked social media or personal. B2B/B2C is asked every time.
const root = new URL('../', import.meta.url);
registerHooks({resolve(s, c, next) { if (s.startsWith('@/')) return next(new URL(s.slice(2) + '.ts', root).href, c); return next(s, c); }});
const {prepareOrder} = await import('../lib/business-server.ts');
const {DATA_SOURCES, CUSTOMER_SEGMENTS} = await import('../lib/order-meta.ts');

// --- The API: required on a /sales order, checked against the lists, untouched elsewhere.
const base = {customer_name: 'زبونة', customer_phone: '0790000001', total_amount: 13, payment_method: 'cash_on_delivery',
  items: [{name: 'شامبو', qty: 1, price: 13}]};
const fails = (body, re) => assert.throws(() => prepareOrder(body, 'رحمة'), re);
fails({...base, source: 'sales'}, /مصدر البيانات ونوع العميل/);
fails({...base, source: 'sales', data_source: 'data_center'}, /مصدر البيانات ونوع العميل/);
fails({...base, source: 'sales', customer_segment: 'B2C'}, /مصدر البيانات ونوع العميل/);
fails({...base, source: 'sales', data_source: 'tiktok', customer_segment: 'B2C'}, /مصدر البيانات غير صالح/);
fails({...base, source: 'sales', data_source: 'data_center', customer_segment: 'b2b'}, /B2B أو B2C/);
const ok = prepareOrder({...base, source: 'sales', data_source: 'personal', customer_segment: 'B2B'}, 'رحمة');
assert.equal(ok.data_source, 'personal');
assert.equal(ok.customer_segment, 'B2B');
const other = prepareOrder({...base, source: 'whatsapp'}, 'رحمة');
assert.ok(!('data_source' in other) && !('customer_segment' in other), 'WhatsApp and n8n orders are not asked');
assert.deepEqual(Object.keys(DATA_SOURCES), ['data_center', 'social_media', 'personal']);
assert.deepEqual(Object.keys(CUSTOMER_SEGMENTS), ['B2B', 'B2C']);

// --- The database: saved with the order as sent, read back by 049 onto the order document.
const dataDir = new URL('../.local-tests/db-' + randomUUID() + '/', import.meta.url);
await mkdir(dataDir, {recursive: true});
const db = new PGlite(fileURLToPath(dataDir));
await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
await db.exec((await readFile(new URL('supabase/migrations/001_initial_schema.sql', root), 'utf8')).replace(/^CREATE EXTENSION[^;]+;/gm, ''));
const files = (await readdir(new URL('supabase/migrations/', root)))
  .filter((f) => /^\d{3}_.*\.sql$/.test(f) && f !== '001_initial_schema.sql' && f.slice(0, 3) <= '049').sort();
assert.ok(files.includes('049_order_data_source.sql'));
for (const f of files) await db.exec(await readFile(new URL('supabase/migrations/' + f, root), 'utf8'));
await db.exec('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; SET ROLE service_role;');
const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const name = (await one(`SELECT name_ar FROM products WHERE sku='PL-SHMP-500-V2-01'`)).name_ar;
const place = async (extra) => (await one('SELECT business_create_order($1,$2,$3) r', ['rep-rahma-01', randomUUID(), JSON.stringify({
  customer_name: 'x', customer_phone: '0790001111', city: 'عمان', address: 'y', payment_method: 'cash_on_delivery', rep_name: 'رحمة',
  total_amount: 13, items: [{name, qty: 1, price: 13}], ...extra})])).r.order;
let doc = await place({source: 'sales', data_source: 'data_center', customer_segment: 'B2C'});
assert.equal(doc.data_source, 'data_center');
assert.equal(doc.customer_segment, 'B2C');
doc = await place({source: 'whatsapp'});
assert.equal(doc.data_source, null, 'older and non-/sales orders carry null');
// 049 carried 045's body forward: the delivery-progress fields are still on the document.
assert.ok('delivery_state' in doc && 'driver' in doc && 'invoice_discount' in doc);

// --- Source guards on the page: locked for our CRM list, open after "+ Add New Phone/Lead", required.
const sales = await readFile(new URL('app/sales/page.tsx', root), 'utf8');
assert.ok(/handleOpenOrderModal\(data\.customer as BusinessCustomer, true\)/.test(sales), 'a new lead opens the builder unlocked');
assert.ok(/onClick=\{\(\) => handleOpenOrderModal\(cust\)\}/.test(sales), 'a CRM customer opens it locked');
assert.ok(/disabled=\{!orderFromNewLead\}/.test(sales), 'the source list is disabled for a CRM customer');
assert.ok(/const dataSource: DataSource \| "" = orderFromNewLead \? orderDataSource : "data_center";/.test(sales),
  'what is sent for a CRM customer is Data Center whatever the list says');
assert.ok(/data_source: dataSource,\s+customer_segment: orderSegment,/.test(sales));
assert.ok(sales.includes('يرجى اختيار مصدر البيانات ونوع العميل'), 'the order does not go without both');

console.log('PASS test_order_data_source (a /sales order needs مصدر البيانات and B2B/B2C and only the listed values; WhatsApp/n8n orders are not asked; both are saved with the order and 049 reads them onto the document without losing 045\'s fields; a CRM customer is locked to Data Center and only a rep-added lead may choose)');
