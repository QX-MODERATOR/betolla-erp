import { NextResponse } from "next/server";
import { extractTokenFromRequest, verifyAuthToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = extractTokenFromRequest(req);

  if (!token) {
    return NextResponse.json(
      { success: false, error: "لم يتم العثور على رمز المصادقة (Token missing)." },
      { status: 401 }
    );
  }

  const user = await verifyAuthToken(token);

  if (!user) {
    return NextResponse.json(
      { success: false, error: "جلسة العمل منتهية أو الرمز غير صالح." },
      { status: 401 }
    );
  }

  return NextResponse.json({
    success: true,
    user,
  });
}
