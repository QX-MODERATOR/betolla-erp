import { NextResponse } from "next/server";
import { safeReturnPath } from "@/lib/auth";
import {
  findAccount, checkAccountPassword, loginLockRemaining, recordFailedLogin, clearFailedLogins,
  lockMessage, sessionCookie, PASSWORD_MAX_LENGTH,
} from "@/lib/auth-server";
import { notifySystemError } from "@/lib/telegram";

export const dynamic = "force-dynamic";

const WRONG = "اسم المستخدم أو كلمة المرور غير صحيحة.";

export async function POST(req: Request) {
  try {
    let body: Record<string, unknown> | null = null;
    try { body = await req.json(); } catch { /* handled below */ }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "بيانات الطلب غير صالحة." }, { status: 400 });
    }
    // Older login pages sent an "encrypted" package; the connection itself (HTTPS) is the protection.
    if ("ciphertext" in body) {
      return NextResponse.json({ success: false, error: "تم تحديث صفحة الدخول. حدّث الصفحة ثم أعد المحاولة." }, { status: 400 });
    }
    const { username, password, from } = body;
    if (typeof username !== "string" || typeof password !== "string" || !username.trim() || !password ||
        username.length > 100 || password.length > PASSWORD_MAX_LENGTH) {
      return NextResponse.json({ success: false, error: "يرجى إدخال اسم المستخدم وكلمة المرور." }, { status: 400 });
    }

    const account = findAccount(username);
    const locked = await loginLockRemaining(account);
    if (locked > 0) {
      return NextResponse.json({ success: false, error: lockMessage(locked) }, { status: 429, headers: { "Retry-After": String(locked) } });
    }

    const check = account ? await checkAccountPassword(account, password) : "wrong";
    if (check === "unavailable") {
      return NextResponse.json({ success: false, error: "تعذر التحقق من الحساب الآن. أعد المحاولة بعد قليل." }, { status: 503 });
    }
    if (check !== "ok" || !account) {
      const { locked: nowLocked } = await recordFailedLogin(account, username.trim());
      return nowLocked
        ? NextResponse.json({ success: false, error: lockMessage(15 * 60) }, { status: 429 })
        : NextResponse.json({ success: false, error: WRONG }, { status: 401 });
    }

    await clearFailedLogins(account);
    const user = account.profile;
    // The token is only in the httpOnly cookie; the page gets the profile, never the token.
    const response = NextResponse.json({
      success: true,
      user,
      redirectUrl: safeReturnPath(user.role, from),
      message: "تم تسجيل الدخول بنجاح",
    });
    response.cookies.set(await sessionCookie(req, account));
    return response;
  } catch (error: unknown) {
    console.error("Authentication Error:", error);
    notifySystemError("/api/auth/login", String((error as Error)?.message || error)).catch(() => {});
    return NextResponse.json({ success: false, error: "حدث خطأ غير متوقع أثناء معالجة تسجيل الدخول." }, { status: 500 });
  }
}
