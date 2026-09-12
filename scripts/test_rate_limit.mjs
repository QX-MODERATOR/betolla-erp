// Login throttling verification — pure logic, uses the in-memory store so
// no live Supabase project is required. Production uses
// createSupabaseRateLimitStore() instead (see lib/rate-limit.ts), which is
// exercised manually against a real project (see scripts/test_live_auth_flow.mjs).
import {
  checkLoginRateLimit,
  recordLoginAttempt,
  createInMemoryRateLimitStore,
  LOGIN_RATE_LIMIT,
} from "../lib/rate-limit.ts";

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

async function run() {
  console.log("Starting login rate-limit verification...");

  // 1. Under the threshold: allowed
  console.log("\n[1] Testing attempts under the threshold are allowed...");
  const store = createInMemoryRateLimitStore();
  const ip = "203.0.113.10";
  const identifier = "victim@betolla.com";

  for (let i = 0; i < LOGIN_RATE_LIMIT.maxFailuresPerIdentifier - 1; i++) {
    const decision = await checkLoginRateLimit(store, identifier, ip);
    assert(decision.allowed, `attempt ${i + 1} should be allowed (under threshold)`);
    await recordLoginAttempt(store, identifier, ip, false);
  }
  console.log(`Pass: ${LOGIN_RATE_LIMIT.maxFailuresPerIdentifier - 1} failed attempts stayed under the per-account limit.`);

  // 2. Crossing the threshold locks out the account
  console.log("\n[2] Testing the account locks out at the threshold...");
  await recordLoginAttempt(store, identifier, ip, false); // this is the Nth failure
  const lockedDecision = await checkLoginRateLimit(store, identifier, ip);
  assert(!lockedDecision.allowed, "account should be locked out after reaching maxFailuresPerIdentifier");
  assert(lockedDecision.retryAfterSeconds > 0, "a lockout must report a retry-after duration");
  console.log("Pass: account-level brute-force lockout triggers correctly.");

  // 3. A different account from the same IP is unaffected by account-level lockout...
  console.log("\n[3] Testing a different account is not blocked by another account's lockout...");
  const otherIdentifier = "someone-else@betolla.com";
  const otherDecision = await checkLoginRateLimit(store, otherIdentifier, ip);
  assert(otherDecision.allowed, "a different account should not be blocked by another account's failures alone");
  console.log("Pass: per-account limiting does not cross-block unrelated accounts.");

  // 4. ...but the same IP still gets globally throttled once it fails enough distinct accounts
  console.log("\n[4] Testing per-IP throttling across many distinct accounts...");
  const ipStore = createInMemoryRateLimitStore();
  const attackerIp = "198.51.100.7";
  for (let i = 0; i < LOGIN_RATE_LIMIT.maxFailuresPerIp; i++) {
    await recordLoginAttempt(ipStore, `victim${i}@betolla.com`, attackerIp, false);
  }
  const ipLockedDecision = await checkLoginRateLimit(ipStore, "yet-another@betolla.com", attackerIp);
  assert(!ipLockedDecision.allowed, "IP should be throttled after failing across many distinct accounts");
  console.log("Pass: per-IP throttling catches credential-stuffing across many accounts.");

  // 5. A successful login does not count as a failure
  console.log("\n[5] Testing successful logins are not counted as failures...");
  const successStore = createInMemoryRateLimitStore();
  const successIdentifier = "legit@betolla.com";
  for (let i = 0; i < 10; i++) {
    await recordLoginAttempt(successStore, successIdentifier, "203.0.113.99", true);
  }
  const stillAllowed = await checkLoginRateLimit(successStore, successIdentifier, "203.0.113.99");
  assert(stillAllowed.allowed, "repeated successful logins must never trigger lockout");
  console.log("Pass: successful logins never contribute to lockout.");

  console.log("\nAll login rate-limit tests passed.");
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
