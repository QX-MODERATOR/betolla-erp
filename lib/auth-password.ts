// Split out of lib/auth.ts: this file needs node:crypto and @supabase/supabase-js
// to persist password overrides in Postgres, but lib/auth.ts is bundled into Edge
// Middleware (middleware.ts imports verifyAuthToken/isRouteAllowedForRole from it),
// and node:crypto isn't available in the Edge Runtime. Only import this module from
// Node-runtime code (API routes) — never from middleware.ts.
import { createClient } from "@supabase/supabase-js";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { SYSTEM_ACCOUNTS, type AuthUser } from "@/lib/auth";

// Changed passwords are persisted in Postgres (account_password_overrides,
// migration 020), not just kept in memory — an in-memory-only override reverts
// to the .env password on every server restart / cold start. This process-local
// cache only avoids a DB round trip on every login for accounts that have never
// changed their password; the database row is always the source of truth.
const OVERRIDE_PASSWORD_CACHE = new Map<string, string>();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPasswordHash(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const hashBuf = Buffer.from(hash, "hex");
  const testBuf = scryptSync(password, salt, 64);
  return hashBuf.length === testBuf.length && timingSafeEqual(hashBuf, testBuf);
}

function businessDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function fetchPasswordOverrideHash(normalizedUsername: string): Promise<string | null> {
  const db = businessDb();
  if (!db) return null;
  try {
    const { data, error } = await db.rpc("business_password_override_get", { p_username: normalizedUsername });
    if (error) return null;
    return (data as string) || null;
  } catch {
    return null;
  }
}

async function savePasswordOverrideHash(normalizedUsername: string, hash: string): Promise<boolean> {
  const db = businessDb();
  if (!db) return false;
  const { error } = await db.rpc("business_password_override_set", { p_username: normalizedUsername, p_hash: hash });
  return !error;
}

/**
 * Verify current password for a user
 */
export async function verifyUserPassword(username: string, password: string): Promise<boolean> {
  if (typeof username !== "string" || typeof password !== "string" || !username || !password) return false;
  const normalized = username.trim().toLowerCase();
  const account = SYSTEM_ACCOUNTS.find((acc) =>
    acc.usernames.some((u) => u.toLowerCase() === normalized)
  );
  if (!account) return false;
  let overrideHash = OVERRIDE_PASSWORD_CACHE.get(normalized);
  if (overrideHash === undefined) {
    overrideHash = (await fetchPasswordOverrideHash(normalized)) ?? undefined;
    if (overrideHash) OVERRIDE_PASSWORD_CACHE.set(normalized, overrideHash);
  }
  if (overrideHash) return verifyPasswordHash(password, overrideHash);
  return account.password === password;
}

/**
 * Update password for a user — persisted to Postgres, survives restart.
 */
export async function setUserPassword(username: string, newPassword: string): Promise<boolean> {
  if (!username || !newPassword) return false;
  const normalized = username.trim().toLowerCase();
  const hash = hashPassword(newPassword);
  const saved = await savePasswordOverrideHash(normalized, hash);
  if (!saved) return false;
  OVERRIDE_PASSWORD_CACHE.set(normalized, hash);
  return true;
}

/**
 * Validate username & password against registered system accounts
 */
export async function authenticateUser(username: string, password: string): Promise<AuthUser | null> {
  if (typeof username !== "string" || typeof password !== "string" || !username || !password) return null;
  const normalized = username.trim().toLowerCase();

  const account = SYSTEM_ACCOUNTS.find(
    (acc) => acc.usernames.some((u) => u.toLowerCase() === normalized)
  );

  if (!account) return null;

  const valid = await verifyUserPassword(username, password);
  if (!valid) return null;

  return account.profile;
}
