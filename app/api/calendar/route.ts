import { NextRequest, NextResponse } from "next/server";
import { generateGoogleCalendarUrl, verifyGoogleCalendarApiKey } from "@/lib/calendar";
import { requireRole } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireRole(["sales_rep"]);
  if (auth instanceof NextResponse) return auth;

  const status = await verifyGoogleCalendarApiKey();
  return NextResponse.json({
    status: status.valid ? "active" : "configuration_needed",
    message: status.message,
    timestamp: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(["sales_rep"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const { customerName, customerPhone, startDate, startTime, notes, address, repName } = body;

    if (!customerName || !startDate) {
      return NextResponse.json(
        { error: "اسم العميل وتاريخ المتابعة مطلوبان لتوليد موعد التقويم." },
        { status: 400 }
      );
    }

    const calendarUrl = generateGoogleCalendarUrl({
      customerName,
      customerPhone: customerPhone || "",
      startDate,
      startTime: startTime || "10:00",
      notes,
      address,
      repName,
    });

    return NextResponse.json({
      success: true,
      calendarUrl,
      event: {
        customerName,
        customerPhone,
        startDate,
        startTime: startTime || "10:00",
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: "حدث خطأ أثناء معالجة طلب التقويم: " + String(error) },
      { status: 500 }
    );
  }
}
