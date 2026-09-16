// Server-side session and rate-limit state (migration 028), reached over Supabase's REST RPC with
// plain fetch so it also works in middleware. Callers get "missing" when there is no session store
// (migration not applied, or no database configured) and "unavailable" when the database cannot be
// reached, and decide how to degrade.

export type SecurityResult<T> = { status: "ok"; data: T } | { status: "missing" } | { status: "unavailable" };

export async function securityRpc<T>(name: string, args: Record<string, unknown>): Promise<SecurityResult<T>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // No database configured (e.g. a bare local setup): same as "no session store".
  if (!url || !key) return { status: "missing" };
  try {
    const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    const text = await res.text();
    if (res.ok) return { status: "ok", data: (text ? JSON.parse(text) : null) as T };
    // PostgREST: PGRST202 = function not found (migration 028 not applied).
    if (res.status === 404 || /PGRST202|Could not find the function/.test(text)) return { status: "missing" };
    return { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Stable id for a token: its jti, or (for tokens issued before jti existed) a hash of the token.
export async function tokenId(token: string, jti: unknown): Promise<string> {
  return typeof jti === "string" && jti ? jti : "h:" + (await sha256Hex(token));
}

// Each server instance remembers recent answers briefly, so a page load does not hit the
// database once per request. An ended session is refused everywhere within this window.
const CACHE_MS = 30_000;
const cache = new Map<string, { active: boolean; at: number }>();
let warned = false;

export async function isSessionActive(accountId: string, id: string, iat: number): Promise<boolean> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.active;
  const result = await securityRpc<boolean>("auth_session_check", { p_account_id: accountId, p_jti: id, p_iat: iat });
  if (result.status !== "ok") {
    // No session store (migration missing) or a transient database error: the signed token still
    // stands on its own, as before this check existed. Data requests need the database anyway.
    if (!warned) { warned = true; console.warn(`[session] session check skipped (${result.status})`); }
    return true;
  }
  if (cache.size > 5000) cache.clear();
  cache.set(id, { active: result.data === true, at: Date.now() });
  return result.data === true;
}

export async function revokeToken(accountId: string, id: string, expiresAt: number): Promise<boolean> {
  cache.set(id, { active: false, at: Date.now() });
  const result = await securityRpc("auth_token_revoke", {
    p_jti: id, p_account_id: accountId, p_expires: new Date(expiresAt * 1000).toISOString(),
  });
  return result.status === "ok";
}

// Called after a password change: this instance forgets cached answers immediately.
export function forgetCachedSessions(): void {
  cache.clear();
}
