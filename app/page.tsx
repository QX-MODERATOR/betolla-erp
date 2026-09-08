"use client";

import { 
  Users, 
  PhoneForwarded, 
  ShoppingBag, 
  TrendingUp, 
  CalendarClock, 
  Sparkles,
  ArrowUpRight,
  PhoneCall,
  CheckCircle2,
  Clock,
  MapPin,
  PackageCheck
} from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";

const STATS = [
  {
    title: "إجمالي قاعدة العملاء",
    value: "45,309",
    subtext: "سجل مستورد وموثق من الإكسل",
    icon: Users,
    color: "from-blue-600 to-indigo-600",
    href: "/customers"
  },
  {
    title: "اتصالات مجدولة للمتابعة",
    value: "142",
    subtext: "مطلوب التواصل معهم هذا الأسبوع",
    icon: CalendarClock,
    color: "from-amber-500 to-amber-600",
    href: "/calls"
  },
  {
    title: "طلبات الواتساب النشطة",
    value: "28",
    subtext: "بانتظار تجهيز التوصيل والتأكيد",
    icon: ShoppingBag,
    color: "from-emerald-500 to-teal-600",
    href: "/orders"
  },
  {
    title: "إجمالي المنتجات المتاحة",
    value: "31",
    subtext: "عبر 6 خطوط عناية وتجميل",
    icon: PackageCheck,
    color: "from-purple-500 to-pink-600",
    href: "/inventory"
  },
];

const TODAY_CALLS = [
  {
    name: "سدين غنايم",
    phone: "0793937385",
    city: "طبربور",
    notes: "2 شامبو بلازما + 100مل تريتمنت (سوشال ميديا - رحمه)",
    rep: "رحمه",
    due: "11:30 ص",
  },
  {
    name: "ربى صبيح",
    phone: "0799193505",
    city: "الزرقاء - الجبل الشمالي",
    notes: "3 بكجات مورفوزيس 250 + 2 ليف ان (حجز شهر)",
    rep: "صابرين",
    due: "01:00 م",
  },
  {
    name: "صيدلية المقاصد",
    phone: "0770005000",
    city: "عمان",
    notes: "استفسار عن توفر بكج البلازما المتكامل",
    rep: "حمزة",
    due: "02:15 م",
  },
  {
    name: "بيان عادل",
    phone: "0770000088",
    city: "الطفيلة",
    notes: "متابعة نتائج شامبو بلازما بعد أسبوعين من الاستخدام",
    rep: "رحمه",
    due: "03:45 م",
  },
];

const TOP_REPS = [
  { name: "حمزة", count: 12672, percentage: 38, active: true },
  { name: "رحمه", count: 5943, percentage: 18, active: true },
  { name: "صابرين", count: 2858, percentage: 9, active: true },
  { name: "حنان", count: 1942, percentage: 6, active: true },
  { name: "سارة", count: 450, percentage: 2, active: true },
];

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Welcome & System Status Banner */}
      <div className="bg-gradient-to-r from-stone-900 via-stone-850 to-stone-900 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden border border-stone-800 shadow-xl">
        <div className="absolute top-0 left-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-semibold mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>نظام بيتولا المتكامل - المرحلة الأولى جاهزة</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              أهلاً بك في نظام إدارة مبيعات بيتولا كوزمتكس
            </h2>
            <p className="mt-2 text-sm text-stone-300 max-w-2xl leading-relaxed">
              تمت أتمتة سجلات المبيعات وإلغاء الحاجة للإدخال الورقي. يمكنك الآن متابعة اتصالات العملاء المجدولة، تأكيد طلبيات الواتساب بضغطة زر، وإدارة المخزون مباشرة.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Link
              href="/calls"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-sm shadow-lg shadow-amber-500/20 transition-all hover:scale-102"
            >
              <PhoneForwarded className="w-4 h-4" />
              <span>جدول اتصالات اليوم</span>
            </Link>
            <Link
              href="/customers"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-stone-800 hover:bg-stone-700 text-white font-semibold text-sm border border-stone-700 transition"
            >
              <span>دليل العملاء (45,309)</span>
              <ArrowUpRight className="w-4 h-4 text-stone-400" />
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {STATS.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <Link
              key={idx}
              href={stat.href}
              className="bg-white rounded-2xl p-5 border border-stone-200/80 hover:border-amber-400/80 shadow-xs hover:shadow-md transition-all group relative overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">
                  {stat.title}
                </span>
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${stat.color} flex items-center justify-center text-white shadow-xs group-hover:scale-110 transition-transform`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-4">
                <div className="text-3xl font-extrabold text-stone-900 tracking-tight">
                  {stat.value}
                </div>
                <p className="mt-1 text-xs text-stone-500">
                  {stat.subtext}
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Two Column Layout: Today's Calls & Rep Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
        
        {/* Today's Follow-up Calls (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-stone-200 shadow-xs space-y-5">
          <div className="flex items-center justify-between pb-4 border-b border-stone-100">
            <div>
              <h3 className="text-lg font-bold text-stone-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-500" />
                <span>متابعات واتصالات اليوم المطلوبة</span>
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                قائمة العملاء الذين تم تحديد موعد اتصال لهم اليوم أو يحتاجون متابعة
              </p>
            </div>
            <Link
              href="/calls"
              className="text-xs font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-1"
            >
              <span>عرض الكل</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-stone-100">
            {TODAY_CALLS.map((call, i) => (
              <div key={i} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-stone-50/80 -mx-2 px-3 rounded-xl transition">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-stone-900">{call.name}</span>
                    <span className="text-xs text-stone-500 font-mono" dir="ltr">{call.phone}</span>
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-stone-100 text-stone-600">
                      <MapPin className="w-3 h-3" />
                      {call.city}
                    </span>
                  </div>
                  <p className="text-xs text-stone-600 line-clamp-1">
                    {call.notes}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-left sm:text-right">
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium border border-amber-200/50">
                      {call.rep}
                    </span>
                    <p className="text-[10px] text-stone-400 mt-0.5">{call.due}</p>
                  </div>
                  <a
                    href={`tel:${call.phone}`}
                    className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition flex items-center justify-center"
                    title="اتصال الآن"
                  >
                    <PhoneCall className="w-4 h-4" />
                  </a>
                  <a
                    href={`https://wa.me/${call.phone.replace(/^0/, '962')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition text-xs font-semibold"
                    title="محادثة واتساب"
                  >
                    واتساب
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sales Rep Distribution (1 col) */}
        <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-xs space-y-5">
          <div>
            <h3 className="text-lg font-bold text-stone-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-amber-500" />
              <span>توزيع العملاء على المندوبين</span>
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              نسبة تغطية قاعدة البيانات حسب المندوب
            </p>
          </div>

          <div className="space-y-4">
            {TOP_REPS.map((rep, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-stone-800">{rep.name}</span>
                  <span className="text-stone-500">{rep.count.toLocaleString()} عميل ({rep.percentage}%)</span>
                </div>
                <div className="w-full bg-stone-100 h-2.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-amber-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(rep.percentage * 2, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/60 text-xs text-amber-900 leading-relaxed">
            <p className="font-bold mb-1">💡 التوزيع الآلي الذكي لليدز:</p>
            تصل الأرقام الجديدة من التسويق وصفحات التواصل ويتم تعيينها آلياً للمندوب النشط بنظام المداورة (Round-Robin) دون الحاجة للطباعة الورقية.
          </div>
        </div>

      </div>
    </div>
  );
}
