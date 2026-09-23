import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';

// The rep sets the order's total and answers for it (owner, 2026-09-23).
//
// A rep typed a total different from the priced lines and got "إجمالي الأصناف لا يطابق إجمالي
// الطلب." — the check read `!override && a || b`, so a typed total was refused whenever every line
// had a price, which is every /sales order. Now a differing total is never refused: it goes to the
// database as a hand-typed total (048), the lines keep their prices and the gap is the discount.
const root = new URL('../', import.meta.url);
registerHooks({resolve(s, c, next) { if (s.startsWith('@/')) return next(new URL(s.slice(2) + '.ts', root).href, c); return next(s, c); }});
const {prepareOrder} = await import('../lib/business-server.ts');

const base = {customer_name: 'زبونة', customer_phone: '0790000001', payment_method: 'cash_on_delivery',
  items: [{name: 'شامبو', qty: 2, price: 13}]};

// The exact case that failed: every line priced, total typed lower, flagged as typed.
let p = prepareOrder({...base, total_amount: 20, total_override: true}, 'رحمة');
assert.equal(p.total_amount, 20);
assert.equal(p.total_override, true);
// Not flagged (an older page, the WhatsApp text path): still accepted, and marked as typed.
p = prepareOrder({...base, total_amount: 20}, 'رحمة');
assert.equal(p.total_override, true, 'a differing total goes to the database as a typed total');
p = prepareOrder({...base, total_amount: 30}, 'رحمة');
assert.equal(p.total_override, true, 'higher than the lines too');
// Matching totals are not marked, so nothing changes for them.
p = prepareOrder({...base, total_amount: 26}, 'رحمة');
assert.ok(!('total_override' in p));
// Lines without prices (typed from WhatsApp) under the total are the normal case, not a mismatch.
p = prepareOrder({...base, items: [{name: 'شامبو', qty: 1, price: 13}, {name: 'بلسم', qty: 1}], total_amount: 26}, 'رحمة');
assert.ok(!('total_override' in p));
// A total must still be a positive amount.
assert.throws(() => prepareOrder({...base, total_amount: 0}, 'رحمة'), /موجب/);

// The catalogue path keeps the page's total instead of refusing a changed price.
const pricing = await readFile(new URL('lib/order-pricing.ts', root), 'utf8');
assert.ok(!pricing.includes('تغيّرت أسعار الكتالوج'), 'a changed catalogue price no longer blocks the order');
assert.ok(pricing.includes('return {...body,items,total_amount:sent,total_override:true};'));
const server = await readFile(new URL('lib/business-server.ts', root), 'utf8');
assert.ok(!server.includes('إجمالي الأصناف لا يطابق إجمالي الطلب'), 'the API no longer refuses a differing total');

console.log('PASS test_order_total_rep (a total the rep sets is never refused for differing from the lines — typed or not, lower or higher, and even when the catalogue changed — it is saved as a hand-typed total with the gap as a discount; matching totals are untouched and zero is still refused)');
