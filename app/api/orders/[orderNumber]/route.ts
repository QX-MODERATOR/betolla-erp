import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { advanceOrderStatus, ORDER_STATUS_ADVANCE_MAP } from "@/lib/orders";
import { notifySystemError } from "@/lib/telegram";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ orderNumber: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const auth = await requireRole(["sales_rep", "driver_manager", "finance"]);
  if (auth instanceof NextResponse) return auth;

  const { orderNumber } = await params;

  try {
    const body = await req.json().catch(() => null);
    const action = body?.action;

    if (action !== "advance" && action !== "return") {
      return NextResponse.json(
        { success: false, error: "إجراء غير معروف. الإجراءات المتاحة: advance, return." },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();

    if (action === "return") {
      const order = await advanceOrderStatus(supabase, orderNumber, "returned");
      return NextResponse.json({ success: true, order });
    }

    // action === "advance": look up the current status to compute the next
    // one server-side — the client only says "move it forward one step",
    // it never gets to pick an arbitrary target status.
    const { data: current, error: findError } = await supabase
      .from("orders")
      .select("status")
      .eq("order_number", orderNumber)
      .maybeSingle();

    if (findError) throw findError;
    if (!current) {
      return NextResponse.json({ success: false, error: "الطلب غير موجود." }, { status: 404 });
    }

    const nextStatus = ORDER_STATUS_ADVANCE_MAP[current.status];
    if (!nextStatus) {
      return NextResponse.json(
        { success: false, error: "لا يمكن تقديم حالة هذا الطلب أكثر من ذلك." },
        { status: 409 }
      );
    }

    const order = await advanceOrderStatus(supabase, orderNumber, nextStatus);
    return NextResponse.json({ success: true, order });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    notifySystemError(`/api/orders/${orderNumber}`, message).catch(() => {});
    return NextResponse.json({ success: false, error: "فشل تحديث حالة الطلب: " + message }, { status: 400 });
  }
}
