/**
 * Client-Side API Helper for Betolla ERP
 * The session token lives only in an httpOnly cookie that the browser sends with every
 * same-origin request; page scripts never see it. localStorage keeps the (non-secret)
 * profile for display.
 */

// Sessions from before the httpOnly cookie kept a copy of the token here; remove it.
if (typeof window !== "undefined") {
  try { localStorage.removeItem("betolla_token"); } catch {}
}

export function isSignedIn(): boolean {
  return getCurrentUser() !== null;
}

export function getCurrentUser() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("betolla_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Re-derive the signed-in identity from the session itself (/api/auth/me).
 *
 * The httpOnly cookie *is* the session; the localStorage copy is only a display cache written by
 * the login page. That cache can be gone while the session is still perfectly valid — cleared
 * site data, a reinstalled Android WebView, a device where someone cleared storage but kept
 * cookies. Everything role-aware (the sidebar's nav list, useCan, the identity chip) reads the
 * cache only, so without this the app renders signed-in but with an empty sidebar and every
 * permission-gated button hidden, which looks exactly like "the page shows nothing".
 *
 * Locally edited display fields (name, phone, avatar from profile settings) win over the
 * account's configured ones; the server stays authoritative for id, username, role and repId.
 */
export async function refreshSessionUser(): Promise<Record<string, unknown> | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" });
    if (res.status === 401) {
      localStorage.removeItem("betolla_user");
      window.dispatchEvent(new Event("betolla_user_updated"));
      return null;
    }
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.success || !data.user?.id) return null;
    const cached = getCurrentUser();
    const display: Record<string, unknown> = {};
    if (cached && cached.id === data.user.id) {
      for (const key of ["name", "phone", "avatar"]) {
        if (cached[key]) display[key] = cached[key];
      }
    }
    const user = { ...data.user, ...display };
    localStorage.setItem("betolla_user", JSON.stringify(user));
    window.dispatchEvent(new Event("betolla_user_updated"));
    return user;
  } catch {
    return null;
  }
}

export async function secureFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, { credentials: "same-origin", ...options, headers: new Headers(options.headers || {}) });
}

export async function logoutUser(): Promise<void> {
  try {
    const { unregisterPushDevice } = await import("@/components/common/push-registration");
    await unregisterPushDevice();
  } catch {}
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch (e) {
    console.error("Logout request error:", e);
  } finally {
    if (typeof window !== "undefined") {
      localStorage.removeItem("betolla_user");
      window.location.href = "/login";
    }
  }
}
