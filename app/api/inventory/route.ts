import { NextRequest, NextResponse } from "next/server";
import { notifyLowStock, notifySystemError } from "@/lib/telegram";

// In-memory movement tracker for fast simulation & sync
let movementsLog = [
  {
    id: "MOV-1001",
    sku: "PL-SHAMP-02",
    product_name: "شامبو بلازما للشعر 500 مل",
    type: "purchase_in",
    type_label: "توريد بضاعة جديدة",
    quantity: 100,
    reference: "فاتورة توريد إيطاليا #IT-8841",
    notes: "شحنة واردة من المصنع مباشرة للمستودع الرئيسي",
    created_at: "2026-09-05T09:30:00Z",
  },
  {
    id: "MOV-1002",
    sku: "MOR-REST-SET-1L",
    product_name: "مجموعة ترميم مورفوزيس ريستركتشر 1000 مل",
    type: "sale_out",
    type_label: "صرف لطلبية مبيعات",
    quantity: -5,
    reference: "طلب مبيعات صالونات #BET-2026-002",
    notes: "تسليم صالونات إربد والزرقاء",
    created_at: "2026-09-07T14:15:00Z",
  },
  {
    id: "MOV-1003",
    sku: "PROT-MARACUJA-1L",
    product_name: "بروتين ماراكوجا البرازيلي 1000 مل",
    type: "adjustment",
    type_label: "تسوية جرد دوري",
    quantity: -1,
    reference: "جرد مستودع عمان الأسبوعي",
    notes: "عينة فحص وتجربة للصالونات المعتمدة",
    created_at: "2026-09-08T08:00:00Z",
  }
];

export async function GET() {
  return NextResponse.json({
    status: "active",
    warehouse: "المستودع الرئيسي - عمان",
    movements: movementsLog,
    summary: {
      total_products: 31,
      total_units: 1740,
      low_stock_count: 4,
      total_inventory_value_jd: 42560.000,
    }
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sku, productName, type, quantity, reference, notes } = body;

    if (!sku || !quantity || !type) {
      return NextResponse.json(
        { error: "رمز المنتج (SKU) والكمية ونوع الحركة حقول مطلوبة." },
        { status: 400 }
      );
    }

    const typeLabels: Record<string, string> = {
      purchase_in: "توريد بضاعة جديدة (+)",
      sale_out: "صرف طلبية مبيعات (-)",
      adjustment: "تسوية جرد (+/-)",
      damaged: "تالف / هالك (-)",
      return_in: "مرتجع من عميل (+)",
    };

    const newMovement = {
      id: `MOV-${Date.now()}`,
      sku,
      product_name: productName || sku,
      type,
      type_label: typeLabels[type] || type,
      quantity: Number(quantity),
      reference: reference || "حركة يدوية من النظام",
      notes: notes || "",
      created_at: new Date().toISOString(),
    };

    movementsLog = [newMovement, ...movementsLog];

    return NextResponse.json(
      {
        success: true,
        message: `تم تسجيل حركة المخزون بنجاح وتحديث الرصيد للصنف (${sku}).`,
        movement: newMovement,
      },
      { status: 201 }
    );
  } catch (error: any) {
    notifySystemError("/api/inventory", String(error?.message || error)).catch((err) =>
      console.error("Failed to send Telegram error alert:", err)
    );
    return NextResponse.json(
      { error: "فشل تسجيل حركة المخزون: " + String(error) },
      { status: 500 }
    );
  }
}
