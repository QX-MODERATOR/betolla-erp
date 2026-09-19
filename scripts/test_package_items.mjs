import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFile} from 'node:fs/promises';

// A package is one thing you sell, made of several things you ship.
//
// Both halves of the app disagreed with that. The WhatsApp parser split every line on '+', so
// "1 بكج رباعي بلازما [شامبو + بلسم + تريتمنت + سيروم]" became FOUR order lines of one each: one
// package was ordered, but four products were priced, reserved and invoiced. The delivery board
// split the same way, so the driver was told to carry four things. And the details screen printed
// the summary string raw, which read as four items too.
//
// The rule is the bracket: a '+' inside one lists what is in a package, a '+' outside one separates
// two products.
const root = new URL('../', import.meta.url);
registerHooks({resolve(s, c, next) { return s.startsWith('@/') ? next(new URL(s.slice(2) + '.ts', root).href, c) : next(s, c); }});
const {splitOutsideBrackets, splitPackageName, isPackageName} = await import('../lib/package-items.ts');
const {parseWhatsAppOrderText} = await import('../lib/order-parser.ts');

// --- The split itself.
assert.deepEqual(splitOutsideBrackets('بكج رباعي بلازما [شامبو + بلسم + تريتمنت + سيروم]'),
  ['بكج رباعي بلازما [شامبو + بلسم + تريتمنت + سيروم]'], 'a package stays one line');
assert.deepEqual(splitOutsideBrackets('شامبو بلازما + بلسم بلازما'), ['شامبو بلازما', 'بلسم بلازما'],
  'two products still separate');
assert.deepEqual(splitOutsideBrackets('بكج [أ + ب] + تريتمنت'), ['بكج [أ + ب]', 'تريتمنت'],
  'a package beside a product: the outer + splits, the inner one does not');
assert.deepEqual(splitOutsideBrackets('بكج (أ + ب)'), ['بكج (أ + ب)'], 'parentheses count too');
assert.deepEqual(splitOutsideBrackets(''), []);
assert.deepEqual(splitOutsideBrackets('منتج واحد'), ['منتج واحد']);

// --- Reading a name as a package.
const quad = splitPackageName('بكج رباعي بلازما [شامبو + بلسم + تريتمنت + سيروم]');
assert.equal(quad.title, 'بكج رباعي بلازما');
assert.deepEqual(quad.contents, ['شامبو', 'بلسم', 'تريتمنت', 'سيروم']);
assert.equal(isPackageName('بكج رباعي بلازما [شامبو + بلسم + تريتمنت + سيروم]'), true);

// A plain product is returned whole, so one rendering path serves both.
assert.deepEqual(splitPackageName('شامبو بلازما 500 مل'), {title: 'شامبو بلازما 500 مل', contents: []});
// A bracket holding one thing is a note, not a package: it must stay in the title.
assert.deepEqual(splitPackageName('شامبو بلازما (محلي / أردني)'),
  {title: 'شامبو بلازما (محلي / أردني)', contents: []}, 'a qualifier is not a package');
assert.equal(isPackageName('شامبو بلازما (محلي / أردني)'), false);
// Arabic and Latin separators inside the bracket both work.
assert.deepEqual(splitPackageName('بكج ثنائي [شامبو، بلسم]').contents, ['شامبو', 'بلسم']);

// --- The parser: the bug as reported.
const order = parseWhatsAppOrderText(
  'الاسم: ليلى\nالهاتف: 0791234567\nالعنوان: عمان\n1 بكج رباعي بلازما [شامبو + بلسم + تريتمنت + سيروم]\nالمبلغ: 40');
assert.equal(order.items.length, 1, 'one package is one order line, not four');
assert.equal(order.items[0].quantity, 1);
assert.match(order.items[0].productName, /بكج رباعي/);
// …while a genuinely compound line still splits, which is why the '+' rule existed.
const compound = parseWhatsAppOrderText('الاسم: س\nالهاتف: 0791234567\nشامبو بلازما + بلسم بلازما');
assert.equal(compound.items.length, 2, 'two products are still two lines');

// --- The screens use it. These are strings written in one file and read in another.
const details = await readFile(new URL('components/orders/orders-workspace.tsx', root), 'utf8');
assert.match(details, /splitPackageName\(item\.name\)/, 'order details draws packages as parent + contents');
assert.ok(!/\{selectedOrderForDetails\.items_summary\}\s*\n\s*<\/div>/.test(details),
  'and no longer prints the raw summary string as the product list');

const board = await readFile(new URL('components/drivers/drivers-workspace.tsx', root), 'utf8');
assert.match(board, /splitOutsideBrackets\(line\)/, "the driver's board splits the same way");
assert.match(board, /order\.status === "مؤجل" && order\.postponeDate/,
  'a postponed order shows the day it moved to — the status alone said only that it had been');
assert.match(board, /postponeDate,/, 'and the date is carried onto the board order');

const statement = await readFile(new URL('components/orders/order-statement.tsx', root), 'utf8');
assert.match(statement, /splitPackageName\(item\.name\)/, 'the printed statement lists what is in a package');

console.log('PASS test_package_items (a package name is one item everywhere: the WhatsApp parser no longer turns "بكج رباعي [شامبو + بلسم + تريتمنت + سيروم]" into four order lines, the delivery board no longer tells the driver to carry four things, and the details screen and printed statement show the package with its contents beneath it; two genuinely separate products still split, and a bracketed qualifier is not mistaken for a package; a postponed order shows the day it moved to)');
