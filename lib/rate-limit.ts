/**
 * Login throttling / brute-force protection.
 *
 * Pluggable behind a small store interface so the throttling algorithm can be
 * unit-tested with an in-memory store (see scripts/test_rate_limit.mjs)
 * while production uses a Postgres-backed store (login_attempts table) that
 * works correctly across Netlify's stateless serverless function instances,
 * where a plain in-process counter would not.
 */

export interface RateLimitStore {
  /** Record one login attempt for a given key ("email" or "ip:<addr>"). */
  recordAttempt(key: string, success: boolean): Promise<void>;
  /** Count failed attempts for a key within the last `windowMs` milliseconds. */
  countRecentFailures(key: string, windowMs: number): Promise<number>;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export const LOGIN_RATE_LIMIT = {
  maxFailuresPerIdentifier: 5,
  maxFailuresPerIp: 20,
  windowMs: 15 * 60 * 1000, // 15 minutes
};

/**
 * Checks whether a login attempt should be allowed BEFORE it is processed.
 * Two independent limits apply: a tight one per account (identifier) so a
 * single username can't be brute-forced, and a looser one per IP so one
 * client can't brute-force many accounts at once.
 */
export async function checkLoginRateLimit(
  store: RateLimitStore,
  identifier: string,
  ip: string
): Promise<RateLimitDecision> {
  const [identifierFailures, ipFailures] = await Promise.all([
    store.countRecentFailures(`id:${identifier}`, LOGIN_RATE_LIMIT.windowMs),
    store.countRecentFailures(`ip:${ip}`, LOGIN_RATE_LIMIT.windowMs),
  ]);

  if (identifierFailures >= LOGIN_RATE_LIMIT.maxFailuresPerIdentifier) {
    return { allowed: false, retryAfterSeconds: Math.ceil(LOGIN_RATE_LIMIT.windowMs / 1000) };
  }

  if (ipFailures >= LOGIN_RATE_LIMIT.maxFailuresPerIp) {
    return { allowed: false, retryAfterSeconds: Math.ceil(LOGIN_RATE_LIMIT.windowMs / 1000) };
  }

  return { allowed: true };
}

export async function recordLoginAttempt(
  store: RateLimitStore,
  identifier: string,
  ip: string,
  success: boolean
): Promise<void> {
  await Promise.all([
    store.recordAttempt(`id:${identifier}`, success),
    store.recordAttempt(`ip:${ip}`, success),
  ]);
}

/**
 * Simple in-memory store. Only correct for a single long-lived process, so
 * it's used for unit tests and as a last-resort fallback — never rely on it
 * in the deployed serverless environment (see createSupabaseRateLimitStore).
 */
export function createInMemoryRateLimitStore(): RateLimitStore {
  const attempts = new Map<string, { at: number; success: boolean }[]>();

  return {
    async recordAttempt(key, success) {
      const list = attempts.get(key) ?? [];
      list.push({ at: Date.now(), success });
      attempts.set(key, list);
    },
    async countRecentFailures(key, windowMs) {
      const list = attempts.get(key) ?? [];
      const since = Date.now() - windowMs;
      return list.filter((a) => !a.success && a.at >= since).length;
    },
  };
}

/**
 * Production store backed by the `login_attempts` table (service-role only,
 * see supabase/migrations/005_auth_security_foundation.sql). Works correctly
 * across multiple stateless serverless function instances.
 */
export function createSupabaseRateLimitStore(): RateLimitStore {
  return {
    async recordAttempt(key, success) {
      const { getSupabaseAdminClient } = await import("@/lib/supabase/admin");
      const supabase = getSupabaseAdminClient();
      await supabase.from("login_attempts").insert({ attempt_key: key, success });

      // Best-effort cleanup so this table doesn't grow unbounded. Not
      // load-bearing for correctness (the count query is always
      // window-scoped), just housekeeping.
      const cutoff = new Date(Date.now() - LOGIN_RATE_LIMIT.windowMs * 4).toISOString();
      await supabase.from("login_attempts").delete().lt("created_at", cutoff);
    },
    async countRecentFailures(key, windowMs) {
      const { getSupabaseAdminClient } = await import("@/lib/supabase/admin");
      const supabase = getSupabaseAdminClient();
      const since = new Date(Date.now() - windowMs).toISOString();
      const { count } = await supabase
        .from("login_attempts")
        .select("id", { count: "exact", head: true })
        .eq("attempt_key", key)
        .eq("success", false)
        .gte("created_at", since);
      return count ?? 0;
    },
  };
}
