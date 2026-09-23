// One-off: turns the warehouse's list (inventory.txt: المواد <tab> تعبئة) into the sheet the owner
// fills with prices and stock (new-inventory.csv). build-migration.mjs then turns that sheet into
// the migration. Run from the repo root:  node scripts/inventory/make-template.mjs inventory.txt
import {readFileSync, writeFileSync} from 'node:fs';

const CATEGORIES = {
  PLS: 'plasma-hair-care', ARG: 'argan-hair-care', MOR: 'morphosis-professional',
  PRO: 'professional-proteins', CARE: 'hair-care', TOOL: 'electrical-styling', LENS: 'beto-lenses',
};

function categoryOf(name) {
  if (/بلازما/.test(name)) return 'PLS';
  if (/ارجان|أرجان/.test(name)) return 'ARG';
  if (/مور/.test(name) || /ريستركشر|ليف ان/.test(name)) return 'MOR';
  if (/ماراكوجا|ديفاي|ثيرابي|بلكس|SP|فيلر/.test(name)) return 'PRO';
  if (/سشوار|مكبس/.test(name)) return 'TOOL';
  if (/عدسات|[A-Za-z]/.test(name)) return 'LENS';
  return 'CARE';
}

// "ش بلازما" is how the warehouse writes شامبو بلازما; the catalog spells it out.
function fullName(material) {
  return material.trim()
    .replace(/^ش\s+/, 'شامبو ').replace(/^ب\s+/, 'بلسم ')
    .replace(/ش\+ب/, 'شامبو + بلسم')
    .replace(/\s+/g, ' ');
}

// Name = material + pack size. Counting units (حبة، كت) are not a size and stay out of the name.
function sizeLabel(size) {
  const s = size.trim();
  if (s === 'حبة' || s === 'كت' || !s) return '';
  if (/^\d+$/.test(s)) return `${s} مل`;
  return s.replace(/^(\d+)\s*(مل|لتر)$/, '$1 $2');
}

const [, , file = 'inventory.txt'] = process.argv;
const rows = readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/).map(l => l.split('\t'))
  .filter(([m]) => m && m.trim() && m.trim() !== 'المواد');

const counters = {};
const seen = new Set();
const lines = [['sku', 'الاسم', 'الفئة', 'سعر البيع', 'سعر التكلفة', 'الكمية', 'حد إعادة الطلب']];
for (const [material, size = ''] of rows) {
  const name = [fullName(material), sizeLabel(size)].filter(Boolean).join(' ');
  if (seen.has(name)) throw new Error('duplicate product name: ' + name);
  seen.add(name);
  const cat = categoryOf(name);
  counters[cat] = (counters[cat] || 0) + 1;
  lines.push([`BT-${cat}-${String(counters[cat]).padStart(2, '0')}`, name, CATEGORIES[cat], '', '', '', '5']);
}
const csv = lines.map(r => r.map(v => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v).join(',')).join('\r\n');
// BOM so Excel opens the Arabic correctly.
writeFileSync('scripts/inventory/new-inventory.csv', '﻿' + csv + '\r\n');
console.log(`${lines.length - 1} products`, counters);
