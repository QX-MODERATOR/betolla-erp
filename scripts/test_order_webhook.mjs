// Self-contained: pure validation/mapping logic, no database. `npm test` / test_all.mjs picks
// this up automatically (test_*.mjs).
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const root = new URL('../', import.meta.url);
registerHooks({ resolve(s, c, next) { if (s.startsWith('@/')) return next(new URL(s.slice(2) + '.ts', root).href, c); return next(s, c); } });

const { validateWebhookOrder, OrderWebhookError, LANDING_PACKAGE_CATALOG, normalizeJordanianPhone } = await import('../lib/order-webhook.ts');

const base = () => ({
  packageId: 'plasma-complete', quantity: 1, fullName: 'سارة أحمد', phone: '0791234567',
  city: 'عمّان', address: 'الدوار السابع', notes: '', language: 'ar',
});

// --- phone normalization ---
assert.equal(normalizeJordanianPhone('0791234567'), '0791234567');
assert.equal(normalizeJordanianPhone('+962791234567'), '0791234567');
assert.equal(normalizeJordanianPhone('00962791234567'), '0791234567');
assert.equal(normalizeJordanianPhone('079-123 4567'), '0791234567');
assert.equal(normalizeJordanianPhone('0761234567'), null); // not a mobile prefix
assert.equal(normalizeJordanianPhone('123'), null);
console.log('ok: phone normalization');

// --- package -> price mapping matches migration 037's exact catalog strings ---
assert.equal(LANDING_PACKAGE_CATALOG['plasma-complete'].nameAr, 'بكج رباعي بلازما [شامبو + بلسم + تريتمنت + سيروم]');
assert.equal(LANDING_PACKAGE_CATALOG['plasma-complete'].unitPrice, 30);
assert.equal(LANDING_PACKAGE_CATALOG['plasma-duo'].nameAr, 'بكج ثنائي بلازما [شامبو + بلسم]');
assert.equal(LANDING_PACKAGE_CATALOG['plasma-duo'].unitPrice, 20);
console.log('ok: package catalog matches migration 037');

// --- totals: no delivery fee, exact package price x quantity ---
assert.equal(validateWebhookOrder(base()).totalAmount, 30);
assert.equal(validateWebhookOrder({ ...base(), quantity: 2 }).totalAmount, 60);
assert.equal(validateWebhookOrder({ ...base(), packageId: 'plasma-duo' }).totalAmount, 20);
assert.equal(validateWebhookOrder({ ...base(), packageId: 'plasma-duo', quantity: 2 }).totalAmount, 40);
console.log('ok: totals for every package x quantity combination');

// --- item name always resolves to the exact ERP bundle name, regardless of storefront language ---
assert.equal(validateWebhookOrder(base()).itemName, LANDING_PACKAGE_CATALOG['plasma-complete'].nameAr);
assert.equal(validateWebhookOrder({ ...base(), language: 'en' }).itemName, LANDING_PACKAGE_CATALOG['plasma-complete'].nameAr);
console.log('ok: item name always in Arabic (matches business_resolve_product + staff UI)');

// --- rejections ---
const rejects = (input, code) => {
  try { validateWebhookOrder(input); assert.fail(`expected ${code} to throw`); }
  catch (e) { assert.ok(e instanceof OrderWebhookError, `expected OrderWebhookError, got ${e}`); assert.equal(e.message, code); }
};
rejects({ ...base(), packageId: 'plasma-mega' }, 'UNKNOWN_PACKAGE');
rejects({ ...base(), packageId: '' }, 'UNKNOWN_PACKAGE');
rejects({ ...base(), quantity: 0 }, 'INVALID_QUANTITY');
rejects({ ...base(), quantity: 11 }, 'INVALID_QUANTITY');
rejects({ ...base(), quantity: 1.5 }, 'INVALID_QUANTITY');
rejects({ ...base(), fullName: '' }, 'MISSING_NAME');
rejects({ ...base(), phone: '123' }, 'INVALID_PHONE');
rejects({ ...base(), city: '' }, 'MISSING_CITY');
rejects({ ...base(), address: '' }, 'MISSING_ADDRESS');
console.log('ok: rejects unknown package, bad quantity, missing name/phone/city/address');

// --- a manipulated client-side price/total is impossible to send: there is no such field ---
const validated = validateWebhookOrder({ ...base(), unitPrice: 1, totalAmount: 1, price: 1 });
assert.equal(validated.totalAmount, 30);
assert.equal(validated.unitPrice, 30);
console.log('ok: ignores any client-supplied price/total, recomputes from the catalog');

// --- English storefront language still produces a valid Arabic-resolvable order ---
const en = validateWebhookOrder({ ...base(), language: 'en', fullName: 'Sara Ahmad' });
assert.equal(en.language, 'en');
assert.equal(en.customerName, 'Sara Ahmad');
assert.equal(en.itemName, LANDING_PACKAGE_CATALOG['plasma-complete'].nameAr);
console.log('ok: English-language order still resolves against the Arabic ERP catalog');

console.log('ALL PASS: test_order_webhook');
