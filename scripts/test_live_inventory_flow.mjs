// Live Inventory persistence verification — run AFTER deploying with real
// Supabase env vars and applying migrations 001-007 (002_seed_products.sql
// must have run too, so at least one real SKU exists).
//
// USAGE:
//   TEST_BASE_URL=http://localhost:3000 \
//   TEST_USERNAME=diya \
//   TEST_PASSWORD='<real driver_manager password>' \
//   TEST_SKU=PL-SHAMP-02 \
//   node scripts/test_live_inventory_flow.mjs

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function run() {
  const baseUrl = requireEnv("TEST_BASE_URL").replace(/\/$/, "");
  const username = requireEnv("TEST_USERNAME");
  const password = requireEnv("TEST_PASSWORD");
  const sku = requireEnv("TEST_SKU");

  console.log(`Running live Inventory persistence checks against ${baseUrl} for SKU ${sku} ...`);

  console.log("\n[1] Logging in as a driver_manager (or admin)...");
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const cookies = login.headers.get("set-cookie");
  const loginBody = await login.json();
  if (login.status !== 200 || !loginBody.success) {
    throw new Error(`FAIL: login failed (${login.status}): ${JSON.stringify(loginBody)}`);
  }
  console.log(`Pass. Logged in as role=${loginBody.user?.role}`);

  console.log("\n[2] Reading current stock level...");
  const before = await fetch(`${baseUrl}/api/inventory`, { headers: { cookie: cookies }, cache: "no-store" });
  const beforeBody = await before.json();
  if (before.status !== 200) throw new Error(`FAIL: could not read inventory (${before.status})`);
  const productBefore = beforeBody.products.find((p) => p.sku === sku);
  if (!productBefore) throw new Error(`FAIL: SKU ${sku} not found — check TEST_SKU and that migrations/seeds ran`);
  console.log(`Pass. Current stock for ${sku}: ${productBefore.stock}`);

  console.log("\n[3] Recording a +7 purchase_in movement...");
  const record = await fetch(`${baseUrl}/api/inventory`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookies },
    body: JSON.stringify({ sku, type: "purchase_in", quantity: 7, reference: "Automated test shipment" }),
  });
  const recordBody = await record.json();
  if (record.status !== 201 || !recordBody.success) {
    throw new Error(`FAIL: movement recording failed (${record.status}): ${JSON.stringify(recordBody)}`);
  }
  const expectedStock = productBefore.stock + 7;
  if (recordBody.new_quantity_on_hand !== expectedStock) {
    throw new Error(`FAIL: expected new stock ${expectedStock}, API reported ${recordBody.new_quantity_on_hand}`);
  }
  console.log(`Pass. Stock updated to ${recordBody.new_quantity_on_hand} in the same response.`);

  console.log("\n[4] Re-fetching from scratch (simulates a page refresh) to confirm real persistence...");
  const after = await fetch(`${baseUrl}/api/inventory`, { headers: { cookie: cookies }, cache: "no-store" });
  const afterBody = await after.json();
  const productAfter = afterBody.products.find((p) => p.sku === sku);
  if (!productAfter || productAfter.stock !== expectedStock) {
    throw new Error(`FAIL: stock did not persist — expected ${expectedStock}, got ${productAfter?.stock}`);
  }
  const movementLogged = afterBody.movements.some((m) => m.sku === sku && m.qty === 7 && m.ref.includes("Automated test shipment"));
  if (!movementLogged) throw new Error("FAIL: the movement does not appear in the audit trail after a fresh fetch");
  console.log("Pass. Stock level AND audit-trail entry both survived a fresh fetch.");

  console.log("\n[5] Confirming insufficient-stock protection (can't remove more than exists)...");
  const overDraw = await fetch(`${baseUrl}/api/inventory`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookies },
    body: JSON.stringify({ sku, type: "damaged", quantity: expectedStock + 1000 }),
  });
  if (overDraw.status === 201) {
    throw new Error("FAIL: a movement that would drive stock negative was accepted");
  }
  console.log(`Pass (correctly rejected with status ${overDraw.status}).`);

  console.log("\nAll live Inventory persistence checks passed.");
}

run().catch((err) => {
  console.error("Live Inventory flow check failed:", err.message || err);
  process.exit(1);
});
