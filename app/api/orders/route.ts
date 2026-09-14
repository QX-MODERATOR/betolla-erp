import { NextRequest, NextResponse } from "next/server";
import { parseWhatsAppOrderText } from "@/lib/order-parser";
import { notifyNewOrder, notifySystemError } from "@/lib/telegram";
import { createServerClient } from "@/lib/supabase/server";
import { createLiveOrder, updateLiveOrderStatus } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const { data: orders, error } = await supabase
      .from("orders")
      .select("*, customers(id, name, phone, city, address)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching orders from Supabase:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: NO_CACHE_HEADERS });
    }

    const formattedOrders = (orders || []).map((o) => {
      const notes = o.notes || "";
      let itemsSummary = "منتجات العناية بالبشرة والشعر من بيتولا";
      const prodMatch = notes.match(/\[المنتجات:\s*([^\]]+)\]/);
      if (prodMatch) itemsSummary = prodMatch[1].trim();
      else if (notes && !notes.includes("[")) itemsSummary = notes;

      return {
        id: o.order_number || o.id,
        dbId: o.id,
        customer_name: o.customers?.name || "عميل بيتولا",
        customer_phone: o.customers?.phone || "0790000000",
        city: o.delivery_city || o.customers?.city || "عمان",
        address: o.delivery_address || o.customers?.address || "",
        items_summary: itemsSummary,
        total_amount: Number(o.total_amount) || 0,
        source: o.source || "sales",
        status: o.status || "confirmed",
        order_date: o.order_date || o.created_at?.split("T")[0],
        payment_method: o.payment_method || "cash_on_delivery",
        notes: o.notes,
        created_at: o.created_at,
      };
    });

    return NextResponse.json(
      {
        success: true,
        orders: formattedOrders,
        count: formattedOrders.length,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error: any) {
    console.error("Error in GET /api/orders:", error);
    return NextResponse.json(
      { success: false, error: String(error?.message || error) },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    let orderPayload: any = {};

    // Case 1: Raw WhatsApp Text provided
    if (body.rawText) {
      const parsed = parseWhatsAppOrderText(body.rawText);
      orderPayload = {
        customer_name: parsed.customerName,
        customer_phone: parsed.phone,
        city: parsed.city,
        address: parsed.address,
        items_summary: parsed.itemsSummary,
        total_amount: parsed.totalAmount,
        rep_name: parsed.repName,
        source: parsed.source,
        payment_method: parsed.paymentMethod,
        installment_notes: parsed.installmentNotes,
        status: parsed.isReservation ? "draft" : "confirmed",
        raw_whatsapp_text: parsed.rawText,
      };
    } 
    // Case 2: Structured order payload
    else {
      orderPayload = {
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
      };
    }

    // Save directly to Supabase
    const savedOrder = await createLiveOrder(orderPayload);

    // Fire Telegram alert in background (non-blocking)
    notifyNewOrder(savedOrder.order_number, orderPayload.customer_name, orderPayload.total_amount).catch((err) =>
      console.error("Failed to send Telegram new order alert:", err)
    );

    return NextResponse.json(
      {
        success: true,
        message: `تم إنشاء الطلب بنجاح برقم (${savedOrder.order_number}) في قاعدة البيانات.`,
        order: savedOrder,
      },
      { status: 201, headers: NO_CACHE_HEADERS }
    );
  } catch (error: any) {
    notifySystemError("/api/orders", String(error?.message || error)).catch((err) =>
      console.error("Failed to send Telegram error alert:", err)
    );
    return NextResponse.json(
      { error: "فشل إنشاء الطلب: " + String(error) },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, status } = body;

    if (!orderId || !status) {
      return NextResponse.json(
        { error: "رقم الطلب والحالة حقول مطلوبة" },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const result = await updateLiveOrderStatus({
      orderId,
      status,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "فشل تحديث الطلب" },
        { status: 500, headers: NO_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: `تم تحديث حالة الطلب (${orderId}) إلى (${status}) بنجاح.`,
        data: result.data,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: "فشل تحديث الطلب: " + String(error) },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
