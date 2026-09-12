import { NextRequest, NextResponse } from "next/server";
import { notifyLowStock, notifySystemError } from "@/lib/telegram";
import { requireRole } from "@/lib/api-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listMovements, listProducts, recordMovement } from "@/lib/inventory";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireRole(["driver_manager"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = await createSupabaseServerClient();
    const [products, movements] = await Promise.all([listProducts(supabase), listMovements(supabase)]);

    const totalUnits = products.reduce((acc, p) => acc + p.stock, 0);
    const totalValue = products.reduce((acc, p) => acc + p.stock * p.cost_price, 0);
    const lowStockCount = products.filter((p) => p.stock <= p.reorder).length;

    return NextResponse.json({
      status: "active",
      warehouse: "المستودع الرئيسي - عمان",
      products,
      movements,
      summary: {
        total_products: products.length,
        total_units: totalUnits,
        low_stock_count: lowStockCount,
        total_inventory_value_jd: totalValue,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    notifySystemError("/api/inventory", message).catch(() => {});
    return NextResponse.json({ error: "فشل تحميل بيانات المخزون: " + message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(["driver_manager"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "بيانات الطلب غير صالحة." }, { status: 400 });
    }

    const { sku, type, quantity, reference, notes } = body;
    const supabase = await createSupabaseServerClient();
    const result = await recordMovement(supabase, { sku, type, quantity, reference, notes });

    if (result.newQuantityOnHand <= result.reorderLevel) {
      notifyLowStock(result.movement.name || sku, result.newQuantityOnHand).catch((err) =>
        console.error("Failed to send Telegram low-stock alert:", err)
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: `تم تسجيل حركة المخزون بنجاح وتحديث الرصيد للصنف (${sku}) إلى ${result.newQuantityOnHand} قطعة.`,
        movement: result.movement,
        new_quantity_on_hand: result.newQuantityOnHand,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    notifySystemError("/api/inventory", message).catch((err) =>
      console.error("Failed to send Telegram error alert:", err)
    );
    return NextResponse.json({ error: "فشل تسجيل حركة المخزون: " + message }, { status: 400 });
  }
}
