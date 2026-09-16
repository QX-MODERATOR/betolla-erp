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

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || new TextEncoder().encode(secret).length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 bytes.");
  }
  return new TextEncoder().encode(secret);
}

// Role-based redirect destinations after login
export const ROLE_HOME_ROUTES: Record<UserRole, string> = {
  admin: "/",
  general_manager: "/",
  sales_manager: "/",
  sales_rep: "/sales",
  marketing_manager: "/analytics",
  marketing: "/customers",
  finance: "/finance",
  hr_operations: "/hr",
  driver_manager: "/drivers",
  driver: "/driver",
};

// Configured accounts with granular Role-Based Access Control (RBAC)
export const SYSTEM_ACCOUNTS = [
  // 1. Central IT / System Admin Account
  {
    id: "admin-betolla-01",
    usernames: ["admin.zaid"],
    password: process.env.BETOLLA_ACCOUNT_PASSWORD_1 || "",
    profile: {
      id: "admin-betolla-01",
      username: "admin.zaid",
      name: "مسؤول النظام التقني (System Admin)",
      role: "admin" as const,
    },
  },
  // 2. General Manager: المدير العام
  {
    id: "gm-betolla-01",
    usernames: ["gm", "gm@betolla.com", "ceo@betolla.com"],
    password: process.env.BETOLLA_ACCOUNT_PASSWORD_2 || "",
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
    password: process.env.BETOLLA_ACCOUNT_PASSWORD_3 || "",
    profile: {
      id: "mgr-sales-01",
      username: "sales.manager",
      name: "مديرة المبيعات",
      role: "sales_manager" as const,
    },
  },
  // 4. Sales Representative: مبيعات (رحمة)
  {
    id: "rep-rahma-01",
    usernames: ["rahma.sales"],
    password: process.env.BETOLLA_ACCOUNT_PASSWORD_4 || "",
    profile: {
      id: "rep-rahma-01",
      username: "rahma.sales",
      name: "رحمة (مبيعات)",
      role: "sales_rep" as const,
      repId: "rahma",
    },
  },
  // 5. Marketing Manager: مدير التسويق
  {
    id: "mgr-mkt-01",
    usernames: ["ammar.mrk.mgr"],
    password: process.env.BETOLLA_ACCOUNT_PASSWORD_5 || "",
    profile: {
      id: "mgr-mkt-01",
      username: "ammar.mrk.mgr",
      name: "مدير التسويق",
      role: "marketing_manager" as const,
    },
  },
  // 6. Marketing Specialist: تسويق
  {
    id: "mkt-team-01",
    usernames: ["hanin.marketing"],
    password: process.env.BETOLLA_ACCOUNT_PASSWORD_6 || "",
    profile: {
      id: "mkt-team-01",
      username: "hanin.marketing",
      name: "أخصائي التسويق (تسويق)",
      role: "marketing" as const,
    },
  },
  // 7. Finance Director: المدير المالي (زيد)
  {
    id: "fin-zaid-01",
    usernames: ["zaid", "finance", "zaid@betolla.com", "finance@betolla.com"],
    password: process.env.BETOLLA_ACCOUNT_PASSWORD_7 || "",
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
    usernames: ["hr.areej"],
    password: process.env.BETOLLA_ACCOUNT_PASSWORD_8 || "",
    profile: {
      id: "hr-ops-01",
      username: "hr.areej",
      name: "مديرة الموارد البشرية - عمليات",
      role: "hr_operations" as const,
    },
  },
  // 9. Driver Manager: مدير سائقين التوصيل (ضياء)
  {
    id: "mgr-diya-01",
    usernames: ["diya.mgn"],
    password: process.env.BETOLLA_ACCOUNT_PASSWORD_9 || "",
    profile: {
      id: "mgr-diya-01",
      username: "diya.mgn",
      name: "ضياء (مدير سائقين التوصيل)",
      role: "driver_manager" as const,
      repId: "diya",
    },
  },
  // 10. Delivery Driver: خالد (سائق توصيل)
  {
    id: "drv-khalid-01",
    usernames: ["khalid.driver", "khalid", "khalid@betolla.com"],
    password: process.env["khalid.driver"] || process.env.BETOLLA_ACCOUNT_PASSWORD_10 || "khalid2026",
    profile: {
      id: "drv-khalid-01",
      username: "khalid.driver",
      name: "خالد (سائق توصيل)",
      role: "driver" as const,
      repId: "khalid",
    },
  },
  // 11. Delivery Driver: علي (سائق توصيل)
  {
    id: "drv-ali-01",
    usernames: ["ali.driver", "ali", "ali@betolla.com"],
    password: process.env["ali.driver"] || process.env.BETOLLA_ACCOUNT_PASSWORD_11 || "ali2026",
    profile: {
      id: "drv-ali-01",
      username: "ali.driver",
      name: "علي (سائق توصيل)",
      role: "driver" as const,
      repId: "ali",
    },
  },
  // 12. Delivery Partner / Driver: BX Arabia (شركة توصيل)
  {
    id: "drv-bx-01",
    usernames: ["bx", "bxarabia", "bx@betolla.com", "bx_arabia"],
    password: process.env.BETOLLA_ACCOUNT_PASSWORD_12 || "",
    profile: {
      id: "drv-bx-01",
      username: "bx",
      name: "BX Arabia (شركة توصيل)",
      role: "driver" as const,
      repId: "BX Arabia",
    },
  },
  // 13. Sales Representative: مبيعات (حنان)
  {
    id: "rep-hanan-01",
    usernames: ["hanan.sales"],
    password: process.env.BETOLLA_ACCOUNT_PASSWORD_13 || "",
    profile: {
      id: "rep-hanan-01",
      username: "hanan.sales",
      name: "حنان (مبيعات)",
      role: "sales_rep" as const,
      repId: "hanan",
    },
  },
  // 14. Central IT / System Admin Account (QX)
  {
    id: "admin-qx-01",
    usernames: ["admin.qx"],
    password: process.env.BETOLLA_ACCOUNT_PASSWORD_14 || "",
    profile: {
      id: "admin-qx-01",
      username: "admin.qx",
      name: "مسؤول النظام التقني (System Admin)",
      role: "admin" as const,
    },
  },
  // 15. Sales Representative: مبيعات (آية)
  {
    id: "rep-aya-01",
    usernames: ["aya.sales"],
    password: process.env.BETOLLA_ACCOUNT_PASSWORD_15 || "",
    profile: {
      id: "rep-aya-01",
      username: "aya.sales",
      name: "آية (مبيعات)",
      role: "sales_rep" as const,
      repId: "آية",
    },
  },
  // 16. Sales Representative: مبيعات (صابرين)
  {
    id: "rep-sabreen-01",
    usernames: ["sabreen.sales"],
    password: process.env.BETOLLA_ACCOUNT_PASSWORD_16 || "",
    profile: {
      id: "rep-sabreen-01",
      username: "sabreen.sales",
      name: "صابرين (مبيعات)",
      role: "sales_rep" as const,
      repId: "صابرين",
    },
  },
  // 17. Marketing Specialist: تسويق (لين)
  {
    id: "mkt-leen-01",
    usernames: ["leen.marketing"],
    password: process.env.BETOLLA_ACCOUNT_PASSWORD_17 || "",
    profile: {
      id: "mkt-leen-01",
      username: "leen.marketing",
      name: "لين (تسويق)",
      role: "marketing" as const,
    },
  },
  // 18. Sales Manager: مديرة مبيعات (رشا)
  {
    id: "mgr-rasha-01",
    usernames: ["rasha.sales.mgn"],
    password: process.env.BETOLLA_ACCOUNT_PASSWORD_18 || "",
    profile: {
      id: "mgr-rasha-01",
      username: "rasha.sales.mgn",
      name: "رشا (مديرة مبيعات)",
      role: "sales_manager" as const,
    },
  },
];

// Compatibility reference for existing admin checks
export const ADMIN_CREDENTIALS = SYSTEM_ACCOUNTS[0];

// In-memory runtime override map for updated passwords
const OVERRIDE_PASSWORDS = new Map<string, string>();

/**
 * Resolve password for an account, checking username-keyed env vars first
 * (e.g. process.env["ali.driver"]), then BETOLLA_ACCOUNT_PASSWORD_X.
 */
function getAccountPassword(account: (typeof SYSTEM_ACCOUNTS)[number]): string {
  for (const u of account.usernames) {
    const val = process.env[u];
    if (val && val.trim()) return val.trim();
  }
  const profileVal = process.env[account.profile.username];
  if (profileVal && profileVal.trim()) return profileVal.trim();
  return account.password;
}

/**
 * Verify current password for a user
 */
export function verifyUserPassword(username: string, password: string): boolean {
  if (typeof username !== "string" || typeof password !== "string" || !username || !password) return false;
  const normalized = username.trim().toLowerCase();
  const account = SYSTEM_ACCOUNTS.find((acc) =>
    acc.usernames.some((u) => u.toLowerCase() === normalized)
  );
  if (!account) return false;
  const validPassword = OVERRIDE_PASSWORDS.get(normalized) || getAccountPassword(account);
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
  if (typeof username !== "string" || typeof password !== "string" || !username || !password) return null;
  const normalized = username.trim().toLowerCase();

  const account = SYSTEM_ACCOUNTS.find(
    (acc) => acc.usernames.some((u) => u.toLowerCase() === normalized)
  );

  if (!account) return null;

  const validPassword = OVERRIDE_PASSWORDS.get(normalized) || getAccountPassword(account);
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

  // Self-service for every signed-in account: own HR record and own profile.
  // The route handlers enforce ownership (HR data by account id; profile edits only for yourself).
  if (matchesAny(["/hr/me", "/api/hr/me", "/api/profile"])) return true;

  if (role === "sales_manager") {
    // Sales Manager can access sales, customers, calls, orders, analytics, drivers overview, inventory
    const forbidden = ["/settings", "/driver", "/api/driver", "/hr", "/api/hr"];
    return !matchesAny(forbidden);
  }

  if (role === "sales_rep") {
    const forbidden = ["/finance", "/analytics", "/inventory", "/settings", "/drivers", "/driver",
      "/api/finance", "/api/analytics", "/api/drivers", "/api/driver", "/hr", "/api/hr"];
    return !matchesAny(forbidden);
  }

  if (role === "marketing_manager") {
    const allowed = ["/analytics", "/customers", "/orders", "/sales", "/api/analytics", "/api/leads",
      "/api/customers", "/api/orders", "/api/auth", "/api/notifications"];
    return matchesAny(allowed);
  }

  if (role === "marketing") {
    const allowed = ["/customers", "/orders", "/api/leads", "/api/customers", "/api/orders", "/api/auth", "/api/notifications"];
    return matchesAny(allowed);
  }

  if (role === "finance") {
    const allowed = ["/finance", "/analytics", "/orders", "/drivers/reconcile", "/hr/payroll", "/api/hr/payroll", "/api/finance", "/api/analytics",
      "/api/orders", "/api/drivers", "/api/auth", "/api/telegram", "/api/notifications"];
    return matchesAny(allowed);
  }

  if (role === "hr_operations") {
    const allowed = ["/", "/hr", "/drivers", "/calls", "/customers", "/inventory", "/orders", "/settings",
      "/api/hr", "/api/drivers", "/api/calls", "/api/leads", "/api/customers", "/api/inventory", "/api/orders", "/api/auth", "/api/telegram", "/api/notifications"];
    return matchesAny(allowed);
  }

  if (role === "driver_manager") {
    const allowed = ["/drivers", "/driver/shift", "/orders", "/inventory", "/drivers/reconcile",
      "/api/drivers", "/api/orders", "/api/inventory", "/api/auth", "/api/telegram", "/api/notifications"];
    return matchesAny(allowed);
  }

  if (role === "driver") {
    const allowed = ["/driver", "/driver/shift", "/api/driver", "/api/auth", "/api/telegram", "/api/notifications"];
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
    .sign(getJwtSecret());
}

/**
 * Verify a JWT token and extract user details
 */
export async function verifyAuthToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      algorithms: ["HS256"],
      requiredClaims: ["exp", "iat", "iss", "aud"],
      issuer: "betolla-erp",
      audience: "betolla-users",
    });

    const account = SYSTEM_ACCOUNTS.find((entry) => entry.profile.id === payload.id);
    if (!account || payload.username !== account.profile.username ||
        payload.role !== account.profile.role || payload.repId !== account.profile.repId ||
        typeof payload.name !== "string" || !payload.name.trim()) return null;

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
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return null;
      }
    }
  }

  return null;
}
