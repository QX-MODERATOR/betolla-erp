import { NextResponse } from "next/server";
import { verifyUserPassword, setUserPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { username, currentPassword, newPassword } = body;

    if (!username || !currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, error: "يرجى تعبئة كافة حقول كلمة المرور." },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { success: false, error: "كلمة المرور الجديدة يجب أن تكون 6 أحرف أو أرقام على الأقل." },
        { status: 400 }
      );
    }

    // Verify current password
    const isCurrentValid = verifyUserPassword(username, currentPassword);
    if (!isCurrentValid) {
      return NextResponse.json(
        { success: false, error: "كلمة المرور الحالية غير صحيحة. يرجى التأكد وإعادة المحاولة." },
        { status: 401 }
      );
    }

    // Set new password
    setUserPassword(username, newPassword);

    return NextResponse.json({
      success: true,
      message: "تم تحديث كلمة المرور بنجاح.",
    });
  } catch (error: any) {
    console.error("Password update error:", error);
    return NextResponse.json(
      { success: false, error: "حدث خطأ غير متوقع أثناء تحديث كلمة المرور." },
      { status: 500 }
    );
  }
}
