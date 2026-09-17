import { NextResponse } from "next/server";
import { securityRpc } from "@/lib/session";
import { extractTokenFromRequest, verifyAuthToken } from "@/lib/auth";
import {
  findAccount, checkAccountPassword, storeAccountPassword, loginLockRemaining, recordFailedLogin,
  clearFailedLogins, lockMessage, sessionCookie, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH,
} from "@/lib/auth-server";

export const dynamic = "force-dynamic";

// Changes the signed-in user's own password. The new password is stored hashed in the database,
// every other session of the account is ended, and this device gets a fresh session.
export async function POST(req: Request) {
  const token = extractTokenFromRequest(req);
  const user = token ? await verifyAuthToken(token) : null;
  if (!user) {
    return NextResponse.json({ success: false, error: "يرجى تسجيل الدخول أولاً." }, { status: 401 });
  }
  try {
    let body: Record<string, unknown> | null = null;
    try { body = await req.json(); } catch { /* handled below */ }
    const { username, currentPassword, newPassword } = body ?? {};

    if (typeof username !== "string" || typeof currentPassword !== "string" ||
        typeof newPassword !== "string" || !username || !currentPassword || !newPassword) {
      return NextResponse.json({ success: false, error: "يرجى تعبئة كافة حقول كلمة المرور." }, { status: 400 });
    }

    const account = findAccount(username);
    if (!account || account.profile.id !== user.id) {
      return NextResponse.json({ success: false, error: "لا يمكنك تغيير كلمة مرور حساب آخر." }, { status: 403 });
    }

    if (newPassword.length < PASSWORD_MIN_LENGTH || newPassword.length > PASSWORD_MAX_LENGTH ||
        !/[A-Za-z؀-ۿ]/.test(newPassword) || !/\d/.test(newPassword)) {
      return NextResponse.json(
        { success: false, error: `كلمة المرور الجديدة يجب أن تكون ${PASSWORD_MIN_LENGTH} خانات على الأقل وتحتوي على حروف وأرقام.` },
        { status: 400 }
      );
    }
    if (newPassword === currentPassword) {
      return NextResponse.json({ success: false, error: "اختر كلمة مرور مختلفة عن الحالية." }, { status: 400 });
    }

    // Wrong current passwords count toward the same lockout as the login form.
    const locked = await loginLockRemaining(account);
    if (locked > 0) return NextResponse.json({ success: false, error: lockMessage(locked) }, { status: 429 });
    const check = await checkAccountPassword(account, currentPassword);
    if (check === "unavailable") {
      return NextResponse.json({ success: false, error: "تعذر التحقق الآن. أعد المحاولة بعد قليل." }, { status: 503 });
    }
    if (check !== "ok") {
      await recordFailedLogin(account, account.profile.username);
      return NextResponse.json(
        { success: false, error: "كلمة المرور الحالية غير صحيحة. يرجى التأكد وإعادة المحاولة." },
        { status: 401 }
      );
    }

    const stored = await storeAccountPassword(account, newPassword);
    if (stored !== "ok") {
      return NextResponse.json(
        { success: false, error: stored === "unsupported"
          ? "تغيير كلمة المرور غير مفعّل بعد على الخادم. تواصل مع مسؤول النظام."
          : "تعذر حفظ كلمة المرور الجديدة. لم يتغير شيء، أعد المحاولة." },
        { status: 503 }
      );
    }
    await clearFailedLogins(account);
    // Signed-out devices must stop receiving this account's notifications; this device re-registers.
    await securityRpc("business_push_unregister_account", { p_account: account.profile.id });

    const response = NextResponse.json({
      success: true,
      message: "تم تحديث كلمة المرور بنجاح. تم تسجيل الخروج من الأجهزة الأخرى.",
    });
    response.cookies.set(await sessionCookie(req, account));
    return response;
  } catch {
    return NextResponse.json({ success: false, error: "حدث خطأ غير متوقع أثناء تحديث كلمة المرور." }, { status: 500 });
  }
}
