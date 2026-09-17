"use client";

import { useEffect, useState } from "react";
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
  CheckCircle2,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useLoading } from "@/lib/loading-context";
import { loadBusiness } from "@/lib/business-client";
import { ammanToday } from "@/lib/dates";

const FUNNEL_COLORS = ["bg-stone-900", "bg-amber-600", "bg-blue-600", "bg-emerald-600"];
const CATEGORY_COLORS = ["bg-amber-500", "bg-blue-500", "bg-emerald-500", "bg-purple-500", "bg-rose-500"];

interface AnalyticsData {
  overview: {
    total_customers: number;
    total_orders: number;
    revenue_collected_jd: number;
    revenue_invoiced_jd: number;
    average_order_value_jd: number;
    lead_conversion_rate_percent: number;
  };
  funnel: { stage: string; count: number; percent: number }[];
  reps_leaderboard: { name: string; clients: number; orders: number; revenue_jd: number; conversion_rate: number; rank: number }[];
  top_products: { name: string; revenue_jd: number; percentage: number }[];
  geo_distribution: { region: string; count: number; percentage: number }[];
}

export default function AnalyticsPage() {
  const { startLoading, stopLoading } = useLoading();
  const [selectedPeriod, setSelectedPeriod] = useState("month");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadBusiness<AnalyticsData>("/api/analytics")
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "تعذر تحميل بيانات التحليلات."))
      .finally(() => setLoading(false));
  }, []);

  const exportCSV = () => {
    if (!data) return;
    startLoading({
      ar: "جاري تجميع البيانات وتصدير ملف التقرير...",
      en: "Compiling analytics & generating export file...",
    });

    setTimeout(() => {
      const headers = "المندوب,عدد العملاء,عدد الطلبات,المبيعات بالدينار,نسبة التحويل\n";
      const rows = data.reps_leaderboard
        .map((r) => `${r.name},${r.clients},${r.orders},${r.revenue_jd},${r.conversion_rate}%`)
        .join("\n");

      const blob = new Blob(["﻿" + headers + rows], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `تقرير_أداء_مبيعات_بيتولا_${ammanToday()}.csv`);
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
            <span>لوحة تحليلات وتقارير الأداء (BI Analytics)</span>
          </h2>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            بيانات حية من قاعدة البيانات: كفاءة المبيعات، تحويل الليدات، وأداء المندوبين
          </p>
        </div>

        <div className="flex items-center gap-2">
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

          <button
            onClick={exportCSV}
            disabled={!data}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 font-bold text-xs rounded-xl shadow-xs transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>تصدير Excel / CSV</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium">{error}</div>
      )}

      {/* Top Executive KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs">
          <div className="flex items-center justify-between text-stone-500 text-xs font-bold">
            <span>إجمالي الإيرادات المحصّلة</span>
            <DollarSign className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-stone-900 mt-2">
            {loading || !data ? "..." : formatCurrency(data.overview.revenue_collected_jd)}
          </p>
          <p className="text-[11px] text-stone-400 mt-1">
            {loading || !data ? "" : `من ${formatCurrency(data.overview.revenue_invoiced_jd)} إجمالي مفوتر`}
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs">
          <div className="flex items-center justify-between text-stone-500 text-xs font-bold">
            <span>نسبة تحويل العملاء لطلبات</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-stone-900 mt-2">
            {loading || !data ? "..." : `${data.overview.lead_conversion_rate_percent}%`}
          </p>
          <p className="text-[11px] text-stone-400 mt-1">من إجمالي قاعدة العملاء</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs">
          <div className="flex items-center justify-between text-stone-500 text-xs font-bold">
            <span>متوسط قيمة الطلب (AOV)</span>
            <ShoppingBag className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-stone-900 mt-2">
            {loading || !data ? "..." : formatCurrency(data.overview.average_order_value_jd)}
          </p>
          <p className="text-[11px] text-stone-400 mt-1">
            {loading || !data ? "" : `عبر ${data.overview.total_orders} طلب`}
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs">
          <div className="flex items-center justify-between text-stone-500 text-xs font-bold">
            <span>قاعدة العملاء الكلية</span>
            <Users className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-stone-900 mt-2">
            {loading || !data ? "..." : data.overview.total_customers.toLocaleString("ar")}
          </p>
          <p className="text-[11px] text-stone-400 mt-1">عميل موثق في قاعدة البيانات</p>
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
                <span>ترتيب أداء مناديب المبيعات</span>
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                محسوب من الطلبات والعملاء الفعليين في قاعدة البيانات
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-stone-50 text-stone-500 font-bold border-b border-stone-200">
                <tr>
                  <th className="py-3 px-3 text-center">الترتيب</th>
                  <th className="py-3 px-3">المندوب</th>
                  <th className="py-3 px-3">العملاء المدارون</th>
                  <th className="py-3 px-3">عدد الطلبات</th>
                  <th className="py-3 px-3">إجمالي المبيعات</th>
                  <th className="py-3 px-3">نسبة التحويل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {!loading && data && data.reps_leaderboard.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-stone-400">لا توجد طلبات بعد.</td></tr>
                )}
                {data?.reps_leaderboard.map((rep) => (
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
                    <td className="py-3.5 px-3 font-bold text-stone-900 text-sm">{rep.name}</td>
                    <td className="py-3.5 px-3 font-mono text-stone-600">{rep.clients.toLocaleString("ar")} عميل</td>
                    <td className="py-3.5 px-3 font-mono font-bold text-stone-900">{rep.orders} طلب</td>
                    <td className="py-3.5 px-3 font-bold font-mono text-amber-700 text-sm">
                      {formatCurrency(rep.revenue_jd)}
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-stone-800">{rep.conversion_rate}%</span>
                        <div className="w-12 bg-stone-100 h-1.5 rounded-full overflow-hidden hidden sm:block">
                          <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${Math.min(rep.conversion_rate, 100)}%` }} />
                        </div>
                      </div>
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
              مسار تدفق العملاء من التسجيل حتى التسليم
            </p>
          </div>

          <div className="space-y-4 pt-2">
            {data?.funnel.map((stage, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-stone-800">{stage.stage}</span>
                  <span className="font-mono font-bold text-stone-900">{stage.count} ({stage.percent}%)</span>
                </div>
                <div className="w-full bg-stone-100 h-3 rounded-full overflow-hidden">
                  <div
                    className={`${FUNNEL_COLORS[idx] || "bg-stone-600"} h-full rounded-full transition-all duration-500`}
                    style={{ width: `${stage.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Two Columns: Top Products & Geographic Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Top-Selling Products */}
        <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-xs space-y-5">
          <div>
            <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <PieChart className="w-5 h-5 text-amber-500" />
              <span>المنتجات الأكثر مبيعاً</span>
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              محسوب من بنود الطلبات الفعلية
            </p>
          </div>

          <div className="space-y-4">
            {!loading && data && data.top_products.length === 0 && (
              <p className="text-xs text-stone-400">لا توجد بيانات مبيعات بعد.</p>
            )}
            {data?.top_products.map((prod, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-stone-800 truncate">{prod.name}</span>
                  <span className="font-mono text-stone-900 shrink-0">{formatCurrency(prod.revenue_jd)} ({prod.percentage}%)</span>
                </div>
                <div className="w-full bg-stone-100 h-2.5 rounded-full overflow-hidden">
                  <div className={`${CATEGORY_COLORS[idx % CATEGORY_COLORS.length]} h-full rounded-full`} style={{ width: `${Math.min(prod.percentage, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Geographic Distribution */}
        <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-xs space-y-5">
          <div>
            <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-amber-500" />
              <span>التوزيع الجغرافي للطلبات</span>
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              حسب مدينة التوصيل المسجلة في الطلبات الفعلية
            </p>
          </div>

          <div className="space-y-3.5">
            {!loading && data && data.geo_distribution.length === 0 && (
              <p className="text-xs text-stone-400">لا توجد بيانات بعد.</p>
            )}
            {data?.geo_distribution.map((geo, idx) => (
              <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-stone-50 border border-stone-150 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="font-bold text-stone-800">{geo.region}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-stone-600">{geo.count.toLocaleString("ar")} طلب</span>
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
