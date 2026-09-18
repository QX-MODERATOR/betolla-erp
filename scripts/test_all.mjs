// Run every scripts/test_*.mjs and report. `npm test`.
//
// There are thirty-odd suites here and nothing ever ran them together, so "does the build still
// work" meant remembering which files to run by hand. This runs all of them, prints one line each,
// and exits non-zero if anything failed — the thing CI or a pre-merge check can call.
//
// Suites fall into two groups and the difference matters:
//
//   self-contained  build their own PGlite database from supabase/migrations and need nothing else.
//                   A failure here is a real failure.
//   needs-live      expect a running dev server, real credentials from .env.local, or a device.
//                   These cannot pass in a bare checkout, so they are run but reported separately
//                   and do NOT fail the run unless --strict is passed.
//
// Usage:
//   node scripts/test_all.mjs                 every suite
//   node scripts/test_all.mjs promo document  only suites whose name contains one of these
//   node scripts/test_all.mjs --strict        needs-live failures count as failures too
//   node scripts/test_all.mjs --serial        one at a time (default runs a few in parallel)
import {readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// Suites that cannot pass without something outside the repo. Named explicitly rather than
// detected, so a self-contained suite that starts failing can never be quietly excused as "needs a
// server". Each says what it needs.
const NEEDS_LIVE = {
  test_business: 'signs in with real BETOLLA_ACCOUNT_PASSWORD_* from .env.local',
  test_business_client: 'drives the client-side store against a running app',
  test_apis: 'python, and a running dev server on :3000',
  test_push: 'a registered device and live push credentials',
  test_customers_native: 'a running dev server',
  test_inventory_native: 'a running dev server',
  test_native_persistence: 'a running dev server',
  test_driver_profile_native: 'a running dev server',
  test_session_identity: 'a running dev server',
};

const TIMEOUT_MS = 10 * 60 * 1000;

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const serial = args.includes('--serial');
const filters = args.filter(a => !a.startsWith('--'));

const all = (await readdir(here))
  .filter(f => /^test_.*\.mjs$/.test(f) && f !== 'test_all.mjs')
  .map(f => f.replace(/\.mjs$/, ''))
  .filter(n => !filters.length || filters.some(f => n.includes(f)))
  .sort();

if (!all.length) { console.error('no suites matched'); process.exit(1); }

const run = (name) => new Promise(resolve => {
  const started = Date.now();
  const child = spawn(process.execPath, [join('scripts', name + '.mjs')], {cwd: root, windowsHide: true});
  let out = '', done = false;
  const finish = (code, note) => {
    if (done) return; done = true;
    resolve({name, code, out, ms: Date.now() - started, note});
  };
  child.stdout.on('data', d => out += d);
  child.stderr.on('data', d => out += d);
  child.on('error', e => finish(1, e.message));
  child.on('close', code => finish(code ?? 1));
  setTimeout(() => { if (!done) { child.kill(); finish(1, `timed out after ${TIMEOUT_MS / 1000}s`); } }, TIMEOUT_MS).unref();
});

// A few at a time: each PGlite suite is its own process and its own database directory, so they do
// not collide, but running thirty at once just thrashes the disk.
async function pool(names, size) {
  const results = [];
  let next = 0;
  await Promise.all(Array.from({length: Math.min(size, names.length)}, async () => {
    while (next < names.length) {
      const name = names[next++];
      const r = await run(name);
      results.push(r);
      const tag = r.code === 0 ? '\x1b[32mPASS\x1b[0m' : (NEEDS_LIVE[r.name] ? '\x1b[33mSKIP\x1b[0m' : '\x1b[31mFAIL\x1b[0m');
      console.log(`${tag}  ${r.name.padEnd(34)} ${String((r.ms / 1000).toFixed(1) + 's').padStart(7)}${r.note ? '  ' + r.note : ''}`);
    }
  }));
  return results;
}

console.log(`running ${all.length} suite${all.length === 1 ? '' : 's'}${serial ? ' (serial)' : ''}\n`);
const results = await pool(all, serial ? 1 : 3);
results.sort((a, b) => a.name.localeCompare(b.name));

const passed = results.filter(r => r.code === 0);
const failed = results.filter(r => r.code !== 0 && !NEEDS_LIVE[r.name]);
const skipped = results.filter(r => r.code !== 0 && NEEDS_LIVE[r.name]);

// The last line of a passing suite is its own one-line description of what it proved; worth
// keeping, because together they are the closest thing this repo has to a spec.
if (passed.length) {
  console.log('\n\x1b[32m─ passed ─\x1b[0m');
  for (const r of passed) {
    const last = r.out.trim().split('\n').filter(l => l.startsWith('PASS')).pop();
    console.log('  ' + (last || r.name));
  }
}

if (skipped.length) {
  console.log('\n\x1b[33m─ needs a live server or credentials (not run against this checkout) ─\x1b[0m');
  for (const r of skipped) console.log(`  ${r.name.padEnd(34)} ${NEEDS_LIVE[r.name]}`);
}

if (failed.length) {
  console.log('\n\x1b[31m─ failed ─\x1b[0m');
  for (const r of failed) {
    console.log(`\n\x1b[31m${r.name}\x1b[0m${r.note ? ' (' + r.note + ')' : ''}`);
    const lines = r.out.trim().split('\n');
    const at = lines.findIndex(l => /AssertionError|Error:/.test(l));
    console.log(lines.slice(at < 0 ? -12 : at, at < 0 ? undefined : at + 8).map(l => '  ' + l).join('\n'));
  }
}

const bad = failed.length + (strict ? skipped.length : 0);
console.log(`\n${passed.length} passed, ${failed.length} failed, ${skipped.length} need a live server` +
  (strict ? '  (--strict: those count as failures)' : ''));
process.exit(bad ? 1 : 0);
