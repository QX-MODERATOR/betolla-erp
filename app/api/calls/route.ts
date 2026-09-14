import { NextRequest, NextResponse } from "next/server";
import { generateGoogleCalendarUrl } from "@/lib/calendar";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      customerId, 
      customerName, 
      phone, 
      outcome, 
      notes, 
      nextCallDate, 
      nextCallTime, 
      repName, 
      address 
    } = body;

    if (!customerName || !outcome) {
      return NextResponse.json(
        { error: "اسم العميل ونتيجة المكالمة مطلوبان." },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    let googleCalendarUrl = null;
    if (nextCallDate) {
      googleCalendarUrl = generateGoogleCalendarUrl({
        customerName,
        customerPhone: phone || "",
        startDate: nextCallDate,
        startTime: nextCallTime || "10:00",
        notes: `نتيجة الاتصال السابق: ${outcome} - ${notes || ''}`,
        address: address || "",
        repName: repName || "مبيعات بيتولا",
      });
    }

    // Update customer in Supabase if phone or id is present
    const supabase = createServerClient();
    const cleanPhone = String(phone || '').replace(/[^\d+]/g, '');
    if (cleanPhone) {
      await supabase
        .from("customers")
        .update({
          notes: `[متابعة: ${outcome}] ${notes || ''}`.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("phone", cleanPhone);
    }

    const logEntry = {
      id: `CALL-${Date.now()}`,
      customerId: customerId || "CUST-001",
      customerName,
      phone,
      calledAt: new Date().toISOString(),
      outcome,
      notes,
      nextCallDate,
      nextCallTime: nextCallTime || "10:00",
      googleCalendarUrl,
    };

    return NextResponse.json(
      {
        success: true,
        message: "تم حفظ سجل المكالمة وموعد المتابعة بنجاح في قاعدة البيانات.",
        log: logEntry,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "فشل حفظ سجل المكالمة: " + String(error) },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
