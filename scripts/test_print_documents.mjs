import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {join} from 'node:path';

// Printed documents must actually print.
//
// The shift statement previewed correctly and came out of the printer as blank pages. Two things
// did it, and both are invisible on screen:
//
//   1. the modal wrapper carried `.no-print`, meant to keep the backdrop off the page — but the
//      document lives inside that wrapper, so hiding it hid the document too;
//   2. /driver/shift defined its own `@media print { .no-print { display: none } }`, left over from
//      when printing meant sending the whole page to the printer. That rule is unconditional, so it
//      applied to the new document print as well.
//
// printArea() (globals.css) already hides everything outside `.print-area` by visibility, so a
// wrapper never needs `.no-print` — and a page-level print rule that is not scoped to
// `body.printing-area` will fight it.
const root = new URL('../', import.meta.url);
const read = (p) => readFile(new URL(p, root), 'utf8');

// --- Every statement modal: its wrapper must not be hidden from print.
const MODALS = [
  ['order statement', 'components/orders/order-statement.tsx'],
  ['shift statement', 'components/drivers/shift-statement.tsx'],
];
for (const [what, path] of MODALS) {
  const src = await read(path);
  assert.match(src, /print-area/, `${what} must mark the document with .print-area`);
  assert.match(src, /printArea/, `${what} must print through printArea(), not window.print()`);
  // The wrapper is the element carrying `fixed inset-0`; it must not also be `.no-print`.
  const wrapper = src.match(/className="fixed inset-0[^"]*"/g) ?? [];
  for (const cls of wrapper)
    assert.ok(!cls.includes('no-print'),
      `${what}: the modal wrapper must not be .no-print — it contains the document, and hiding it prints blank pages`);
}

// --- No page may hide .no-print in print outside body.printing-area.
const appDir = new URL('app/', root);
async function* files(dir) {
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
    if (entry.isDirectory()) yield* files(child);
    else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.css')) yield child;
  }
}
const offenders = [];
for await (const file of files(appDir)) {
  const src = await readFile(file, 'utf8');
  if (!/@media\s+print/.test(src)) continue;
  // globals.css is where the mechanism itself lives; its rules are scoped to body.printing-area.
  const isGlobals = file.pathname.endsWith('globals.css');
  for (const block of src.split(/@media\s+print/).slice(1)) {
    const body = block.slice(0, block.indexOf('}\n      }') + 1 || 600);
    if (/\.no-print/.test(body) && !/printing-area/.test(body) && !isGlobals)
      offenders.push(file.pathname.split('/app/')[1]);
  }
}
assert.deepEqual([...new Set(offenders)], [],
  'these pages hide .no-print in print without scoping it to body.printing-area, which blanks any document printed from them:\n  ' + offenders.join('\n  '));

// --- The mechanism itself is intact.
const globals = await read('app/globals.css');
assert.match(globals, /body\.printing-area \* \{ visibility: hidden/, 'printArea hides the page by visibility');
assert.match(globals, /body\.printing-area \.print-area, body\.printing-area \.print-area \* \{ visibility: visible/,
  'and shows the document');
// Hiding by visibility alone keeps every box, so the page still occupies its height and the printer
// emits blank trailing pages for it — that is the second page the shift statement came out with.
assert.match(globals, /:not\(:has\(\.print-area\)\)/,
  'the page around the document must collapse, not merely turn invisible');

// --- And nothing may render a second copy of a document into the page itself.
// The shift page carried a `.print-only` voucher: a whole second statement rendered into the page
// and revealed only when printing. Even hidden it holds its box, so the print ran to two pages.
const pageFiles = [];
for await (const f of files(appDir)) pageFiles.push(f);
const withPrintOnly = [];
for (const f of pageFiles) {
  const src = await readFile(f, 'utf8');
  if (/className="[^"]*print-only/.test(src)) withPrintOnly.push(f.pathname.split('/app/')[1]);
}
assert.deepEqual(withPrintOnly, [],
  'these pages render a .print-only block: a second copy of a document inside the page, which prints as extra pages. Documents belong in a .print-area modal. Offenders: ' + withPrintOnly.join(', '));
assert.ok(pageFiles.length > 10, `only ${pageFiles.length} page files scanned — the walker is broken`);

// --- The shift statement carries what a signed sheet needs.
const shift = await read('components/drivers/shift-statement.tsx');
for (const [what, needle] of [
  ['the driver and the day', /shift\.driver/],
  ['every order on the run', /orders\.length \? orders\.map/],
  ['what was due and what was collected', /cash_to_collect/],
  ['the cash difference', /difference/],
  ['signature lines', /توقيع السائق/],
]) assert.match(shift, needle, `the shift statement must show ${what}`);

console.log(`PASS test_print_documents (${MODALS.length} statement modals print through printArea with the document inside a wrapper that is not .no-print; no page hides .no-print in print without scoping it to body.printing-area, which is what turned the shift statement into blank pages; the printArea mechanism in globals.css is intact; the shift statement carries the driver, the run, the cash and the signatures)`);
