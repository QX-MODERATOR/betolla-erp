import { SignJWT, jwtVerify } from "jose";

export type UserRole =
  | "admin"
  | "general_manager"
  | "sales_manager"
  | "sales_rep"
  | "marketing_manager"
  | "marketing"
  | "finance"
  | "hr_operations"
  | "driver_manager"
  | "driver";

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
  general_manager: "/",
  sales_manager: "/",
  sales_rep: "/sales",
  marketing_manager: "/analytics",
  marketing: "/customers",
  finance: "/finance",
  hr_operations: "/",
  driver_manager: "/drivers",
  driver: "/driver",
};

// Configured accounts with granular Role-Based Access Control (RBAC)
export const SYSTEM_ACCOUNTS = [
  // 1. Central IT / System Admin Account
  {
    id: "admin-betolla-01",
    usernames: ["admin", "it@betolla.com", "admin@betolla.com", "admin@betollacosmetics.com"],
    password: "rJ/$:9fUz3>a$z,",
    profile: {
      id: "admin-betolla-01",
      username: "admin",
      name: "مسؤول النظام التقني (System Admin)",
      role: "admin" as const,
    },
  },
  // 2. General Manager: المدير العام
  {
    id: "gm-betolla-01",
    usernames: ["gm", "gm@betolla.com", "ceo@betolla.com"],
    password: "gm2026",
    profile: {
      id: "gm-betolla-01",
      username: "gm",
      name: "المدير العام",
      role: "general_manager" as const,
    },
  },
  // 3. Sales Manager: مديرة المبيعات
  {
    id: "mgr-sales-01",
    usernames: ["sales.manager", "sales_manager", "sales_mgr@betolla.com"],
    password: "sales2026",
    profile: {
      id: "mgr-sales-01",
      username: "sales.manager",
      name: "مديرة المبيعات",
      role: "sales_manager" as const,
    },
  },
  // 4. Sales Representative: مبيعات (حنان)
  {
    id: "rep-hanan-01",
    usernames: ["hanan", "hanan@betolla.com", "hanan@betollacosmetics.com"],
    password: "hanan2026",
    profile: {
      id: "rep-hanan-01",
      username: "hanan",
      name: "حنان (مبيعات)",
      role: "sales_rep" as const,
      repId: "hanan",
    },
  },
  // 5. Marketing Manager: مدير التسويق
  {
    id: "mgr-mkt-01",
    usernames: ["marketing.mgr", "marketing_manager", "marketing_mgr@betolla.com"],
    password: "marketing2026",
    profile: {
      id: "mgr-mkt-01",
      username: "marketing.mgr",
      name: "مدير التسويق",
      role: "marketing_manager" as const,
    },
  },
  // 6. Marketing Specialist: تسويق
  {
    id: "mkt-team-01",
    usernames: ["marketing", "marketing@betolla.com"],
    password: "mkt2026",
    profile: {
      id: "mkt-team-01",
      username: "marketing",
      name: "أخصائي التسويق (تسويق)",
      role: "marketing" as const,
    },
  },
  // 7. Finance Director: المدير المالي (زيد)
  {
    id: "fin-zaid-01",
    usernames: ["zaid", "finance", "zaid@betolla.com", "finance@betolla.com"],
    password: "zaid2026",
    profile: {
      id: "fin-zaid-01",
      username: "zaid",
      name: "زيد (المدير المالي)",
      role: "finance" as const,
      repId: "zaid",
    },
  },
  // 8. HR & Operations Manager: مديرة الموارد البشرية - عمليات
  {
    id: "hr-ops-01",
    usernames: ["hr", "operations", "hr@betolla.com", "ops@betolla.com"],
    password: "hr2026",
    profile: {
      id: "hr-ops-01",
      username: "hr",
      name: "مديرة الموارد البشرية - عمليات",
      role: "hr_operations" as const,
    },
  },
  // 9. Driver Manager: مدير سائقين التوصيل (ضياء)
  {
    id: "mgr-diya-01",
    usernames: ["diya", "diya@betolla.com"],
    password: "diya2026",
    profile: {
      id: "mgr-diya-01",
      username: "diya",
      name: "ضياء (مدير سائقين التوصيل)",
      role: "driver_manager" as const,
      repId: "diya",
    },
  },
  // 10. Delivery Driver: خالد (سائق توصيل)
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
  // 11. Delivery Driver: علي (سائق توصيل)
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
  // 12. Delivery Partner / Driver: BX Arabia (شركة توصيل)
  {
    id: "drv-bx-01",
    usernames: ["bx", "bxarabia", "bx@betolla.com", "bx_arabia"],
    password: "bx2026",
    profile: {
      id: "drv-bx-01",
      username: "bx",
      name: "BX Arabia (شركة توصيل)",
      role: "driver" as const,
      repId: "BX Arabia",
    },
  },
];

// Compatibility reference for existing admin checks
export const ADMIN_CREDENTIALS = SYSTEM_ACCOUNTS[0];

// In-memory runtime override map for updated passwords
const OVERRIDE_PASSWORDS = new Map<string, string>();

/**
 * Verify current password for a user
 */
export function verifyUserPassword(username: string, password: string): boolean {
  if (!username || !password) return false;
  const normalized = username.trim().toLowerCase();
  const account = SYSTEM_ACCOUNTS.find((acc) =>
    acc.usernames.some((u) => u.toLowerCase() === normalized)
  );
  if (!account) return false;
  const validPassword = OVERRIDE_PASSWORDS.get(normalized) || account.password;
  return validPassword === password;
}

/**
 * Update password for a user
 */
export function setUserPassword(username: string, newPassword: string): boolean {
  if (!username || !newPassword) return false;
  const normalized = username.trim().toLowerCase();
  OVERRIDE_PASSWORDS.set(normalized, newPassword);
  return true;
}

/**
 * Validate username & password against registered system accounts
 */
export function authenticateUser(username: string, password: string): AuthUser | null {
  if (!username || !password) return null;
  const normalized = username.trim().toLowerCase();

  const account = SYSTEM_ACCOUNTS.find(
    (acc) => acc.usernames.some((u) => u.toLowerCase() === normalized)
  );

  if (!account) return null;

  const validPassword = OVERRIDE_PASSWORDS.get(normalized) || account.password;
  if (validPassword !== password) return null;

  return account.profile;
}

/**
 * Check if a specific route is allowed for a given role.
 * Admin has access to everything. Other roles are restricted to their own areas.
 */
export function isRouteAllowedForRole(role: UserRole, pathname: string): boolean {
  // Superadmin and General Manager have unrestricted access across the entire ERP
  if (role === "admin" || role === "general_manager") return true;

  // Helper to check if pathname matches any prefix
  const matchesAny = (prefixes: string[]) =>
    prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (role === "sales_manager") {
    // Sales Manager can access sales, customers, calls, orders, analytics, drivers overview, inventory
    const forbidden = ["/settings", "/driver", "/api/driver"];
    return !matchesAny(forbidden);
  }

  if (role === "sales_rep") {
    const forbidden = ["/finance", "/analytics", "/inventory", "/settings", "/drivers", "/driver",
      "/api/finance", "/api/analytics", "/api/drivers", "/api/driver"];
    return !matchesAny(forbidden);
  }

  if (role === "marketing_manager") {
    const allowed = ["/analytics", "/customers", "/orders", "/sales", "/api/analytics", "/api/leads",
      "/api/orders", "/api/auth"];
    return matchesAny(allowed);
  }

  if (role === "marketing") {
    const allowed = ["/customers", "/orders", "/api/leads", "/api/orders", "/api/auth"];
    return matchesAny(allowed);
  }

  if (role === "finance") {
    const allowed = ["/finance", "/analytics", "/orders", "/drivers/reconcile", "/api/finance", "/api/analytics",
      "/api/orders", "/api/drivers", "/api/auth", "/api/telegram"];
    return matchesAny(allowed);
  }

  if (role === "hr_operations") {
    const allowed = ["/", "/drivers", "/calls", "/customers", "/inventory", "/orders", "/settings",
      "/api/drivers", "/api/calls", "/api/leads", "/api/inventory", "/api/orders", "/api/auth", "/api/telegram"];
    return matchesAny(allowed);
  }

  if (role === "driver_manager") {
    const allowed = ["/drivers", "/driver/shift", "/orders", "/inventory", "/drivers/reconcile",
      "/api/drivers", "/api/orders", "/api/inventory", "/api/auth", "/api/telegram"];
    return matchesAny(allowed);
  }

  if (role === "driver") {
    const allowed = ["/driver", "/driver/shift", "/api/driver", "/api/auth", "/api/telegram"];
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
