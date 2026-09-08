import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAuthToken, AUTH_COOKIE_NAME, isRouteAllowedForRole } from "@/lib/auth";

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

  // 3. Handle /login route: if already logged in, redirect to respective portal
  if (pathname === "/login") {
    if (isAuthenticated) {
      const destination = user.role === "sales_rep" ? "/sales" : "/";
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

  // 5. Role-Based Access Control (RBAC) Enforcement
  if (user && user.role === "sales_rep") {
    // If sales rep visits executive dashboard root "/", direct her to her Sales Portal
    if (pathname === "/") {
      return NextResponse.redirect(new URL("/sales", request.url));
    }

    // Check if sales rep is attempting to access restricted departments (finance, analytics, settings, stock adjustments)
    const isAllowed = isRouteAllowedForRole("sales_rep", pathname);
    if (!isAllowed) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          {
            success: false,
            error: "غير مصرح لك بالوصول (صلاحيات المندوبة مقتصرة على مهام المبيعات والمكالمات والطلبات فقط).",
          },
          { status: 403 }
        );
      }
      // Redirect forbidden page attempt to /sales with warning notice
      const salesUrl = new URL("/sales", request.url);
      salesUrl.searchParams.set("restricted", "true");
      return NextResponse.redirect(salesUrl);
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
