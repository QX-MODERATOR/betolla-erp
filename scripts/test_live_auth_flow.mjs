// Live end-to-end auth verification — run this AFTER deploying with real
// Supabase env vars, applying supabase/migrations/005_auth_security_foundation.sql,
// and provisioning at least one test account with scripts/provision_users.mjs.
//
// This cannot be run in CI/sandboxed environments without a live Supabase
// project, which is why it's a separate manual script rather than part of
// the automated test_*.mjs suite.
//
// USAGE:
//   TEST_BASE_URL=http://localhost:3000 \
//   TEST_USERNAME=rahma \
//   TEST_PASSWORD='<the real password you set via provision_users.mjs>' \
//   node scripts/test_live_auth_flow.mjs
//
// Never commit real credentials used with this script into shell history
// files, .bashrc, or any tracked file.

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function run() {
  const baseUrl = requireEnv("TEST_BASE_URL").replace(/\/$/, "");
  const username = requireEnv("TEST_USERNAME");
  const password = requireEnv("TEST_PASSWORD");

  console.log(`Running live auth flow checks against ${baseUrl} ...`);

  // 1. Unauthorized access to a protected page/API before logging in
  console.log("\n[1] Unauthenticated request to a protected API should be 401...");
  const meBefore = await fetch(`${baseUrl}/api/auth/me`);
  if (meBefore.status !== 401) throw new Error(`FAIL: expected 401, got ${meBefore.status}`);
  console.log("Pass.");

  // 2. Invalid login returns a generic error, not "user not found" vs "wrong password"
  console.log("\n[2] Invalid credentials should return a generic 401 error...");
  const badLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "this-account-does-not-exist", password: "wrong" }),
  });
  const badLoginBody = await badLogin.json();
  if (badLogin.status !== 401) throw new Error(`FAIL: expected 401, got ${badLogin.status}`);
  if (!badLoginBody.error) throw new Error("FAIL: expected a generic error message");
  console.log(`Pass. Message shown to client: "${badLoginBody.error}" (must not reveal whether the account exists)`);

  // 3. Successful login
  console.log("\n[3] Valid credentials should log in successfully...");
  const goodLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const cookies = goodLogin.headers.get("set-cookie");
  const goodLoginBody = await goodLogin.json();
  if (goodLogin.status !== 200 || !goodLoginBody.success) {
    throw new Error(`FAIL: expected successful login, got ${goodLogin.status}: ${JSON.stringify(goodLoginBody)}`);
  }
  if (goodLoginBody.token) {
    throw new Error("FAIL: login response must not include a bearer token anymore");
  }
  if (!cookies) {
    throw new Error("FAIL: expected the server to set session cookies");
  }
  console.log(`Pass. Logged in as role=${goodLoginBody.user?.role}, redirectUrl=${goodLoginBody.redirectUrl}`);

  // 4. /api/auth/me with the session cookie should now succeed
  console.log("\n[4] /api/auth/me with the session cookie should succeed...");
  const meAfter = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: cookies } });
  if (meAfter.status !== 200) throw new Error(`FAIL: expected 200, got ${meAfter.status}`);
  console.log("Pass.");

  // 5. Role restriction: this account should be denied access to routes outside its role
  //    (skipped automatically for admin/sales_manager, which are allowed everywhere)
  if (!["admin", "sales_manager"].includes(goodLoginBody.user?.role)) {
    console.log("\n[5] Role restriction: a non-admin role should be denied /api/finance...");
    const forbidden = await fetch(`${baseUrl}/api/finance`, { headers: { cookie: cookies } });
    if (goodLoginBody.user?.role !== "finance" && forbidden.status !== 403 && forbidden.status !== 401) {
      throw new Error(`FAIL: expected 401/403 for a non-finance role, got ${forbidden.status}`);
    }
    console.log(`Pass (status ${forbidden.status}).`);
  } else {
    console.log("\n[5] Skipped — test account is admin/sales_manager, which is allowed everywhere by design.");
  }

  // 6. Logout, then confirm the session no longer works
  console.log("\n[6] Logout should invalidate the session...");
  const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST", headers: { cookie: cookies } });
  if (logout.status !== 200) throw new Error(`FAIL: expected 200 from logout, got ${logout.status}`);
  const meAfterLogout = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: cookies } });
  if (meAfterLogout.status !== 401) throw new Error(`FAIL: expected 401 after logout, got ${meAfterLogout.status}`);
  console.log("Pass.");

  // 7. Brute-force throttling: repeated bad logins against the same account should eventually 429
  console.log("\n[7] Repeated invalid logins should eventually trigger 429 (rate limit)...");
  let sawRateLimit = false;
  for (let i = 0; i < 8; i++) {
    const attempt = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: "definitely-wrong" }),
    });
    if (attempt.status === 429) {
      sawRateLimit = true;
      break;
    }
  }
  if (!sawRateLimit) throw new Error("FAIL: expected a 429 after repeated failed attempts");
  console.log("Pass. NOTE: this account is now locked out for the configured window — wait before re-testing successful login above.");

  // 8. Webhook rejection/acceptance
  if (process.env.TEST_WEBHOOK_SECRET) {
    console.log("\n[8] Testing /api/leads webhook auth...");
    const noSecret = await fetch(`${baseUrl}/api/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "0790000000" }),
    });
    if (noSecret.status !== 401) throw new Error(`FAIL: expected 401 without secret, got ${noSecret.status}`);

    const withSecret = await fetch(`${baseUrl}/api/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Webhook-Secret": process.env.TEST_WEBHOOK_SECRET },
      body: JSON.stringify({ phone: "0790000000" }),
    });
    if (withSecret.status !== 201) throw new Error(`FAIL: expected 201 with correct secret, got ${withSecret.status}`);
    console.log("Pass.");
  } else {
    console.log("\n[8] Skipped — set TEST_WEBHOOK_SECRET to also verify /api/leads webhook auth.");
  }

  console.log("\nAll live auth flow checks passed.");
}

run().catch((err) => {
  console.error("Live auth flow check failed:", err.message || err);
  process.exit(1);
});
