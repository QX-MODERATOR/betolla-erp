import type { User } from "@supabase/supabase-js";

export type UserRole = "admin" | "sales_manager" | "sales_rep" | "driver_manager" | "driver" | "finance";

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  repId?: string;
}

const VALID_ROLES: UserRole[] = ["admin", "sales_manager", "sales_rep", "driver_manager", "driver", "finance"];

/**
 * Internal email domain used to let staff log in with a short username
 * (e.g. "rahma") while Supabase Auth — which is email-based — stores a real
 * address underneath. This is purely a login-UX convenience; it does not
 * grant or imply mailbox access, and is not treated as a secret.
 */
export const INTERNAL_AUTH_EMAIL_DOMAIN = "betolla.com";

/**
 * Normalizes whatever the user typed in the "username" field into the email
 * address Supabase Auth expects. Accepts either a bare username ("rahma")
 * or a full email ("rahma@betolla.com").
 */
export function usernameToEmail(usernameOrEmail: string): string {
  const trimmed = usernameOrEmail.trim().toLowerCase();
  if (trimmed.includes("@")) return trimmed;
  return `${trimmed}@${INTERNAL_AUTH_EMAIL_DOMAIN}`;
}

// Role-based redirect destinations after login
export const ROLE_HOME_ROUTES: Record<UserRole, string> = {
  admin: "/",
  sales_manager: "/",
  sales_rep: "/sales",
  driver_manager: "/drivers",
  driver: "/driver",
  finance: "/finance",
};

/**
 * Maps a Supabase Auth user (from auth.getUser()) into this app's AuthUser
 * shape. Role and rep-key live in app_metadata, which — unlike
 * user_metadata — can only be written by the service role (see
 * scripts/provision_users.mjs), so a signed-in user cannot escalate their
 * own role by editing client-side profile fields.
 */
export function mapSupabaseUserToAuthUser(user: User): AuthUser | null {
  const role = user.app_metadata?.role;
  if (typeof role !== "string" || !VALID_ROLES.includes(role as UserRole)) {
    return null;
  }

  const email = user.email || "";
  const username = email.includes("@") ? email.split("@")[0] : email;

  return {
    id: user.id,
    username,
    name: (user.app_metadata?.full_name as string | undefined) || username,
    role: role as UserRole,
    repId: (user.app_metadata?.rep_key as string | undefined) || undefined,
  };
}

/**
 * Check if a specific route is allowed for a given role.
 * Admin has access to everything. Other roles are restricted to their own areas.
 */
export function isRouteAllowedForRole(role: UserRole, pathname: string): boolean {
  if (role === "admin" || role === "sales_manager") return true;

  // Helper to check if pathname matches any prefix
  const matchesAny = (prefixes: string[]) =>
    prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (role === "sales_rep") {
    // NOTE: "/api/inventory" was missing here even though the equivalent
    // "/inventory" page route was already forbidden — a sales_rep could
    // previously call the inventory API directly. Fixed as part of the
    // Phase 1 API authorization review.
    const forbidden = ["/finance", "/analytics", "/inventory", "/settings", "/drivers", "/driver",
      "/api/finance", "/api/analytics", "/api/drivers", "/api/driver", "/api/inventory"];
    return !matchesAny(forbidden);
  }

  if (role === "driver_manager") {
    const allowed = ["/drivers", "/orders", "/inventory", "/api/drivers", "/api/orders", "/api/inventory",
      "/api/auth", "/api/telegram"];
    return matchesAny(allowed);
  }

  if (role === "driver") {
    const allowed = ["/driver", "/api/driver", "/api/auth", "/api/telegram"];
    return matchesAny(allowed);
  }

  if (role === "finance") {
    const allowed = ["/finance", "/analytics", "/orders", "/api/finance", "/api/analytics", "/api/orders",
      "/api/auth", "/api/telegram"];
    return matchesAny(allowed);
  }

  return false;
}
