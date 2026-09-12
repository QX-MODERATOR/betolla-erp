import { NextResponse } from "next/server";
import { usernameToEmail, mapSupabaseUserToAuthUser, ROLE_HOME_ROUTES } from "@/lib/auth";
import type { UserRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkLoginRateLimit, recordLoginAttempt, createSupabaseRateLimitStore } from "@/lib/rate-limit";
import { notifyWarning, notifySystemError } from "@/lib/telegram";

export const dynamic = "force-dynamic";

const GENERIC_AUTH_ERROR = "اسم المستخدم أو كلمة المرور غير صحيحة.";

function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rateLimitStore = createSupabaseRateLimitStore();

  try {
    const body = await req.json().catch(() => null);
    const username = typeof body?.username === "string" ? body.username : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: "يرجى إدخال اسم المستخدم وكلمة المرور." },
        { status: 400 }
      );
    }

    const email = usernameToEmail(username);

    // 1. Rate limit BEFORE touching Supabase Auth — both per-account and
    // per-IP, so neither a single account nor a single client can be
    // brute-forced.
    const decision = await checkLoginRateLimit(rateLimitStore, email, ip);
    if (!decision.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "تم إيقاف تسجيل الدخول مؤقتاً بسبب محاولات فاشلة متكررة. يرجى المحاولة لاحقاً.",
        },
        { status: 429, headers: { "Retry-After": String(decision.retryAfterSeconds ?? 900) } }
      );
    }

    // 2. Attempt sign-in via Supabase Auth (bcrypt-hashed credentials,
    // managed entirely by Supabase — this route never sees or stores a
    // password hash itself).
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user) {
      await recordLoginAttempt(rateLimitStore, email, ip, false);
      notifyWarning("Failed Login Attempt", `Login failed for identifier: ${username}`).catch(() => {});
      // Deliberately generic: never reveal whether the account exists.
      return NextResponse.json({ success: false, error: GENERIC_AUTH_ERROR }, { status: 401 });
    }

    const authUser = mapSupabaseUserToAuthUser(data.user);
    if (!authUser) {
      // Account exists in Supabase Auth but is missing required app_metadata
      // (role). Treat as a configuration problem, not a valid session.
      await supabase.auth.signOut();
      await recordLoginAttempt(rateLimitStore, email, ip, false);
      notifySystemError("/api/auth/login", `User ${data.user.id} authenticated but has no valid role in app_metadata.`).catch(() => {});
      return NextResponse.json(
        { success: false, error: "الحساب غير مكتمل الإعداد. يرجى التواصل مع الإدارة." },
        { status: 403 }
      );
    }

    await recordLoginAttempt(rateLimitStore, email, ip, true);

    const redirectUrl = ROLE_HOME_ROUTES[authUser.role as UserRole] || "/";

    // Supabase's own HttpOnly session cookies were already attached to this
    // request's cookie store by createSupabaseServerClient() during
    // signInWithPassword(). We only return the user profile for the UI —
    // never a bearer token, and nothing the client needs to store itself.
    return NextResponse.json({
      success: true,
      user: authUser,
      redirectUrl,
      message: "تم تسجيل الدخول بنجاح",
    });
  } catch (error: unknown) {
    console.error("Authentication Error:", error);
    notifySystemError("/api/auth/login", String(error instanceof Error ? error.message : error)).catch(() => {});
    return NextResponse.json(
      { success: false, error: "حدث خطأ غير متوقع أثناء معالجة تسجيل الدخول." },
      { status: 500 }
    );
  }
}
