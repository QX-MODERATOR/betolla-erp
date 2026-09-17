"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Calculator,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Clock,
  Package,
  Banknote,
  Printer,
  MessageSquare,
  Copy,
  Check,
  Lock,
  Unlock,
  Phone,
  FileText,
  Calendar,
  Coins,
  Info,
  ChevronDown,
  ChevronUp,
  Sparkles,
  UserCheck,
  CreditCard
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { getCurrentUser, secureFetch } from "@/lib/client-api";
import { loadBusiness } from "@/lib/business-client";
import { DRIVERS, type DriverShiftSummary } from "@/lib/driver-ops";
import { useToast } from "@/components/common/toast";

type Order = {
  id: string;
  customer_name: string;
  phone: string;
  area: string;
  address: string;
  products: string;
  order_total?: number;
  cash_to_collect: number;
  receivables: number;
  payment_method?: 'cash' | 'cliq';
  cliq_includes_delivery?: boolean;
  delivery_fee?: number;
  status: 'pending' | 'delivered' | 'returned' | 'postponed' | 'remaining';
  postpone_date?: string;
  return_reason?: string;
  cash_collected: number | null;
};

const collectedOf = (o: Order) => (o.status === 'delivered' ? (o.cash_collected ?? o.cash_to_collect) : 0);

interface CashDenominations {
  fifty: number;
  twenty: number;
  ten: number;
  five: number;
  one: number;
  coins: number;
}

const SUPERVISOR_PHONE = "0791858928";
const SUPERVISOR_WHATSAPP = "962791858928";

export default function DriverShiftClosePage() {
  const { showToast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [driver, setDriver] = useState({ name: "", avatar: "" });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [shift, setShift] = useState<DriverShiftSummary | null>(null);
  // Drivers see their own day; delivery managers pick a driver (and are the only ones who can reopen).
  const [isManager, setIsManager] = useState(false);
  const [managedDriver, setManagedDriver] = useState<string>(DRIVERS[0]);
  const [countedInput, setCountedInput] = useState("");
  const [activeTab, setActiveTab] = useState<'all' | 'delivered' | 'returned' | 'postponed'>('all');

  // Shift Lock State
  const [isShiftClosed, setIsShiftClosed] = useState(false);
  const [closedAt, setClosedAt] = useState<string | null>(null);
  const [closingNotes, setClosingNotes] = useState("");
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closingShift, setClosingShift] = useState(false);
  const [reopeningShift, setReopeningShift] = useState(false);
  const [showWhatsAppPreview, setShowWhatsAppPreview] = useState(false);

  // Cash Calculator Drawer State
  const [showDenomCalc, setShowDenomCalc] = useState(false);
  const [denoms, setDenoms] = useState<CashDenominations>({
    fifty: 0,
    twenty: 0,
    ten: 0,
    five: 0,
    one: 0,
    coins: 0,
  });

  // Copied state
  const [copiedReport, setCopiedReport] = useState(false);

  // Done / Success Feedback Modal
  const [doneModalInfo, setDoneModalInfo] = useState<{
    isOpen: boolean;
    title: string;
    subtitle: string;
    closedAt?: string;
    cashCollected?: number;
    deliveredCount?: number;
    returnedCount?: number;
  }>({
    isOpen: false,
    title: "",
    subtitle: "",
  });

  const applyShift = (summary: DriverShiftSummary) => {
    setShift(summary);
    const closure = summary.closure?.is_closed ? summary.closure : null;
    setIsShiftClosed(Boolean(closure));
    setClosedAt(closure?.closed_at ? new Date(closure.closed_at).toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' }) : null);
    if (closure) setClosingNotes(closure.notes || "");
  };

  // Load today's orders & the shift status (totals are computed by the server)
  const loadDriverShiftData = async (forDriver?: string) => {
    const manager = getCurrentUser()?.role !== 'driver';
    setIsManager(manager);
    try {
      const target = forDriver ?? managedDriver;
      const data = await loadBusiness<{ orders: Order[]; driver: { name: string; avatar: string }; shift: DriverShiftSummary }>(
        manager ? `/api/driver?driver=${encodeURIComponent(target)}` : '/api/driver'
      );
      setOrders(data.orders || []);
      if (data.driver) setDriver(data.driver);
      applyShift(data.shift);
      setLoadError("");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "تعذر تحميل بيانات الوردية.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDriverShiftData();
  }, []);

  // Financial & Operational Metrics
  const stats = useMemo(() => {
    const totalOrders = orders.length;
    const deliveredOrders = orders.filter((o) => o.status === 'delivered');
    const returnedOrders = orders.filter((o) => o.status === 'returned');
    const postponedOrders = orders.filter((o) => o.status === 'postponed');
    const pendingOrders = orders.filter((o) => o.status === 'pending' || o.status === 'remaining');

    // Cash the driver recorded on today's deliveries (the server's figure when available)
    const totalCashCollected = shift ? Number(shift.expected_cash) || 0 : deliveredOrders.reduce((sum, o) => sum + collectedOf(o), 0);
    // Potential receivables or pending cash
    const pendingCash = pendingOrders.reduce((sum, o) => sum + (o.cash_to_collect || 0), 0);

    const completionRate = totalOrders > 0 ? Math.round((deliveredOrders.length / totalOrders) * 100) : 0;

    return {
      totalOrders,
      deliveredCount: deliveredOrders.length,
      returnedCount: returnedOrders.length,
      postponedCount: postponedOrders.length,
      pendingCount: pendingOrders.length,
      totalCashCollected,
      pendingCash,
      completionRate,
      deliveredOrders,
      returnedOrders,
      postponedOrders,
      pendingOrders,
    };
  }, [orders, shift]);

  // Denominations live cash calculation
  const countedCash = useMemo(() => {
    return (
      denoms.fifty * 50 +
      denoms.twenty * 20 +
      denoms.ten * 10 +
      denoms.five * 5 +
      denoms.one * 1 +
      (Number(denoms.coins) || 0)
    );
  }, [denoms]);

  const cashDifference = countedCash - stats.totalCashCollected;

  // Filtered orders list for the manifest table
  const filteredOrders = useMemo(() => {
    if (activeTab === 'delivered') return stats.deliveredOrders;
    if (activeTab === 'returned') return stats.returnedOrders;
    if (activeTab === 'postponed') return [...stats.postponedOrders, ...stats.pendingOrders];
    return orders;
  }, [activeTab, orders, stats]);

  // Current Arabic date
  const todayFormatted = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('ar-JO', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(new Date());
    } catch {
      return "اليوم";
    }
  }, []);

  // WhatsApp Report Formatter
  const whatsAppReportText = useMemo(() => {
    const timeString = new Date().toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' });

    let text = `*كشف إغلاق الوردية اليومية - شركة بيتولا لمستحضرات التجميل*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `👤 *المندوب:* ${driver.name}\n`;
    text += `📅 *التاريخ:* ${todayFormatted}\n`;
    text += `🕒 *الوقت:* ${timeString}\n`;
    text += `📊 *حالة الوردية:* ${isShiftClosed ? "مغلقة ومعتمدة 🔒" : "كشف نهاية الدوام 📋"}\n\n`;

    text += `💰 *العهد النقدية المحصلة (COD):*\n`;
    text += `*${formatCurrency(stats.totalCashCollected)}*\n`;
    if (countedCash > 0) {
      text += `• الكاش المحسوب باليد: ${formatCurrency(countedCash)}\n`;
      if (cashDifference === 0) {
        text += `• حالة المطابقة: مطابق 100% ✅\n`;
      } else if (cashDifference < 0) {
        text += `• تنبيه: نقص نقدي بقيمة ${formatCurrency(Math.abs(cashDifference))} ⚠️\n`;
      } else {
        text += `• تنبيه: زيادة نقدية بقيمة +${formatCurrency(cashDifference)}\n`;
      }
    }
    text += `\n`;

    text += `📦 *ملخص الطرود:* (${stats.totalOrders} إجمالي)\n`;
    text += `• تم التسليم بنجاح: ${stats.deliveredCount} طرد ✅\n`;
    text += `• مرتجع للمستودع: ${stats.returnedCount} طرد 🔄\n`;
    text += `• مؤجل / متبقي: ${stats.postponedCount + stats.pendingCount} طرد ⏳\n`;
    text += `• نسبة الإنجاز: ${stats.completionRate}%\n\n`;

    if (stats.returnedOrders.length > 0) {
      text += `🔄 *بيان الطرود المرتجعة للمستودع:*\n`;
      stats.returnedOrders.forEach((o, idx) => {
        text += `${idx + 1}. [${o.id}] ${o.customer_name} (${o.area}) - السبب: ${o.return_reason || "غير محدد"}\n`;
      });
      text += `\n`;
    }

    if (stats.deliveredOrders.length > 0) {
      text += `📋 *الطلبات المسلمة والمبالغ:*\n`;
      stats.deliveredOrders.forEach((o, idx) => {
        if (o.payment_method === 'cliq') {
          if (o.cliq_includes_delivery) {
            text += `${idx + 1}. [${o.id}] ${o.customer_name} (${o.area}): مدفوع CliQ كامل (0.000 د.أ)\n`;
          } else {
            text += `${idx + 1}. [${o.id}] ${o.customer_name} (${o.area}): ${formatCurrency(collectedOf(o))} (تحصيل توصيل - البضاعة مدفوعة CliQ)\n`;
          }
        } else {
          text += `${idx + 1}. [${o.id}] ${o.customer_name} (${o.area}): ${formatCurrency(collectedOf(o))} (كاش)\n`;
        }
      });
      text += `\n`;
    }

    if (closingNotes) {
      text += `📝 *ملاحظات الإغلاق:* ${closingNotes}\n\n`;
    }

    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `تم الإنشاء آلياً عبر نظام Betolla ERP`;

    return text;
  }, [driver.name, todayFormatted, isShiftClosed, stats, countedCash, cashDifference, closingNotes]);

  // Send WhatsApp Action
  const handleSendWhatsApp = () => {
    const encoded = encodeURIComponent(whatsAppReportText);
    const url = `https://wa.me/${SUPERVISOR_WHATSAPP}?text=${encoded}`;
    window.open(url, "_blank");
    showToast("تم فتح تطبيق واتساب مع تقرير الوردية المنسق", "success");
  };

  // Copy to clipboard
  const handleCopyReport = async () => {
    try {
      await navigator.clipboard.writeText(whatsAppReportText);
      setCopiedReport(true);
      showToast("تم نسخ نص التقرير بالكامل للحافظة", "success");
      setTimeout(() => setCopiedReport(false), 2500);
    } catch {
      showToast("فشل النسخ، يرجى المحاولة يدوياً", "error");
    }
  };

  const postShift = async (body: Record<string, unknown>) => {
    const res = await secureFetch('/api/driver', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isManager ? { ...body, driverName: managedDriver } : body),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || "تعذر حفظ الوردية.");
    return data.shift as DriverShiftSummary;
  };

  const openCloseModal = () => {
    setCountedInput(countedCash > 0 ? String(countedCash) : "");
    setShowCloseModal(true);
  };

  // Confirm shift close: the counted cash is what gets stored; the expected total comes from the server.
  const handleConfirmCloseShift = async () => {
    const counted = Number(countedInput);
    if (countedInput.trim() === "" || !Number.isFinite(counted) || counted < 0) {
      showToast("أدخل مبلغ الكاش الذي عددته (0 إذا لا يوجد).", "warning", 5000);
      return;
    }
    setClosingShift(true);
    try {
      const saved = await postShift({ action: 'close_shift', notes: closingNotes, countedCash: counted });
      applyShift(saved);
      setShowCloseModal(false);
      const closure = saved.closure;
      setDoneModalInfo({
        isOpen: true,
        title: "تم إغلاق الوردية 🔒",
        subtitle: closure && closure.counted_cash !== null && Number(closure.counted_cash) !== Number(closure.cash_collected)
          ? `تم الحفظ مع فرق نقدي ${formatCurrency(Number(closure.counted_cash) - Number(closure.cash_collected))} بين المعدود والمسجل.`
          : "تم حفظ تقرير الوردية والكاش المعدود في قاعدة البيانات.",
        closedAt: closure?.closed_at ? new Date(closure.closed_at).toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' }) : undefined,
        cashCollected: closure ? Number(closure.counted_cash) : counted,
        deliveredCount: closure?.delivered_count ?? saved.delivered_count,
        returnedCount: closure?.returned_count ?? saved.returned_count,
      });
    } catch (e) {
      showToast(e instanceof Error ? e.message : "تعذر إغلاق الوردية. أعد المحاولة.", "error", 5000);
    } finally {
      setClosingShift(false);
    }
  };

  // Reopening a closed shift needs a delivery manager (the server enforces it too).
  const handleReopenShift = async () => {
    if (!isManager) return;
    setReopeningShift(true);
    try {
      applyShift(await postShift({ action: 'reopen_shift' }));
      showToast(`تمت إعادة فتح وردية ${managedDriver}`, "info");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "تعذر إعادة فتح الوردية.", "error", 4000);
    } finally {
      setReopeningShift(false);
    }
  };

  // Print manifest
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 pb-20 max-w-6xl mx-auto">
      {/* Printable CSS Hook */}
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
            direction: rtl !important;
          }
          aside, header, nav, .no-print {
            display: none !important;
          }
          .print-only {
            display: block !important;
          }
          .print-break-inside-avoid {
            break-inside: avoid;
          }
        }
        @media screen {
          .print-only {
            display: none !important;
          }
        }
      `}</style>

      {/* Breadcrumb & Navigation Header */}
      <div className="no-print flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/driver"
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-stone-200 text-stone-700 hover:text-amber-600 hover:border-amber-300 font-bold text-xs transition shadow-xs active:scale-95"
          >
            <ArrowRight className="w-4 h-4" />
            <span>العودة لطلبات التوصيل</span>
          </Link>
          <div className="h-4 w-px bg-stone-200" />
          <span className="text-xs font-semibold text-stone-400">إغلاق الوردية والتقرير المالي</span>
          {isManager && (
            <select
              id="shift-driver"
              aria-label="اختر السائق"
              value={managedDriver}
              onChange={(e) => { setManagedDriver(e.target.value); setLoading(true); loadDriverShiftData(e.target.value); }}
              className="px-3 py-2 rounded-xl bg-white border border-stone-200 text-xs font-bold"
            >
              {DRIVERS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
        </div>

        {/* Shift status badge */}
        <div className="flex items-center gap-2">
          {isShiftClosed ? (
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-black shadow-xs animate-slideUp">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>الوردية مغلقة ({closedAt})</span>
              {isManager && (
                <button
                  onClick={handleReopenShift}
                  disabled={reopeningShift}
                  title="إعادة فتح الوردية" aria-label="إعادة فتح الوردية"
                  className="ms-1 underline text-emerald-900 hover:text-emerald-700 cursor-pointer text-[11px] disabled:opacity-60"
                >
                  (إعادة فتح)
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold shadow-xs">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulseDot" />
              <span>الوردية جارية (مفتوحة)</span>
            </div>
          )}
        </div>
      </div>

      {loadError && (
        <div role="alert" className="no-print bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl px-4 py-3 text-sm font-bold">{loadError}</div>
      )}
      {loading && <div className="no-print text-sm text-stone-500">جاري تحميل الوردية...</div>}

      {/* Main Luxury Driver Banner */}
      <div className="no-print relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#160f02] via-[#241a08] to-[#160f02] text-[#f4e5d0] p-6 sm:p-8 border border-[#554625] shadow-xl">
        {/* Subtle decorative gold line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#9e8959] to-transparent" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#9e8959] to-[#c28a40] text-[#160f02] flex items-center justify-center text-3xl font-black shadow-lg shadow-[#9e8959]/25 shrink-0 border border-white/20">
              {driver.avatar}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-white">{driver.name}</h1>
                <span className="px-2 py-0.5 rounded-lg bg-[#35270e] text-[#9e8959] border border-[#554625] text-[11px] font-bold">
                  كشف نهاية اليوم
                </span>
              </div>
              <p className="text-xs sm:text-sm text-[#9e8959] mt-1 flex items-center gap-2 font-medium">
                <Calendar className="w-3.5 h-3.5" />
                <span>{todayFormatted}</span>
                <span className="text-[#554625]">•</span>
                <span>المشرف المسؤول: ضياء ({SUPERVISOR_PHONE})</span>
              </p>
            </div>
          </div>

          {/* Quick Action Buttons Group */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#241a08] hover:bg-[#35270e] text-[#f4e5d0] border border-[#554625] text-xs font-bold transition cursor-pointer active:scale-95"
            >
              <Printer className="w-4 h-4 text-[#9e8959]" />
              <span>طباعة الكشف</span>
            </button>

            <button
              onClick={handleSendWhatsApp}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-900/30 transition cursor-pointer active:scale-95"
            >
              <MessageSquare className="w-4 h-4" />
              <span>تقرير واتساب فوري</span>
            </button>

            {!isShiftClosed ? (
              <button
                onClick={openCloseModal}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#9e8959] via-[#bda66d] to-[#9e8959] text-[#160f02] font-black text-xs shadow-lg shadow-[#9e8959]/30 hover:shadow-xl transition cursor-pointer active:scale-95"
              >
                <Lock className="w-4 h-4" />
                <span>إغلاق الوردية وتسليم العهدة</span>
              </button>
            ) : isManager ? (
              <button
                onClick={handleReopenShift}
                disabled={reopeningShift}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#241a08] border border-[#554625] text-[#9e8959] font-bold text-xs transition cursor-pointer active:scale-95 disabled:opacity-60"
              >
                <Unlock className="w-4 h-4" />
                <span>{reopeningShift ? 'جاري الفتح...' : 'إعادة فتح الوردية'}</span>
              </button>
            ) : (
              <span className="px-4 py-2.5 rounded-xl bg-[#241a08] border border-[#554625] text-[#9e8959] font-bold text-xs">
                الوردية مغلقة — لإعادة فتحها تواصل مع المشرف
              </span>
            )}
          </div>
        </div>
      </div>

      {/* KPI Financial & Operations Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* 1. Cash In Hand (The Big COD Metric) */}
        <div className="bg-white rounded-3xl p-5 border-2 border-amber-300/80 shadow-md shadow-amber-500/5 relative overflow-hidden animate-slideUp">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-[#9e8959] to-amber-400" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-stone-500">إجمالي الكاش المحصل (COD)</span>
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/25">
              <Banknote className="w-5 h-5" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-2xl sm:text-3xl font-black text-stone-900 font-mono tracking-tight">
              {formatCurrency(stats.totalCashCollected)}
            </div>
            <div className="flex items-center justify-between text-[11px] text-stone-500 pt-1">
              <span>المطلوب تسليمه للصندوق</span>
              <button
                onClick={() => setShowDenomCalc(!showDenomCalc)}
                className="text-amber-700 hover:text-amber-800 font-bold underline cursor-pointer"
              >
                {showDenomCalc ? "إخفاء الفئات ▲" : "حاسبة الفئات ▼"}
              </button>
            </div>
          </div>
        </div>

        {/* 2. Delivered Packages */}
        <div className="bg-white rounded-3xl p-5 border border-stone-200/80 shadow-xs relative overflow-hidden animate-slideUp" style={{ animationDelay: '80ms' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-stone-500">تم التسليم بنجاح</span>
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-emerald-700 font-mono">
                {stats.deliveredCount}
              </span>
              <span className="text-xs text-stone-400 font-bold">من أصل {stats.totalOrders} طرد</span>
            </div>
            <div className="w-full bg-stone-100 rounded-full h-2 mt-2 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${stats.completionRate}%` }}
              />
            </div>
            <div className="text-[11px] text-stone-400 pt-0.5">
              نسبة الإنجاز: {stats.completionRate}%
            </div>
          </div>
        </div>

        {/* 3. Returns to Warehouse */}
        <div className="bg-white rounded-3xl p-5 border border-stone-200/80 shadow-xs relative overflow-hidden animate-slideUp" style={{ animationDelay: '160ms' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-stone-500">مرتجع للمستودع</span>
            <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shadow-xs">
              <RotateCcw className="w-5 h-5" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-rose-700 font-mono">
                {stats.returnedCount}
              </span>
              <span className="text-xs text-stone-400 font-bold">طرد للمستودع</span>
            </div>
            <p className="text-[11px] text-stone-400 pt-1">
              {stats.returnedCount > 0 ? "يجب تسليمها لأمين المستودع" : "لا توجد مرتجعات اليوم"}
            </p>
          </div>
        </div>

        {/* 4. Postponed / Pending */}
        <div className="bg-white rounded-3xl p-5 border border-stone-200/80 shadow-xs relative overflow-hidden animate-slideUp" style={{ animationDelay: '240ms' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-stone-500">مؤجل / قيد المتابعة</span>
            <div className="w-10 h-10 rounded-2xl bg-stone-100 text-stone-700 flex items-center justify-center shadow-xs">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-stone-800 font-mono">
                {stats.postponedCount + stats.pendingCount}
              </span>
              <span className="text-xs text-stone-400 font-bold">طرد معلق</span>
            </div>
            <p className="text-[11px] text-stone-400 pt-1">
              {stats.postponedCount} مؤجل • {stats.pendingCount} متبقي
            </p>
          </div>
        </div>
      </div>

      {/* Cash Denominations Handover Calculator (Interactive Dropdown / Card) */}
      {showDenomCalc && (
        <div className="no-print bg-white rounded-3xl p-6 border border-amber-300/80 shadow-lg shadow-amber-500/5 animate-modalSlideUp">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-stone-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                <Coins className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-stone-900 text-sm">حاسبة فئات النقدية (جرد الكاش في يد السائق)</h3>
                <p className="text-xs text-stone-400">أدخل عدد الأوراق النقدية للتأكد من مطابقة الكاش قبل تسليم الصندوق</p>
              </div>
            </div>
            <button
              onClick={() => setShowDenomCalc(false)}
              aria-label="إخفاء حاسبة النقدية"
              className="text-stone-400 hover:text-stone-600 p-1.5 rounded-lg hover:bg-stone-100"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            {/* 50 JOD */}
            <div className="bg-stone-50 p-3 rounded-2xl border border-stone-200/80 text-center">
              <span className="text-xs font-black text-stone-700 block mb-1">50 دينار</span>
              <input
                type="number"
                min="0"
                value={denoms.fifty || ""}
                onChange={(e) => setDenoms({ ...denoms, fifty: Math.max(0, parseInt(e.target.value) || 0) })}
                placeholder="0"
                className="w-full text-center font-mono font-black text-lg py-1 bg-white rounded-xl border border-stone-300 focus:border-amber-500 outline-none"
              />
              <span className="text-[10px] text-stone-400 font-mono mt-1 block">
                = {formatCurrency(denoms.fifty * 50)}
              </span>
            </div>

            {/* 20 JOD */}
            <div className="bg-stone-50 p-3 rounded-2xl border border-stone-200/80 text-center">
              <span className="text-xs font-black text-stone-700 block mb-1">20 دينار</span>
              <input
                type="number"
                min="0"
                value={denoms.twenty || ""}
                onChange={(e) => setDenoms({ ...denoms, twenty: Math.max(0, parseInt(e.target.value) || 0) })}
                placeholder="0"
                className="w-full text-center font-mono font-black text-lg py-1 bg-white rounded-xl border border-stone-300 focus:border-amber-500 outline-none"
              />
              <span className="text-[10px] text-stone-400 font-mono mt-1 block">
                = {formatCurrency(denoms.twenty * 20)}
              </span>
            </div>

            {/* 10 JOD */}
            <div className="bg-stone-50 p-3 rounded-2xl border border-stone-200/80 text-center">
              <span className="text-xs font-black text-stone-700 block mb-1">10 دنانير</span>
              <input
                type="number"
                min="0"
                value={denoms.ten || ""}
                onChange={(e) => setDenoms({ ...denoms, ten: Math.max(0, parseInt(e.target.value) || 0) })}
                placeholder="0"
                className="w-full text-center font-mono font-black text-lg py-1 bg-white rounded-xl border border-stone-300 focus:border-amber-500 outline-none"
              />
              <span className="text-[10px] text-stone-400 font-mono mt-1 block">
                = {formatCurrency(denoms.ten * 10)}
              </span>
            </div>

            {/* 5 JOD */}
            <div className="bg-stone-50 p-3 rounded-2xl border border-stone-200/80 text-center">
              <span className="text-xs font-black text-stone-700 block mb-1">5 دنانير</span>
              <input
                type="number"
                min="0"
                value={denoms.five || ""}
                onChange={(e) => setDenoms({ ...denoms, five: Math.max(0, parseInt(e.target.value) || 0) })}
                placeholder="0"
                className="w-full text-center font-mono font-black text-lg py-1 bg-white rounded-xl border border-stone-300 focus:border-amber-500 outline-none"
              />
              <span className="text-[10px] text-stone-400 font-mono mt-1 block">
                = {formatCurrency(denoms.five * 5)}
              </span>
            </div>

            {/* 1 JOD */}
            <div className="bg-stone-50 p-3 rounded-2xl border border-stone-200/80 text-center">
              <span className="text-xs font-black text-stone-700 block mb-1">1 دينار</span>
              <input
                type="number"
                min="0"
                value={denoms.one || ""}
                onChange={(e) => setDenoms({ ...denoms, one: Math.max(0, parseInt(e.target.value) || 0) })}
                placeholder="0"
                className="w-full text-center font-mono font-black text-lg py-1 bg-white rounded-xl border border-stone-300 focus:border-amber-500 outline-none"
              />
              <span className="text-[10px] text-stone-400 font-mono mt-1 block">
                = {formatCurrency(denoms.one * 1)}
              </span>
            </div>

            {/* Coins / Fractions */}
            <div className="bg-stone-50 p-3 rounded-2xl border border-stone-200/80 text-center">
              <span className="text-xs font-black text-stone-700 block mb-1">فراطة / قروش</span>
              <input
                type="number"
                step="0.05"
                min="0"
                value={denoms.coins || ""}
                onChange={(e) => setDenoms({ ...denoms, coins: Math.max(0, parseFloat(e.target.value) || 0) })}
                placeholder="0.00"
                className="w-full text-center font-mono font-black text-lg py-1 bg-white rounded-xl border border-stone-300 focus:border-amber-500 outline-none"
              />
              <span className="text-[10px] text-stone-400 font-mono mt-1 block">
                = {formatCurrency(denoms.coins || 0)}
              </span>
            </div>
          </div>

          {/* Calculator Summary Result */}
          <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200/80 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <div>
                <span className="text-xs text-stone-500 block">المبلغ المعدود بيدك:</span>
                <span className="text-xl font-mono font-black text-stone-900">
                  {formatCurrency(countedCash)}
                </span>
              </div>
              <div className="h-8 w-px bg-stone-200" />
              <div>
                <span className="text-xs text-stone-500 block">المطلوب في النظام:</span>
                <span className="text-xl font-mono font-black text-amber-700">
                  {formatCurrency(stats.totalCashCollected)}
                </span>
              </div>
            </div>

            {/* Status of match */}
            <div>
              {countedCash === 0 ? (
                <span className="text-xs text-stone-400 font-bold">قم بتعبئة الفئات لحساب الفرق</span>
              ) : cashDifference === 0 ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-black">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>الكاش مطابق تماماً (0.000 د.أ) ✅</span>
                </div>
              ) : cashDifference < 0 ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-100 text-rose-800 border border-rose-300 text-xs font-black">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <span>عجز في الكاش: {formatCurrency(Math.abs(cashDifference))} ⚠️</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-100 text-amber-800 border border-amber-300 text-xs font-black">
                  <Info className="w-4 h-4 text-amber-600" />
                  <span>زيادة في الكاش: +{formatCurrency(cashDifference)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manifest Table & Categorized Orders */}
      <div className="bg-white rounded-3xl border border-stone-200/80 shadow-xs overflow-hidden">
        {/* Manifest Header with Tabs */}
        <div className="p-4 sm:p-5 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-stone-900">كشف الطرود المفصل لنهاية الوردية</h3>
            <p className="text-xs text-stone-400 mt-0.5">تفصيل كل طرد لتسليم الكاش والمرتجعات لأمين المستودع</p>
          </div>

          {/* Filter tabs */}
          <div className="no-print flex items-center bg-stone-100 p-1 rounded-2xl border border-stone-200/80 overflow-x-auto">
            <button
              onClick={() => setActiveTab('all')}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap active:scale-95",
                activeTab === 'all'
                  ? "bg-white text-stone-900 shadow-xs"
                  : "text-stone-500 hover:text-stone-900"
              )}
            >
              الكل ({stats.totalOrders})
            </button>
            <button
              onClick={() => setActiveTab('delivered')}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap active:scale-95",
                activeTab === 'delivered'
                  ? "bg-emerald-500 text-white shadow-xs"
                  : "text-stone-500 hover:text-emerald-700"
              )}
            >
              المسلم ({stats.deliveredCount})
            </button>
            <button
              onClick={() => setActiveTab('returned')}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap active:scale-95",
                activeTab === 'returned'
                  ? "bg-rose-500 text-white shadow-xs"
                  : "text-stone-500 hover:text-rose-700"
              )}
            >
              المرتجع ({stats.returnedCount})
            </button>
            <button
              onClick={() => setActiveTab('postponed')}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap active:scale-95",
                activeTab === 'postponed'
                  ? "bg-stone-800 text-white shadow-xs"
                  : "text-stone-500 hover:text-stone-800"
              )}
            >
              المؤجل ({stats.postponedCount + stats.pendingCount})
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-stone-50 text-stone-500 font-bold border-b border-stone-200">
              <tr>
                <th className="py-3.5 px-4">رقم الشحنة</th>
                <th className="py-3.5 px-4">العميل / الهاتف</th>
                <th className="py-3.5 px-4">المنطقة والمدينة</th>
                <th className="py-3.5 px-4">المنتجات المطلوبة</th>
                <th className="py-3.5 px-4">طريقة الدفع (CliQ / كاش)</th>
                <th className="py-3.5 px-4">كاش مطلوب (COD)</th>
                <th className="py-3.5 px-4">حالة الطلب</th>
                <th className="py-3.5 px-4">ملاحظات / سبب الإرجاع</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-stone-400">
                    لا توجد طرود مطابقة لهذا التصنيف
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-stone-50/60 transition">
                    <td className="py-3 px-4 font-mono font-bold text-amber-700 whitespace-nowrap">
                      {order.id}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-bold text-stone-900">{order.customer_name}</div>
                      <div className="text-[11px] text-stone-400 font-mono">{order.phone}</div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-bold text-stone-800">{order.area}</span>
                      <div className="text-[10px] text-stone-400 truncate max-w-[160px]">{order.address}</div>
                    </td>
                    <td className="py-3 px-4 max-w-[220px]">
                      <span className="text-[11px] text-stone-600 line-clamp-1">{order.products}</span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {order.payment_method === 'cliq' ? (
                        order.cliq_includes_delivery ? (
                          <span className="px-2 py-0.5 rounded-lg bg-purple-100 text-purple-900 border border-purple-200 font-bold text-[10px] inline-flex items-center gap-1 shadow-2xs">
                            <CreditCard className="w-3 h-3 text-purple-700" />
                            <span>CliQ شامل التوصيل</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-lg bg-blue-100 text-blue-900 border border-blue-200 font-bold text-[10px] inline-flex items-center gap-1 shadow-2xs">
                            <CreditCard className="w-3 h-3 text-blue-700" />
                            <span>CliQ (تحصيل توصيل)</span>
                          </span>
                        )
                      ) : (
                        <span className="px-2 py-0.5 rounded-lg bg-stone-100 text-stone-700 border border-stone-200 font-medium text-[10px] inline-flex items-center gap-1">
                          <Banknote className="w-3 h-3 text-emerald-600" />
                          <span>كاش عند الاستلام</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-mono font-bold text-sm">
                      {order.payment_method === 'cliq' && order.cliq_includes_delivery ? (
                        <span className="text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 text-xs">
                          0.000 د.أ (مدفوع)
                        </span>
                      ) : order.payment_method === 'cliq' && !order.cliq_includes_delivery ? (
                        <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-xs">
                          {formatCurrency(order.cash_to_collect)} (توصيل)
                        </span>
                      ) : order.status === 'delivered' ? (
                        <span className="text-emerald-700">{formatCurrency(order.cash_to_collect)}</span>
                      ) : (
                        <span className="text-stone-400">{formatCurrency(order.cash_to_collect)}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {order.status === 'delivered' && (
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-[11px] inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          تم التسليم
                        </span>
                      )}
                      {order.status === 'returned' && (
                        <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 border border-rose-200 font-bold text-[11px] inline-flex items-center gap-1">
                          <RotateCcw className="w-3 h-3 text-rose-600" />
                          مرتجع للمستودع
                        </span>
                      )}
                      {order.status === 'postponed' && (
                        <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 border border-amber-200 font-bold text-[11px] inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-600" />
                          مؤجل ({order.postpone_date || "لاحقاً"})
                        </span>
                      )}
                      {(order.status === 'pending' || order.status === 'remaining') && (
                        <span className="px-2.5 py-1 rounded-lg bg-stone-100 text-stone-700 border border-stone-200 font-bold text-[11px] inline-flex items-center gap-1">
                          <Package className="w-3 h-3 text-stone-500" />
                          معلق / بالسيارة
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {order.status === 'returned' && (
                        <span className="font-bold text-rose-700 text-[11px]">
                          {order.return_reason || "رفض الاستلام"}
                        </span>
                      )}
                      {order.status === 'postponed' && (
                        <span className="text-stone-500 text-[11px]">
                          تأجيل لتاريخ: {order.postpone_date || "غير محدد"}
                        </span>
                      )}
                      {order.status === 'delivered' && (
                        <span className="text-emerald-600 text-[11px] font-medium">
                          تم تحصيل المبلغ نقداً
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Manifest Table Footer Summary */}
        <div className="bg-stone-50 p-4 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-stone-500">
            عدد الطرود المعروضة: <span className="font-bold text-stone-900">{filteredOrders.length}</span> من أصل <span className="font-bold text-stone-900">{stats.totalOrders}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-stone-600 font-bold">مجموع الكاش المحصل المعتمد:</span>
            <span className="text-base font-mono font-black text-emerald-700 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-200">
              {formatCurrency(stats.totalCashCollected)}
            </span>
          </div>
        </div>
      </div>

      {/* WhatsApp Report Preview & Action Dock */}
      <div className="no-print bg-white rounded-3xl p-6 border border-stone-200/80 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900">تقرير الوردية المباشر لمشرف العمليات (واتساب)</h3>
              <p className="text-xs text-stone-400">يمكنك إرسال التقرير بنقرة واحدة أو نسخه ومشاركته</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyReport}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold transition cursor-pointer active:scale-95"
            >
              {copiedReport ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              <span>{copiedReport ? "تم النسخ!" : "نسخ التقرير"}</span>
            </button>

            <button
              onClick={() => setShowWhatsAppPreview(!showWhatsAppPreview)}
              className="px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold transition cursor-pointer"
            >
              {showWhatsAppPreview ? "إخفاء المعاينة ▲" : "معاينة النص ▼"}
            </button>

            <button
              onClick={handleSendWhatsApp}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md shadow-emerald-700/20 transition cursor-pointer active:scale-95"
            >
              <MessageSquare className="w-4 h-4" />
              <span>إرسال عبر واتساب الآن</span>
            </button>
          </div>
        </div>

        {/* WhatsApp Message Preview Box */}
        {showWhatsAppPreview && (
          <div className="bg-stone-900 text-emerald-400 p-4 rounded-2xl font-mono text-xs whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto border border-stone-800 animate-slideUp select-all">
            {whatsAppReportText}
          </div>
        )}
      </div>

      {/* Printable Voucher Section (Only Visible in Print) */}
      <div className="print-only p-8 text-black space-y-6">
        {/* Header */}
        <div className="text-center border-b-2 border-black pb-4">
          <h1 className="text-2xl font-black">شركة بيتولا لمستحضرات التجميل - BETOLLA COSMETICS</h1>
          <h2 className="text-lg font-bold mt-1">سند استلام عهدة نقدية وطرود مرتجعة (إغلاق وردية)</h2>
          <p className="text-xs mt-1">عمان - المملكة الأردنية الهاشمية • هاتف الإدارة: {SUPERVISOR_PHONE}</p>
        </div>

        {/* Voucher Meta */}
        <div className="grid grid-cols-3 gap-4 text-xs font-bold border-b pb-4">
          <div>اسم المندوب: <span className="font-normal">{driver.name}</span></div>
          <div>التاريخ: <span className="font-normal">{todayFormatted}</span></div>
          <div>حالة الوردية: <span className="font-normal">{isShiftClosed ? "مغلقة ومعتمدة" : "مفتوحة"}</span></div>
        </div>

        {/* Financial Summary */}
        <div className="bg-gray-100 p-4 rounded-lg text-sm">
          <div className="font-black text-base mb-2">البيان المالي للعهدة:</div>
          <div className="grid grid-cols-2 gap-2">
            <div>إجمالي النقدية المحصلة (المسلمة للصندوق):</div>
            <div className="font-mono font-bold text-base">{formatCurrency(stats.totalCashCollected)}</div>
            <div>عدد الطرود المسلمة بنجاح:</div>
            <div>{stats.deliveredCount} طرد</div>
            <div>عدد الطرود المرتجعة للمستودع:</div>
            <div>{stats.returnedCount} طرد</div>
            <div>عدد الطرود المؤجلة/المتبقية:</div>
            <div>{stats.postponedCount + stats.pendingCount} طرد</div>
          </div>
        </div>

        {/* Itemized Returns Checklist for Inventory Keeper */}
        {stats.returnedOrders.length > 0 && (
          <div className="border border-black p-3 rounded">
            <h4 className="font-black text-xs mb-2">قائمة الطرود المرتجعة المستلمة للمستودع:</h4>
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="border-b font-bold">
                  <th className="py-1">رقم الطلب</th>
                  <th className="py-1">اسم العميل</th>
                  <th className="py-1">المنطقة</th>
                  <th className="py-1">سبب الإرجاع</th>
                  <th className="py-1">تأكيد الاستلام</th>
                </tr>
              </thead>
              <tbody>
                {stats.returnedOrders.map((o) => (
                  <tr key={o.id} className="border-b">
                    <td className="py-1 font-mono">{o.id}</td>
                    <td className="py-1">{o.customer_name}</td>
                    <td className="py-1">{o.area}</td>
                    <td className="py-1">{o.return_reason || "رفض الاستلام"}</td>
                    <td className="py-1">[  ] تم الفحص والإرجاع</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Signatures Section */}
        <div className="grid grid-cols-3 gap-8 pt-12 text-center text-xs">
          <div>
            <p className="font-bold mb-8">توقيع المندوب المسلّم:</p>
            <p>.......................................</p>
          </div>
          <div>
            <p className="font-bold mb-8">توقيع أمين المستودع المستلم:</p>
            <p>.......................................</p>
          </div>
          <div>
            <p className="font-bold mb-8">توقيع أمين الصندوق / المحاسب:</p>
            <p>.......................................</p>
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Shift Close */}
      {showCloseModal && (
        <div data-dialog="" className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-backdropFadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200 animate-modalSlideUp space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2.5 text-stone-900">
                <div className="w-9 h-9 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base">تأكيد إغلاق الوردية اليومية</h3>
                  <p className="text-xs text-stone-400">مراجعة البيانات قبل اعتماد التسليم</p>
                </div>
              </div>
              <button
                onClick={() => setShowCloseModal(false)}
                className="text-stone-400 hover:text-stone-600 p-1.5 rounded-lg hover:bg-stone-100"
              >
                ✕
              </button>
            </div>

            {/* Warning if there are pending packages */}
            {stats.pendingCount > 0 && (
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">يوجد {stats.pendingCount} طرود لم يتم تحديثها!</span>
                  <span>يرجى التأكد من تسليمها أو تحويلها لمرتجع/مؤجل قبل الإغلاق.</span>
                </div>
              </div>
            )}

            {/* Summary List */}
            <div className="bg-stone-50 rounded-2xl p-4 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-stone-500">الكاش المسجل على طلبات اليوم:</span>
                <span className="font-mono font-black text-emerald-700 text-sm">
                  {formatCurrency(stats.totalCashCollected)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-stone-500">الطرود المسلمة بنجاح:</span>
                <span className="font-bold text-stone-800">{stats.deliveredCount} طرد</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-stone-500">الطرود المرتجعة للمستودع:</span>
                <span className="font-bold text-rose-700">{stats.returnedCount} طرد</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-stone-500">الطرود المؤجلة:</span>
                <span className="font-bold text-stone-600">{stats.postponedCount} طرد</span>
              </div>
            </div>

            <div>
              <label htmlFor="counted-cash" className="text-xs font-bold text-stone-700 block mb-1">
                الكاش الذي عددته فعلًا (دينار):
              </label>
              <input
                id="counted-cash"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.001"
                value={countedInput}
                onChange={(e) => setCountedInput(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border-2 border-stone-200 rounded-xl text-lg font-mono font-black text-center outline-none focus:border-amber-500"
                dir="ltr"
              />
              {countedInput.trim() !== "" && Number(countedInput) !== stats.totalCashCollected && (
                <p className="mt-1 text-[11px] font-bold text-orange-700">
                  فرق عن المسجل: {formatCurrency(Number(countedInput) - stats.totalCashCollected)} — سيُحفظ الفرق مع الإغلاق.
                </p>
              )}
            </div>

            {/* Closing Notes */}
            <div>
              <label className="text-xs font-bold text-stone-700 block mb-1">
                ملاحظات الإغلاق والتسليم (اختياري):
              </label>
              <textarea
                value={closingNotes}
                onChange={(e) => setClosingNotes(e.target.value)}
                placeholder="مثال: تم تسليم الكاش للمشرف ضياء واستلام إشعار الإيداع..."
                rows={2}
                className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs outline-none focus:border-amber-500"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setShowCloseModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-stone-200 text-stone-600 text-xs font-bold hover:bg-stone-50 transition cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={handleConfirmCloseShift}
                disabled={closingShift}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#9e8959] to-[#c28a40] text-[#160f02] text-xs font-black shadow-md shadow-[#9e8959]/20 hover:shadow-lg transition cursor-pointer active:scale-95 disabled:opacity-60"
              >
                {closingShift ? 'جاري الحفظ...' : 'تأكيد واعتماد الإغلاق'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- DONE / SUCCESS MODAL ---------------- */}
      {doneModalInfo.isOpen && (
        <div data-dialog=""
          className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setDoneModalInfo(prev => ({ ...prev, isOpen: false }))}
        >
          <div
            className="bg-white w-full max-w-sm rounded-3xl p-6 sm:p-7 shadow-2xl border border-emerald-100 text-center space-y-4 animate-in zoom-in-95"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner ring-8 ring-emerald-50">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div>
              <h3 className="text-xl font-black text-stone-900">{doneModalInfo.title}</h3>
              <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">{doneModalInfo.subtitle}</p>
            </div>

            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 space-y-2.5 text-right">
              {doneModalInfo.closedAt && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-stone-400">وقت الإغلاق:</span>
                  <span className="font-mono font-bold text-stone-800 bg-stone-200/70 px-2 py-0.5 rounded">
                    {doneModalInfo.closedAt}
                  </span>
                </div>
              )}
              {doneModalInfo.cashCollected !== undefined && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-stone-600 font-bold">إجمالي الكاش المورد:</span>
                  <span className="font-mono font-black text-emerald-600 text-sm">
                    {formatCurrency(doneModalInfo.cashCollected)}
                  </span>
                </div>
              )}
              {doneModalInfo.deliveredCount !== undefined && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-stone-400">الطلبات المسلمة:</span>
                  <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    {doneModalInfo.deliveredCount} طرد
                  </span>
                </div>
              )}
              {doneModalInfo.returnedCount !== undefined && doneModalInfo.returnedCount > 0 && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-stone-400">المرتجع للمستودع:</span>
                  <span className="font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                    {doneModalInfo.returnedCount} طرد
                  </span>
                </div>
              )}
            </div>

            <button
              onClick={() => setDoneModalInfo(prev => ({ ...prev, isOpen: false }))}
              className="w-full py-3.5 rounded-2xl bg-stone-900 hover:bg-stone-800 text-amber-400 font-black text-sm shadow-lg transition active:scale-95 cursor-pointer"
            >
              تم ومتابعة العمل
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
