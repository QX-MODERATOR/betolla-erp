import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listInvoices, recordInvoicePayment } from "@/lib/finance";
import { notifySystemError } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireRole(["finance"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = await createSupabaseServerClient();
    const invoices = await listInvoices(supabase);

    const totalInvoiced = invoices.reduce((acc, inv) => acc + inv.total_amount, 0);
    const totalCollected = invoices.reduce((acc, inv) => acc + inv.paid_amount, 0);
    const totalReceivables = totalInvoiced - totalCollected;
    const overdueCount = invoices.filter(
      (inv) => inv.status !== "paid" && new Date(inv.due_date) < new Date()
    ).length;

    return NextResponse.json({
      status: "active",
      summary: {
        total_invoiced_jd: totalInvoiced,
        total_collected_jd: totalCollected,
        total_receivables_jd: totalReceivables,
        collection_rate_percent: totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 100) : 0,
        overdue_count: overdueCount,
      },
      invoices,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    notifySystemError("/api/finance", message).catch(() => {});
    return NextResponse.json({ error: "فشل تحميل البيانات المالية: " + message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(["finance"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "بيانات الطلب غير صالحة." }, { status: 400 });
    }
    const { invoice_id, amount, payment_method, reference_number, notes } = body;
    if (!invoice_id || !amount) {
      return NextResponse.json({ error: "رقم الفاتورة والمبلغ المدفوع حقول مطلوبة." }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const result = await recordInvoicePayment(supabase, { invoice_id, amount, payment_method, reference_number, notes });

    return NextResponse.json({
      success: true,
      message: `تم تسجيل سند القبض بمبلغ (${Number(amount).toFixed(3)} د.أ) بنجاح للفاتورة (${invoice_id}).`,
      status: result.status,
      paid_amount: result.paidAmount,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    notifySystemError("/api/finance", message).catch(() => {});
    return NextResponse.json({ error: "فشل تسجيل الدفعة: " + message }, { status: 400 });
  }
}
