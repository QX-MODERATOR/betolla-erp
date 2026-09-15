import { NextResponse } from "next/server";
import { extractTokenFromRequest, verifyAuthToken } from "@/lib/auth";
import { getAllProfilesServer, updateProfileServer } from "@/lib/profile-server";

export const dynamic = "force-dynamic";

async function requireAuth(req: Request) {
  const token = extractTokenFromRequest(req);
  if (!token) return null;
  return verifyAuthToken(token);
}

export async function GET(req: Request) {
  const user = await requireAuth(req);
  if (!user) {
    return NextResponse.json({ success: false, error: "يرجى تسجيل الدخول." }, { status: 401 });
  }

  try {
    const profiles = await getAllProfilesServer();
    return NextResponse.json({ success: true, profiles }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "تعذر تحميل البيانات." },
      { status: 503 }
    );
  }
}

export async function PATCH(req: Request) {
  const user = await requireAuth(req);
  if (!user) {
    return NextResponse.json({ success: false, error: "يرجى تسجيل الدخول." }, { status: 401 });
  }

  let body: { username?: unknown; updates?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "بيانات الطلب غير صالحة." }, { status: 400 });
  }

  const target = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  if (!target) {
    return NextResponse.json({ success: false, error: "اسم المستخدم مطلوب." }, { status: 400 });
  }

  const isAdmin =
    user.role === "admin" ||
    user.role === "general_manager" ||
    user.username.toLowerCase() === "admin" ||
    user.username.toLowerCase() === "gm";

  if (!isAdmin && user.username.toLowerCase() !== target) {
    return NextResponse.json({ success: false, error: "لا تملك صلاحية تعديل هذا الملف الشخصي." }, { status: 403 });
  }

  const updates = body.updates && typeof body.updates === "object" ? (body.updates as Record<string, unknown>) : {};
  const sanitized: Record<string, string> = {};
  for (const key of ["name", "phone", "whatsapp", "email", "city", "bio", "avatar", "avatarColor"] as const) {
    const value = updates[key];
    if (typeof value === "string") sanitized[key] = value;
  }

  try {
    const profile = await updateProfileServer(target, sanitized);
    return NextResponse.json({ success: true, profile });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "تعذر حفظ التعديلات." },
      { status: 503 }
    );
  }
}
