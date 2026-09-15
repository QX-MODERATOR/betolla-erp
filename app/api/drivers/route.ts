import { NextRequest, NextResponse } from 'next/server';
import {
  getLiveDriverOrders,
  assignLiveOrdersToDriver,
  dispatchLiveDrivers,
  updateLiveOrderStatus,
  getInventoryNeededForDispatch,
} from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
};

export async function GET(req: NextRequest) {
  try {
    const orders = await getLiveDriverOrders();

    // Compute summaries per driver including BX Arabia
    const drivers = ['خالد', 'علي', 'BX Arabia'];
    const summaries: Record<string, any> = {};

    drivers.forEach((d) => {
      const dOrders = orders.filter((o) => o.driver === d || (d === 'BX Arabia' && (o.driver?.toLowerCase().includes('bx') || false)));
      const delivered = dOrders.filter((o) => o.status === 'delivered');
      const returned = dOrders.filter((o) => o.status === 'returned');
      const remaining = dOrders.filter((o) => o.status === 'pending' || o.status === 'remaining' || o.status === 'postponed');

      const expectedCash = dOrders.reduce((s, o) => s + (o.cash_to_collect || 0), 0);
      const collectedCash = delivered.reduce((s, o) => s + (o.cash_to_collect || 0), 0);

      summaries[d] = {
        driver: d,
        totalOrders: dOrders.length,
        deliveredCount: delivered.length,
        returnedCount: returned.length,
        remainingCount: remaining.length,
        expectedCash,
        collectedCash,
        diff: collectedCash - expectedCash,
      };
    });

    const driverLoads = drivers.map((d) => {
      const dOrders = orders.filter((o) => o.driver === d || (d === 'BX Arabia' && (o.driver?.toLowerCase().includes('bx') || false)));
      return {
        driver: d,
        orders: dOrders.map((o) => ({
          id: o.id,
          customer: o.customer_name,
          area: o.area,
          items: o.products,
          cash: o.cash_to_collect || 0,
        })),
        totalCash: dOrders.reduce((s, o) => s + (o.cash_to_collect || 0), 0),
      };
    });

    const inventoryNeeded = await getInventoryNeededForDispatch(orders.map((o) => o.dbId));

    const reconcileOrders = orders.map((o) => {
      let driverName = o.driver || 'خالد';
      if (driverName.toLowerCase().includes('bx')) driverName = 'BX Arabia';
      const statusMap: Record<string, string> = {
        delivered: 'مكتمل',
        returned: 'مرتجع',
        postponed: 'مؤجل',
        remaining: 'متبقي',
        pending: 'خرج مع السائق',
      };
      return {
        id: o.id,
        driver: driverName,
        customer: o.customer_name,
        area: o.area,
        expectedCash: o.cash_to_collect || 0,
        actualCash: o.status === 'delivered' ? (o.cash_to_collect || 0) : 0,
        status: statusMap[o.status] || 'خرج مع السائق',
        notes: o.notes || '',
        paymentMethod: o.payment_method,
        cliqIncludesDelivery: o.cliq_includes_delivery,
      };
    });

    return NextResponse.json(
      {
        success: true,
        endpoint: '/api/drivers',
        drivers_available: drivers,
        orders,
        summaries,
        driverLoads,
        inventoryNeeded,
        reconcileOrders,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error: any) {
    console.error('Error in GET /api/drivers:', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || error) },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action || 'unknown';

    switch (action) {
      case 'assign':
      case 'assign_orders': {
        const orderIds = body.order_ids || body.orderIds || [];
        const driver = body.driver || body.driverName;
        if (!driver || !orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
          return NextResponse.json(
            { success: false, error: 'اسم السائق وقائمة الطلبات حقول مطلوبة' },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }

        const assignRes = await assignLiveOrdersToDriver(orderIds, driver);
        return NextResponse.json(
          {
            success: true,
            message: `تم تعيين ${orderIds.length} طلبات للسائق ${driver} بنجاح في قاعدة البيانات`,
            data: assignRes,
          },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case 'dispatch':
      case 'dispatch_drivers': {
        const drivers = body.drivers || ['خالد', 'علي', 'BX Arabia'];
        const dispatchRes = await dispatchLiveDrivers(drivers);
        return NextResponse.json(
          {
            success: true,
            message: 'تم إصدار أمر التحميل وتغيير حالة الطلبات إلى خرج مع السائق بنجاح',
            data: dispatchRes,
          },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case 'withdraw_inventory': {
        // Stock itself is already tracked in real time (deducted when each order
        // was confirmed, via business_create_order's inventory auto-linking).
        // This action is a same-session warehouse-readiness checklist step, not
        // a second stock movement — it must never claim to write one.
        return NextResponse.json(
          {
            success: true,
            message: 'تم تأكيد تجهيز البضاعة للتحميل. الكميات معتمدة من رصيد المخزون الحالي.',
          },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case 'reconcile': {
        const orderSummaries = body.reconcileData || body.order_summaries || body.orders || [];
        for (const item of orderSummaries) {
          if (item.id) {
            const finalStatus = item.status === 'مكتمل' ? 'delivered' : item.status === 'مرتجع' ? 'returned' : 'processing';
            await updateLiveOrderStatus({
              orderId: item.id,
              status: finalStatus,
              cashCollected: item.actualCash !== undefined ? Number(item.actualCash) : undefined,
              notes: item.notes,
            });
          }
        }

        return NextResponse.json(
          {
            success: true,
            message: 'تمت التسوية بنجاح وتحديث كافة الحسابات والطلبات في قاعدة البيانات',
          },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case 'update_order': {
        const orderId = body.orderId || body.order?.id;
        const driver = body.driver || body.order?.driver;
        const status = body.status || body.order?.status;
        const notes = body.notes || body.order?.notes;
        const cashCollected = body.cashCollected;

        if (!orderId) {
          return NextResponse.json(
            { success: false, error: 'رقم الطلب مطلوب' },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }

        const updateRes = await updateLiveOrderStatus({
          orderId,
          status: status || 'processing',
          cashCollected,
          notes: driver ? `[السائق: ${driver}] ${notes || ''}`.trim() : notes,
        });

        return NextResponse.json(
          {
            success: true,
            message: `تم تحديث تفاصيل الطلب ${orderId} في قاعدة البيانات`,
            data: updateRes.data,
          },
          { headers: NO_CACHE_HEADERS }
        );
      }

      default:
        return NextResponse.json(
          { error: 'إجراء غير معروف. الإجراءات المتاحة: assign, assign_orders, dispatch, withdraw_inventory, reconcile, update_order' },
          { status: 400, headers: NO_CACHE_HEADERS }
        );
    }
  } catch (error: any) {
    console.error('Error in POST /api/drivers:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء معالجة طلب السائقين: ' + String(error?.message || error) },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
