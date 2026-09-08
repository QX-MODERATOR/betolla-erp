import { NextRequest, NextResponse } from "next/server";

const ACTIVE_REPS = ["حمزة", "رحمه", "صابرين", "حنان", "سارة", "حنين"];
let roundRobinIndex = 0;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, phone, city, address, notes, source, rep_name } = body;

    if (!phone) {
      return NextResponse.json(
        { error: "رقم هاتف العميل مطلوب لإضافة الليد." },
        { status: 400 }
      );
    }

    // Clean phone number
    const cleanPhone = String(phone).replace(/[^\d+]/g, '');

    // Auto-assign rep if not specified
    let assignedRep = rep_name;
    if (!assignedRep || assignedRep === "auto") {
      assignedRep = ACTIVE_REPS[roundRobinIndex % ACTIVE_REPS.length];
      roundRobinIndex++;
    }

    const newLead = {
      id: `LEAD-${Date.now()}`,
      name: name || "عميل محتمل جديد",
      phone: cleanPhone,
      city: city || "عمان",
      address: address || "",
      notes: notes || "تم استلام الرقم آلياً من قسم التسويق / n8n",
      lead_source: source || "marketing_automation",
      rep_name: assignedRep,
      status: "new",
      created_at: new Date().toISOString(),
    };

    // Return success response for n8n or webhooks
    return NextResponse.json(
      {
        success: true,
        message: `تم تسجيل الليد بنجاح وتحويله آلياً إلى المندوب (${assignedRep}) دون الحاجة لطباعة أوراق.`,
        lead: newLead,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "فشل استلام الليد: " + String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "active",
    endpoint: "/api/leads",
    description: "نقطة استقبال الليدات الآلية لربط التسويق ونظام n8n بـ Betolla ERP",
    activeReps: ACTIVE_REPS,
    supportedFields: ["name", "phone", "city", "address", "notes", "source", "rep_name"]
  });
}
