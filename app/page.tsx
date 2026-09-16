"use client";

import { useEffect, useState } from "react";
import {
  Users,
  PhoneForwarded,
  ShoppingBag,
  TrendingUp,
  CalendarClock,
  Sparkles,
  ArrowUpRight,
  PhoneCall,
  Clock,
  MapPin,
  PackageCheck
} from "lucide-react";
import Link from "next/link";
import { DashboardSkeleton } from "@/components/common/skeleton";
import { loadBusiness } from "@/lib/business-client";
import { useLanguage } from "@/lib/i18n";
import type { BusinessCustomer, BusinessOrder, BusinessProduct } from "@/lib/business";

export default function DashboardPage() {
  const { language } = useLanguage();
  const isArabic = language === "ar";
  const numLocale = isArabic ? "ar" : "en";

  const [customers, setCustomers] = useState<BusinessCustomer[]>([]);
  const [orders, setOrders] = useState<BusinessOrder[]>([]);
  const [products, setProducts] = useState<BusinessProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setLoading(true);
    setLoadError(false);
    Promise.all([
      loadBusiness<{ customers: BusinessCustomer[] }>("/api/customers").then((d) => d.customers),
      loadBusiness<{ orders: BusinessOrder[] }>("/api/orders").then((d) => d.orders),
      loadBusiness<{ catalog: BusinessProduct[] }>("/api/inventory").then((d) => d.catalog),
    ]).then(([c, o, p]) => {
      setCustomers(c);
      setOrders(o);
      setProducts(p);
    }).catch(() => setLoadError(true)).finally(() => setLoading(false));
  }, [attempt]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const scheduledCalls = customers.filter((c) => !!c.next_call_date);
  const todayCalls = customers
    .filter((c) => c.next_call_date === todayStr)
    .slice(0, 6);
  const activeOrders = orders.filter((o) => !["delivered", "cancelled", "returned"].includes(o.status));

  const unassignedLabel = isArabic ? "غير معيّن" : "Unassigned";
  const repCounts = customers.reduce<Record<string, number>>((acc, c) => {
    const rep = c.rep_name_raw || unassignedLabel;
    acc[rep] = (acc[rep] || 0) + 1;
    return acc;
  }, {});
  const totalWithRep = Object.values(repCounts).reduce((s, n) => s + n, 0) || 1;
  const topReps = Object.entries(repCounts)
    .map(([name, count]) => ({ name, count, percentage: Math.round((count / totalWithRep) * 100) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  const STATS = [
    {
      title: isArabic ? "إجمالي قاعدة العملاء" : "Total Customer Base",
      value: loading ? "..." : customers.length.toLocaleString(numLocale),
      subtext: isArabic ? "سجل عملاء حقيقي من قاعدة البيانات" : "Real customer records from the database",
      icon: Users,
      color: "from-blue-600 to-indigo-600",
      href: "/customers"
    },
    {
      title: isArabic ? "اتصالات مجدولة للمتابعة" : "Scheduled Follow-up Calls",
      value: loading ? "..." : scheduledCalls.length.toLocaleString(numLocale),
      subtext: isArabic ? "مطلوب التواصل معهم قريباً" : "Need to be contacted soon",
      icon: CalendarClock,
      color: "from-[#9e8959] to-[#c28a40]",
      href: "/calls"
    },
    {
      title: isArabic ? "الطلبات النشطة" : "Active Orders",
      value: loading ? "..." : activeOrders.length.toLocaleString(numLocale),
      subtext: isArabic ? "بانتظار تجهيز التوصيل والتأكيد" : "Awaiting delivery prep & confirmation",
      icon: ShoppingBag,
      color: "from-[#533f16] to-[#2d6a4f]",
      href: "/orders"
    },
    {
      title: isArabic ? "إجمالي المنتجات المتاحة" : "Total Products Available",
      value: loading ? "..." : products.length.toLocaleString(numLocale),
      subtext: isArabic ? "في كتالوج المخزون الحالي" : "In the current inventory catalog",
      icon: PackageCheck,
      color: "from-purple-500 to-pink-600",
      href: "/inventory"
    },
  ];

  if (loading) return <div role="status" aria-label={isArabic ? "جاري التحميل" : "Loading"}><DashboardSkeleton /></div>;
  if (loadError) return <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-6 space-y-4 text-rose-900">
    <p>{isArabic ? "تعذر تحميل لوحة التحكم. يرجى إعادة المحاولة." : "Dashboard data could not be loaded. Please try again."}</p>
    <button className="min-h-11 rounded-xl bg-[#533f16] px-5 text-white" onClick={() => setAttempt(a => a + 1)}>{isArabic ? "إعادة المحاولة" : "Retry"}</button>
  </div>;
  return (
    <div className="space-y-8">
      {/* Welcome & System Status Banner */}
      <div className="bg-gradient-to-r from-[#160f02] via-[#241a08] to-[#160f02] rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden border border-[#554625] shadow-2xl animate-slideUp">
        <div className="absolute top-0 left-0 w-96 h-96 bg-[#9e8959]/15 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#35270e] border border-[#554625] text-[#f4e5d0] text-xs font-semibold mb-3">
              <Sparkles className="w-3.5 h-3.5 text-[#9e8959]" />
              <span>{isArabic ? "نظام بيتولا المتكامل - إدارة العمليات والمبيعات" : "Betolla Integrated System - Operations & Sales Management"}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {isArabic ? "أهلاً بك في نظام إدارة مبيعات بيتولا كوزمتكس" : "Welcome to the Betolla Cosmetics Sales Management System"}
            </h2>
            <p className="mt-2 text-sm text-[#f4e5d0]/80 max-w-2xl leading-relaxed">
              {isArabic
                ? "تمت أتمتة سجلات المبيعات وإلغاء الحاجة للإدخال الورقي. يمكنك الآن متابعة اتصالات العملاء المجدولة، تأكيد طلبيات الواتساب بضغطة زر، وإدارة المخزون مباشرة."
                : "Sales records are now automated, removing the need for paper entry. You can track scheduled customer calls, confirm WhatsApp orders in one click, and manage inventory directly."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Link
              href="/calls"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-[#9e8959] via-[#bda66d] to-[#9e8959] hover:from-[#bda66d] hover:to-[#9e8959] text-[#160f02] font-black text-sm shadow-lg shadow-[#9e8959]/30 transition-all hover:scale-102 active:scale-95"
            >
              <PhoneForwarded className="w-4 h-4" />
              <span>{isArabic ? "جدول اتصالات اليوم" : "Today's Call Schedule"}</span>
            </Link>
            <Link
              href="/customers"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#241a08] hover:bg-[#35270e] text-[#f4e5d0] font-semibold text-sm border border-[#554625] transition active:scale-95"
            >
              <span>{isArabic ? "دليل العملاء" : "Customer Directory"} ({loading ? "..." : customers.length.toLocaleString(numLocale)})</span>
              <ArrowUpRight className="w-4 h-4 text-[#9e8959]" />
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
              className="bg-white rounded-2xl p-5 border border-[#e8dfcf] hover:border-[#9e8959]/80 shadow-xs hover:shadow-lg hover:-translate-y-0.5 transition-all group relative overflow-hidden animate-slideUp"
              style={{ animationDelay: `${idx * 80}ms` }}
            >
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#9e8959] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">
                  {stat.title}
                </span>
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform ring-1 ring-white/20`}>
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
        <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-[#e8dfcf] shadow-xs space-y-5 animate-slideUp" style={{ animationDelay: '300ms' }}>
          <div className="flex items-center justify-between pb-4 border-b border-[#e8dfcf]/60">
            <div>
              <h3 className="text-lg font-bold text-[#2b2926] flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#9e8959]" />
                <span>{isArabic ? "متابعات واتصالات اليوم المطلوبة" : "Today's Required Follow-ups & Calls"}</span>
              </h3>
              <p className="text-xs text-[#6b655d] mt-0.5">
                {isArabic ? "قائمة العملاء الذين تم تحديد موعد اتصال لهم اليوم" : "Customers scheduled for a call today"}
              </p>
            </div>
            <Link
              href="/calls"
              className="text-xs font-semibold text-[#9e8959] hover:text-[#7b5e28] flex items-center gap-1"
            >
              <span>{isArabic ? "عرض الكل" : "View All"}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-[#e8dfcf]/60">
            {loading ? (
              <p className="py-8 text-center text-xs text-stone-400">{isArabic ? "جاري تحميل البيانات..." : "Loading data..."}</p>
            ) : todayCalls.length === 0 ? (
              <p className="py-8 text-center text-xs text-stone-400">{isArabic ? "لا توجد اتصالات مجدولة لليوم." : "No calls scheduled for today."}</p>
            ) : (
              todayCalls.map((call) => (
                <div key={call.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#faf7f2] -mx-2 px-3 rounded-xl transition">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-[#2b2926]">{call.name}</span>
                      <span className="text-xs text-[#6b655d] font-mono" dir="ltr">{call.phone}</span>
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-[#faf7f2] border border-[#e8dfcf] text-[#6b655d]">
                        <MapPin className="w-3 h-3 text-[#9e8959]" />
                        {call.city}
                      </span>
                    </div>
                    <p className="text-xs text-[#6b655d] line-clamp-1">
                      {call.notes || "—"}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-left sm:text-right">
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#35270e]/10 text-[#7b5e28] font-medium border border-[#9e8959]/30">
                        {call.rep_name_raw}
                      </span>
                    </div>
                    <a
                      href={`tel:${call.phone}`}
                      className="p-2 rounded-xl bg-[#533f16]/10 hover:bg-[#533f16]/20 text-[#533f16] border border-[#533f16]/25 transition flex items-center justify-center"
                      title={isArabic ? "اتصال الآن" : "Call now"}
                    >
                      <PhoneCall className="w-4 h-4" />
                    </a>
                    <a
                      href={`https://wa.me/${call.phone.replace(/^0/, '962')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 rounded-xl bg-[#9e8959]/15 hover:bg-[#9e8959]/25 text-[#7b5e28] border border-[#9e8959]/30 transition text-xs font-semibold"
                      title={isArabic ? "محادثة واتساب" : "WhatsApp chat"}
                    >
                      {isArabic ? "واتساب" : "WhatsApp"}
                    </a>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sales Rep Distribution (1 col) */}
        <div className="bg-white rounded-3xl p-6 border border-[#e8dfcf] shadow-xs space-y-5 animate-slideUp" style={{ animationDelay: '400ms' }}>
          <div>
            <h3 className="text-lg font-bold text-[#2b2926] flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#9e8959]" />
              <span>{isArabic ? "توزيع العملاء على المندوبين" : "Customer Distribution by Rep"}</span>
            </h3>
            <p className="text-xs text-[#6b655d] mt-0.5">
              {isArabic ? "نسبة تغطية قاعدة البيانات حسب المندوب" : "Share of the customer base per rep"}
            </p>
          </div>

          <div className="space-y-4">
            {loading ? (
              <p className="text-xs text-stone-400">{isArabic ? "جاري التحميل..." : "Loading..."}</p>
            ) : topReps.length === 0 ? (
              <p className="text-xs text-stone-400">{isArabic ? "لا توجد بيانات بعد." : "No data yet."}</p>
            ) : (
              topReps.map((rep) => (
                <div key={rep.name} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-[#2b2926]">{rep.name}</span>
                    <span className="text-[#6b655d]">
                      {rep.count.toLocaleString(numLocale)} {isArabic ? "عميل" : "customers"} ({rep.percentage}%)
                    </span>
                  </div>
                  <div className="w-full bg-[#faf7f2] border border-[#e8dfcf] h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-[#9e8959] to-[#c28a40] h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(rep.percentage * 2, 100)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-4 rounded-2xl bg-[#faf7f2] border border-[#e8dfcf] text-xs text-[#2b2926] leading-relaxed">
            <p className="font-bold mb-1 text-[#9e8959]">
              {isArabic ? "💡 التوزيع الآلي الذكي لليدز:" : "💡 Smart Automatic Lead Distribution:"}
            </p>
            {isArabic
              ? "تصل الأرقام الجديدة من التسويق وصفحات التواصل ويتم تعيينها آلياً للمندوب النشط بنظام المداورة (Round-Robin) دون الحاجة للطباعة الورقية."
              : "New leads arrive from marketing and social pages and are automatically assigned to an active rep via round-robin, with no paper handling needed."}
          </div>
        </div>

      </div>
    </div>
  );
}
