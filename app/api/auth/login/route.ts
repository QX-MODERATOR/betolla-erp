import { NextResponse } from "next/server";
import { decryptPayload, EncryptedPackage } from "@/lib/security";
import { authenticateUser, signAuthToken, AUTH_COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    let credentials: { username?: string; password?: string } = {};

    // 1. Decrypt incoming encrypted payload package
    if (body && body.ciphertext && body.iv && body.ts) {
      try {
        credentials = await decryptPayload(body as EncryptedPackage);
      } catch (err: any) {
        console.error("Payload decryption failure:", err?.message);
        return NextResponse.json(
          {
            success: false,
            error: "فشل فك تشفير البيانات المشفرة أو انتهت صلاحية الطلب (حماية ضد هجمات Replay).",
          },
          { status: 400 }
        );
      }
    } else if (body && body.username && body.password) {
      // Fallback for direct plain API tests if necessary, but log warning
      credentials = body;
    } else {
      return NextResponse.json(
        { success: false, error: "بيانات الطلب غير صالحة أو غير مشفرة بشكل سليم." },
        { status: 400 }
      );
    }

    const { username, password } = credentials;

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: "يرجى إدخال اسم المستخدم وكلمة المرور." },
        { status: 400 }
      );
    }

    const userProfile = authenticateUser(username, password);

    if (!userProfile) {
      return NextResponse.json(
        { success: false, error: "اسم المستخدم أو كلمة المرور غير صحيحة." },
        { status: 401 }
      );
    }

    // 2. Generate signed JWT token
    const token = await signAuthToken(userProfile);

    // 3. Prepare response with JSON payload and secure HttpOnly cookie
    const redirectUrl = userProfile.role === "sales_rep" ? "/sales" : "/";
    const response = NextResponse.json({
      success: true,
      token,
      user: userProfile,
      redirectUrl,
      message: "تم تسجيل الدخول بنجاح",
    });

    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (error: any) {
    console.error("Authentication Error:", error);
    return NextResponse.json(
      { success: false, error: "حدث خطأ غير متوقع أثناء معالجة تسجيل الدخول." },
      { status: 500 }
    );
  }
}
