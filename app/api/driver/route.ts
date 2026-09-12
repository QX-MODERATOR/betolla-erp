import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';

const MOCK_ORDERS = [
  {
    id: "BET-2026-101",
    customer_name: "سدين غنايم",
    phone: "0793937385",
    area: "طبربور",
    address: "شارع الامير حسين عمارة 101",
    products: "2x شامبو بلازما, 1x بلسم بلازما",
    cash_to_collect: 25.000,
    receivables: 0,
    status: "pending"
  },
  {
    id: "BET-2026-102",
    customer_name: "بيان عادل",
    phone: "0770000088",
    area: "الطفيلة",
    address: "حي المنشية قرب مسجد الأبرار",
    products: "1x بكج بلازما الرباعي المتكامل",
    cash_to_collect: 33.300,
    receivables: 5.000,
    status: "pending"
  },
  {
    id: "BET-2026-103",
    customer_name: "صالون لورا بيوتي",
    phone: "0791234567",
    area: "عمان",
    address: "الصويفية - مجمع البركة التجاري الطابق الثاني",
    products: "1x بروتين ماراكوجا 1 لتر, 1x سشوار جاما",
    cash_to_collect: 150.000,
    receivables: 0,
    status: "delivered"
  },
  {
    id: "BET-2026-104",
    customer_name: "روان الخطيب",
    phone: "0789876543",
    area: "إربد",
    address: "حي القصيلة قرب دوار القبة",
    products: "1x طقم عدسات بيتو فينوس",
    cash_to_collect: 22.500,
    receivables: 0,
    status: "postponed",
    postpone_date: "2026-09-15"
  },
  {
    id: "BET-2026-105",
    customer_name: "صيدلية المقاصد",
    phone: "0770005000",
    area: "عمان",
    address: "الدوار السابع",
    products: "10x بكج مورفوزيس ريستركتشر لتر",
    cash_to_collect: 450.000,
    receivables: 0,
    status: "pending"
  },
  {
    id: "BET-2026-106",
    customer_name: "ميساء العمري",
    phone: "0795551234",
    area: "عمان",
    address: "خلدا - قرب سيتي مول",
    products: "1x سيروم بلازما المغذي",
    cash_to_collect: 12.600,
    receivables: 0,
    status: "returned",
    return_reason: "الزبون غير موجود"
  },
  {
    id: "BET-2026-107",
    customer_name: "نادين الطراونة",
    phone: "0772223344",
    area: "الكرك",
    address: "الثنية - مقابل مجمع البنوك",
    products: "1x بكج أرجان ريبير",
    cash_to_collect: 28.800,
    receivables: 0,
    status: "pending"
  },
  {
    id: "BET-2026-108",
    customer_name: "دلال الكردي",
    phone: "0796667788",
    area: "الزرقاء",
    address: "الزرقاء الجديدة - شارع 36",
    products: "1x سيروم مورفوزيس",
    cash_to_collect: 15.000,
    receivables: 0,
    status: "remaining"
  },
  {
    id: "BET-2026-109",
    customer_name: "ريم العبادي",
    phone: "0778889900",
    area: "السلط",
    address: "حي السلالم قرب المركز الصحي",
    products: "1x ليف ان مورفوزيس",
    cash_to_collect: 18.000,
    receivables: 2.000,
    status: "pending"
  },
  {
    id: "BET-2026-110",
    customer_name: "منى الحنيطي",
    phone: "0797776655",
    area: "طبربور",
    address: "حي الغابة",
    products: "1x مملس الشعر الاحترافي ماك",
    cash_to_collect: 35.000,
    receivables: 0,
    status: "delivered"
  }
];

export async function GET(request: NextRequest) {
  const auth = await requireRole(["driver"]);
  if (auth instanceof NextResponse) return auth;

  // Returns only this driver's assigned orders for today.
  // NOTE: orders below are still static mock data (Phase 1 does not touch
  // business persistence) so there is no real per-driver ownership to
  // filter by yet. Once orders are backed by the real `orders` table
  // (assigned_driver_id), this handler must filter by auth.repId /
  // auth.id rather than returning the same fixed list to every driver.
  return NextResponse.json({
    success: true,
    orders: MOCK_ORDERS,
    driver: {
      name: "خالد المندوب",
      avatar: "خ"
    }
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(["driver"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { action, orderId, status, notes, cashCollected, returnReason, postponeDate } = body;
    
    if (action === 'update_status') {
      return NextResponse.json({
        success: true,
        message: `تم تحديث حالة الطلب ${orderId} إلى ${status}`,
        data: {
          orderId,
          status,
          notes,
          cashCollected,
          returnReason,
          postponeDate,
          updated_at: new Date().toISOString()
        }
      });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
