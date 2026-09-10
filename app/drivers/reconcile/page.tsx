"use client";

import React, { useState } from "react";
import { 
  Calculator,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Save,
  Check
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";

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
}

const INITIAL_ORDERS: ReconcileOrder[] = [
  // Khalid's Orders
  { id: "BET-D-001", driver: "خالد", customer: "سدين غنايم", area: "طبربور", expectedCash: 24.000, actualCash: 24.000, status: "مكتمل", notes: "" },
  { id: "BET-D-003", driver: "خالد", customer: "صالون لمسة حرير", area: "ناعور", expectedCash: 100.000, actualCash: 100.000, status: "مكتمل", notes: "" },
  { id: "BET-D-006", driver: "خالد", customer: "ليلى حسن", area: "وادي صقرة", expectedCash: 0, actualCash: 0, status: "مرتجع", notes: "تالف" },
  { id: "BET-D-008", driver: "خالد", customer: "صالون الورد", area: "طبربور", expectedCash: 50.000, actualCash: 50.000, status: "مكتمل", notes: "" },
  { id: "BET-D-011", driver: "خالد", customer: "نور الدين", area: "المدينة الرياضية", expectedCash: 15.000, actualCash: 15.000, status: "مكتمل", notes: "" },
  { id: "BET-D-014", driver: "خالد", customer: "عبير محمود", area: "جبل التاج", expectedCash: 50.000, actualCash: 0, status: "مؤجل", notes: "لم ترد" },
  // Ali's Orders
  { id: "BET-D-002", driver: "علي", customer: "ربى صبيح", area: "عرجان", expectedCash: 95.000, actualCash: 95.000, status: "مكتمل", notes: "" },
  { id: "BET-D-005", driver: "علي", customer: "صالون جمالك", area: "المدينة الرياضية", expectedCash: 100.000, actualCash: 80.000, status: "مكتمل", notes: "نقص 20 دينار بالاتفاق" },
  { id: "BET-D-007", driver: "علي", customer: "سارة محمد", area: "السابع", expectedCash: 35.000, actualCash: 0, status: "مرتجع", notes: "رفض الاستلام" },
  { id: "BET-D-010", driver: "علي", customer: "صيدلية الشفاء", area: "ناعور", expectedCash: 0, actualCash: 0, status: "مكتمل", notes: "" },
  { id: "BET-D-012", driver: "علي", customer: "صالون الأناقة", area: "وادي صقرة", expectedCash: 100.000, actualCash: 100.000, status: "مكتمل", notes: "" },
  { id: "BET-D-015", driver: "علي", customer: "مركز تجميل", area: "طبربور", expectedCash: 0, actualCash: 0, status: "مكتمل", notes: "" },
];

export default function ReconcilePage() {
  const [orders, setOrders] = useState<ReconcileOrder[]>(INITIAL_ORDERS);
  const [reconciled, setReconciled] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const updateOrder = (id: string, updates: Partial<ReconcileOrder>) => {
    setOrders(orders.map(o => o.id === id ? { ...o, ...updates } : o));
  };

  const handleReconcile = () => {
    if (confirm("تأكيد تسوية اليوم وإغلاق الحسابات؟ لا يمكن التراجع عن هذه الخطوة.")) {
      setReconciled(true);
      setToastMessage("تمت التسوية بنجاح وتم ترحيل الحركات المالية.");
      setTimeout(() => setToastMessage(""), 4000);
    }
  };

  const drivers = ["خالد", "علي"];

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-stone-900 text-white px-6 py-3 rounded-2xl shadow-xl font-bold text-sm z-50 flex items-center gap-2 animate-in slide-in-from-top">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div>
        <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5">
          <Calculator className="w-6 h-6 text-amber-500" />
          <span>التسوية اليومية وإغلاق الحسابات (End-of-Day Reconciliation)</span>
        </h2>
        <p className="text-xs sm:text-sm text-stone-500 mt-1">
          مراجعة الطلبات الموصلة، المرتجعات، ومطابقة النقدية مع السائقين
        </p>
      </div>

      {/* Section 1: Driver Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              {orders.map(order => (
                <tr key={order.id} className="hover:bg-stone-50/50 transition">
                  <td className="py-3.5 px-4 font-bold text-stone-700">{order.driver}</td>
                  <td className="py-3.5 px-4 font-mono font-bold text-amber-600">{order.id}</td>
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-stone-900">{order.customer}</div>
                    <div className="text-[10px] text-stone-500">{order.area}</div>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-stone-500">{formatCurrency(order.expectedCash)}</td>
                  <td className="py-3.5 px-4">
                    <input 
                      type="number" 
                      value={order.actualCash}
                      onChange={(e) => updateOrder(order.id, { actualCash: Number(e.target.value) })}
                      className="w-24 px-2 py-1.5 bg-white border border-stone-200 rounded-lg text-sm font-mono font-bold text-stone-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                      disabled={reconciled}
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
                      disabled={reconciled}
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
                      disabled={reconciled}
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
          disabled={reconciled}
          className={cn(
            "px-8 py-3 rounded-xl font-black text-sm flex items-center gap-2 transition shadow-md",
            reconciled
              ? "bg-stone-200 text-stone-500 cursor-not-allowed"
              : "bg-stone-900 hover:bg-black text-amber-500 shadow-stone-900/20"
          )}
        >
          {reconciled ? (
            <>
              <Check className="w-5 h-5" />
              <span>تمت التسوية وإغلاق اليوم</span>
            </>
          ) : (
            <>
              <Save className="w-5 h-5" />
              <span>اعتماد وتسوية اليوم</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
