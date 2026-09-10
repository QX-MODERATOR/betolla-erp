import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAuthToken, AUTH_COOKIE_NAME, isRouteAllowedForRole, ROLE_HOME_ROUTES } from "@/lib/auth";
import type { UserRole } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Bypass static files, assets, public webhooks
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname.includes(".") || // files like favicon.ico, manifest.json, svgs, images
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/auth/logout") ||
    pathname.startsWith("/api/leads") // public webhook ingestion from landing pages
  ) {
    return NextResponse.next();
  }

  // 2. Extract token from Cookie or Authorization header
  let token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    const authHeader = request.headers.get("Authorization") || request.headers.get("authorization");
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      token = authHeader.substring(7).trim();
    }
  }

  const user = token ? await verifyAuthToken(token) : null;
  const isAuthenticated = !!user;

  // 3. Handle /login route: if already logged in, redirect to role-specific home
  if (pathname === "/login") {
    if (isAuthenticated && user) {
      const destination = ROLE_HOME_ROUTES[user.role as UserRole] || "/";
      return NextResponse.redirect(new URL(destination, request.url));
    }
    return NextResponse.next();
  }

  // 4. Protected Routes: redirect unauthenticated users to /login
  if (!isAuthenticated) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: "غير مصرح بالدخول. يرجى تسجيل الدخول أولاً." },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("from", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // 5. Role-Based Access Control (RBAC) Enforcement for all roles
  if (user) {
    const role = user.role as UserRole;
    const homeRoute = ROLE_HOME_ROUTES[role] || "/";

    // If any non-admin visits root "/", redirect to their home
    if (pathname === "/" && role !== "admin" && role !== "sales_manager") {
      return NextResponse.redirect(new URL(homeRoute, request.url));
    }

    // Check RBAC for restricted routes
    const isAllowed = isRouteAllowedForRole(role, pathname);
    if (!isAllowed) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          {
            success: false,
            error: "غير مصرح لك بالوصول إلى هذا القسم. صلاحياتك مقتصرة على مهامك فقط.",
          },
          { status: 403 }
        );
      }
      // Redirect forbidden page attempt to user's home with warning notice
      const redirectUrl = new URL(homeRoute, request.url);
      redirectUrl.searchParams.set("restricted", "true");
      return NextResponse.redirect(redirectUrl);
    }
  }

  return NextResponse.next();
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
