import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createLead, listCustomers } from "@/lib/customers";
import { notifySystemError } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireRole(["sales_rep"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = await createSupabaseServerClient();
    const customers = await listCustomers(supabase);
    return NextResponse.json({ success: true, customers });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    notifySystemError("/api/customers", message).catch(() => {});
    return NextResponse.json({ success: false, error: "فشل تحميل بيانات العملاء: " + message }, { status: 500 });
  }
}

/**
 * The in-app "Add Lead" action in the Customers UI. Distinct from
 * POST /api/leads (the public webhook for n8n/marketing tools, gated by a
 * shared secret): this runs under the staff member's own session, subject
 * to the same customers_insert RLS policy as any other customer creation —
 * a sales_rep creating a lead here is bound by exactly the same rules as
 * one created through an order.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(["sales_rep"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || !body.phone) {
      return NextResponse.json({ success: false, error: "رقم هاتف العميل مطلوب." }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const lead = await createLead(supabase, {
      name: body.name,
      phone: body.phone,
      city: body.city,
      address: body.address,
      notes: body.notes,
      source: body.source,
      repName: body.rep_name,
    });

    return NextResponse.json(
      {
        success: true,
        message: lead.isDuplicate
          ? `العميل مسجل مسبقاً في النظام ومسند للمندوب (${lead.repName}).`
          : `تم تسجيل الليد بنجاح وتحويله آلياً إلى المندوب (${lead.repName}).`,
        lead: { id: lead.id, name: lead.name, phone: lead.phone, rep_name: lead.repName, is_duplicate: lead.isDuplicate },
      },
      { status: lead.isDuplicate ? 200 : 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    notifySystemError("/api/customers", message).catch(() => {});
    return NextResponse.json({ success: false, error: "فشل إنشاء الليد: " + message }, { status: 400 });
  }
}
