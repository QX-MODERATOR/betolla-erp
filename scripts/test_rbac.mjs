// RBAC Verification Test Script
//
// Pure logic test — no network calls, no live Supabase project required.
// Exercises the route-permission matrix in lib/auth.ts, including the
// sales_rep -> /api/inventory gap discovered and fixed during the Phase 1
// security review.
import { isRouteAllowedForRole, mapSupabaseUserToAuthUser, usernameToEmail } from "../lib/auth.ts";

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function runRbacTests() {
  console.log("Starting Betolla ERP RBAC (Role-Based Access Control) Verification...");

  // 1. username -> email normalization
  console.log("\n[1] Testing username-to-email normalization...");
  assert(usernameToEmail("rahma") === "rahma@betolla.com", "bare username should map to @betolla.com");
  assert(usernameToEmail("RAHMA") === "rahma@betolla.com", "normalization should lowercase");
  assert(usernameToEmail("rahma@betolla.com") === "rahma@betolla.com", "existing email should pass through");
  console.log("Pass: username/email normalization behaves as expected.");

  // 2. Supabase user -> AuthUser mapping requires a valid role in app_metadata
  console.log("\n[2] Testing Supabase user -> AuthUser mapping...");
  const validUser = {
    id: "11111111-1111-1111-1111-111111111111",
    email: "rahma@betolla.com",
    app_metadata: { role: "sales_rep", rep_key: "rahma", full_name: "رحمة" },
  };
  const mapped = mapSupabaseUserToAuthUser(validUser);
  assert(mapped !== null, "user with valid role should map successfully");
  assert(mapped.role === "sales_rep" && mapped.repId === "rahma", "mapped fields should match app_metadata");

  const userWithoutRole = { id: "x", email: "nobody@betolla.com", app_metadata: {} };
  assert(mapSupabaseUserToAuthUser(userWithoutRole) === null, "user without a valid role must map to null (fail closed)");

  const userWithBadRole = { id: "x", email: "nobody@betolla.com", app_metadata: { role: "super_admin" } };
  assert(mapSupabaseUserToAuthUser(userWithBadRole) === null, "unrecognized role must map to null (fail closed)");
  console.log("Pass: role mapping fails closed for missing/invalid roles.");

  // 3. Route permissions for sales_rep
  console.log("\n[3] Testing RBAC route access rules for sales_rep...");
  const allowedForRahma = ["/sales", "/calls", "/orders", "/customers", "/api/orders", "/api/calls", "/api/leads"];
  for (const r of allowedForRahma) {
    assert(isRouteAllowedForRole("sales_rep", r), `sales_rep should have access to ${r}`);
  }
  console.log("Pass: sales_rep is granted access to sales & CRM tasks.");

  const forbiddenForRahma = [
    "/finance", "/finance/invoices", "/analytics", "/inventory", "/settings",
    "/api/finance", "/api/analytics", "/api/inventory", "/api/drivers", "/api/driver",
  ];
  for (const r of forbiddenForRahma) {
    assert(!isRouteAllowedForRole("sales_rep", r), `sales_rep should NOT have access to ${r}`);
  }
  console.log("Pass: sales_rep is strictly restricted from sensitive departments, including /api/inventory (previously an unguarded gap).");

  // 4. Admin retains full access
  console.log("\n[4] Testing admin access...");
  for (const r of forbiddenForRahma) {
    assert(isRouteAllowedForRole("admin", r), `admin should have access to ${r}`);
  }
  console.log("Pass: admin retains unrestricted access across all departments.");

  // 5. driver / driver_manager / finance boundaries
  console.log("\n[5] Testing driver, driver_manager, and finance boundaries...");
  assert(isRouteAllowedForRole("driver", "/driver"), "driver should access /driver");
  assert(isRouteAllowedForRole("driver", "/api/driver"), "driver should access /api/driver");
  assert(!isRouteAllowedForRole("driver", "/api/orders"), "driver should NOT access /api/orders");
  assert(!isRouteAllowedForRole("driver", "/finance"), "driver should NOT access /finance");

  assert(isRouteAllowedForRole("driver_manager", "/api/inventory"), "driver_manager should access /api/inventory");
  assert(!isRouteAllowedForRole("driver_manager", "/api/analytics"), "driver_manager should NOT access /api/analytics");

  assert(isRouteAllowedForRole("finance", "/api/analytics"), "finance should access /api/analytics");
  assert(!isRouteAllowedForRole("finance", "/api/inventory"), "finance should NOT access /api/inventory");
  console.log("Pass: role boundaries hold for driver, driver_manager, and finance.");

  console.log("\nAll RBAC access control tests passed.");
}

try {
  runRbacTests();
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
