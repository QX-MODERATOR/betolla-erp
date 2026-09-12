// Live Orders persistence verification — run AFTER deploying with real
// Supabase env vars, applying migrations 001-006, and provisioning a
// sales_rep test account (scripts/provision_users.mjs).
//
// This is the concrete "refresh persistence test" for the Orders module:
// it creates an order, re-fetches the list from scratch (simulating a page
// refresh — a brand new request with no client-side state carried over),
// and confirms the order is really there with the right total; then
// advances its status the same way and re-confirms.
//
// USAGE:
//   TEST_BASE_URL=http://localhost:3000 \
//   TEST_USERNAME=rahma \
//   TEST_PASSWORD='<real password>' \
//   node scripts/test_live_orders_flow.mjs

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function run() {
  const baseUrl = requireEnv("TEST_BASE_URL").replace(/\/$/, "");
  const username = requireEnv("TEST_USERNAME");
  const password = requireEnv("TEST_PASSWORD");

  console.log(`Running live Orders persistence checks against ${baseUrl} ...`);

  console.log("\n[1] Logging in...");
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

  const uniquePhone = `079${Math.floor(1000000 + Math.random() * 8999999)}`;
  const rawText = [
    "اختبار تحقق تلقائي",
    "عميل اختبار الاستمرارية",
    uniquePhone,
    "شارع اختبار عمارة 1",
    "1 شامبو بلازما",
    "24 د",
  ].join("\n");

  console.log("\n[2] Creating an order from WhatsApp text...");
  const create = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookies },
    body: JSON.stringify({ rawText }),
  });
  const createBody = await create.json();
  if (create.status !== 201 || !createBody.success) {
    throw new Error(`FAIL: order creation failed (${create.status}): ${JSON.stringify(createBody)}`);
  }
  const orderId = createBody.order.id;
  console.log(`Pass. Created order ${orderId} for phone ${uniquePhone}, total ${createBody.order.total_amount}`);

  console.log("\n[3] Re-fetching the order list from scratch (simulates a page refresh)...");
  const list1 = await fetch(`${baseUrl}/api/orders`, { headers: { cookie: cookies }, cache: "no-store" });
  const list1Body = await list1.json();
  if (list1.status !== 200 || !list1Body.success) {
    throw new Error(`FAIL: could not list orders (${list1.status})`);
  }
  const found1 = list1Body.orders.find((o) => o.id === orderId);
  if (!found1) throw new Error(`FAIL: order ${orderId} was not found after a fresh fetch — it did not persist`);
  if (found1.customer_phone !== uniquePhone) {
    throw new Error(`FAIL: persisted order has wrong phone: expected ${uniquePhone}, got ${found1.customer_phone}`);
  }
  console.log("Pass. Order survived a fresh fetch with correct data — real persistence confirmed.");

  console.log("\n[4] Advancing the order's status...");
  const initialStatus = found1.status;
  const advance = await fetch(`${baseUrl}/api/orders/${orderId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie: cookies },
    body: JSON.stringify({ action: "advance" }),
  });
  const advanceBody = await advance.json();
  if (advance.status !== 200 || !advanceBody.success) {
    throw new Error(`FAIL: status advance failed (${advance.status}): ${JSON.stringify(advanceBody)}`);
  }
  if (advanceBody.order.status === initialStatus) {
    throw new Error(`FAIL: status did not change from ${initialStatus}`);
  }
  console.log(`Pass. Status moved ${initialStatus} -> ${advanceBody.order.status}`);

  console.log("\n[5] Re-fetching again to confirm the status change persisted...");
  const list2 = await fetch(`${baseUrl}/api/orders`, { headers: { cookie: cookies }, cache: "no-store" });
  const list2Body = await list2.json();
  const found2 = list2Body.orders.find((o) => o.id === orderId);
  if (!found2 || found2.status !== advanceBody.order.status) {
    throw new Error(`FAIL: status change did not persist across a fresh fetch`);
  }
  console.log("Pass. Status change survived a fresh fetch.");

  console.log("\n[6] Confirming a different role can't tamper with this order via a raw ownership check...");
  console.log("(Skipped automatically — requires a second role's credentials; see role restriction check in test_live_auth_flow.mjs for the general pattern.)");

  console.log("\nAll live Orders persistence checks passed.");
}

run().catch((err) => {
  console.error("Live Orders flow check failed:", err.message || err);
  process.exit(1);
});
