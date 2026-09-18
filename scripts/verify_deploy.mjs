// Read-only check of what production is actually serving.
//
// Nothing here signs in or writes. Next names its chunks by content, so the check is: find which
// locally-built chunk carries a string that only a given change introduced, then ask production for
// that exact filename. A 200 whose body still contains the marker means production is serving
// byte-identical code — no session, no password, no guessing whether the rollout finished.
//
// Usage: node scripts/verify_deploy.mjs [url]   (run `npx next build` first)
import {readdir, readFile} from 'node:fs/promises';
import {join} from 'node:path';

const BASE = process.argv[2] || 'https://betolla-erp--betolla-erp.us-east4.hosted.app';
const DIR = '.next/static/chunks';

// Each marker is a string introduced by one change and present in no earlier build.
const MARKERS = [
  ['#38  /drivers holds both tabs', 'لوحة التوصيل'],
  ['#37  order timeline', 'مسار الطلب'],
  ['#37  driver picker on dispatch', 'إخراج الطلب للتوصيل'],
  ['#40  statement shows a credit', 'رصيد دائن للعميلة'],
  ['#40  statement flags uncollectible', 'غير مستحقة للتحصيل'],
  ['#36  promo placeholder names VIP', 'مثال: VIP أو Salons'],
  ['#36  sample code applied to nothing', 'لا توجد عينات مجانية في هذا الطلب'],
  ['#39  sidebar drops /driver for ضياء', 'طلبات التوصيل'],
];

const files = (await readdir(DIR)).filter(f => f.endsWith('.js'));
const local = [];
for (const f of files) local.push([f, await readFile(join(DIR, f), 'utf8')]);
console.log(`local build: ${files.length} chunks\nchecking ${BASE}\n`);

let proven = 0, missing = 0;
for (const [what, marker] of MARKERS) {
  const hit = local.find(([, body]) => body.includes(marker));
  if (!hit) { console.log(`\x1b[90m  n/a  \x1b[0m ${what}  (marker not in the local build either)`); continue; }
  const [name] = hit;
  const res = await fetch(`${BASE}/_next/static/chunks/${name}`);
  const ok = res.ok && (await res.text()).includes(marker);
  if (ok) proven++; else missing++;
  console.log(`${ok ? '\x1b[32m LIVE \x1b[0m' : '\x1b[31m  NO  \x1b[0m'} ${what.padEnd(36)} ${name} -> HTTP ${res.status}`);
}

console.log(`\n${proven} of ${proven + missing} changes proven live by content-hash match.`);
if (missing) console.log('A NO means production does not serve that chunk: either the rollout has not\nfinished, or it built from a different commit.');
