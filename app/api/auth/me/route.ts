import { NextResponse } from "next/server";
import { mapSupabaseUserToAuthUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: "جلسة العمل منتهية أو غير موجودة." },
      { status: 401 }
    );
  }

  const authUser = mapSupabaseUserToAuthUser(user);
  if (!authUser) {
    return NextResponse.json(
      { success: false, error: "حساب غير مكتمل الإعداد." },
      { status: 403 }
    );
  }

  return NextResponse.json({
    success: true,
    user: authUser,
  });
}
