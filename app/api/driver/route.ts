import { NextRequest, NextResponse } from 'next/server';
import { 
  getLiveDriverOrders, 
  updateLiveOrderStatus, 
  saveLiveShiftClosure, 
  getLiveShiftClosure,
  reopenLiveShift,
} from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const driverParam = searchParams.get('driver') || 'خالد';

    const orders = await getLiveDriverOrders(driverParam);
    const shiftClosure = await getLiveShiftClosure(driverParam);

    return NextResponse.json(
      {
        success: true,
        orders,
        driver: {
          name: driverParam === 'BX Arabia' ? 'BX Arabia (شركة توصيل)' : driverParam === 'علي' ? 'علي المندوب' : 'خالد المندوب',
          avatar: driverParam === 'BX Arabia' ? 'BX' : driverParam === 'علي' ? 'ع' : 'خ',
        },
        shiftClosure: shiftClosure ? { closed: true, ...shiftClosure } : { closed: false },
      },
      {
        headers: NO_CACHE_HEADERS,
      }
    );
  } catch (error: any) {
    console.error('Error in GET /api/driver:', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || error) },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      action, 
      orderId, 
      status, 
      notes, 
      cashCollected, 
      returnReason, 
      postponeDate, 
      driverName,
      deliveredCount,
      returnedCount,
    } = body;

    // 1. Update individual order status
    if (action === 'update_status') {
      if (!orderId) {
        return NextResponse.json(
          { success: false, error: 'رقم الطلب مطلوب' },
          { status: 400, headers: NO_CACHE_HEADERS }
        );
      }

      const result = await updateLiveOrderStatus({
        orderId,
        status: status || 'delivered',
        cashCollected: cashCollected !== undefined ? Number(cashCollected) : undefined,
        returnReason,
        postponeDate,
        notes,
      });

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error || 'فشل تحديث الطلب في قاعدة البيانات' },
          { status: 500, headers: NO_CACHE_HEADERS }
        );
      }

      return NextResponse.json(
        {
          success: true,
          message: `تم تحديث حالة الطلب ${orderId} إلى ${status} في قاعدة البيانات بنجاح`,
          data: result.data,
        },
        { headers: NO_CACHE_HEADERS }
      );
    }

    // 2. Close Shift & Save reconciliation report
    if (action === 'close_shift') {
      const driver = driverName || 'خالد';
      const shiftResult = await saveLiveShiftClosure({
        driverName: driver,
        notes: notes || '',
        cashCollected: cashCollected !== undefined ? Number(cashCollected) : undefined,
        deliveredCount: deliveredCount !== undefined ? Number(deliveredCount) : undefined,
        returnedCount: returnedCount !== undefined ? Number(returnedCount) : undefined,
      });

      if (!shiftResult.success) {
        return NextResponse.json(
          { success: false, error: shiftResult.error || 'فشل حفظ إغلاق الوردية في قاعدة البيانات' },
          { status: 500, headers: NO_CACHE_HEADERS }
        );
      }

      return NextResponse.json(
        {
          success: true,
          message: `تم اعتماد إغلاق الوردية للسائق ${driver} بنجاح`,
          shift: shiftResult.shift,
        },
        { headers: NO_CACHE_HEADERS }
      );
    }

    // 3. Reopen a previously-closed shift
    if (action === 'reopen_shift') {
      const driver = driverName || 'خالد';
      const result = await reopenLiveShift(driver);

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error || 'فشل إعادة فتح الوردية في قاعدة البيانات' },
          { status: 500, headers: NO_CACHE_HEADERS }
        );
      }

      return NextResponse.json(
        { success: true, message: `تمت إعادة فتح الوردية للسائق ${driver}` },
        { headers: NO_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      { success: false, error: 'الإجراء المطلوب غير معروف' },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  } catch (error: any) {
    console.error('Error in POST /api/driver:', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || error) },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
