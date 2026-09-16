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

export async function secureFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, { credentials: "same-origin", ...options, headers: new Headers(options.headers || {}) });
}

export async function logoutUser(): Promise<void> {
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
