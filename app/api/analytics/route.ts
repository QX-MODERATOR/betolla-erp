import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireRole(["finance"]);
  if (auth instanceof NextResponse) return auth;

  const analyticsData = {
    overview: {
      total_customers: 45309,
      total_orders_month: 248,
      monthly_revenue_jd: 12850.000,
      average_order_value_jd: 51.800,
      lead_conversion_rate_percent: 28.4,
    },
    funnel: [
      { stage: "ليدات وأرقام مستلمة", count: 1250, percent: 100 },
      { stage: "تم التواصل والمتابعة", count: 980, percent: 78.4 },
      { stage: "تأكيد طلبيات وعروض", count: 355, percent: 28.4 },
      { stage: "تم التسليم والتحصيل", count: 320, percent: 25.6 },
    ],
    reps_leaderboard: [
      { name: "حمزة", clients: 12672, calls_today: 34, revenue_jd: 5420.000, conversion_rate: 31.2, rank: 1 },
      { name: "رحمه", clients: 5943, calls_today: 28, revenue_jd: 3180.000, conversion_rate: 29.5, rank: 2 },
      { name: "صابرين", clients: 2858, calls_today: 22, revenue_jd: 1940.000, conversion_rate: 26.8, rank: 3 },
      { name: "حنان", clients: 1942, calls_today: 18, revenue_jd: 1420.000, conversion_rate: 25.0, rank: 4 },
      { name: "سارة", clients: 450, calls_today: 12, revenue_jd: 890.000, conversion_rate: 24.1, rank: 5 },
    ],
    categories_distribution: [
      { name: "مورفوزيس الإيطالي", percentage: 42, revenue_jd: 5397.000 },
      { name: "مجموعة بلازما", percentage: 26, revenue_jd: 3341.000 },
      { name: "العناية بالأرجان", percentage: 16, revenue_jd: 2056.000 },
      { name: "بروتين ماراكوجا", percentage: 10, revenue_jd: 1285.000 },
      { name: "عدسات بيتو وأجهزة التصفيف", percentage: 6, revenue_jd: 771.000 },
    ],
    top_cities: [
      { city: "عمان والضواحي", count: 12450, percentage: 27.5 },
      { city: "طبربور", count: 8380, percentage: 18.5 },
      { city: "إربد والشمال", count: 7040, percentage: 15.5 },
      { city: "الزرقاء", count: 6510, percentage: 14.4 },
      { city: "مرج الحمام وشفا بدران", count: 4800, percentage: 10.6 },
      { city: "مادبا والعقبة وباقي المحافظات", count: 6129, percentage: 13.5 },
    ]
  };

  return NextResponse.json(analyticsData);
}
