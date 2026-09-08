"use client";

import { useState } from "react";
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  ShoppingBag, 
  DollarSign, 
  Trophy, 
  PieChart, 
  MapPin, 
  Download, 
  Printer, 
  Filter, 
  ArrowUpRight,
  Sparkles,
  PhoneCall,
  CheckCircle2,
  Calendar
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useLoading } from "@/lib/loading-context";

const REPS_LEADERBOARD = [
  { name: "حمزة", clients: 12672, calls_today: 34, revenue_jd: 5420.000, conversion_rate: 31.2, rank: 1, badge: "الأعلى مبيعاً" },
  { name: "رحمه", clients: 5943, calls_today: 28, revenue_jd: 3180.000, conversion_rate: 29.5, rank: 2, badge: "الأسرع تجاوباً" },
  { name: "صابرين", clients: 2858, calls_today: 22, revenue_jd: 1940.000, conversion_rate: 26.8, rank: 3, badge: "أعلى حجوزات" },
  { name: "حنان", clients: 1942, calls_today: 18, revenue_jd: 1420.000, conversion_rate: 25.0, rank: 4, badge: "صالونات الشمال" },
  { name: "سارة", clients: 450, calls_today: 12, revenue_jd: 890.000, conversion_rate: 24.1, rank: 5, badge: "متابعة مستمرة" },
];

const CATEGORIES_DATA = [
  { name: "مورفوزيس بروفيشنال الإيطالي", percentage: 42, revenue_jd: 5397.000, color: "bg-amber-500" },
  { name: "مجموعة بلازما للشعر", percentage: 26, revenue_jd: 3341.000, color: "bg-blue-500" },
  { name: "العناية بالأرجان والشيا", percentage: 16, revenue_jd: 2056.000, color: "bg-emerald-500" },
  { name: "بروتينات ماراكوجا البرازيلية", percentage: 10, revenue_jd: 1285.000, color: "bg-purple-500" },
  { name: "عدسات بيتو وأجهزة التصفيف", percentage: 6, revenue_jd: 771.000, color: "bg-rose-500" },
];

const GEOGRAPHIC_DATA = [
  { region: "عمان الكبرى والضواحي", count: 12450, percentage: 27.5 },
  { region: "طبربور وماركا", count: 8380, percentage: 18.5 },
  { region: "إربد ومحافظات الشمال", count: 7040, percentage: 15.5 },
  { region: "الزرقاء والرصيفة", count: 6510, percentage: 14.4 },
  { region: "مرج الحمام وشفا بدران والجبيهة", count: 4800, percentage: 10.6 },
  { region: "مادبا والعقبة والجنوب", count: 6129, percentage: 13.5 },
];

const FUNNEL_STAGES = [
  { stage: "ليدات وأرقام مستلمة من التسويق", count: 1250, percent: 100, color: "bg-stone-900" },
  { stage: "تم الاتصال والمتابعة الفعالة", count: 980, percent: 78.4, color: "bg-amber-600" },
  { stage: "طلبيات مؤكدة وحجوزات", count: 355, percent: 28.4, color: "bg-blue-600" },
  { stage: "تم التسليم بنجاح وتحصيل المبلغ", count: 320, percent: 25.6, color: "bg-emerald-600" },
];

export default function AnalyticsPage() {
  const { startLoading, stopLoading } = useLoading();
  const [selectedPeriod, setSelectedPeriod] = useState("month");

  const exportCSV = () => {
    startLoading({
      ar: "جاري تجميع البيانات وتصدير ملف التقرير...",
      en: "Compiling analytics & generating export file...",
    });

    setTimeout(() => {
      const headers = "المندوب,عدد العملاء,مكالمات اليوم,المبيعات بالدينار,نسبة التحويل\n";
      const rows = REPS_LEADERBOARD.map(r => 
        `${r.name},${r.clients},${r.calls_today},${r.revenue_jd},${r.conversion_rate}%`
      ).join("\n");
      
      const blob = new Blob(["\uFEFF" + headers + rows], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `تقرير_أداء_مبيعات_بيتولا_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      stopLoading();
    }, 450);
  };


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5">
            <BarChart3 className="w-6 h-6 text-amber-500" />
            <span>لوحة تحليلات وتقارير الأداء الذكية (BI Analytics)</span>
          </h2>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            تحليل كفاءة المبيعات، تحويل الليدات، أداء المندوبين، ومؤشرات النمو اللحظية
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Period Selector */}
          <div className="flex items-center bg-white border border-stone-200 rounded-xl p-1 text-xs">
            <button
              onClick={() => setSelectedPeriod("week")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                selectedPeriod === "week" ? "bg-stone-900 text-white" : "text-stone-600 hover:text-stone-900"
              }`}
            >
              هذا الأسبوع
            </button>
            <button
              onClick={() => setSelectedPeriod("month")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                selectedPeriod === "month" ? "bg-stone-900 text-white" : "text-stone-600 hover:text-stone-900"
              }`}
            >
              هذا الشهر
            </button>
            <button
              onClick={() => setSelectedPeriod("year")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                selectedPeriod === "year" ? "bg-stone-900 text-white" : "text-stone-600 hover:text-stone-900"
              }`}
            >
              السنة الحالية
            </button>
          </div>

          {/* Export Button */}
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs rounded-xl shadow-xs transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>تصدير Excel / CSV</span>
          </button>
        </div>
      </div>

      {/* Top Executive KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs">
          <div className="flex items-center justify-between text-stone-500 text-xs font-bold">
            <span>إجمالي الإيرادات المحققة</span>
            <DollarSign className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-stone-900 mt-2">
            {formatCurrency(12850.000)}
          </p>
          <p className="text-[11px] text-emerald-600 font-semibold mt-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            <span>+18.4% مقارنة بالشهر السابق</span>
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs">
          <div className="flex items-center justify-between text-stone-500 text-xs font-bold">
            <span>نسبة تحويل الليدات للطلبات</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-stone-900 mt-2">
            28.4%
          </p>
          <p className="text-[11px] text-stone-400 mt-1">من إجمالي الأرقام المستلمة</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs">
          <div className="flex items-center justify-between text-stone-500 text-xs font-bold">
            <span>متوسط قيمة الطلب (AOV)</span>
            <ShoppingBag className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-stone-900 mt-2">
            {formatCurrency(51.800)}
          </p>
          <p className="text-[11px] text-stone-400 mt-1">لكل عملية بيع مؤكدة</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs">
          <div className="flex items-center justify-between text-stone-500 text-xs font-bold">
            <span>قاعدة العملاء الكلية</span>
            <Users className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-stone-900 mt-2">
            45,309
          </p>
          <p className="text-[11px] text-stone-400 mt-1">عميل موثق في الأردن</p>
        </div>
      </div>

      {/* Two Columns: Sales Rep Leaderboard & Lead Conversion Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Sales Rep Leaderboard (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-stone-200 shadow-xs space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <div>
              <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                <span>لوحة شرف وترتيب أداء مناديب المبيعات</span>
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                مقياس الكفاءة التحويلية والمبيعات المحققة والمكالمات اليومية
              </p>
            </div>
            <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
              تحديث لحظي
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-stone-50 text-stone-500 font-bold border-b border-stone-200">
                <tr>
                  <th className="py-3 px-3 text-center">الترتيب</th>
                  <th className="py-3 px-3">المندوب</th>
                  <th className="py-3 px-3">العملاء المدارين</th>
                  <th className="py-3 px-3">اتصالات اليوم</th>
                  <th className="py-3 px-3">إجمالي المبيعات</th>
                  <th className="py-3 px-3">نسبة التحويل</th>
                  <th className="py-3 px-3 text-center">الوسام</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {REPS_LEADERBOARD.map((rep) => (
                  <tr key={rep.name} className="hover:bg-amber-50/40 transition">
                    <td className="py-3.5 px-3 text-center">
                      <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center font-black text-xs ${
                        rep.rank === 1 ? "bg-amber-500 text-stone-950 shadow-xs" :
                        rep.rank === 2 ? "bg-stone-300 text-stone-800" :
                        rep.rank === 3 ? "bg-amber-700 text-white" :
                        "bg-stone-100 text-stone-600"
                      }`}>
                        {rep.rank}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 font-bold text-stone-900 text-sm">
                      {rep.name}
                    </td>
                    <td className="py-3.5 px-3 font-mono text-stone-600">
                      {rep.clients.toLocaleString()} عميل
                    </td>
                    <td className="py-3.5 px-3 font-mono font-bold text-stone-900">
                      {rep.calls_today} مكالمة
                    </td>
                    <td className="py-3.5 px-3 font-bold font-mono text-amber-700 text-sm">
                      {formatCurrency(rep.revenue_jd)}
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-stone-800">{rep.conversion_rate}%</span>
                        <div className="w-12 bg-stone-100 h-1.5 rounded-full overflow-hidden hidden sm:block">
                          <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${rep.conversion_rate * 2.5}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-stone-100 text-stone-700 border border-stone-200">
                        {rep.badge}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Lead Conversion Funnel (1 col) */}
        <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-xs space-y-5">
          <div>
            <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-amber-500" />
              <span>قمع تحويل المبيعات (Funnel)</span>
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              مسار تدفق الليدات من مرحلة الاستلام حتى تسليم الطلب والتحصيل
            </p>
          </div>

          <div className="space-y-4 pt-2">
            {FUNNEL_STAGES.map((stage, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-stone-800">{stage.stage}</span>
                  <span className="font-mono font-bold text-stone-900">{stage.count} ({stage.percent}%)</span>
                </div>
                <div className="w-full bg-stone-100 h-3 rounded-full overflow-hidden">
                  <div 
                    className={`${stage.color} h-full rounded-full transition-all duration-500`}
                    style={{ width: `${stage.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/70 text-xs text-amber-950 space-y-1">
            <p className="font-bold">🎯 خلاصة الكفاءة:</p>
            <p className="text-[11px] leading-relaxed">
              يحقق الفريق نسبة إغلاق مبيعات ممتازة بنسبة 25.6% من إجمالي الليدات الواردة من التسويق، مع استقرار وقت التوصيل في 24-48 ساعة.
            </p>
          </div>
        </div>

      </div>

      {/* Two Columns: Category Breakdown & Geographic Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Category Contribution */}
        <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-xs space-y-5">
          <div>
            <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <PieChart className="w-5 h-5 text-amber-500" />
              <span>مساهمة خطوط المنتجات في المبيعات</span>
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              توزيع إيرادات الـ 31 منتج حسب التصنيف الرئيسي
            </p>
          </div>

          <div className="space-y-4">
            {CATEGORIES_DATA.map((cat, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-stone-800">{cat.name}</span>
                  <span className="font-mono text-stone-900">{formatCurrency(cat.revenue_jd)} ({cat.percentage}%)</span>
                </div>
                <div className="w-full bg-stone-100 h-2.5 rounded-full overflow-hidden">
                  <div className={`${cat.color} h-full rounded-full`} style={{ width: `${cat.percentage}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Geographic Distribution Across Jordan */}
        <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-xs space-y-5">
          <div>
            <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-amber-500" />
              <span>التوزيع الجغرافي للعملاء والمبيعات (الأردن)</span>
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              تغطية قاعدة الـ 45,309 عميل حسب المحافظات والمناطق
            </p>
          </div>

          <div className="space-y-3.5">
            {GEOGRAPHIC_DATA.map((geo, idx) => (
              <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-stone-50 border border-stone-150 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="font-bold text-stone-800">{geo.region}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-stone-600">{geo.count.toLocaleString()} عميل</span>
                  <span className="font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/50">
                    {geo.percentage}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
