import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

// In-memory payment supplements for instant live sync
let paymentRecords: Record<string, { paid_amount: number; status: string; payments: any[] }> = {};

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data: orders, error } = await supabase
      .from("orders")
      .select("*, customers(id, name, phone, city, address)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching finance data from Supabase:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: NO_CACHE_HEADERS });
    }

    const invoices = (orders || []).map((o, idx) => {
      const notes = o.notes || "";
      let repName = "مبيعات";
      const repMatch = notes.match(/\[المندوب:\s*([^\]]+)\]/);
      if (repMatch) repName = repMatch[1].trim();

      let items = [
        { name: "منتجات العناية بالبشرة والشعر من بيتولا", qty: 1, price: Number(o.total_amount) || 0, total: Number(o.total_amount) || 0 }
      ];
      const prodMatch = notes.match(/\[المنتجات:\s*([^\]]+)\]/);
      if (prodMatch) {
        items = [{ name: prodMatch[1].trim(), qty: 1, price: Number(o.total_amount) || 0, total: Number(o.total_amount) || 0 }];
      }

      const totalAmount = Number(o.total_amount) || 0;
      const orderId = o.order_number || o.id;
      const invoiceId = `INV-${orderId.replace("BET-", "")}`;

      // Live paid status from Supabase payment_status or delivery
      let basePaid = 0;
      if (o.payment_status === "paid" || o.status === "delivered") {
        basePaid = totalAmount;
      }

      const supplemented = paymentRecords[invoiceId] || paymentRecords[orderId];
      const paidAmount = supplemented ? supplemented.paid_amount : basePaid;

      let status = "pending";
      let statusLabel = "قيد التحصيل";

      if (paidAmount >= totalAmount && totalAmount > 0) {
        status = "paid";
        statusLabel = "مدفوع بالكامل";
      } else if (paidAmount > 0) {
        status = "partial";
        statusLabel = "مدفوع جزئياً";
      }

      return {
        id: invoiceId,
        order_id: orderId,
        dbId: o.id,
        customer_name: o.customers?.name || "عميل بيتولا",
        customer_phone: o.customers?.phone || "0790000000",
        city: o.delivery_city || o.customers?.city || "عمان",
        subtotal: totalAmount,
        discount: 0,
        delivery_fee: Number(o.delivery_fee) || 0,
        total_amount: totalAmount,
        paid_amount: paidAmount,
        status,
        status_label: statusLabel,
        payment_method: o.payment_method || "cash_on_delivery",
        issued_date: o.order_date || o.created_at?.split("T")[0] || "2026-09-12",
        due_date: o.order_date || o.created_at?.split("T")[0] || "2026-09-12",
        rep_name: repName,
        items,
      };
    });

    const totalInvoiced = invoices.reduce((acc, inv) => acc + inv.total_amount, 0);
    const totalCollected = invoices.reduce((acc, inv) => acc + inv.paid_amount, 0);
    const totalReceivables = totalInvoiced - totalCollected;

    return NextResponse.json(
      {
        status: "active",
        summary: {
          total_invoiced_jd: totalInvoiced,
          total_collected_jd: totalCollected,
          total_receivables_jd: totalReceivables,
          collection_rate_percent: totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 100) : 0,
          overdue_count: invoices.filter((i) => i.status === "pending").length,
        },
        invoices,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error: any) {
    console.error("Error in GET /api/finance:", error);
    return NextResponse.json(
      { success: false, error: String(error?.message || error) },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { invoice_id, order_id, amount, payment_method, reference_number, notes } = body;

    if ((!invoice_id && !order_id) || !amount) {
      return NextResponse.json(
        { error: "رقم الفاتورة والمبلغ المدفوع حقول مطلوبة." },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const payAmount = Number(amount);
    const key = invoice_id || order_id;

    // Record payment locally & update order payment_status in Supabase
    const supabase = createServerClient();
    const current = paymentRecords[key] || { paid_amount: 0, status: "pending", payments: [] };
    current.paid_amount += payAmount;
    current.payments.push({
      amount: payAmount,
      method: payment_method || "cliq",
      ref: reference_number || "",
      notes: notes || "",
      created_at: new Date().toISOString(),
    });
    paymentRecords[key] = current;

    // Also update order if matching order_number
    const orderNumber = order_id || invoice_id.replace("INV-", "BET-");
    await supabase
      .from("orders")
      .update({
        payment_status: "paid",
        notes: `[سند قبض: ${payAmount} د.أ - مرجع: ${reference_number || "CliQ"}]`,
        updated_at: new Date().toISOString(),
      })
      .eq("order_number", orderNumber);

    return NextResponse.json(
      {
        success: true,
        message: `تم تسجيل سند القبض بمبلغ (${payAmount} د.أ) بنجاح في قاعدة البيانات للفاتورة (${key}).`,
        payment: current,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: "فشل تسجيل الدفعة: " + String(error?.message || error) },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
