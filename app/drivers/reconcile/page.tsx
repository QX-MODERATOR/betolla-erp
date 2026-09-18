"use client";

import React, { useState } from "react";
import { 
  Calculator,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Save,
  Check,
  CreditCard
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { loadBusiness, saveBusiness } from "@/lib/business-client";
import { useDateFilter } from "@/lib/date-context";
import { useToast } from "@/components/common/toast";

type OrderStatus = "مكتمل" | "مرتجع" | "مؤجل" | "متبقي" | "خرج مع السائق";

interface ReconcileOrder {
  id: string;
  driver: string;
  customer: string;
  area: string;
  expectedCash: number;
  actualCash: number;
  status: OrderStatus;
  notes: string;
  paymentMethod?: 'cash' | 'cliq';
  cliqIncludesDelivery?: boolean;
  dbStatus: string;
}

// A finished order (delivered/returned) is settled; corrections go through Finance.
const isSettled = (o: ReconcileOrder) => o.dbStatus === "delivered" || o.dbStatus === "returned";


export default function ReconcilePage() {
  const { selectedDate, isToday, formattedDateLabel } = useDateFilter();
  const { showToast } = useToast();
  const [orders, setOrders] = useState<ReconcileOrder[]>([]);
  const [original, setOriginal] = useState<Record<string, ReconcileOrder>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [canReconcile, setCanReconcile] = useState(false);
  const [saving, setSaving] = useState(false);

  // Done / Success Feedback Modal
  const [doneModalInfo, setDoneModalInfo] = useState<{
    isOpen: boolean;
    title: string;
    subtitle: string;
    totalCollected?: number;
    reconciledCount?: number;
  }>({
    isOpen: false,
    title: "",
    subtitle: "",
  });

  // Reconciliation is always about one day's run, and it is usually yesterday's that needs
  // closing, so this follows the header day picker instead of being pinned to today.
  const loadReconcileData = React.useCallback(async (day: string) => {
    try {
      const data = await loadBusiness<{ reconcileOrders: ReconcileOrder[]; canReconcile: boolean }>(
        "/api/drivers?date=" + encodeURIComponent(day),
      );
      setOrders(data.reconcileOrders);
      setOriginal(Object.fromEntries(data.reconcileOrders.map((o) => [o.id, o])));
      setCanReconcile(Boolean(data.canReconcile));
      setLoadError("");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "تعذر تحميل بيانات التسوية.");
    } finally {
      setLoading(false);
    }
  }, []);
  const reloadReconcile = React.useCallback(() => loadReconcileData(selectedDate), [loadReconcileData, selectedDate]);

  React.useEffect(() => {
    void reloadReconcile();
  }, [reloadReconcile]);

  const updateOrder = (id: string, updates: Partial<ReconcileOrder>) => {
    setOrders((prev) => prev.map(o => o.id === id ? { ...o, ...updates } : o));
  };

  // Only rows the user actually changed are sent; untouched orders are never rewritten.
  const changedOrders = orders.filter((o) => {
    const before = original[o.id];
    return before && !isSettled(before) &&
      (before.status !== o.status || before.notes !== o.notes || (o.status === "مكتمل" && before.actualCash !== o.actualCash));
  });

  const handleReconcile = async () => {
    if (!changedOrders.length || saving) return;
    setSaving(true);
    const changes = changedOrders.map((o) => ({ id: o.id, dbStatus: o.dbStatus, status: o.status, actualCash: o.actualCash, notes: o.notes }));
    try {
      await saveBusiness(`driver-reconcile:${changes.map((c) => c.id).sort().join(",")}`, "/api/drivers", { action: "reconcile", changes });
      const totalCollected = changedOrders.filter(o => o.status === "مكتمل").reduce((sum, o) => sum + (o.actualCash || 0), 0);
      setDoneModalInfo({
        isOpen: true,
        title: "تم حفظ التسوية 💰",
        subtitle: "تم تسجيل الطلبات المعدلة، وقيدت المبالغ المحصلة كدفعات في المالية.",
        totalCollected,
        reconciledCount: changes.length,
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "تعذر حفظ التسوية.", "error", 8000);
    } finally {
      await reloadReconcile();
      setSaving(false);
    }
  };

  const drivers = ["خالد", "علي", "BX Arabia"];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5">
          <Calculator className="w-6 h-6 text-amber-500" />
          <span>التسوية اليومية وإغلاق الحسابات (End-of-Day Reconciliation)</span>
        </h2>
        <p className="text-xs sm:text-sm text-stone-500 mt-1">
          مراجعة الطلبات الموصلة، المرتجعات، ومطابقة النقدية مع السائقين
        </p>
      </div>

      {loadError && (
        <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl px-4 py-3 text-sm font-bold">{loadError}</div>
      )}
      {loading && <div className="text-sm text-stone-500">جاري تحميل طلبات اليوم...</div>}

      {/* Section 1: Driver Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {drivers.map(driverName => {
          const driverOrders = orders.filter(o => o.driver === driverName);
          const totalOrders = driverOrders.length;
          const delivered = driverOrders.filter(o => o.status === "مكتمل").length;
          const returned = driverOrders.filter(o => o.status === "مرتجع").length;
          const remaining = driverOrders.filter(o => ["مؤجل", "متبقي", "خرج مع السائق"].includes(o.status)).length;
          
          const expectedTotalCash = driverOrders.reduce((sum, o) => sum + o.expectedCash, 0);
          const collectedTotalCash = driverOrders.reduce((sum, o) => sum + o.actualCash, 0);
          const diff = collectedTotalCash - expectedTotalCash;

          const isMatched = diff === 0 && remaining === 0;

          return (
            <div key={driverName} className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-lg text-stone-900">حساب {driverName}</h3>
                  <p className="text-xs text-stone-500">ملخص نهاية اليوم</p>
                </div>
                {isMatched ? (
                  <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    مطابق
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 px-3 py-1 rounded-full text-xs font-bold border border-rose-200">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    يوجد فرق / معلق
                  </span>
                )}
              </div>

              <div className="grid grid-cols-4 gap-2 mb-4 bg-stone-50 p-3 rounded-xl border border-stone-100">
                <div className="text-center">
                  <div className="text-[10px] text-stone-500 mb-1">الطلبات</div>
                  <div className="font-bold text-stone-900">{totalOrders}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-stone-500 mb-1">تم التوصيل</div>
                  <div className="font-bold text-emerald-600">{delivered}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-stone-500 mb-1">مرتجع</div>
                  <div className="font-bold text-rose-600">{returned}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-stone-500 mb-1">متبقي/مؤجل</div>
                  <div className="font-bold text-amber-600">{remaining}</div>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-stone-500">النقدية المتوقعة (Expected):</span>
                  <span className="font-mono font-bold text-stone-900">{formatCurrency(expectedTotalCash)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-stone-500">النقدية المحصلة (Collected):</span>
                  <span className="font-mono font-bold text-emerald-700">{formatCurrency(collectedTotalCash)}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-stone-100">
                  <span className="font-bold text-stone-900">الفرق (Difference):</span>
                  <span className={cn("font-mono font-bold", diff < 0 ? "text-rose-600" : diff > 0 ? "text-amber-600" : "text-stone-400")}>
                    {diff > 0 ? "+" : ""}{formatCurrency(diff)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Section 2: Detailed Orders Table */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-stone-100 bg-stone-50">
          <h3 className="font-bold text-stone-900 text-sm">تفاصيل التسوية لكل طلب</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-stone-50 text-stone-500 font-bold border-b border-stone-200">
              <tr>
                <th className="py-3 px-4">السائق</th>
                <th className="py-3 px-4">رقم الطلب</th>
                <th className="py-3 px-4">العميل / المنطقة</th>
                <th className="py-3 px-4">المتوقع (JOD)</th>
                <th className="py-3 px-4">التحصيل الفعلي (JOD)</th>
                <th className="py-3 px-4">حالة الطلب النهائية</th>
                <th className="py-3 px-4">ملاحظات التسوية</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {!loading && orders.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-stone-400">
                  {isToday ? "لا توجد طلبات خرجت مع السائقين اليوم." : `لا توجد طلبات خرجت مع السائقين يوم ${formattedDateLabel}.`}
                </td></tr>
              )}
              {orders.map(order => (
                <tr key={order.id} className="hover:bg-stone-50/50 transition">
                  <td className="py-3.5 px-4 font-bold text-stone-700">{order.driver}</td>
                  <td className="py-3.5 px-4 font-mono font-bold text-amber-600">{order.id}</td>
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-stone-900">{order.customer}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-stone-500">{order.area}</span>
                      {order.paymentMethod === 'cliq' && (
                        order.cliqIncludesDelivery ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 bg-purple-100 text-purple-800 rounded border border-purple-200 inline-flex items-center gap-0.5">
                            <CreditCard className="w-2.5 h-2.5" />
                            CliQ شامل
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 bg-blue-100 text-blue-800 rounded border border-blue-200 inline-flex items-center gap-0.5">
                            <CreditCard className="w-2.5 h-2.5" />
                            CliQ توصيل فقط
                          </span>
                        )
                      )}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-stone-500">
                    {order.paymentMethod === 'cliq' && order.cliqIncludesDelivery ? (
                      <span className="text-purple-700 font-bold bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                        0.000 (مدفوع)
                      </span>
                    ) : (
                      formatCurrency(order.expectedCash)
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    <input 
                      type="number" 
                      value={order.actualCash}
                      onChange={(e) => updateOrder(order.id, { actualCash: Number(e.target.value) })}
                      className="w-24 px-2 py-1.5 bg-white border border-stone-200 rounded-lg text-sm font-mono font-bold text-stone-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                      disabled={!canReconcile || saving || isSettled(order) || order.status !== "مكتمل"}
                      step="0.001"
                    />
                  </td>
                  <td className="py-3.5 px-4">
                    <select 
                      value={order.status}
                      onChange={(e) => updateOrder(order.id, { status: e.target.value as OrderStatus })}
                      className={cn(
                        "px-2 py-1.5 rounded-lg text-xs font-bold border outline-none cursor-pointer",
                        order.status === "مكتمل" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                        order.status === "مرتجع" ? "bg-rose-50 text-rose-700 border-rose-200" :
                        "bg-stone-100 text-stone-700 border-stone-200"
                      )}
                      disabled={!canReconcile || saving || isSettled(order)}
                    >
                      <option value="خرج مع السائق">خرج مع السائق</option>
                      <option value="مكتمل">مكتمل ✅</option>
                      <option value="مرتجع">مرتجع 🔄</option>
                      <option value="مؤجل">مؤجل ⏳</option>
                      <option value="متبقي">متبقي</option>
                    </select>
                  </td>
                  <td className="py-3.5 px-4">
                    <input 
                      type="text" 
                      value={order.notes}
                      onChange={(e) => updateOrder(order.id, { notes: e.target.value })}
                      placeholder="ملاحظات (اختياري)..."
                      className="w-full min-w-[150px] px-2 py-1.5 bg-white border border-stone-200 rounded-lg text-xs outline-none focus:border-amber-500"
                      disabled={!canReconcile || saving || isSettled(order)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 3: Reconcile Button */}
      <div className="flex justify-end pt-4">
        <button 
          onClick={handleReconcile}
          disabled={!canReconcile || saving || changedOrders.length === 0}
          className={cn(
            "px-8 py-3 rounded-xl font-black text-sm flex items-center gap-2 transition shadow-md",
            !canReconcile || saving || changedOrders.length === 0
              ? "bg-stone-200 text-stone-500 cursor-not-allowed"
              : "bg-stone-900 hover:bg-black text-amber-500 shadow-stone-900/20"
          )}
        >
          {saving ? (
            <span>جاري الحفظ...</span>
          ) : changedOrders.length === 0 ? (
            <>
              <Check className="w-5 h-5" />
              <span>لا توجد تعديلات للحفظ</span>
            </>
          ) : (
            <>
              <Save className="w-5 h-5" />
              <span>حفظ تسوية {changedOrders.length} طلب</span>
            </>
          )}
        </button>
      </div>

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

            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 space-y-2 text-right">
              {doneModalInfo.totalCollected !== undefined && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-stone-600 font-bold">إجمالي الكاش المعتمد:</span>
                  <span className="font-mono font-black text-emerald-600 text-sm">
                    {formatCurrency(doneModalInfo.totalCollected)}
                  </span>
                </div>
              )}
              {doneModalInfo.reconciledCount !== undefined && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-stone-400">عدد الشحنات المسواة:</span>
                  <span className="font-bold text-stone-800 bg-stone-200/70 px-2 py-0.5 rounded">
                    {doneModalInfo.reconciledCount} طلبات
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
