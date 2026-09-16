import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { registerHooks } from 'node:module';
import pg from '../.local-tests/node_modules/pg/lib/index.js';
import { SignJWT } from 'jose';

// Verifies migrations 013 (driver_shift_closures) and 014 (user_profile_overrides)
// by calling the real lib/db.ts + lib/profile-server.ts functions against the
// already-running native sandbox (real Postgres + real PostgREST on loopback).
// Bypasses Next.js's dev server entirely (a second `next dev` instance for this
// same project directory is already refused by Next 16's single-instance lock,
// and the port-3000 process is the user's own — not touched here).
const root = new URL('../', import.meta.url);
registerHooks({
  resolve(s, c, next) {
    if (s.startsWith('@/')) return next(new URL(s.slice(2) + '.ts', root).href, c);
    if ((s.startsWith('./') || s.startsWith('../')) && !/\.[a-z]+$/i.test(s)) {
      try { return next(s + '.ts', c); } catch { /* fall through */ }
    }
    return next(s, c);
  },
});

const runtime = JSON.parse(await readFile(new URL('.local-tests/native-sandbox/runtime.json', root), 'utf8'));
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:55441';
process.env.SUPABASE_SERVICE_ROLE_KEY = await new SignJWT({ role: 'service_role' })
  .setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode(runtime.pgjwt));

const { getAllProfilesServer, updateProfileServer, getProfileServer } = await import('../lib/profile-server.ts');
const { saveLiveShiftClosure, getLiveShiftClosure, reopenLiveShift } = await import('../lib/db.ts');

const db = new pg.Client({ host: '127.0.0.1', port: 55439, user: 'postgres', database: 'betolla_isolated_20260913' });
await db.connect();

try {
  // --- 014: profile persistence ---
  const bioTag = 'native-check-' + randomUUID().slice(0, 8);

  const before = await getAllProfilesServer();
  assert.ok(before['admin'], 'expected admin profile in merged list');

  const updated = await updateProfileServer('admin', { bio: bioTag, city: 'عمان' });
  assert.equal(updated.bio, bioTag);

  const row = await db.query("SELECT bio, city FROM user_profile_overrides WHERE username='admin'");
  assert.equal(row.rows.length, 1, 'expected exactly one override row for admin');
  assert.equal(row.rows[0].bio, bioTag, 'override not persisted to user_profile_overrides');
  assert.equal(row.rows[0].city, 'عمان');

  const reread = await getProfileServer('admin');
  assert.equal(reread.bio, bioTag, 'independent re-read via lib/profile-server.ts did not see the override');

  // second upsert must update, not duplicate (PRIMARY KEY(username) + onConflict:'username')
  await updateProfileServer('admin', { bio: bioTag + '-v2' });
  const rowCount = await db.query("SELECT count(*)::int AS n FROM user_profile_overrides WHERE username='admin'");
  assert.equal(rowCount.rows[0].n, 1, 'second update duplicated the row instead of upserting');
  console.log('PASS (014): profile edits persist in user_profile_overrides via real PostgREST, upsert does not duplicate, independent read confirms.');

  // --- 013: driver shift closures ---
  const driverName = 'native-test-driver-' + randomUUID().slice(0, 6);

  const initial = await getLiveShiftClosure(driverName);
  assert.equal(initial, null, 'expected no shift closure row before test');

  const closeResult = await saveLiveShiftClosure({ driverName, notes: 'native test close', cashCollected: 12.5, deliveredCount: 3, returnedCount: 1 });
  assert.ok(closeResult.success, 'saveLiveShiftClosure failed: ' + closeResult.error);

  const dbRow = await db.query('SELECT is_closed, cash_collected, delivered_count, returned_count FROM driver_shift_closures WHERE driver_name=$1', [driverName]);
  assert.equal(dbRow.rows.length, 1, 'expected exactly one driver_shift_closures row');
  assert.equal(dbRow.rows[0].is_closed, true);
  assert.equal(Number(dbRow.rows[0].cash_collected), 12.5);
  assert.equal(dbRow.rows[0].delivered_count, 3);
  assert.equal(dbRow.rows[0].returned_count, 1);

  const afterClose = await getLiveShiftClosure(driverName);
  assert.ok(afterClose, 'getLiveShiftClosure did not see the persisted closure');

  const reopenResult = await reopenLiveShift(driverName);
  assert.ok(reopenResult.success, 'reopenLiveShift failed: ' + reopenResult.error);

  const dbRowAfterReopen = await db.query('SELECT is_closed FROM driver_shift_closures WHERE driver_name=$1', [driverName]);
  assert.equal(dbRowAfterReopen.rows[0].is_closed, false);

  const afterReopen = await getLiveShiftClosure(driverName);
  assert.equal(afterReopen, null, 'getLiveShiftClosure should report no active closure after reopen');

  // upsert on (driver_name, shift_date) must not duplicate on a second close same day
  await saveLiveShiftClosure({ driverName, notes: 'second close same day' });
  const rowCount2 = await db.query('SELECT count(*)::int AS n FROM driver_shift_closures WHERE driver_name=$1', [driverName]);
  assert.equal(rowCount2.rows[0].n, 1, 'second same-day close duplicated the row instead of upserting');

  console.log('PASS (013): shift close/reopen persists in driver_shift_closures via real PostgREST, upsert does not duplicate, independent read confirms.');
} finally {
  await db.end();
}
