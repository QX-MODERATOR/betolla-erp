// RBAC Verification Test Script
import { authenticateUser, isRouteAllowedForRole, signAuthToken, verifyAuthToken } from "../lib/auth.ts";

async function runRbacTests() {
  console.log("🛡️ Starting Betolla ERP RBAC (Role-Based Access Control) Verification...");

  // 1. Verify Hanan credentials
  console.log("\n[1] Testing Hanan (Sales Badge Employee) Authentication...");
  const hananProfile = authenticateUser("Hanan", "hanan2026");
  if (!hananProfile) {
    throw new Error("FAIL: Hanan could not be authenticated!");
  }
  if (hananProfile.role !== "sales_rep" || hananProfile.username !== "hanan") {
    throw new Error(`FAIL: Unexpected profile for Hanan: ${JSON.stringify(hananProfile)}`);
  }
  console.log("✓ Pass: Hanan authenticated successfully -> Role:", hananProfile.role, "| Name:", hananProfile.name);

  // 1b. Test case-insensitivity for username
  const hananLower = authenticateUser("hanan", "hanan2026");
  if (!hananLower) throw new Error("FAIL: Lowercase username failed!");
  console.log("✓ Pass: Case-insensitive username match supported.");

  // 2. Verify Admin credentials
  console.log("\n[2] Testing Admin Authentication...");
  const adminProfile = authenticateUser("admin", "rJ/$:9fUz3>a$z,");
  if (!adminProfile || adminProfile.role !== "admin") {
    throw new Error("FAIL: Admin authentication failed!");
  }
  console.log("✓ Pass: Admin authenticated successfully -> Role:", adminProfile.role);

  // 3. Verify Invalid credentials rejection
  console.log("\n[3] Testing Invalid Credentials Rejection...");
  const invalidUser = authenticateUser("Hanan", "wrong_pass_999");
  if (invalidUser !== null) {
    throw new Error("FAIL: Invalid password was accepted!");
  }
  console.log("✓ Pass: Invalid credentials rejected.");

  // 4. Token signing & claims verification for Hanan
  console.log("\n[4] Testing JWT Token generation for Hanan...");
  const token = await signAuthToken(hananProfile);
  const verifiedUser = await verifyAuthToken(token);
  if (!verifiedUser || verifiedUser.role !== "sales_rep" || verifiedUser.repId !== "hanan") {
    throw new Error("FAIL: Token verification failed for Hanan!");
  }
  console.log("✓ Pass: JWT token issued with claims: role=sales_rep, repId=hanan");

  // 5. Test Route Permissions (RBAC)
  console.log("\n[5] Testing RBAC Route Access Rules...");
  
  // Routes Hanan CAN access:
  const allowedForHanan = ["/sales", "/calls", "/orders", "/customers", "/api/orders", "/api/calls", "/api/leads"];
  for (const r of allowedForHanan) {
    if (!isRouteAllowedForRole("sales_rep", r)) {
      throw new Error(`FAIL: Sales rep should have access to ${r}`);
    }
  }
  console.log("✓ Pass: Hanan is granted access to all sales & CRM tasks:", allowedForHanan.join(", "));

  // Routes Hanan CANNOT access:
  const forbiddenForHanan = ["/finance", "/finance/invoices", "/analytics", "/inventory", "/settings", "/api/finance", "/api/analytics"];
  for (const r of forbiddenForHanan) {
    if (isRouteAllowedForRole("sales_rep", r)) {
      throw new Error(`FAIL: Sales rep should NOT have access to ${r}`);
    }
  }
  console.log("✓ Pass: Hanan is strictly restricted from sensitive departments:", forbiddenForHanan.join(", "));

  // Admin access check:
  for (const r of forbiddenForHanan) {
    if (!isRouteAllowedForRole("admin", r)) {
      throw new Error(`FAIL: Admin should have access to ${r}`);
    }
  }
  console.log("✓ Pass: Admin retains unrestricted access across all departments.");

  console.log("\n✨ All RBAC access control tests passed with 100% success!");
}

runRbacTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
