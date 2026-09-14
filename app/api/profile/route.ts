import { NextRequest, NextResponse } from "next/server";
import {
  getAllProfilesServer,
  getProfileServer,
  updateProfileServer,
  UserProfile,
} from "@/lib/profile-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get("username");

    if (username) {
      const profile = getProfileServer(username);
      if (!profile) {
        return NextResponse.json(
          { success: false, error: "المستخدم غير موجود" },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, profile });
    }

    const profiles = getAllProfilesServer();
    return NextResponse.json({ success: true, profiles });
  } catch (error: any) {
    console.error("Profile GET Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "فشل جلب بيانات الملفات الشخصية" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, updates } = body;

    if (!username || typeof username !== "string") {
      return NextResponse.json(
        { success: false, error: "اسم المستخدم مطلوب للتحديث" },
        { status: 400 }
      );
    }

    if (!updates || typeof updates !== "object") {
      return NextResponse.json(
        { success: false, error: "بيانات التحديث غير صالحة" },
        { status: 400 }
      );
    }

    const updatedProfile = updateProfileServer(username, updates);

    return NextResponse.json({
      success: true,
      profile: updatedProfile,
      message: "تم حفظ وتحديث بيانات الملف الشخصي بنجاح",
    });
  } catch (error: any) {
    console.error("Profile PATCH Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "حدث خطأ أثناء حفظ الملف الشخصي" },
      { status: 500 }
    );
  }
}
