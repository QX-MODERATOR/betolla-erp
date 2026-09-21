// Browser QA harness: real headless Chrome, driven over the DevTools protocol, against the isolated
// sandbox (`node scripts/local_sandbox.mjs`, http://127.0.0.1:3107). Nothing here can reach
// production: every connection is to loopback, and the database guard checks the sandbox identity.
//
// The unit suites (scripts/test_*.mjs) prove the database and the API. What they cannot see is the
// page a person actually gets: a layout that overflows a phone (hanan.sales, PR #52), a button that
// never appears, a page that throws after hydration. Every page opened through `openPage` is checked
// for those automatically — a test only has to say what the page should contain.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir, rm} from 'node:fs/promises';
import {existsSync, openSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, join, resolve} from 'node:path';
import pg from '../../.local-tests/node_modules/pg/lib/index.js';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const BASE = 'http://127.0.0.1:3107';
const SANDBOX_DB = {host: '127.0.0.1', port: 55439, user: 'postgres', database: 'betolla_isolated_20260913'};
const sandboxDir = join(root, '.local-tests/native-sandbox');
export const reportDir = join(root, '.local-tests/qa-report');

// Wide tables that are known and not fixed yet. Reported as a warning on every run — not silently
// passed — so they stay visible until someone decides to redesign them. Remove an entry once fixed.
const KNOWN_WIDE_TABLES = {
  '/inventory': 'the stock and movement tables (9 and 6 columns) have no phone layout yet — raised 2026-09-21',
  '/customers': 'the customer list is a 9-column table (~900px) with no phone layout yet — raised 2026-09-21',
};
const warned = new Set();

export const PHONE = {name: 'phone', width: 390, height: 844, mobile: true, scale: 2};
export const DESKTOP = {name: 'desktop', width: 1366, height: 900, mobile: false, scale: 1};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const up = async (url, wait = 5000) => { try { return (await fetch(url, {signal: AbortSignal.timeout(wait)})).status < 500; } catch { return false; } };

// ─── sandbox ────────────────────────────────────────────────────────────────────────────────────

// PostgREST is the part of the sandbox that dies on its own (and it is the one the OS reaps under
// memory pressure). Without it every sign-in answers 503, which reads like an app bug. Restart it
// here rather than making every QA run start with a debugging session.
async function ensurePostgrest() {
  if (await up('http://127.0.0.1:55440/')) return;
  const runtime = JSON.parse(await readFile(join(sandboxDir, 'runtime.json'), 'utf8'));
  const {pg_ctl} = await import('../../.local-tests/node_modules/@embedded-postgres/windows-x64/dist/index.js');
  const log = openSync(join(sandboxDir, 'postgrest.log'), 'a');
  const child = spawn(join(root, '.local-tests/postgrest/postgrest.exe'), [], {
    // Run from Postgres's bin folder: that is where Windows finds libpq.dll. Putting the folder on
    // PATH is not reliably enough — PostgREST then exits at once with 0xC0000135 (DLL not found),
    // logging nothing after "Starting PostgREST".
    cwd: dirname(pg_ctl),
    env: {...process.env,
      PGRST_DB_URI: `postgres://postgres@127.0.0.1:55439/${SANDBOX_DB.database}`, PGRST_DB_SCHEMAS: 'public',
      PGRST_JWT_SECRET: runtime.pgjwt, PGRST_SERVER_HOST: '127.0.0.1', PGRST_SERVER_PORT: '55440'},
    detached: true, windowsHide: true, stdio: ['ignore', log, log],
  });
  child.unref();
  for (let i = 0; i < 40 && !(await up('http://127.0.0.1:55440/')); i++) await sleep(500);
  if (!(await up('http://127.0.0.1:55440/'))) throw new Error('PostgREST would not start; see .local-tests/native-sandbox/postgrest.log');
  console.log('  (restarted PostgREST, which had stopped)');
}

export async function ensureSandbox() {
  if (!existsSync(join(sandboxDir, 'runtime.json')) || !(await up(BASE + '/login', 240000)))
    throw new Error('The QA sandbox is not running. Start it with:  node scripts/local_sandbox.mjs   (then re-run)');
  await ensurePostgrest();
}

let dbClient;
export async function db() {
  if (dbClient) return dbClient;
  dbClient = new pg.Client(SANDBOX_DB);
  await dbClient.connect();
  // The one guard that matters: this must be the throwaway sandbox, never a real database.
  assert.equal((await dbClient.query('SELECT name FROM sandbox_identity')).rows[0].name, SANDBOX_DB.database);
  return dbClient;
}

// Jordan's calendar day, which is what the app means by "today".
export const today = (offsetDays = 0) =>
  new Date(Date.now() + offsetDays * 864e5).toLocaleDateString('en-CA', {timeZone: 'Asia/Amman'});

// ─── accounts ───────────────────────────────────────────────────────────────────────────────────

const sessions = new Map();
// Signs in through the real /api/auth/login (the sandbox gives every account one password, kept in
// runtime.json — it never appears in a URL, a log or a screenshot).
export async function session(username) {
  if (sessions.has(username)) return sessions.get(username);
  const {password} = JSON.parse(await readFile(join(sandboxDir, 'runtime.json'), 'utf8'));
  let r;
  for (let i = 0; i < 3; i++) {
    r = await fetch(BASE + '/api/auth/login', {method: 'POST', headers: {'content-type': 'application/json', origin: BASE},
      body: JSON.stringify({username, password}), signal: AbortSignal.timeout(60000)});
    if (r.status !== 503) break;
    await ensurePostgrest();
  }
  assert.equal(r.status, 200, `sign-in as ${username} failed: ${r.status} ${await r.text()}`);
  const cookies = r.headers.getSetCookie().map(s => {
    const [nv] = s.split(';'); const i = nv.indexOf('=');
    return {name: nv.slice(0, i), value: nv.slice(i + 1), domain: '127.0.0.1', path: '/'};
  });
  const cookie = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  const me = await (await fetch(BASE + '/api/auth/me', {headers: {cookie}})).json();
  const s = {username, cookies, cookie, user: me.user ?? me};
  sessions.set(username, s);
  return s;
}

// Calls the same API route the page calls, as that person. Used to set up state a journey starts
// from; the step under test goes through the page.
export async function api(username, path, body, method = body ? 'POST' : 'GET') {
  const s = await session(username);
  const r = await fetch(BASE + path, {method, headers: {cookie: s.cookie, origin: BASE, 'content-type': 'application/json',
    'Idempotency-Key': crypto.randomUUID()}, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000)});
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = {raw: text}; }
  return {status: r.status, json};
}

// ─── browser ────────────────────────────────────────────────────────────────────────────────────

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', process.env.CHROME_PATH].find(p => p && existsSync(p));

let browser;
async function launchBrowser() {
  if (browser) return browser;
  assert.ok(CHROME, 'Chrome not found (set CHROME_PATH)');
  const port = 9400 + Math.floor(Math.random() * 400);
  const profile = join(reportDir, '.chrome-profile');
  await rm(profile, {recursive: true, force: true});
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--disable-gpu', '--disable-extensions', 'about:blank'], {stdio: 'ignore', windowsHide: true});
  let wsUrl;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; } catch { await sleep(250); }
  }
  assert.ok(wsUrl, 'Chrome did not open its debugging port');
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map(), listeners = new Set();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const {res, rej} = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    else for (const l of listeners) l(m);
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const i = ++id; pending.set(i, {res, rej});
    ws.send(JSON.stringify({id: i, method, params, sessionId}));
  });
  browser = {send, listeners, close: () => { try { ws.close(); } catch {} proc.kill(); }};
  return browser;
}
export function closeBrowser() { browser?.close(); browser = null; dbClient?.end().catch(() => {}); dbClient = null; }

// A page signed in as `username`, in its own browser context (its own cookies and localStorage), at
// the given screen size. Everything the page does wrong is collected in `page.problems`.
export async function openPage(username, viewport = PHONE) {
  const b = await launchBrowser();
  const s = await session(username);
  const {browserContextId} = await b.send('Target.createBrowserContext', {disposeOnDetach: true});
  const {targetId} = await b.send('Target.createTarget', {url: 'about:blank', browserContextId});
  const {sessionId} = await b.send('Target.attachToTarget', {targetId, flatten: true});
  const send = (m, p) => b.send(m, p, sessionId);
  const problems = [];
  const apiFailures = [];
  // Data requests still in flight, so a check waits for the page's data, not just its spinner.
  const inflight = new Set();
  const onEvent = m => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Runtime.exceptionThrown') problems.push('uncaught exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      const text = m.params.args.map(a => a.value ?? a.description ?? '').join(' ');
      // React dev-mode noise that is not a user-visible fault.
      if (!/Download the React DevTools|\[HMR\]|\[Fast Refresh\]/.test(text)) problems.push('console error: ' + text.slice(0, 200));
    }
    if (m.method === 'Network.requestWillBeSent' && m.params.request.url.includes('/api/')) inflight.add(m.params.requestId);
    if (m.method === 'Network.loadingFinished' || m.method === 'Network.loadingFailed') inflight.delete(m.params.requestId);
    if (m.method === 'Network.responseReceived') {
      const {url, status} = m.params.response;
      if (url.includes('/api/') && status >= 500) apiFailures.push(`${status} ${url.replace(BASE, '')}`);
    }
  };
  b.listeners.add(onEvent);
  await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable');
  await send('Network.setCookies', {cookies: s.cookies});
  await send('Emulation.setDeviceMetricsOverride', {width: viewport.width, height: viewport.height, deviceScaleFactor: viewport.scale, mobile: viewport.mobile});
  if (viewport.mobile) await send('Emulation.setTouchEmulationEnabled', {enabled: true});
  // The page reads who is signed in from localStorage (only the login form writes it); seed it the
  // same way before the first real page loads.
  await send('Page.addScriptToEvaluateOnNewDocument', {source:
    `try{localStorage.setItem('betolla_user',${JSON.stringify(JSON.stringify(s.user))});}catch{}`});

  const evaluate = async (expr, arg) => {
    const expression = arg === undefined ? expr : `(${expr})(${JSON.stringify(arg)})`;
    const r = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (r.exceptionDetails) throw new Error('in page: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };

  const page = {
    username, viewport, problems, apiFailures, evaluate,
    async goto(path) {
      problems.length = 0; apiFailures.length = 0;
      await send('Page.navigate', {url: BASE + path});
      await page.waitFor(() => document.readyState === 'complete', 'the page to load', 60000);
      // Wait for hydration and the first data load: no spinner, and the shell rendered.
      await page.waitFor(() => !!document.querySelector('main') &&
        !document.querySelector('main .animate-spin') && !/جاري (ال)?تحميل|Loading\.\.\./.test(document.querySelector('main')?.innerText.slice(0, 400) || ''),
        'the page to finish loading', 60000);
      await page.settle();
      return page;
    },
    // Until no data request has been in flight for half a second (at most 15s): a board that
    // renders empty and fills in a moment later is checked filled, not empty.
    async settle() {
      const started = Date.now();
      let quietSince = inflight.size ? 0 : Date.now();
      while (Date.now() - started < 15000) {
        await sleep(100);
        if (inflight.size) quietSince = 0; else if (!quietSince) quietSince = Date.now();
        if (quietSince && Date.now() - quietSince >= 500) break;
      }
      await sleep(200);
    },
    path: () => evaluate('location.pathname'),
    text: () => evaluate(`document.querySelector('main')?.innerText || document.body.innerText`),
    async waitFor(fn, what, timeout = 20000) {
      const started = Date.now();
      let last;
      while (Date.now() - started < timeout) {
        try { if (await evaluate(`(${fn})()`)) return; } catch (e) { last = e; }
        await sleep(250);
      }
      throw new Error(`timed out waiting for ${what}${last ? ' (' + last.message + ')' : ''}`);
    },
    async waitForText(text, timeout = 20000) {
      await page.waitFor(`() => document.body.innerText.includes(${JSON.stringify(text)})`, `"${text}" on ${username}'s page`, timeout);
    },
    // Clicks the visible button/link whose text contains `label` — the way a person finds it.
    // `within` narrows to the smallest element containing that text first (a card, a dialog).
    async click(label, {within, exact = false, timeout = 10000} = {}) {
      // Retried for a while, the way a person waits for a list to load before tapping.
      const started = Date.now();
      let ok = false;
      while (!ok && Date.now() - started < timeout) {
      ok = await evaluate(`(${({label, within, exact}) => {
        const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
        const match = t => { t = t.replace(/s+/g, ' ').trim(); return exact ? t === label : t.includes(label); };
        const buttons = scope => [...scope.querySelectorAll('button,a,[role=button],[role=option],[role=tab]')]
          .filter(e => visible(e) && !e.disabled && [e.innerText, e.getAttribute('aria-label'), e.title].some(t => t && match(t)))
          .sort((a, b) => a.innerText.length - b.innerText.length);
        let found = [];
        if (within) {
          // The smallest block that holds both the text (a phone, an order number) and the button:
          // the customer's card, not the phone row inside it that has its own copy button.
          const holders = [...document.querySelectorAll('main *, [data-dialog] *')]
            .filter(e => visible(e) && e.innerText?.includes(within))
            .sort((a, b) => a.innerText.length - b.innerText.length);
          for (const h of holders) { found = buttons(h); if (found.length) break; }
        } else {
          // While a dialog is open only the dialog can be touched — the backdrop covers the page.
          // Without this, "تم التسليم" in the dialog loses to the same label on a card behind it.
          const dialogs = [...document.querySelectorAll('[data-dialog]')].filter(visible);
          found = buttons(dialogs.length ? dialogs[dialogs.length - 1] : document);
        }
        const el = found[0];
        if (!el) return false;
        el.scrollIntoView({block: 'center'}); el.click(); return true;
      }})(${JSON.stringify({label, within, exact})})`);
      if (!ok) await sleep(300);
      }
      if (!ok) throw new Error(`no visible, enabled "${label}" button${within ? ` near "${within}"` : ''} on ${username}'s ${viewport.name} page`);
      await sleep(300);
    },
    // Taps the text itself (a customer's name on a card) — for cards that open on a tap, with no
    // button to find. The tap bubbles up to the card's own handler, as a finger's would.
    async tap(text, {timeout = 10000} = {}) {
      const started = Date.now();
      while (Date.now() - started < timeout) {
        const ok = await evaluate(`(${text => {
          const el = [...document.querySelectorAll('main *')]
            .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && e.innerText?.includes(text); })
            .sort((a, b) => a.innerText.length - b.innerText.length)[0];
          if (!el) return false;
          el.scrollIntoView({block: 'center'}); el.click(); return true;
        }})(${JSON.stringify(text)})`);
        if (ok) { await sleep(300); return; }
        await sleep(300);
      }
      throw new Error(`nothing showing "${text}" to tap on ${username}'s ${viewport.name} page`);
    },
    async hasButton(label) {
      return evaluate(`(${label => [...document.querySelectorAll('button,a')].some(e => {
        const r = e.getBoundingClientRect(); return r.width > 0 && !e.disabled && [e.innerText, e.getAttribute('aria-label'), e.title].some(t => t && t.includes(label)); })})(${JSON.stringify(label)})`);
    },
    // Types into an input/textarea/select the way React sees a real keystroke.
    async fill(selector, value) {
      const ok = await evaluate(`(${({selector, value}) => {
        const el = [...document.querySelectorAll(selector)].find(e => e.getBoundingClientRect().width > 0);
        if (!el) return false;
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : el.tagName === 'SELECT' ? HTMLSelectElement : HTMLInputElement;
        Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, value);
        el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true}));
        return true;
      }})(${JSON.stringify({selector, value})})`);
      if (!ok) throw new Error(`no visible field ${selector} on ${username}'s page`);
    },
    // The automatic checks. Horizontal overflow is measured, not eyeballed: in this right-to-left
    // app it shows up as the sidebar sitting mid-screen with white space beside it.
    async checkHealthy(label = '') {
      await page.settle();
      const where = `${username} ${viewport.name} ${await page.path()}${label ? ' (' + label + ')' : ''}`;
      const layout = await evaluate(`(() => {
        const d = document.documentElement;
        const culprits = d.scrollWidth > d.clientWidth + 1
          ? [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > d.clientWidth + 1); })
              .filter(e => !e.closest('.overflow-x-auto,.overflow-auto,.overflow-hidden,.overflow-x-hidden,.truncate,[hidden]'))
              .slice(0, 3).map(e => e.tagName.toLowerCase() + ' "' + (e.innerText || '').replace(/\\s+/g, ' ').slice(0, 50) + '"')
          : [];
        return {scroll: d.scrollWidth, client: d.clientWidth, culprits,
          errorScreen: /Application error|Unhandled Runtime Error|This page could not be found|404/.test(document.body.innerText.slice(0, 500)),
          // Squeezed cards: a grid putting several cards (each with 2+ controls) side by side at under
          // 180px — names, numbers and items get cut off even though nothing overflows the page.
          squeezed: [...document.querySelectorAll('main *')].filter(g => {
            if (getComputedStyle(g).display !== 'grid' || g.closest('[hidden]')) return false;
            const cards = [...g.children].filter(c => c.getBoundingClientRect().width > 0 && c.querySelectorAll('button,select,a').length >= 2);
            if (cards.length < 2) return false;
            const rows = new Set(cards.map(c => Math.round(c.getBoundingClientRect().top)));
            return rows.size < cards.length && cards.some(c => c.getBoundingClientRect().width < 180);
          }).slice(0, 2).map(g => (g.innerText || '').replace(/\s+/g, ' ').slice(0, 50)),
          // Tables much wider than their box on a phone: the columns off to the side are out of sight.
          wideTables: [...document.querySelectorAll('main table')].filter(t => {
            const box = t.parentElement.getBoundingClientRect();
            return box.width > 0 && t.scrollWidth > box.width * 1.5;
          }).map(t => [...t.querySelectorAll('th')].map(th => th.innerText.trim()).slice(0, 3).join(' | ') + ' (' + t.scrollWidth + 'px in ' + Math.round(t.parentElement.getBoundingClientRect().width) + 'px)')};
      })()`);
      const faults = [...problems, ...apiFailures.map(f => 'API failed: ' + f)];
      if (layout.scroll > layout.client + 1) faults.push(`page is ${layout.scroll}px wide on a ${layout.client}px screen (sideways overflow)` +
        (layout.culprits.length ? ' — sticking out: ' + layout.culprits.join(', ') : ''));
      if (layout.errorScreen) faults.push('shows an error screen');
      if (viewport.mobile) {
        for (const g of layout.squeezed) faults.push(`cards squeezed side by side on a phone (under 180px each): "${g}"`);
        const path = await page.path();
        if (layout.wideTables.length && KNOWN_WIDE_TABLES[path]) {
          if (!warned.has(path)) { warned.add(path); console.log(`      \x1b[33m! known issue on ${path}: ${KNOWN_WIDE_TABLES[path]}\x1b[0m`); }
          layout.wideTables = [];
        }
        for (const t of layout.wideTables) faults.push(`table far wider than the screen, columns out of sight: ${t}`);
      }
      if (faults.length) {
        await page.screenshot('FAIL ' + where);
        throw new Error(`${where}:\n      - ` + faults.join('\n      - '));
      }
    },
    // {full: true} captures the whole scrolling page, not just the first screen.
    async screenshot(name, {full = false} = {}) {
      await mkdir(reportDir, {recursive: true});
      const height = full ? await evaluate('document.documentElement.scrollHeight') : 0;
      const {data} = await send('Page.captureScreenshot', full
        ? {format: 'png', captureBeyondViewport: true, clip: {x: 0, y: 0, width: viewport.width, height: Math.min(height, 12000), scale: 1}}
        : {format: 'png', captureBeyondViewport: false});
      const file = join(reportDir, name.replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 120) + '.png');
      await writeFile(file, Buffer.from(data, 'base64'));
      return file;
    },
    async close() { b.listeners.delete(onEvent); await b.send('Target.disposeBrowserContext', {browserContextId}).catch(() => {}); },
  };
  return page;
}

// ─── runner ─────────────────────────────────────────────────────────────────────────────────────

// Each suite is a list of named checks. A failing check does not stop the others (one broken page
// should not hide the state of the rest), but its screenshot is kept in .local-tests/qa-report/.
export async function suite(title, checks) {
  await ensureSandbox();
  await mkdir(reportDir, {recursive: true});
  console.log(`\n${title}`);
  let failed = 0;
  for (const [name, fn] of checks) {
    const started = Date.now();
    try {
      await fn();
      console.log(`  \x1b[32m✓\x1b[0m ${name} \x1b[2m${((Date.now() - started) / 1000).toFixed(1)}s\x1b[0m`);
    } catch (e) {
      failed++;
      console.log(`  \x1b[31m✗ ${name}\x1b[0m\n      ${String(e.message || e).split('\n').join('\n      ')}`);
    }
  }
  closeBrowser();
  const total = checks.length;
  console.log(failed ? `FAIL ${title}: ${failed} of ${total} checks failed (screenshots in .local-tests/qa-report/)`
    : `PASS ${title}: all ${total} checks passed`);
  process.exitCode = failed ? 1 : 0;
  return failed;
}

// Which routes each role's sidebar offers, read from the sidebar itself so a page added there is
// swept without anyone remembering to add it here.
export async function sidebarRoutes(role) {
  const src = await readFile(join(root, 'components/layout/sidebar.tsx'), 'utf8');
  const routes = [];
  for (const m of src.matchAll(/href:\s*"([^"]+)"[\s\S]*?roles:\s*\[([^\]]*)\]/g))
    if (m[2].includes(`"${role}"`)) routes.push(m[1]);
  return [...new Set(routes)];
}

// Opens every page each person's sidebar offers, at each screen size, and checks it is healthy.
// Collects every broken page before failing, so one run shows the whole picture.
// QA_SKIP_SWEEP=1 skips it while working on a journey (it is most of a suite's run time).
export async function sweep(usernames, viewports) {
  if (process.env.QA_SKIP_SWEEP) { console.log('      \x1b[2m(page sweep skipped: QA_SKIP_SWEEP)\x1b[0m'); return; }
  const faults = [];
  let pages = 0;
  for (const username of usernames) {
    const {user} = await session(username);
    const routes = await sidebarRoutes(user.role);
    assert.ok(routes.length, `the sidebar offers ${user.role} nothing`);
    for (const viewport of viewports) {
      const page = await openPage(username, viewport);
      try {
        for (const route of routes) {
          pages++;
          try {
            await page.goto(route);
            const landed = await page.path();
            if (landed !== route) throw new Error(`${username} ${viewport.name} ${route}: the sidebar offers this page but it sends ${user.role} to ${landed}`);
            await page.checkHealthy();
          } catch (e) { faults.push(e.message); }
        }
      } finally { await page.close(); }
    }
  }
  if (faults.length) throw new Error(`${faults.length} of ${pages} pages broken:\n` + faults.join('\n'));
  console.log(`      \x1b[2m${pages} page loads checked\x1b[0m`);
}
