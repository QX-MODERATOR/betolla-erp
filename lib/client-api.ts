/**
 * Client-Side API Helper for Betolla ERP
 *
 * Authentication is handled entirely by Supabase Auth's HttpOnly session
 * cookie, which the browser attaches automatically to same-origin requests.
 * There is no client-readable token: nothing here can be stolen via XSS and
 * replayed, unlike the old localStorage bearer token this replaced.
 */

/**
 * Non-sensitive profile cache for instant UI rendering (sidebar/header)
 * without waiting on a network round trip. NEVER the source of truth for
 * authorization — every request is re-checked server-side against the
 * session cookie (see middleware.ts and lib/api-auth.ts).
 */
export function getCurrentUser() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("betolla_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function secureFetch(url: string, options: RequestInit = {}): Promise<Response> {
  // Cookies are sent automatically for same-origin requests; nothing to attach.
  return fetch(url, options);
}

export async function logoutUser(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch (e) {
    console.error("Logout request error:", e);
  } finally {
    if (typeof window !== "undefined") {
      localStorage.removeItem("betolla_token");
      localStorage.removeItem("betolla_user");
      window.location.href = "/login";
    }
  }
}
