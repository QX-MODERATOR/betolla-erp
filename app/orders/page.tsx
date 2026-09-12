"use client";

import { useEffect, useState } from "react";
import {
  ShoppingCart,
  Sparkles,
  CheckCircle2,
  Printer,
  RotateCcw,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { formatCurrency, ORDER_STATUS_LABELS } from "@/lib/utils";
import { parseWhatsAppOrderText } from "@/lib/order-parser";
import { useLoading } from "@/lib/loading-context";

interface Order {
  id: string;
  customer_name: string;
  customer_phone: string;
  city: string;
  address: string;
  items_summary: string;
  total_amount: number;
  source: string;
  status: string;
  order_date: string;
  payment_method: string;
  installment_notes: string | null;
}

export default function OrdersPage() {
  const { startLoading, stopLoading } = useLoading();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("all");

  // Per-row in-flight tracking so a double-click can't fire two requests
  // for the same order, and so only the affected row shows a spinner.
  const [pendingOrderIds, setPendingOrderIds] = useState<Set<string>>(new Set());

  // WhatsApp Parser Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [rawText, setRawText] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Waybill / Invoice Printable Modal
  const [waybillOrder, setWaybillOrder] = useState<Order | null>(null);

  const sample1 = `8/9 الثلاثاء

سدين غنايم
0793937385
طبربور /شارع الامير حسين عماره 101

2 شامبو بلازما
100مل تريتمنت

24 د

رحمه الجمّال /سوشال ميديا`;

  const sample2 = `الخميس 10/9 حجز
ربى صبيح
0799193505
3بكجات مورفوزيس 250
2ليف أن
5سيشتات

95د

حجز شهر
صابرين`;

  const preview = rawText ? parseWhatsAppOrderText(rawText) : null;

  async function loadOrders() {
    setIsLoadingOrders(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/orders", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "تعذر تحميل الطلبات.");
      }
      setOrders(data.orders || []);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : "تعذر تحميل الطلبات.");
    } finally {
      setIsLoadingOrders(false);
    }
  }

  // Always load from the server — never from local/mock state — so a page
  // refresh, a different tab, or a different device all show the same
  // real, persisted data. isLoadingOrders already starts `true`, so the
  // only state updates here happen inside .then()/.catch() continuations,
  // never synchronously in the effect body itself.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/orders", { cache: "no-store" })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok || !data.success) {
          setLoadError(data.error || "تعذر تحميل الطلبات.");
          return;
        }
        setOrders(data.orders || []);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "تعذر تحميل الطلبات.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingOrders(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleParseAndCreateOrder = async () => {
    if (!rawText.trim() || !preview || isCreating) return;

    setIsCreating(true);
    setCreateError(null);
    startLoading({
      ar: "جاري تحليل نص الرسالة آلياً وتثبيت الطلبية في النظام...",
      en: "Parsing message & confirming order in ERP...",
    });

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "فشل إنشاء الطلب.");
      }

      // Re-fetch from the server rather than trusting only the response we
      // just got — this is what actually proves the write was persisted,
      // not just echoed back.
      await loadOrders();
      setRawText("");
      setModalOpen(false);
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "فشل إنشاء الطلب.");
    } finally {
      setIsCreating(false);
      stopLoading();
    }
  };

  async function patchOrder(orderId: string, action: "advance" | "return") {
    if (pendingOrderIds.has(orderId)) return; // guard against double submission
    setPendingOrderIds((prev) => new Set(prev).add(orderId));
    startLoading({
      ar: "جاري تحديث مسار الشحنة وحالة الطلب...",
      en: "Updating order status & delivery dispatch...",
    });

    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "فشل تحديث حالة الطلب.");
      }
      setOrders((prev) => prev.map((o) => (o.id === orderId ? data.order : o)));
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : "فشل تحديث حالة الطلب.");
    } finally {
      setPendingOrderIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
      stopLoading();
    }
  }

  const advanceOrder = (orderId: string) => patchOrder(orderId, "advance");
  const markOrderReturned = (orderId: string) => patchOrder(orderId, "return");

  const filteredOrders = orders.filter(o => {
    if (activeTab === "all") return true;
    return o.status === activeTab;
  });

  return (
    <div className="space-y-6">
      {/* Header Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5">
            <ShoppingCart className="w-6 h-6 text-amber-500" />
            <span>إدارة وتأكيد الطلبات (Order Lifecycle)</span>
          </h2>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            تحويل طلبيات الواتساب آلياً، إدارة دورة التوصيل، وطباعة بوالص الشحن لسائقي التوصيل
          </p>
        </div>

        <button
          onClick={() => { setCreateError(null); setModalOpen(true); }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-sm rounded-xl shadow-xs transition"
        >
          <Sparkles className="w-4 h-4" />
          <span>تحويل رسالة واتساب لطلب رسمي</span>
        </button>
      </div>

      {loadError && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">{loadError}</div>
          <button onClick={loadOrders} className="font-bold underline shrink-0">إعادة المحاولة</button>
        </div>
      )}

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-stone-200 pb-2 overflow-x-auto">
        {[
          { id: "all", label: "كافة الطلبات", count: orders.length },
          { id: "draft", label: "مسودات وحجوزات", count: orders.filter(o => o.status === 'draft').length },
          { id: "confirmed", label: "تم التأكيد", count: orders.filter(o => o.status === 'confirmed').length },
          { id: "processing", label: "قيد التجهيز بالمستودع", count: orders.filter(o => o.status === 'processing').length },
          { id: "shipped", label: "خرج مع السائق للتوصيل", count: orders.filter(o => o.status === 'shipped').length },
          { id: "delivered", label: "تم التسليم والتحصيل", count: orders.filter(o => o.status === 'delivered').length },
          { id: "returned", label: "مرتجع", count: orders.filter(o => o.status === 'returned').length },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-stone-900 text-white shadow-xs"
                : "bg-white text-stone-600 hover:bg-stone-50 border border-stone-200"
            }`}
          >
            <span>{tab.label}</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === tab.id ? "bg-amber-500 text-stone-950 font-black" : "bg-stone-100 text-stone-600"
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-stone-100 flex items-center justify-between">
          <h3 className="font-bold text-sm text-stone-900">سجل طلبيات التوصيل</h3>
          <span className="text-xs text-stone-400">إجمالي {filteredOrders.length} طلب</span>
        </div>

        {isLoadingOrders ? (
          <div className="flex items-center justify-center gap-2 py-16 text-stone-400 text-xs">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>جاري تحميل الطلبات من قاعدة البيانات...</span>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="py-16 text-center text-stone-400 text-xs">
            لا توجد طلبات في هذا التصنيف بعد.
          </div>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-stone-50 text-stone-500 font-bold border-b border-stone-200">
              <tr>
                <th className="py-3 px-4">رقم الطلب</th>
                <th className="py-3 px-4">العميل والهاتف</th>
                <th className="py-3 px-4">المنتجات المطلوبة</th>
                <th className="py-3 px-4">العنوان والمدينة</th>
                <th className="py-3 px-4">طريقة الدفع</th>
                <th className="py-3 px-4">المبلغ المطلوب</th>
                <th className="py-3 px-4">حالة الطلب</th>
                <th className="py-3 px-4 text-center">إجراءات ودورة الطلب</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredOrders.map((order) => {
                const statusInfo = ORDER_STATUS_LABELS[order.status] || { label: order.status, color: "bg-stone-100" };
                const isPending = pendingOrderIds.has(order.id);

                return (
                  <tr key={order.id} className="hover:bg-stone-50/80 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-amber-600">
                      {order.id}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-stone-900">{order.customer_name}</div>
                      <div className="text-[11px] font-mono text-stone-500" dir="ltr">{order.customer_phone}</div>
                    </td>
                    <td className="py-3.5 px-4 max-w-xs font-medium text-stone-800">
                      {order.items_summary}
                    </td>
                    <td className="py-3.5 px-4 text-stone-600">
                      <div className="font-semibold text-stone-900">{order.city}</div>
                      <div className="text-[11px] text-stone-400 truncate max-w-xs">{order.address}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      {order.payment_method === 'installment' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                          <span>شهر / أقساط</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-stone-100 text-stone-700">
                          دفع عند الاستلام
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-stone-900 font-mono text-sm">
                      {formatCurrency(order.total_amount)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* Status Advancement Button */}
                        {order.status !== 'delivered' && order.status !== 'returned' && order.status !== 'cancelled' && (
                          <button
                            onClick={() => advanceOrder(order.id)}
                            disabled={isPending}
                            className="px-2.5 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white font-semibold text-[11px] shadow-2xs transition inline-flex items-center gap-1"
                          >
                            {isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                            {order.status === 'draft' && 'تأكيد'}
                            {order.status === 'confirmed' && 'تجهيز'}
                            {order.status === 'processing' && 'إرسال للتوصيل'}
                            {order.status === 'shipped' && 'تم التسليم'}
                          </button>
                        )}

                        {/* Waybill / Dispatch Print Button */}
                        <button
                          onClick={() => setWaybillOrder(order)}
                          className="p-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 transition"
                          title="طباعة بوليصة التوصيل / سند التسليم"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>

                        {/* Mark Returned if in shipped */}
                        {order.status === 'shipped' && (
                          <button
                            onClick={() => markOrderReturned(order.id)}
                            disabled={isPending}
                            className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 disabled:opacity-50 text-rose-700 border border-rose-200 transition"
                            title="تسجيل كطلب مرتجع"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* WhatsApp Parsing Automation Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-stone-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-lg text-stone-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  <span>محرك الأتمتة: تحويل رسائل الواتساب إلى طلبيات رسمية</span>
                </h3>
                <p className="text-xs text-stone-500 mt-1">
                  يقوم النظام باستخراج بيانات العميل، الأصناف، الأسعار، وحجز الأقساط آلياً
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg bg-stone-100 text-stone-500 hover:bg-stone-200"
              >
                ✕
              </button>
            </div>

            {/* Quick Test Samples */}
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-stone-600 block">اختيار نموذج للاختبار:</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setRawText(sample1)}
                  className="px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium transition"
                >
                  طلب التسويق (سدين غنايم - 24 د)
                </button>
                <button
                  type="button"
                  onClick={() => setRawText(sample2)}
                  className="px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium transition"
                >
                  طلب المبيعات والحجز (ربى صبيح - 95 د - شهر)
                </button>
              </div>
            </div>

            {/* Textarea */}
            <div>
              <textarea
                rows={6}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="الصق نص الرسالة المستلمة عبر الواتساب هنا..."
                className="w-full p-3 text-xs bg-stone-50 border border-stone-200 rounded-2xl focus:outline-none focus:border-amber-500 font-mono leading-relaxed"
              />
            </div>

            {/* Live Parsing Preview Card */}
            {preview && (
              <div className="p-4 bg-amber-50/60 rounded-2xl border border-amber-200/80 space-y-2 text-xs">
                <p className="font-bold text-amber-950 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>المعاينة الفورية للبيانات المستخرجة آلياً:</span>
                </p>
                <div className="grid grid-cols-2 gap-2 bg-white/80 p-3 rounded-xl border border-amber-200/50">
                  <div>
                    <span className="text-stone-400 block text-[10px]">اسم العميل:</span>
                    <span className="font-bold text-stone-900">{preview.customerName}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px]">رقم الهاتف:</span>
                    <span className="font-mono font-bold text-stone-900" dir="ltr">{preview.phone || "—"}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px]">المدينة / العنوان:</span>
                    <span className="font-medium text-stone-900">{preview.city} • {preview.address}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px]">المبلغ المستخرج:</span>
                    <span className="font-mono font-bold text-amber-600 text-sm">{formatCurrency(preview.totalAmount)}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-stone-400 block text-[10px]">الأصناف والكميات:</span>
                    <span className="font-semibold text-stone-900">{preview.itemsSummary}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px]">المندوب / المصدر:</span>
                    <span className="font-medium text-stone-800">{preview.repName} ({preview.source})</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px]">طريقة السداد:</span>
                    <span className="font-bold text-purple-700">
                      {preview.paymentMethod === 'installment' ? 'حجز شهر / أقساط' : 'دفع عند الاستلام'}
                    </span>
                  </div>
                </div>
                {!preview.phone && (
                  <p className="text-rose-600 font-semibold flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>لم يتم العثور على رقم هاتف صالح — لا يمكن اعتماد الطلب بدونه.</span>
                  </p>
                )}
              </div>
            )}

            {createError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{createError}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleParseAndCreateOrder}
                disabled={!rawText.trim() || !preview?.phone || isCreating}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 rounded-xl font-bold text-xs shadow-md shadow-amber-500/20 transition flex items-center justify-center gap-2"
              >
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>{isCreating ? "جاري الاعتماد..." : "اعتماد وتحويل الطلب فوراً"}</span>
              </button>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={isCreating}
                className="px-4 py-3 bg-stone-100 hover:bg-stone-200 disabled:opacity-50 text-stone-700 rounded-xl text-xs font-medium"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Delivery Waybill / Dispatch Slip Modal */}
      {waybillOrder && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-stone-200 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-stone-950 font-black text-xs">
                  B
                </div>
                <div>
                  <h3 className="font-bold text-sm text-stone-900">بوليصة وسند تسليم طلبية</h3>
                  <p className="text-[10px] text-stone-400">Betolla Cosmetics Delivery Slip</p>
                </div>
              </div>
              <button
                onClick={() => setWaybillOrder(null)}
                className="p-1 rounded-lg bg-stone-100 text-stone-500"
              >
                ✕
              </button>
            </div>

            {/* Waybill Card Content */}
            <div className="space-y-3 text-xs border border-dashed border-stone-300 p-4 rounded-2xl bg-stone-50">
              <div className="flex justify-between items-center pb-2 border-b border-stone-200">
                <span className="text-stone-500">رقم البوليصة:</span>
                <span className="font-mono font-black text-amber-700 text-sm">{waybillOrder.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">اسم المستلم:</span>
                <span className="font-bold text-stone-900">{waybillOrder.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">هاتف العميل:</span>
                <span className="font-mono font-bold text-stone-900" dir="ltr">{waybillOrder.customer_phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">مدينة التوصيل:</span>
                <span className="font-bold text-stone-800">{waybillOrder.city}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">العنوان التفصيلي:</span>
                <span className="font-medium text-stone-800">{waybillOrder.address}</span>
              </div>
              <div className="pt-2 border-t border-stone-200">
                <span className="text-stone-500 block mb-1">الطرود والمنتجات:</span>
                <div className="p-2.5 bg-white rounded-xl border border-stone-200 font-semibold text-stone-800">
                  {waybillOrder.items_summary}
                </div>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-stone-200 bg-amber-100/50 -mx-4 -mb-4 p-4 rounded-b-2xl">
                <span className="font-bold text-stone-900 text-sm">المبلغ المطلوب تحصيله (COD):</span>
                <span className="font-mono font-black text-lg text-amber-900">
                  {formatCurrency(waybillOrder.total_amount)}
                </span>
              </div>
            </div>

            {/* Print & Action Buttons */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة البوليصة للسائق</span>
              </button>
              <button
                type="button"
                onClick={() => setWaybillOrder(null)}
                className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-medium"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
