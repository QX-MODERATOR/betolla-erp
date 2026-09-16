import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { findAccount, matchesConfiguredPassword, signAuthToken, AUTH_COOKIE_NAME, type SystemAccount } from "@/lib/auth";
import { securityRpc, forgetCachedSessions } from "@/lib/session";
import { notifyWarning } from "@/lib/telegram";

// Node-only sign-in helpers: password hashing, stored passwords, login lockout, session cookie.

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

function scryptAsync(password: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number }): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, keylen, { ...opts, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key))));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPasswordHash(password: string, stored: string): Promise<boolean> {
  const [kind, n, r, p, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scryptAsync(password, Buffer.from(salt, "base64"), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export type PasswordCheck = "ok" | "wrong" | "unavailable";

/**
 * A password changed in the app (stored hashed in the database) replaces the configured one.
 * Before migration 028 exists, only the configured password applies. If the database cannot be
 * reached we refuse rather than fall back, so a replaced (possibly leaked) password never works.
 */
export async function checkAccountPassword(account: SystemAccount, password: unknown): Promise<PasswordCheck> {
  if (typeof password !== "string" || !password || password.length > PASSWORD_MAX_LENGTH) return "wrong";
  const state = await securityRpc<{ password_hash: string | null }>("auth_account_get", { p_account_id: account.profile.id });
  if (state.status === "unavailable") return "unavailable";
  if (state.status === "ok" && state.data?.password_hash) {
    return (await verifyPasswordHash(password, state.data.password_hash)) ? "ok" : "wrong";
  }
  return matchesConfiguredPassword(account, password) ? "ok" : "wrong";
}

export type PasswordChange = "ok" | "unsupported" | "unavailable";

export async function storeAccountPassword(account: SystemAccount, newPassword: string): Promise<PasswordChange> {
  const result = await securityRpc("auth_password_set", { p_account_id: account.profile.id, p_hash: await hashPassword(newPassword) });
  if (result.status === "ok") forgetCachedSessions();
  return result.status === "ok" ? "ok" : result.status === "missing" ? "unsupported" : "unavailable";
}

// Failed-login lockout: 5 wrong passwords within 15 minutes locks the account for 15 minutes.
// Unknown usernames share one bucket, so guessing names creates no per-name rows.
export const LOGIN_LOCK = { limit: 5, windowSeconds: 900, lockSeconds: 900 };
const loginBucket = (account: SystemAccount | null) => `login:${account ? account.profile.id : "unknown"}`;

export async function loginLockRemaining(account: SystemAccount | null): Promise<number> {
  const result = await securityRpc<number>("security_lock_remaining", { p_bucket: loginBucket(account) });
  return result.status === "ok" ? Number(result.data) || 0 : 0;
}

export async function recordFailedLogin(account: SystemAccount | null, attemptedUsername: string): Promise<{ locked: boolean }> {
  const result = await securityRpc<{ just_locked: boolean; allowed: boolean }>("security_rate_hit", {
    p_bucket: loginBucket(account), p_limit: LOGIN_LOCK.limit, p_window_seconds: LOGIN_LOCK.windowSeconds, p_lock_seconds: LOGIN_LOCK.lockSeconds,
  });
  if (result.status !== "ok") return { locked: false };
  // One alert per lockout, not one per wrong password.
  if (result.data.just_locked) {
    const who = account ? account.profile.username : `unknown usernames (last tried: ${attemptedUsername.slice(0, 40)})`;
    notifyWarning("Login locked", `${LOGIN_LOCK.limit} failed sign-ins for ${who}. Locked for ${LOGIN_LOCK.lockSeconds / 60} minutes.`).catch(() => {});
  }
  return { locked: result.data.just_locked || !result.data.allowed };
}

export async function clearFailedLogins(account: SystemAccount): Promise<void> {
  await securityRpc("security_rate_clear", { p_bucket: loginBucket(account) });
}

export const lockMessage = (seconds: number) =>
  `تم إيقاف تسجيل الدخول لهذا الحساب مؤقتًا بسبب محاولات خاطئة متكررة. حاول بعد ${Math.max(1, Math.ceil(seconds / 60))} دقيقة.`;

export function isHttpsRequest(req: Request): boolean {
  const proto = req.headers.get("x-forwarded-proto") || new URL(req.url).protocol;
  return proto.includes("https");
}

// The session cookie is the only place the token lives: page scripts cannot read it.
export async function sessionCookie(req: Request, account: SystemAccount) {
  return {
    name: AUTH_COOKIE_NAME,
    value: await signAuthToken(account.profile),
    httpOnly: true,
    secure: isHttpsRequest(req),
    sameSite: "lax" as const,
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  };
}

export function clearedSessionCookie(req: Request) {
  return { name: AUTH_COOKIE_NAME, value: "", httpOnly: true, secure: isHttpsRequest(req), sameSite: "lax" as const, path: "/", expires: new Date(0) };
}

export { findAccount };
