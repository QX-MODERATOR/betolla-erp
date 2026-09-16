import { NextResponse } from "next/server";
import { extractTokenFromRequest, verifyAuthToken } from "@/lib/auth";
import { verifyUserPassword, setUserPassword } from "@/lib/auth-password";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const token = extractTokenFromRequest(req);
  const user = token ? await verifyAuthToken(token) : null;
  if (!user) {
    return NextResponse.json({ success: false, error: "يرجى تسجيل الدخول أولاً." }, { status: 401 });
  }
  try {
    const body = await req.json();
    const { username, currentPassword, newPassword } = body ?? {};

    if (typeof username !== "string" || typeof currentPassword !== "string" ||
        typeof newPassword !== "string" || !username || !currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, error: "يرجى تعبئة كافة حقول كلمة المرور." },
        { status: 400 }
      );
    }

    if (username.trim().toLowerCase() !== user.username) {
      return NextResponse.json({ success: false, error: "لا يمكنك تغيير كلمة مرور حساب آخر." }, { status: 403 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { success: false, error: "كلمة المرور الجديدة يجب أن تكون 6 أحرف أو أرقام على الأقل." },
        { status: 400 }
      );
    }

    // Verify current password
    const isCurrentValid = await verifyUserPassword(user.username, currentPassword);
    if (!isCurrentValid) {
      return NextResponse.json(
        { success: false, error: "كلمة المرور الحالية غير صحيحة. يرجى التأكد وإعادة المحاولة." },
        { status: 401 }
      );
    }

    // Set new password — persisted to the database; do not report success if it wasn't saved.
    const saved = await setUserPassword(user.username, newPassword);
    if (!saved) {
      return NextResponse.json(
        { success: false, error: "تعذر حفظ كلمة المرور الجديدة في قاعدة البيانات. حاول مرة أخرى." },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "تم تحديث كلمة المرور بنجاح.",
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "حدث خطأ غير متوقع أثناء تحديث كلمة المرور." },
      { status: 500 }
    );
  }
}
