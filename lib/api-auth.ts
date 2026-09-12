import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapSupabaseUserToAuthUser, type AuthUser, type UserRole } from "@/lib/auth";

/**
 * Defense-in-depth authorization check for API route handlers.
 *
 * middleware.ts already enforces RBAC by pathname for every request, but a
 * route handler should never rely solely on "middleware ran first" — a
 * future routing change, a misconfigured matcher, or a direct server-side
 * invocation could bypass it. Each protected route calls this at the top of
 * its handler so authorization holds even if middleware is ever changed or
 * skipped.
 *
 * Returns the authenticated user on success, or a ready-to-return
 * NextResponse (401/403) on failure — callers do:
 *
 *   const auth = await requireRole(["finance", "admin"]);
 *   if (auth instanceof NextResponse) return auth;
 *   // auth is AuthUser here
 */
export async function requireRole(allowedRoles: UserRole[]): Promise<AuthUser | NextResponse> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: "غير مصرح بالدخول. يرجى تسجيل الدخول أولاً." },
      { status: 401 }
    );
  }

  const authUser = mapSupabaseUserToAuthUser(user);
  if (!authUser) {
    return NextResponse.json(
      { success: false, error: "حساب غير مكتمل الإعداد. يرجى التواصل مع الإدارة." },
      { status: 403 }
    );
  }

  const isAdmin = authUser.role === "admin" || authUser.role === "sales_manager";
  if (!isAdmin && !allowedRoles.includes(authUser.role)) {
    return NextResponse.json(
      { success: false, error: "غير مصرح لك بالوصول إلى هذا القسم. صلاحياتك مقتصرة على مهامك فقط." },
      { status: 403 }
    );
  }

  return authUser;
}
