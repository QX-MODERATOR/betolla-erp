/**
 * Client-Side API Helper for Betolla ERP
 * Automatically attaches the JWT Bearer token in the request headers.
 */

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("betolla_token");
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
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(url, {
    ...options,
    headers,
  });
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
