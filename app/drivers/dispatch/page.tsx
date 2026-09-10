"use client";

import React, { useState } from "react";
import { 
  PackageSearch,
  Truck,
  Printer,
  CheckCircle2,
  AlertTriangle,
  ArrowRight
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";

// Mock Inventory Needed Data
const INVENTORY_NEEDED = [
  { id: "p1", product: "شامبو بلازما", needed: 6, available: 50, status: "OK" },
  { id: "p2", product: "بلسم بلازما", needed: 13, available: 45, status: "OK" },
  { id: "p3", product: "بكج مورفوسيس ريستركشر", needed: 5, available: 10, status: "OK" },
  { id: "p4", product: "ماركوجا المطور", needed: 4, available: 3, status: "Low" },
  { id: "p5", product: "بروتين SP فضي", needed: 5, available: 20, status: "OK" },
  { id: "p6", product: "سيروم بلازما", needed: 2, available: 15, status: "OK" },
];

// Mock Driver Loads Data
const DRIVER_LOADS = [
  {
    driver: "خالد",
    orders: [
      { id: "BET-D-001", customer: "سدين غنايم", area: "طبربور", items: "2 شامبو بلازما, 1 بلسم بلازما", cash: 24.000 },
      { id: "BET-D-003", customer: "صالون لمسة حرير", area: "ناعور", items: "1 ماركوجا المطور", cash: 100.000 },
      { id: "BET-D-006", customer: "ليلى حسن", area: "وادي صقرة", items: "1 شامبو بلازما (استبدال)", cash: 0 },
      { id: "BET-D-008", customer: "صالون الورد", area: "طبربور", items: "تحصيل", cash: 50.000 },
      { id: "BET-D-011", customer: "نور الدين", area: "المدينة الرياضية", items: "1 سيروم بلازما", cash: 15.000 },
      { id: "BET-D-014", customer: "عبير محمود", area: "جبل التاج", items: "1 ماركوجا المطور", cash: 50.000 },
    ],
    totalCash: 239.000,
  },
  {
    driver: "علي",
    orders: [
      { id: "BET-D-002", customer: "ربى صبيح", area: "عرجان", items: "3 بكج مورفوسيس", cash: 95.000 },
      { id: "BET-D-005", customer: "صالون جمالك", area: "المدينة الرياضية", items: "2 بروتين SP فضي", cash: 100.000 },
      { id: "BET-D-007", customer: "سارة محمد", area: "السابع", items: "1 بكج مورفوسيس", cash: 35.000 },
      { id: "BET-D-010", customer: "صيدلية الشفاء", area: "ناعور", items: "10 بلسم بلازما", cash: 0 },
      { id: "BET-D-012", customer: "صالون الأناقة", area: "وادي صقرة", items: "3 بروتين SP, 3 شامبو بلازما", cash: 100.000 },
      { id: "BET-D-015", customer: "مركز تجميل", area: "طبربور", items: "2 بلسم بلازما (استبدال)", cash: 0 },
    ],
    totalCash: 330.000,
  }
];

export default function DispatchPage() {
  const [withdrawn, setWithdrawn] = useState(false);
  const [dispatched, setDispatched] = useState(false);

  const handleWithdraw = () => {
    if (confirm("تأكيد سحب الكميات من المستودع؟")) {
      setWithdrawn(true);
    }
  };

  const handleDispatch = () => {
    if (!withdrawn) {
      alert("يجب سحب البضاعة من المستودع أولاً!");
      return;
    }
    if (confirm("تأكيد إرسال السائقين؟ سيتم تغيير حالة الطلبات إلى 'خرج مع السائق'")) {
      setDispatched(true);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5">
          <Truck className="w-6 h-6 text-amber-500" />
          <span>تجهيز وإرسال السائقين (Morning Dispatch)</span>
        </h2>
        <p className="text-xs sm:text-sm text-stone-500 mt-1">
          إجراءات الصباح: سحب البضاعة، طباعة بوالص التحميل، وبدء التوصيل
        </p>
      </div>

      {/* Section 1: Inventory Withdrawal Summary */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-stone-100 flex items-center justify-between bg-stone-50">
          <div className="flex items-center gap-2">
            <PackageSearch className="w-5 h-5 text-stone-700" />
            <h3 className="font-bold text-stone-900">ملخص سحب المستودع (بناءً على طلبات اليوم)</h3>
          </div>
          <button 
            onClick={handleWithdraw}
            disabled={withdrawn}
            className={cn(
              "px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition",
              withdrawn 
                ? "bg-emerald-100 text-emerald-700 cursor-not-allowed" 
                : "bg-amber-500 hover:bg-amber-600 text-stone-950 shadow-sm"
            )}
          >
            {withdrawn ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>تم سحب البضاعة</span>
              </>
            ) : (
              <span>سحب من المخزون</span>
            )}
          </button>
        </div>
        
        <div className="p-4 overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-stone-50 text-stone-500 font-bold">
              <tr>
                <th className="py-2 px-3 rounded-r-lg">اسم الصنف</th>
                <th className="py-2 px-3 text-center">الكمية المطلوبة للطلبات</th>
                <th className="py-2 px-3 text-center">المتوفر في المستودع</th>
                <th className="py-2 px-3 rounded-l-lg text-center">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {INVENTORY_NEEDED.map(item => (
                <tr key={item.id}>
                  <td className="py-2.5 px-3 font-bold text-stone-800">{item.product}</td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-stone-900">{item.needed}</td>
                  <td className="py-2.5 px-3 text-center font-mono text-stone-500">{item.available}</td>
                  <td className="py-2.5 px-3 text-center">
                    {item.status === "OK" ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full text-[10px] font-bold">
                        <CheckCircle2 className="w-3 h-3" />
                        متوفر
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-600 bg-red-50 px-2 py-0.5 rounded-full text-[10px] font-bold border border-red-100">
                        <AlertTriangle className="w-3 h-3" />
                        نقص ({item.needed - item.available})
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: Driver Load Sheets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {DRIVER_LOADS.map(driverLoad => (
          <div key={driverLoad.driver} className="bg-white rounded-2xl border border-stone-200 shadow-sm flex flex-col">
            <div className="p-4 border-b border-stone-100 flex items-center justify-between bg-stone-50 rounded-t-2xl">
              <div>
                <h3 className="font-bold text-stone-900">حمولة {driverLoad.driver}</h3>
                <p className="text-[10px] text-stone-500 mt-0.5">{driverLoad.orders.length} طلبات</p>
              </div>
              <button className="p-2 bg-white border border-stone-200 hover:bg-stone-100 rounded-lg text-stone-700 transition" title="طباعة بوليصة التحميل">
                <Printer className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto max-h-[400px]">
              <ul className="space-y-3">
                {driverLoad.orders.map(order => (
                  <li key={order.id} className="p-3 border border-stone-100 rounded-xl bg-stone-50/50 hover:bg-stone-50 transition">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-bold text-xs text-stone-900">{order.customer}</span>
                      <span className="font-mono text-[10px] font-bold text-amber-600">{order.id}</span>
                    </div>
                    <div className="text-[11px] text-stone-500 mb-2">{order.area}</div>
                    <div className="text-[11px] font-medium text-stone-700 bg-white p-1.5 rounded border border-stone-100 mb-2">
                      {order.items}
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-stone-100">
                      <span className="text-[10px] text-stone-500">المبلغ للتحصيل:</span>
                      <span className={cn("font-mono font-bold text-xs", order.cash > 0 ? "text-emerald-700" : "text-stone-400")}>
                        {formatCurrency(order.cash)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-4 border-t border-stone-100 bg-amber-50/30 rounded-b-2xl flex justify-between items-center">
              <span className="font-bold text-sm text-stone-900">إجمالي النقد المتوقع:</span>
              <span className="font-mono font-black text-lg text-amber-700">{formatCurrency(driverLoad.totalCash)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Section 3: Dispatch Button */}
      <div className="flex justify-end pt-4">
        <button 
          onClick={handleDispatch}
          disabled={dispatched}
          className={cn(
            "px-8 py-3 rounded-xl font-black text-sm flex items-center gap-2 transition shadow-md",
            dispatched
              ? "bg-stone-200 text-stone-500 cursor-not-allowed"
              : "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20"
          )}
        >
          {dispatched ? (
            <>
              <CheckCircle2 className="w-5 h-5" />
              <span>تم إرسال السائقين بنجاح</span>
            </>
          ) : (
            <>
              <span>إرسال السائقين وتحديث الحالة</span>
              <ArrowRight className="w-5 h-5 rtl:rotate-180" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
