import { NextRequest, NextResponse } from "next/server";
import { generateGoogleCalendarUrl } from "@/lib/calendar";
import { requireRole } from "@/lib/api-auth";

export async function POST(req: NextRequest) {
  const auth = await requireRole(["sales_rep"]);
  if (auth instanceof NextResponse) return auth;

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
        { status: 400 }
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

    return NextResponse.json({
      success: true,
      message: "تم حفظ سجل المكالمة وموعد المتابعة بنجاح.",
      log: logEntry,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "فشل حفظ سجل المكالمة: " + String(error) },
      { status: 500 }
    );
  }
}
