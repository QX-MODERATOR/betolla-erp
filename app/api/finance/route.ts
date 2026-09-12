import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";

let invoicesStore = [
  {
    id: "INV-2026-001",
    order_id: "BET-2026-001",
    customer_name: "سدين غنايم",
    customer_phone: "0793937385",
    subtotal: 24.000,
    delivery_fee: 0.000,
    total_amount: 24.000,
    paid_amount: 24.000,
    status: "paid",
    status_label: "مدفوع بالكامل",
    payment_method: "cash_on_delivery",
    issued_date: "2026-09-08",
    due_date: "2026-09-08",
    rep_name: "رحمه",
    items: [
      { name: "شامبو بلازما 500 مل", qty: 2, price: 12.000 },
      { name: "تريتمنت بلازما 100 مل", qty: 1, price: 0.000 }
    ]
  },
  {
    id: "INV-2026-002",
    order_id: "BET-2026-002",
    customer_name: "ربى صبيح",
    customer_phone: "0799193505",
    subtotal: 95.000,
    delivery_fee: 0.000,
    total_amount: 95.000,
    paid_amount: 0.000,
    status: "pending",
    status_label: "قيد التحصيل (قسط شهر)",
    payment_method: "installment",
    issued_date: "2026-09-10",
    due_date: "2026-10-10",
    rep_name: "صابرين",
    items: [
      { name: "بكج مورفوزيس ريستركتشر 250", qty: 3, price: 62.100 },
      { name: "ليف ان مورفوزيس 125 مل", qty: 2, price: 36.000 },
      { name: "عينات سيشتات مجانية", qty: 5, price: 0.000 }
    ]
  },
  {
    id: "INV-2026-003",
    order_id: "BET-2026-003",
    customer_name: "صالون لمسة حرير",
    customer_phone: "0788812345",
    subtotal: 150.000,
    delivery_fee: 0.000,
    total_amount: 150.000,
    paid_amount: 50.000,
    status: "partial",
    status_label: "مدفوع جزئياً",
    payment_method: "cliq",
    issued_date: "2026-09-07",
    due_date: "2026-09-20",
    rep_name: "حنان",
    items: [
      { name: "بروتين ماراكوجا 1 لتر", qty: 1, price: 105.000 },
      { name: "سشوار جاما توربو ستار 2500 واط", qty: 1, price: 45.000 }
    ]
  },
  {
    id: "INV-2026-004",
    order_id: "BET-2026-004",
    customer_name: "صيدلية المقاصد",
    customer_phone: "0770005000",
    subtotal: 180.000,
    delivery_fee: 0.000,
    total_amount: 180.000,
    paid_amount: 180.000,
    status: "paid",
    status_label: "مدفوع بالكامل",
    payment_method: "bank_transfer",
    issued_date: "2026-09-02",
    due_date: "2026-09-05",
    rep_name: "حمزة",
    items: [
      { name: "بكجات بلازما متكاملة", qty: 5, price: 180.000 }
    ]
  }
];

export async function GET() {
  const auth = await requireRole(["finance"]);
  if (auth instanceof NextResponse) return auth;

  const totalInvoiced = invoicesStore.reduce((acc, inv) => acc + inv.total_amount, 0);
  const totalCollected = invoicesStore.reduce((acc, inv) => acc + inv.paid_amount, 0);
  const totalReceivables = totalInvoiced - totalCollected;

  return NextResponse.json({
    status: "active",
    summary: {
      total_invoiced_jd: totalInvoiced,
      total_collected_jd: totalCollected,
      total_receivables_jd: totalReceivables,
      collection_rate_percent: Math.round((totalCollected / totalInvoiced) * 100),
      overdue_count: 1,
    },
    invoices: invoicesStore,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(["finance"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const { invoice_id, amount, payment_method, reference_number, notes } = body;

    if (!invoice_id || !amount) {
      return NextResponse.json(
        { error: "رقم الفاتورة والمبلغ المدفوع حقول مطلوبة." },
        { status: 400 }
      );
    }

    const payAmount = Number(amount);
    let targetInvoice = invoicesStore.find(i => i.id === invoice_id);

    if (!targetInvoice) {
      return NextResponse.json(
        { error: "لم يتم العثور على الفاتورة المطلوبة." },
        { status: 404 }
      );
    }

    targetInvoice.paid_amount += payAmount;
    if (targetInvoice.paid_amount >= targetInvoice.total_amount) {
      targetInvoice.status = "paid";
      targetInvoice.status_label = "مدفوع بالكامل";
    } else {
      targetInvoice.status = "partial";
      targetInvoice.status_label = "مدفوع جزئياً";
    }

    return NextResponse.json({
      success: true,
      message: `تم تسجيل سند القبض بمبلغ (${payAmount} د.أ) بنجاح للفاتورة (${invoice_id}).`,
      invoice: targetInvoice,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "فشل تسجيل الدفعة: " + String(error) },
      { status: 500 }
    );
  }
}
