import { NextRequest, NextResponse } from "next/server";
import { notifyNewOrder, notifySystemError } from "@/lib/telegram";
import { requireRole } from "@/lib/api-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createOrderFromWhatsAppText, createStructuredOrder, listOrders } from "@/lib/orders";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireRole(["sales_rep", "driver_manager", "finance"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "بيانات الطلب غير صالحة." }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();

    const order = body.rawText
      ? await createOrderFromWhatsAppText(supabase, { rawText: body.rawText })
      : await createStructuredOrder(supabase, body);

    // Fire Telegram alert in background (non-blocking)
    notifyNewOrder(order.id, order.customer_name, order.total_amount).catch((err) =>
      console.error("Failed to send Telegram new order alert:", err)
    );

    return NextResponse.json(
      {
        success: true,
        message: `تم إنشاء الطلب بنجاح برقم (${order.id}).`,
        order,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    notifySystemError("/api/orders", message).catch((err) =>
      console.error("Failed to send Telegram error alert:", err)
    );
    return NextResponse.json({ error: "فشل إنشاء الطلب: " + message }, { status: 400 });
  }
}

export async function GET() {
  const auth = await requireRole(["sales_rep", "driver_manager", "finance"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = await createSupabaseServerClient();
    const orders = await listOrders(supabase);
    return NextResponse.json({ success: true, orders });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    notifySystemError("/api/orders", message).catch(() => {});
    return NextResponse.json({ success: false, error: "فشل تحميل الطلبات: " + message }, { status: 500 });
  }
}
