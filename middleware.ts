import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRouteAllowedForRole, mapSupabaseUserToAuthUser, ROLE_HOME_ROUTES } from "@/lib/auth";
import type { UserRole } from "@/lib/auth";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

/**
 * updateSupabaseSession() may have rotated the session's access/refresh
 * token cookies on `response`. Every early-return path below builds its own
 * NextResponse (redirect/json), which would otherwise silently drop those
 * rotated cookies — carry them forward explicitly so a session refresh
 * never gets lost mid-request.
 */
function withCarriedCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }
  return to;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Bypass static files, assets, public webhooks
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname.includes(".") || // files like favicon.ico, manifest.json, svgs, images
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/auth/logout") ||
    pathname.startsWith("/api/leads") // public webhook ingestion — authenticated via X-Webhook-Secret inside the route itself
  ) {
    return NextResponse.next();
  }

  // 2. Refresh/validate the Supabase session for this request. This also
  // returns the response object that must be used going forward so any
  // rotated session cookies are preserved.
  const { response, user: supabaseUser } = await updateSupabaseSession(request);
  const user = supabaseUser ? mapSupabaseUserToAuthUser(supabaseUser) : null;
  const isAuthenticated = !!user;

  // 3. Handle /login route: if already logged in, redirect to role-specific home
  if (pathname === "/login") {
    if (isAuthenticated && user) {
      const destination = ROLE_HOME_ROUTES[user.role as UserRole] || "/";
      return withCarriedCookies(response, NextResponse.redirect(new URL(destination, request.url)));
    }
    return response;
  }

  // 4. Protected Routes: redirect unauthenticated users to /login
  if (!isAuthenticated) {
    if (pathname.startsWith("/api/")) {
      return withCarriedCookies(
        response,
        NextResponse.json(
          { success: false, error: "غير مصرح بالدخول. يرجى تسجيل الدخول أولاً." },
          { status: 401 }
        )
      );
    }
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("from", pathname);
    }
    return withCarriedCookies(response, NextResponse.redirect(loginUrl));
  }

  // 5. Role-Based Access Control (RBAC) Enforcement for all roles
  if (user) {
    const role = user.role as UserRole;
    const homeRoute = ROLE_HOME_ROUTES[role] || "/";

    // If any non-admin visits root "/", redirect to their home
    if (pathname === "/" && role !== "admin" && role !== "sales_manager") {
      return withCarriedCookies(response, NextResponse.redirect(new URL(homeRoute, request.url)));
    }

    // Check RBAC for restricted routes
    const isAllowed = isRouteAllowedForRole(role, pathname);
    if (!isAllowed) {
      if (pathname.startsWith("/api/")) {
        return withCarriedCookies(
          response,
          NextResponse.json(
            {
              success: false,
              error: "غير مصرح لك بالوصول إلى هذا القسم. صلاحياتك مقتصرة على مهامك فقط.",
            },
            { status: 403 }
          )
        );
      }
      // Redirect forbidden page attempt to user's home with warning notice
      const redirectUrl = new URL(homeRoute, request.url);
      redirectUrl.searchParams.set("restricted", "true");
      return withCarriedCookies(response, NextResponse.redirect(redirectUrl));
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, manifest.json
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.json).*)",
  ],
};
