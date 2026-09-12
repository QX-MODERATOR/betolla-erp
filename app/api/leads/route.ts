import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSecret, WEBHOOK_SECRET_HEADER } from "@/lib/webhook-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createLead } from "@/lib/customers";

const ACTIVE_REPS = ["حمزة", "رحمه", "صابرين", "حنان", "سارة", "حنين"];
const MAX_FIELD_LENGTH = 500;

export async function POST(req: NextRequest) {
  try {
    // This endpoint is the PUBLIC external webhook (n8n, Meta Lead Ads,
    // marketing tools) — bypassed by middleware.ts, gated by the shared
    // secret instead of a staff session. CORS is irrelevant here since the
    // caller is a server, not a browser. The in-app "Add Lead" button in
    // the Customers UI does NOT call this route — it has no webhook secret
    // to send — it calls POST /api/customers instead, which runs the same
    // lib/customers.ts createLead() logic under the staff member's own
    // authenticated session.
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

    // No staff session exists for an external webhook call, so this runs
    // via the service role (bypasses RLS) — the shared secret above is the
    // authorization check, not the caller's own permissions.
    const supabase = getSupabaseAdminClient();
    const lead = await createLead(supabase, { name, phone, city, address, notes, source, repName: rep_name });

    return NextResponse.json(
      {
        success: true,
        message: lead.isDuplicate
          ? `العميل مسجل مسبقاً في النظام ومسند للمندوب (${lead.repName}).`
          : `تم تسجيل الليد بنجاح وتحويله آلياً إلى المندوب (${lead.repName}) دون الحاجة لطباعة أوراق.`,
        lead: { id: lead.id, name: lead.name, phone: lead.phone, rep_name: lead.repName, is_duplicate: lead.isDuplicate },
      },
      { status: lead.isDuplicate ? 200 : 201 }
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
