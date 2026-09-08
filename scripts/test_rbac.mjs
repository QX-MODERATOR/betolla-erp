// RBAC Verification Test Script
import { authenticateUser, isRouteAllowedForRole, signAuthToken, verifyAuthToken } from "../lib/auth.ts";

async function runRbacTests() {
  console.log("🛡️ Starting Betolla ERP RBAC (Role-Based Access Control) Verification...");

  // 1. Verify Rahma credentials
  console.log("\n[1] Testing Rahma (Sales Badge Employee) Authentication...");
  const rahmaProfile = authenticateUser("Rahma", "rahma2026");
  if (!rahmaProfile) {
    throw new Error("FAIL: Rahma could not be authenticated!");
  }
  if (rahmaProfile.role !== "sales_rep" || rahmaProfile.username !== "rahma") {
    throw new Error(`FAIL: Unexpected profile for Rahma: ${JSON.stringify(rahmaProfile)}`);
  }
  console.log("✓ Pass: Rahma authenticated successfully -> Role:", rahmaProfile.role, "| Name:", rahmaProfile.name);

  // 1b. Test case-insensitivity for username
  const rahmaLower = authenticateUser("rahma", "rahma2026");
  if (!rahmaLower) throw new Error("FAIL: Lowercase username failed!");
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
  const invalidUser = authenticateUser("Rahma", "wrong_pass_999");
  if (invalidUser !== null) {
    throw new Error("FAIL: Invalid password was accepted!");
  }
  console.log("✓ Pass: Invalid credentials rejected.");

  // 4. Token signing & claims verification for Rahma
  console.log("\n[4] Testing JWT Token generation for Rahma...");
  const token = await signAuthToken(rahmaProfile);
  const verifiedUser = await verifyAuthToken(token);
  if (!verifiedUser || verifiedUser.role !== "sales_rep" || verifiedUser.repId !== "rahma") {
    throw new Error("FAIL: Token verification failed for Rahma!");
  }
  console.log("✓ Pass: JWT token issued with claims: role=sales_rep, repId=rahma");

  // 5. Test Route Permissions (RBAC)
  console.log("\n[5] Testing RBAC Route Access Rules...");
  
  // Routes Rahma CAN access:
  const allowedForRahma = ["/sales", "/calls", "/orders", "/customers", "/api/orders", "/api/calls", "/api/leads"];
  for (const r of allowedForRahma) {
    if (!isRouteAllowedForRole("sales_rep", r)) {
      throw new Error(`FAIL: Sales rep should have access to ${r}`);
    }
  }
  console.log("✓ Pass: Rahma is granted access to all sales & CRM tasks:", allowedForRahma.join(", "));

  // Routes Rahma CANNOT access:
  const forbiddenForRahma = ["/finance", "/finance/invoices", "/analytics", "/inventory", "/settings", "/api/finance", "/api/analytics"];
  for (const r of forbiddenForRahma) {
    if (isRouteAllowedForRole("sales_rep", r)) {
      throw new Error(`FAIL: Sales rep should NOT have access to ${r}`);
    }
  }
  console.log("✓ Pass: Rahma is strictly restricted from sensitive departments:", forbiddenForRahma.join(", "));

  // Admin access check:
  for (const r of forbiddenForRahma) {
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
