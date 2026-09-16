import { NextResponse } from "next/server";
import { extractTokenFromRequest, verifyAuthToken } from "@/lib/auth";
import { getAllProfilesServer, updateProfileServer } from "@/lib/profile-server";
import { can } from "@/lib/permissions";
import type { UserProfile } from "@/lib/profile-store";

// What any colleague may see about another account. Contact details and bio are private to the
// account itself and to management/HR.
function publicProfile(p: UserProfile): UserProfile {
  return { id: p.id, username: p.username, name: p.name, role: p.role, repId: p.repId, avatar: p.avatar, avatarColor: p.avatarColor };
}

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
    const all = await getAllProfilesServer();
    const seeAll = can(user.role, "profiles.viewPrivate");
    const profiles = Object.fromEntries(Object.entries(all).map(([id, p]) => [id, seeAll || id === user.id ? p : publicProfile(p)]));
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

  let body: { id?: unknown; updates?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "بيانات الطلب غير صالحة." }, { status: 400 });
  }

  const target = typeof body.id === "string" ? body.id.trim() : "";
  if (!target) {
    return NextResponse.json({ success: false, error: "معرّف الحساب مطلوب." }, { status: 400 });
  }

  const isAdmin = user.role === "admin" || user.role === "general_manager";

  if (!isAdmin && user.id !== target) {
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
