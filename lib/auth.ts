import { SignJWT, jwtVerify } from "jose";

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: "admin" | "sales_manager" | "sales_rep";
}

export const AUTH_COOKIE_NAME = "betolla_token";

const JWT_SECRET_STRING = process.env.JWT_SECRET || "betolla-erp-jwt-secret-key-2026-very-secure-random-token-xyz99!";
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_STRING);

// Admin user credentials as requested by the user
export const ADMIN_CREDENTIALS = {
  usernames: ["admin", "admin@betolla.com", "admin@betollacosmetics.com"],
  password: "rJ/$:9fUz3>a$z,",
  profile: {
    id: "admin-betolla-01",
    username: "admin",
    name: "المدير العام (Admin)",
    role: "admin" as const,
  }
};

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
      role: payload.role as "admin" | "sales_manager" | "sales_rep",
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
