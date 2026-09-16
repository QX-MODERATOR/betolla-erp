import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { SignJWT } from "jose";
import { registerHooks } from "node:module";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) return nextResolve(new URL("../" + specifier.slice(2) + ".ts", import.meta.url).href, context);
  if (specifier === "next/server") return nextResolve("next/server.js", context);
  return nextResolve(specifier, context);
} });

// Deliberately do not load .env: all credentials and tokens are disposable.
process.env.JWT_SECRET = randomBytes(48).toString("hex");
process.env.BETOLLA_ACCOUNT_PASSWORD_4 = randomBytes(24).toString("hex");
const { signAuthToken, verifyAuthToken, extractTokenFromRequest } = await import("../lib/auth.ts");
const { authenticateUser } = await import("../lib/auth-password.ts");
const user = await authenticateUser("Rahma", process.env.BETOLLA_ACCOUNT_PASSWORD_4);
assert.ok(user);
const key = new TextEncoder().encode(process.env.JWT_SECRET);
const signingSecret = process.env.JWT_SECRET;
const token = await signAuthToken(user);
assert.deepEqual(await verifyAuthToken(token), user);
assert.equal(await authenticateUser("rahma", "incorrect-test-password"), null);
assert.equal(await authenticateUser({}, []), null);
assert.equal(await authenticateUser("admin", ""), null);

async function mint(payload, options = {}) {
  let jwt = new SignJWT(payload).setProtectedHeader({ alg: options.alg || "HS256" })
    .setIssuedAt().setIssuer(options.issuer || "betolla-erp")
    .setAudience(options.audience || "betolla-users");
  if (!options.omitExpiration) jwt = jwt.setExpirationTime(options.expiration || "1h");
  return jwt.sign(options.key || key);
}
const rejected = [
  await mint({ ...user, role: "admin" }),
  await mint({ ...user, repId: "another-rep" }),
  await mint({ ...user, id: "unknown-account" }),
  await mint({ ...user, username: "admin" }),
  await mint({ ...user, name: "" }),
  await mint(user, { expiration: "-1h" }),
  await mint(user, { omitExpiration: true }),
  await mint(user, { issuer: "other-app" }),
  await mint(user, { audience: "other-users" }),
  await mint(user, { alg: "HS384" }),
  await mint(user, { key: randomBytes(48) }),
  "malformed-token",
];
for (const forged of rejected) assert.equal(await verifyAuthToken(forged), null);
assert.equal(extractTokenFromRequest(new Request("http://localhost", { headers: { cookie: "betolla_token=%ZZ" } })), null);
assert.equal(extractTokenFromRequest(new Request("http://localhost", { headers: { authorization: `Bearer ${token}` } })), token);
for (const secret of [undefined, "", "too-short"]) {
  if (secret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = secret;
  await assert.rejects(signAuthToken(user), /JWT_SECRET/);
  assert.equal(await verifyAuthToken(token), null);
}
process.env.JWT_SECRET = signingSecret;
const { POST } = await import("../app/api/auth/password/route.ts");
const request = (body, bearer = token) => new Request("http://localhost/api/auth/password", {
  method: "POST", headers: { "Content-Type": "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
  body: JSON.stringify(body),
});
assert.equal((await POST(request({}, null))).status, 401);
assert.equal((await POST(request({ username: "admin", currentPassword: "test-only", newPassword: "test-only-new" }))).status, 403);
assert.equal((await POST(request({ username: user.username, currentPassword: {}, newPassword: [] }))).status, 400);
assert.equal((await POST(request(null))).status, 400);
assert.equal((await POST(request({ username: user.username, currentPassword: "wrong", newPassword: "test-only-new" }))).status, 401);
console.log("PASS: isolated authentication, token round trip, 12 invalid token cases, malformed cookies, missing/weak key checks, and five password endpoint rejection cases.");
