import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSecret, WEBHOOK_SECRET_HEADER } from "@/lib/webhook-auth";

const ACTIVE_REPS = ["حمزة", "رحمه", "صابرين", "حنان", "سارة", "حنين"];
let roundRobinIndex = 0;

const MAX_FIELD_LENGTH = 500;

export async function POST(req: NextRequest) {
  try {
    // This endpoint is public (bypassed by middleware.ts) so n8n/marketing
    // tools can reach it without a staff login — the shared secret is the
    // actual gate. CORS is irrelevant here since the caller is a server,
    // not a browser.
    const providedSecret = req.headers.get(WEBHOOK_SECRET_HEADER);
    if (!verifyWebhookSecret(providedSecret, process.env.WEBHOOK_SHARED_SECRET)) {
      return NextResponse.json(
        { error: "غير مصرح. مفتاح الويب هوك مفقود أو غير صحيح." },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "بيانات الطلب غير صالحة." }, { status: 400 });
    }

    const { name, phone, city, address, notes, source, rep_name } = body;

    if (!phone || typeof phone !== "string") {
      return NextResponse.json(
        { error: "رقم هاتف العميل مطلوب لإضافة الليد." },
        { status: 400 }
      );
    }

    const fields = { name, city, address, notes, source, rep_name };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && (typeof value !== "string" || value.length > MAX_FIELD_LENGTH)) {
        return NextResponse.json(
          { error: `الحقل (${key}) غير صالح أو طويل جداً.` },
          { status: 400 }
        );
      }
    }

    // Clean phone number
    const cleanPhone = String(phone).replace(/[^\d+]/g, '').slice(0, 20);

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
