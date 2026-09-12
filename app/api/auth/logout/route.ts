import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createSupabaseServerClient();

  // Revokes the refresh token server-side (not just clearing the cookie),
  // so a stolen cookie can't be replayed after the user logs out.
  await supabase.auth.signOut();

  return NextResponse.json({
    success: true,
    message: "تم تسجيل الخروج بنجاح",
  });
}
