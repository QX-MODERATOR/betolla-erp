import { NextRequest, NextResponse } from "next/server";

let driverTaskCounter = 100;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    let resultData;
    driverTaskCounter++;

    // Handle different actions: assign | dispatch | reconcile
    const action = body.action || "unknown";

    switch (action) {
      case "assign":
        resultData = {
          task_id: `DRV-TASK-${driverTaskCounter}`,
          action: "assign",
          driver: body.driver,
          order_ids: body.order_ids || [],
          status: "assigned",
          timestamp: new Date().toISOString(),
          message: `تم تعيين ${body.order_ids?.length || 0} طلبات للسائق ${body.driver}`
        };
        break;

      case "dispatch":
        resultData = {
          task_id: `DRV-TASK-${driverTaskCounter}`,
          action: "dispatch",
          drivers: body.drivers || ["خالد", "علي"],
          status: "dispatched",
          timestamp: new Date().toISOString(),
          message: "تم إصدار أمر التحميل وتغيير حالة الطلبات إلى 'خرج مع السائق'"
        };
        break;

      case "reconcile":
        resultData = {
          task_id: `DRV-TASK-${driverTaskCounter}`,
          action: "reconcile",
          driver_summaries: body.driver_summaries || [],
          status: "reconciled",
          timestamp: new Date().toISOString(),
          message: "تمت التسوية بنجاح وإغلاق الحسابات اليومية"
        };
        break;

      default:
        return NextResponse.json(
          { error: "إجراء غير معروف. الإجراءات المتاحة: assign, dispatch, reconcile" },
          { status: 400 }
        );
    }

    return NextResponse.json(
      {
        success: true,
        message: resultData.message,
        data: resultData,
      },
      { status: 200 } // using 200 since it can be update/action rather than strict creation (201)
    );
  } catch (error) {
    return NextResponse.json(
      { error: "حدث خطأ أثناء معالجة طلب السائقين: " + String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "active",
    endpoint: "/api/drivers",
    description: "محرك إدارة مسارات السائقين، التوزيع، التسويات، وإغلاق الحسابات لـ Betolla ERP",
    drivers_available: ["خالد", "علي"]
  });
}
