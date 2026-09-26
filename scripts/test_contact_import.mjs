import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';

// "إرسال أرقام للمندوب" (/sales): the admin pastes a list or picks an Excel file and the parser has to
// find the customer's name and phone on its own — in Arabic sheets whose first "رقم" column is the
// row number, whose "اسم" columns include the product and the rep, and where Excel has already
// dropped the leading zero of every phone. lib/contact-import.ts is pure, so this needs no server.
const root = new URL('../', import.meta.url);
registerHooks({resolve(s, c, next) { if (s.startsWith('@/')) return next(new URL(s.slice(2) + '.ts', root).href, c); return next(s, c); }});
const {normalizePhone, guessColumns, extractContacts, parsePasted, sendable} = await import('../lib/contact-import.ts');

// --- normalizePhone: every shape a Jordanian number arrives in ends up as 07XXXXXXXX.
for (const [raw, want] of [
  ['0791234567', '0791234567'], [791234567, '0791234567'], ['+962 79 123 4567', '0791234567'], ['00962781234567', '0781234567'],
  ['962771234567', '0771234567'], ['٠٧٩١٢٣٤٥٦٧', '0791234567'], ['۰۷۸۱۲۳۴۵۶۷', '0781234567'], ['079-123-4567', '0791234567'], [' 077 123 4567 ', '0771234567'],
]) assert.deepEqual(normalizePhone(raw), {phone: want, status: 'ok'}, `normalizePhone(${JSON.stringify(raw)})`);
assert.deepEqual(normalizePhone('+971501270474'), {phone: '+971501270474', status: 'foreign'}, 'a Gulf number is kept, flagged foreign');
assert.equal(normalizePhone('12345').status, 'invalid');
assert.equal(normalizePhone('').status, 'invalid');
assert.equal(normalizePhone('ما في رقم').status, 'invalid');

// --- guessColumns on an MD&ZAID-style day tab: a title row, then headers where "الرقم" is the row
// number, "اسم الصنف" is the product and "المندوب" is the rep. Only اسم الزبون / رقم الهاتف are wanted.
const mdzaid = [
  ['', '', 'شيت يوم 24-09'],
  ['.', 'الرقم', 'نوع العميل', 'اسم الزبون', 'رقم الهاتف', 'المندوب', 'الكمية', 'اسم الصنف', 'العنوان'],
  ['', 1, '2026-09-24', 'فاطمه بلتاجي', 799911276, 'صابرين', 2, 'شامبو بلازما', 'جبل المريخ'],
  ['', '', '', '', '', '', 1, 'تريتمنت بلازما', ''],
  ['', 2, '2026-09-24', 'العنود احمد', '0796375498', 'رحمه', 1, 'شامبو بلازما', 'طبربور'],
  ['', 3, '2026-09-24', 'فاطمه بلتاجي', '0799911276', 'حنين', 1, 'بلسم بلازما', ''],
  ['', 4, '2026-09-24', 'حنان حسين', '+971501270474', 'سنتر', 1, 'سيرم', ''],
];
let g = guessColumns(mdzaid);
assert.deepEqual([g.headerRow, g.nameCol, g.phoneCol], [1, 3, 4], 'header row 2, name = اسم الزبون, phone = رقم الهاتف (not الرقم)');
let contacts = extractContacts(mdzaid, g);
assert.deepEqual(contacts.map(c => [c.name, c.phone, c.status]), [
  ['فاطمه بلتاجي', '0799911276', 'ok'],
  ['العنود احمد', '0796375498', 'ok'],
  ['فاطمه بلتاجي', '0799911276', 'duplicate'],
  ['حنان حسين', '+971501270474', 'foreign'],
], 'product-only rows are skipped, the dropped zero is restored, a repeat is marked duplicate');
assert.equal(contacts.filter(sendable).length, 3, 'the duplicate is never sent');

// Common English/Arabic headers from a CRM export, phone column first.
g = guessColumns([['Mobile', 'Customer Name', 'City'], ['0781111111', 'Lina', 'Amman'], ['0782222222', 'Sara', 'Zarqa']]);
assert.deepEqual([g.headerRow, g.nameCol, g.phoneCol], [0, 1, 0]);
g = guessColumns([['الاسم', 'جوال'], ['ام محمد', '٠٧٩٥٥٥٥٥٥٥']]);
assert.deepEqual([g.nameCol, g.phoneCol], [0, 1]);
assert.equal(extractContacts([['الاسم', 'جوال'], ['ام محمد', '٠٧٩٥٥٥٥٥٥٥']], g)[0].phone, '0795555555');

// No headers at all: the phone column is the one full of numbers, the name the one full of words.
g = guessColumns([[1, 'هديل', 795476064, 'عمان'], [2, 'رشا', 796666666, 'اربد'], [3, 'منى', 797777777, 'عمان']]);
assert.equal(g.headerRow, -1);
assert.equal(g.phoneCol, 2);
assert.ok([1, 3].includes(g.nameCol));
// A header that names a phone column holding no phones is not trusted.
g = guessColumns([['رقم الهاتف', 'الاسم', 'ملاحظة'], ['—', 'سعاد', '0791231231'], ['', 'نور', '0791231232']]);
assert.equal(g.phoneCol, 2);

// --- parsePasted: free lines from WhatsApp or notes, number anywhere in the line.
let p = parsePasted('سارة احمد 0791234567\n0781112223 - ام محمد\n+962 77 999 8887 : ليلى\nنص بلا رقم\n\n٠٧٩٠٠٠٠٠٠١');
assert.deepEqual(p.contacts.map(c => [c.name, c.phone, c.status]), [
  ['سارة احمد', '0791234567', 'ok'], ['ام محمد', '0781112223', 'ok'], ['ليلى', '0779998887', 'ok'], ['', '0790000001', 'ok'],
]);
// Cells copied from Excel arrive tab-separated and go through the column logic.
p = parsePasted('اسم العميل\tرقم الهاتف\nمنى\t795000001\nرنا\t0795000002\n');
assert.deepEqual(p.contacts.map(c => [c.name, c.phone]), [['منى', '0795000001'], ['رنا', '0795000002']]);
assert.equal(p.guess.headerRow, 0);
// Bad numbers stay visible (marked invalid) instead of vanishing silently.
p = parsePasted('وعد 07912\nهبة 0791234560');
assert.deepEqual(p.contacts.map(c => c.status), ['invalid', 'ok']);

console.log('PASS test_contact_import (phones in every Jordanian shape, Arabic sheet headers, headerless lists, pasted lines, duplicates)');
