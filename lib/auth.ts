import { SignJWT, jwtVerify } from "jose";

export type UserRole = "admin" | "sales_manager" | "sales_rep" | "driver_manager" | "driver" | "finance";

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  repId?: string;
}

export const AUTH_COOKIE_NAME = "betolla_token";

const JWT_SECRET_STRING = process.env.JWT_SECRET || "betolla-erp-jwt-secret-key-2026-very-secure-random-token-xyz99!";
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_STRING);

// Role-based redirect destinations after login
export const ROLE_HOME_ROUTES: Record<UserRole, string> = {
  admin: "/",
  sales_manager: "/",
  sales_rep: "/sales",
  driver_manager: "/drivers",
  driver: "/driver",
  finance: "/finance",
};

// Configured accounts with granular Role-Based Access Control (RBAC)
export const SYSTEM_ACCOUNTS = [
  // 1. Central Admin Account
  {
    id: "admin-betolla-01",
    usernames: ["admin", "admin@betolla.com", "admin@betollacosmetics.com"],
    password: "rJ/$:9fUz3>a$z,",
    profile: {
      id: "admin-betolla-01",
      username: "admin",
      name: "المدير العام (Admin)",
      role: "admin" as const,
    },
  },
  // 2. Sales Badge Employee: Rahma
  {
    id: "rep-rahma-01",
    usernames: ["rahma", "rahma@betolla.com", "rahma@betollacosmetics.com"],
    password: "rahma2026",
    profile: {
      id: "rep-rahma-01",
      username: "rahma",
      name: "رحمة (مندوبة مبيعات)",
      role: "sales_rep" as const,
      repId: "rahma",
    },
  },
  // 3. Driver Manager: Diya (ضياء)
  {
    id: "mgr-diya-01",
    usernames: ["diya", "diya@betolla.com"],
    password: "diya2026",
    profile: {
      id: "mgr-diya-01",
      username: "diya",
      name: "ضياء (مدير السائقين)",
      role: "driver_manager" as const,
      repId: "diya",
    },
  },
  // 4. Driver: Khalid (خالد)
  {
    id: "drv-khalid-01",
    usernames: ["khalid", "khalid@betolla.com"],
    password: "khalid2026",
    profile: {
      id: "drv-khalid-01",
      username: "khalid",
      name: "خالد (سائق توصيل)",
      role: "driver" as const,
      repId: "khalid",
    },
  },
  // 5. Driver: Ali (علي)
  {
    id: "drv-ali-01",
    usernames: ["ali", "ali@betolla.com"],
    password: "ali2026",
    profile: {
      id: "drv-ali-01",
      username: "ali",
      name: "علي (سائق توصيل)",
      role: "driver" as const,
      repId: "ali",
    },
  },
  // 6. Finance: Zaid (زيد) — On hold, account pre-created
  {
    id: "fin-zaid-01",
    usernames: ["zaid", "zaid@betolla.com"],
    password: "zaid2026",
    profile: {
      id: "fin-zaid-01",
      username: "zaid",
      name: "زيد (المحاسبة والمالية)",
      role: "finance" as const,
      repId: "zaid",
    },
  },
];

// Compatibility reference for existing admin checks
export const ADMIN_CREDENTIALS = SYSTEM_ACCOUNTS[0];

/**
 * Validate username & password against registered system accounts
 */
export function authenticateUser(username: string, password: string): AuthUser | null {
  if (!username || !password) return null;
  const normalized = username.trim().toLowerCase();

  const account = SYSTEM_ACCOUNTS.find(
    (acc) =>
      acc.usernames.some((u) => u.toLowerCase() === normalized) &&
      acc.password === password
  );

  return account ? account.profile : null;
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
    const forbidden = ["/finance", "/analytics", "/inventory", "/settings", "/drivers", "/driver",
      "/api/finance", "/api/analytics", "/api/drivers", "/api/driver"];
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

/**
 * Sign a new JWT token for an authenticated user
 */
export async function signAuthToken(user: AuthUser): Promise<string> {
  return await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .setIssuer("betolla-erp")
    .setAudience("betolla-users")
    .sign(JWT_SECRET);
}

/**
 * Verify a JWT token and extract user details
 */
export async function verifyAuthToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: "betolla-erp",
      audience: "betolla-users",
    });

    return {
      id: (payload.id as string) || (payload.sub as string),
      username: payload.username as string,
      name: payload.name as string,
      role: payload.role as UserRole,
      repId: payload.repId as string | undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Extract token from either Authorization header or Cookie
 */
export function extractTokenFromRequest(req: Request): string | null {
  // 1. Check Authorization Bearer header
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.substring(7).trim();
  }

  // 2. Check Cookie header
  const cookieHeader = req.headers.get("cookie");
  if (cookieHeader) {
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE_NAME}=([^;]*)`));
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }
  }

  return null;
}
