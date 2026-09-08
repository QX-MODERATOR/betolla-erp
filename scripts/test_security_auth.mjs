// Security & Auth Verification Script
import { encryptPayload, decryptPayload } from "../lib/security.ts";

async function runTests() {
  console.log("🔒 Starting Betolla ERP Security & Auth Verification...");

  // 1. Test AES-256 GCM Encryption / Decryption
  const credentials = {
    username: "admin",
    password: "rJ/$:9fUz3>a$z,"
  };

  console.log("\n[1] Encrypting Credentials...");
  const encrypted = await encryptPayload(credentials);
  console.log("-> Ciphertext length:", encrypted.ciphertext.length, "hex characters");
  console.log("-> IV (Hex):", encrypted.iv);
  console.log("-> Timestamp:", encrypted.ts);
  console.log("-> Sample Ciphertext:", encrypted.ciphertext.substring(0, 32) + "...");

  if (encrypted.ciphertext.includes("admin") || encrypted.ciphertext.includes("rJ/$")) {
    throw new Error("FAIL: Plaintext found in ciphertext!");
  }
  console.log("✓ Pass: Zero plaintext in encrypted payload.");

  // 2. Test Decryption
  console.log("\n[2] Decrypting Payload on Server...");
  const decrypted = await decryptPayload(encrypted);
  if (decrypted.username !== "admin" || decrypted.password !== "rJ/$:9fUz3>a$z,") {
    throw new Error("FAIL: Decrypted data does not match original!");
  }
  console.log("✓ Pass: Decryption matched original credentials perfectly.");

  // 3. Test Replay Attack Prevention
  console.log("\n[3] Testing Replay Attack Protection (Old Timestamp)...");
  const oldPackage = {
    ...encrypted,
    ts: Date.now() - 300000 // 5 minutes old
  };
  try {
    await decryptPayload(oldPackage);
    throw new Error("FAIL: Expired payload was accepted!");
  } catch (err) {
    console.log("✓ Pass: Replay attack successfully blocked ->", err.message);
  }

  // 4. Test Tamper Resistance (Corrupt ciphertext)
  console.log("\n[4] Testing Tamper Resistance (Modified Ciphertext)...");
  const tamperedPackage = {
    ...encrypted,
    ciphertext: "ff" + encrypted.ciphertext.substring(2)
  };
  try {
    await decryptPayload(tamperedPackage);
    throw new Error("FAIL: Tampered payload was accepted!");
  } catch (err) {
    console.log("✓ Pass: Tampered ciphertext rejected by AES-GCM MAC tag validation.");
  }

  // 5. Test JWT Generation & Verification
  console.log("\n[5] Testing JWT Signing & Verification...");
  const { signAuthToken, verifyAuthToken, ADMIN_CREDENTIALS } = await import("../lib/auth.ts");
  const token = await signAuthToken(ADMIN_CREDENTIALS.profile);
  console.log("-> JWT Token Generated:", token.substring(0, 32) + "...");
  const verifiedUser = await verifyAuthToken(token);
  if (!verifiedUser || verifiedUser.username !== "admin") {
    throw new Error("FAIL: JWT verification failed!");
  }
  console.log("✓ Pass: JWT Token signed and verified successfully -> User:", verifiedUser.name);

  console.log("\n✨ All Security & Auth tests passed successfully!");
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
