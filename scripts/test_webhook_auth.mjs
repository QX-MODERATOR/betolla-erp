// Webhook shared-secret verification — pure logic, no network required.
import { verifyWebhookSecret } from "../lib/webhook-auth.ts";

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function run() {
  console.log("Starting webhook secret verification tests...");

  const REAL_SECRET = "a-long-random-shared-secret-value-1234567890";

  console.log("\n[1] Testing a correct secret is accepted...");
  assert(verifyWebhookSecret(REAL_SECRET, REAL_SECRET), "matching secret should be accepted");
  console.log("Pass.");

  console.log("\n[2] Testing a missing header is rejected...");
  assert(!verifyWebhookSecret(null, REAL_SECRET), "null header should be rejected");
  assert(!verifyWebhookSecret(undefined, REAL_SECRET), "undefined header should be rejected");
  assert(!verifyWebhookSecret("", REAL_SECRET), "empty header should be rejected");
  console.log("Pass.");

  console.log("\n[3] Testing a wrong secret is rejected...");
  assert(!verifyWebhookSecret("totally-wrong-value", REAL_SECRET), "wrong secret should be rejected");
  assert(!verifyWebhookSecret(REAL_SECRET.slice(0, -1), REAL_SECRET), "truncated secret should be rejected");
  assert(!verifyWebhookSecret(REAL_SECRET + "x", REAL_SECRET), "longer secret should be rejected");
  console.log("Pass.");

  console.log("\n[4] Testing an unconfigured secret fails closed (never treated as 'no auth required')...");
  assert(!verifyWebhookSecret(REAL_SECRET, undefined), "missing server-side secret must fail closed, not pass open");
  assert(!verifyWebhookSecret(REAL_SECRET, ""), "empty server-side secret must fail closed");
  console.log("Pass.");

  console.log("\nAll webhook secret verification tests passed.");
}

try {
  run();
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
