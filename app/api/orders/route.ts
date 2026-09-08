import { NextRequest, NextResponse } from "next/server";
import { parseWhatsAppOrderText } from "@/lib/order-parser";

let orderCounter = 100;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    let orderData;

    // Case 1: Raw WhatsApp Text provided (Webhook from n8n or copy-pasted in UI)
    if (body.rawText) {
      const parsed = parseWhatsAppOrderText(body.rawText);
      orderCounter++;
      orderData = {
        id: `BET-2026-${orderCounter}`,
        customer_name: parsed.customerName,
        customer_phone: parsed.phone,
        city: parsed.city,
        address: parsed.address,
        items: parsed.items,
        items_summary: parsed.itemsSummary,
        total_amount: parsed.totalAmount,
        rep_name: parsed.repName,
        source: parsed.source,
        payment_method: parsed.paymentMethod,
        installment_notes: parsed.installmentNotes,
        status: parsed.isReservation ? "draft" : "confirmed",
        order_date: new Date().toISOString().split('T')[0],
        raw_whatsapp_text: parsed.rawText,
        created_at: new Date().toISOString(),
      };
    } 
    // Case 2: Structured order payload
    else {
      orderCounter++;
      orderData = {
        id: `BET-2026-${orderCounter}`,
        customer_name: body.customer_name || "عميل مباشر",
        customer_phone: body.customer_phone || "",
        city: body.city || "عمان",
        address: body.address || "",
        items_summary: body.items_summary || "منتجات تجميل",
        total_amount: Number(body.total_amount) || 0,
        rep_name: body.rep_name || "مبيعات",
        source: body.source || "manual",
        payment_method: body.payment_method || "cash_on_delivery",
        status: body.status || "confirmed",
        order_date: body.order_date || new Date().toISOString().split('T')[0],
        created_at: new Date().toISOString(),
      };
    }

    return NextResponse.json(
      {
        success: true,
        message: `تم إنشاء الطلب بنجاح برقم (${orderData.id}).`,
        order: orderData,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "فشل إنشاء الطلب: " + String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "active",
    endpoint: "/api/orders",
    description: "محرك استقبال ومعالجة الطلبات الرسمية وطلبات الواتساب لـ Betolla ERP",
  });
}
