import { NextRequest, NextResponse } from "next/server";
import { generateGoogleCalendarUrl } from "@/lib/calendar";
import { requireRole } from "@/lib/api-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listDueCalls, logCall } from "@/lib/customers";
import { notifySystemError } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireRole(["sales_rep"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = await createSupabaseServerClient();
    const calls = await listDueCalls(supabase);
    return NextResponse.json({ success: true, calls });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    notifySystemError("/api/calls", message).catch(() => {});
    return NextResponse.json({ success: false, error: "فشل تحميل قائمة المكالمات: " + message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(["sales_rep"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "بيانات الطلب غير صالحة." }, { status: 400 });
    }

    const {
      customerId,
      customerName,
      phone,
      outcome,
      notes,
      nextCallDate,
      nextCallTime,
      repName,
      address,
    } = body;

    if (!customerId || !outcome) {
      return NextResponse.json(
        { error: "العميل ونتيجة المكالمة مطلوبان." },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();
    const log = await logCall(supabase, { customerId, outcome, notes, nextCallDate, nextCallTime });

    let googleCalendarUrl = null;
    if (nextCallDate) {
      googleCalendarUrl = generateGoogleCalendarUrl({
        customerName: customerName || "",
        customerPhone: phone || "",
        startDate: nextCallDate,
        startTime: nextCallTime || "10:00",
        notes: `نتيجة الاتصال السابق: ${outcome} - ${notes || ''}`,
        address: address || "",
        repName: repName || "مبيعات بيتولا",
      });
    }

    return NextResponse.json({
      success: true,
      message: "تم حفظ سجل المكالمة وموعد المتابعة بنجاح.",
      log: {
        id: log.id,
        customerId,
        outcome,
        notes,
        nextCallDate,
        nextCallTime: nextCallTime || "10:00",
        googleCalendarUrl,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    notifySystemError("/api/calls", message).catch(() => {});
    return NextResponse.json({ error: "فشل حفظ سجل المكالمة: " + message }, { status: 400 });
  }
}
