// Browser QA for the sales and delivery departments.  `npm run qa`
//
//   npm run qa                 every QA suite
//   npm run qa -- sales        only suites whose name contains "sales" (or "drivers")
//
// Needs the isolated sandbox (`node scripts/local_sandbox.mjs`, http://127.0.0.1:3107) and Google
// Chrome. It never touches production. Screenshots of every failure land in .local-tests/qa-report/.
//
// These are separate from `npm test` on purpose: the unit suites run anywhere in seconds, these
// drive a real browser against a running app and take a few minutes.
import {readdir, rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {ensureSandbox, reportDir} from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const filters = process.argv.slice(2).filter(a => !a.startsWith('--'));
const suites = (await readdir(here))
  .filter(f => f.endsWith('.mjs') && !['lib.mjs', 'fixtures.mjs', 'run.mjs'].includes(f))
  .map(f => f.replace(/\.mjs$/, ''))
  .filter(n => !filters.length || filters.some(f => n.includes(f)))
  .sort();
if (!suites.length) { console.error('no QA suite matched'); process.exit(1); }

try { await ensureSandbox(); } catch (e) { console.error(e.message); process.exit(1); }
await rm(reportDir, {recursive: true, force: true});

// One at a time: they share the sandbox, and a delivery run dispatches every order waiting.
const results = [];
for (const name of suites) {
  const started = Date.now();
  const code = await new Promise(resolve => {
    const child = spawn(process.execPath, [join(here, name + '.mjs')], {stdio: 'inherit', windowsHide: true});
    child.on('close', c => resolve(c ?? 1));
  });
  results.push({name, code, s: ((Date.now() - started) / 1000).toFixed(0)});
}

console.log('\n─ QA summary ─');
for (const r of results) console.log(`  ${r.code === 0 ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${r.name.padEnd(10)} ${r.s}s`);
const failed = results.filter(r => r.code !== 0).length;
if (failed) console.log(`\nScreenshots of what failed: ${reportDir}`);
process.exit(failed ? 1 : 0);
