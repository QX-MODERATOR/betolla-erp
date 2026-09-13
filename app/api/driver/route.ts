import { NextRequest, NextResponse } from 'next/server';

const MOCK_ORDERS = [
  {
    id: "BET-2026-101",
    customer_name: "سدين غنايم",
    phone: "0793937385",
    area: "طبربور",
    address: "شارع الامير حسين عمارة 101",
    products: "2x شامبو بلازما, 1x بلسم بلازما",
    order_total: 25.000,
    cash_to_collect: 25.000,
    receivables: 0,
    payment_method: "cash",
    cliq_includes_delivery: false,
    delivery_fee: 0,
    status: "pending"
  },
  {
    id: "BET-2026-102",
    customer_name: "بيان عادل",
    phone: "0770000088",
    area: "الطفيلة",
    address: "حي المنشية قرب مسجد الأبرار",
    products: "1x بكج بلازما الرباعي المتكامل",
    order_total: 33.300,
    cash_to_collect: 33.300,
    receivables: 5.000,
    payment_method: "cash",
    cliq_includes_delivery: false,
    delivery_fee: 0,
    status: "pending"
  },
  {
    id: "BET-2026-103",
    customer_name: "صالون لورا بيوتي",
    phone: "0791234567",
    area: "عمان",
    address: "الصويفية - مجمع البركة التجاري الطابق الثاني",
    products: "1x بروتين ماراكوجا 1 لتر, 1x سشوار جاما",
    order_total: 150.000,
    cash_to_collect: 0.000, // CliQ Full payment including delivery
    receivables: 0,
    payment_method: "cliq",
    cliq_includes_delivery: true,
    delivery_fee: 0,
    status: "delivered"
  },
  {
    id: "BET-2026-104",
    customer_name: "روان الخطيب",
    phone: "0789876543",
    area: "إربد",
    address: "حي القصيلة قرب دوار القبة",
    products: "1x طقم عدسات بيتو فينوس",
    order_total: 22.500,
    cash_to_collect: 22.500,
    receivables: 0,
    payment_method: "cash",
    cliq_includes_delivery: false,
    delivery_fee: 0,
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
    order_total: 450.000,
    cash_to_collect: 3.000, // Products paid via CliQ, driver collects only delivery fee!
    receivables: 0,
    payment_method: "cliq",
    cliq_includes_delivery: false,
    delivery_fee: 3.000,
    status: "pending"
  },
  {
    id: "BET-2026-106",
    customer_name: "ميساء العمري",
    phone: "0795551234",
    area: "عمان",
    address: "خلدا - قرب سيتي مول",
    products: "1x سيروم بلازما المغذي",
    order_total: 12.600,
    cash_to_collect: 12.600,
    receivables: 0,
    payment_method: "cash",
    cliq_includes_delivery: false,
    delivery_fee: 0,
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
    order_total: 28.800,
    cash_to_collect: 0.000, // CliQ Full payment including delivery
    receivables: 0,
    payment_method: "cliq",
    cliq_includes_delivery: true,
    delivery_fee: 0,
    status: "pending"
  },
  {
    id: "BET-2026-108",
    customer_name: "دلال الكردي",
    phone: "0796667788",
    area: "الزرقاء",
    address: "الزرقاء الجديدة - شارع 36",
    products: "1x سيروم مورفوزيس",
    order_total: 15.000,
    cash_to_collect: 2.500, // CliQ paid for products, collect delivery fee
    receivables: 0,
    payment_method: "cliq",
    cliq_includes_delivery: false,
    delivery_fee: 2.500,
    status: "remaining"
  },
  {
    id: "BET-2026-109",
    customer_name: "ريم العبادي",
    phone: "0778889900",
    area: "السلط",
    address: "حي السلالم قرب المركز الصحي",
    products: "1x ليف ان مورفوزيس",
    order_total: 18.000,
    cash_to_collect: 18.000,
    receivables: 2.000,
    payment_method: "cash",
    cliq_includes_delivery: false,
    delivery_fee: 0,
    status: "pending"
  },
  {
    id: "BET-2026-110",
    customer_name: "منى الحنيطي",
    phone: "0797776655",
    area: "طبربور",
    address: "حي الغابة",
    products: "1x مملس الشعر الاحترافي ماك",
    order_total: 35.000,
    cash_to_collect: 35.000,
    receivables: 0,
    payment_method: "cash",
    cliq_includes_delivery: false,
    delivery_fee: 0,
    status: "delivered"
  }
];

export async function GET(request: NextRequest) {
  // Returns only this driver's assigned orders for today
  // In real app, would filter by driver ID from JWT
  // For now, return mock data
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
