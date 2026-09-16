"use client";

import React, { useState } from "react";
import { 
  PackageSearch,
  Truck,
  Printer,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  GripVertical,
  ChevronUp,
  ChevronDown
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { useToast } from "@/components/common/toast";

interface InventoryNeededRow {
  id: string;
  product: string;
  needed: number;
  available: number;
  status: "OK" | "Low";
}

export default function DispatchPage() {
  const { showToast } = useToast();
  const [loads, setLoads] = useState([
    { driver: "خالد", orders: [] as any[], totalCash: 0 },
    { driver: "علي", orders: [] as any[], totalCash: 0 },
    { driver: "BX Arabia", orders: [] as any[], totalCash: 0 },
  ]);
  const [inventoryNeeded, setInventoryNeeded] = useState<InventoryNeededRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [withdrawn, setWithdrawn] = useState(false);
  const [dispatched, setDispatched] = useState(false);

  // Done / Success Feedback Modal
  const [doneModalInfo, setDoneModalInfo] = useState<{
    isOpen: boolean;
    title: string;
    subtitle: string;
    details?: string;
  }>({
    isOpen: false,
    title: "",
    subtitle: "",
  });

  // Drag and Drop state
  const [draggedOrder, setDraggedOrder] = useState<{ id: string; fromDriver: string } | null>(null);
  const [dragOverDriver, setDragOverDriver] = useState<string | null>(null);
  const [dragOverOrderId, setDragOverOrderId] = useState<string | null>(null);

  const loadDispatchData = async () => {
    try {
      const res = await fetch('/api/drivers', { cache: 'no-store' });
      const data = await res.json();
      if (data.success && data.driverLoads) {
        setLoads(data.driverLoads);
        setInventoryNeeded(data.inventoryNeeded || []);
      }
    } catch (err) {
      console.error("Failed to load dispatch data:", err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadDispatchData();
  }, []);

  const handleDragStart = (e: React.DragEvent, id: string, fromDriver: string) => {
    setDraggedOrder({ id, fromDriver });
    e.dataTransfer.setData("text/plain", JSON.stringify({ id, fromDriver }));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOverCard = (e: React.DragEvent, driverName: string) => {
    e.preventDefault();
    if (dragOverDriver !== driverName) {
      setDragOverDriver(driverName);
    }
  };

  const handleDragOverItem = (e: React.DragEvent, orderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragOverOrderId !== orderId) {
      setDragOverOrderId(orderId);
    }
  };

  const handleDragEnd = () => {
    setDraggedOrder(null);
    setDragOverDriver(null);
    setDragOverOrderId(null);
  };

  const handleDropOnDriver = async (e: React.DragEvent, toDriver: string, targetOrderId?: string) => {
    e.preventDefault();
    if (!draggedOrder) {
      handleDragEnd();
      return;
    }

    const { id: orderId, fromDriver } = draggedOrder;

    setLoads((prev) => {
      const fromLoadIndex = prev.findIndex((l) => l.driver === fromDriver);
      const toLoadIndex = prev.findIndex((l) => l.driver === toDriver);
      if (fromLoadIndex === -1 || toLoadIndex === -1) return prev;

      const newLoads = prev.map((l) => ({ ...l, orders: [...l.orders] }));
      const fromOrders = newLoads[fromLoadIndex].orders;
      const orderIndex = fromOrders.findIndex((o) => o.id === orderId);
      if (orderIndex === -1) return prev;

      const [orderToMove] = fromOrders.splice(orderIndex, 1);
      const toOrders = newLoads[toLoadIndex].orders;

      if (targetOrderId) {
        const targetIndex = toOrders.findIndex((o) => o.id === targetOrderId);
        if (targetIndex !== -1) {
          toOrders.splice(targetIndex, 0, orderToMove);
        } else {
          toOrders.push(orderToMove);
        }
      } else {
        toOrders.push(orderToMove);
      }

      // Recalculate cash for both drivers
      newLoads[fromLoadIndex].totalCash = newLoads[fromLoadIndex].orders.reduce((s, o) => s + (o.cash || 0), 0);
      newLoads[toLoadIndex].totalCash = newLoads[toLoadIndex].orders.reduce((s, o) => s + (o.cash || 0), 0);

      return newLoads;
    });

    handleDragEnd();

    // Persist assignment to DB
    if (fromDriver !== toDriver) {
      try {
        const res = await fetch('/api/drivers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'assign_orders',
            orderIds: [orderId],
            driverName: toDriver
          })
        });
        const data = await res.json();
        if (!res.ok || data.success === false) {
          showToast(data.error || "فشل نقل الطلب للسائق الجديد. أعد المحاولة.", "error");
          await loadDispatchData();
        }
      } catch (err) {
        console.error("Failed to reassign driver in DB:", err);
        showToast("تعذر الاتصال بالخادم لنقل الطلب.", "error");
        await loadDispatchData();
      }
    }
  };

  const moveOrderItem = (driverName: string, orderId: string, direction: "up" | "down") => {
    setLoads((prev) => {
      return prev.map((load) => {
        if (load.driver !== driverName) return load;
        const index = load.orders.findIndex((o) => o.id === orderId);
        if (index === -1) return load;
        const targetIndex = direction === "up" ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= load.orders.length) return load;

        const newOrders = [...load.orders];
        const temp = newOrders[index];
        newOrders[index] = newOrders[targetIndex];
        newOrders[targetIndex] = temp;
        return { ...load, orders: newOrders };
      });
    });
  };

  const handleWithdraw = async () => {
    const lowStockItems = inventoryNeeded.filter((item) => item.status === "Low");
    if (lowStockItems.length > 0) {
      const list = lowStockItems.map((i) => `${i.product} (متاح ${i.available} / مطلوب ${i.needed})`).join("، ");
      if (!confirm(`تنبيه: الكمية المتوفرة غير كافية لبعض المنتجات: ${list}.\n\nهل ترغب بالمتابعة رغم ذلك؟`)) {
        return;
      }
    }

    try {
      const res = await fetch('/api/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'withdraw_inventory'
        })
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        showToast(data.error || "فشل تأكيد تجهيز البضاعة. أعد المحاولة.", "error");
        return;
      }
      setWithdrawn(true);
      setDoneModalInfo({
        isOpen: true,
        title: "تم تأكيد تجهيز البضاعة للتحميل! 📦",
        subtitle: "الكميات معتمدة من رصيد المخزون الحالي (تم خصمه فعلياً عند تأكيد كل طلب).",
      });
    } catch (err) {
      console.error("Failed to record inventory withdrawal confirmation:", err);
      showToast("تعذر الاتصال بالخادم لتأكيد التجهيز.", "error");
    }
  };

  const handleDispatch = async () => {
    if (!withdrawn) {
      alert("يجب سحب البضاعة من المستودع أولاً!");
      return;
    }
    
    try {
      const res = await fetch('/api/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'dispatch'
        })
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        showToast(data.error || "فشل إصدار أمر التحميل. أعد المحاولة.", "error");
        await loadDispatchData();
        return;
      }
      setDispatched(true);
      setDoneModalInfo({
        isOpen: true,
        title: "تم إصدار أمر التحميل وانطلاق السائقين! 🚚",
        subtitle: "تم تحويل جميع الطلبات لحالة (خرج مع السائق) وحفظ مسارات التوصيل في قاعدة البيانات.",
      });
      await loadDispatchData();
    } catch (err) {
      console.error("Failed to record morning dispatch in DB:", err);
      showToast("تعذر الاتصال بالخادم لإصدار أمر التحميل.", "error");
      await loadDispatchData();
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
          إجراءات الصباح: سحب البضاعة، توزيع الحمولات بين السائقين، وبدء التوصيل (اسحب الطلبات لنقلها بين السائقين)
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
              "px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm",
              withdrawn 
                ? "bg-emerald-100 text-emerald-800 border border-emerald-200 cursor-not-allowed" 
                : "bg-amber-500 hover:bg-amber-600 text-stone-950 shadow-amber-500/20 cursor-pointer"
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
              {inventoryNeeded.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-stone-400">
                    لا توجد منتجات مرتبطة بطلبات اليوم بعد.
                  </td>
                </tr>
              )}
              {inventoryNeeded.map(item => (
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loads.map(driverLoad => {
          const isTargetCard = dragOverDriver === driverLoad.driver;

          return (
            <div 
              key={driverLoad.driver}
              onDragOver={(e) => handleDragOverCard(e, driverLoad.driver)}
              onDrop={(e) => handleDropOnDriver(e, driverLoad.driver)}
              className={cn(
                "bg-white rounded-2xl border shadow-sm flex flex-col transition-all",
                isTargetCard ? "border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/10" : "border-stone-200"
              )}
            >
              <div className="p-4 border-b border-stone-100 flex items-center justify-between bg-stone-50 rounded-t-2xl">
                <div>
                  <h3 className="font-bold text-stone-900 flex items-center gap-2">
                    <span>حمولة {driverLoad.driver}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 border border-amber-500/20 font-bold">
                      {driverLoad.orders.length} طلبات
                    </span>
                  </h3>
                  <p className="text-[11px] text-stone-500 mt-0.5">اسحب الطلبات إلى هنا لنقلها لـ {driverLoad.driver}</p>
                </div>
                <button className="p-2 bg-white border border-stone-200 hover:bg-stone-100 rounded-lg text-stone-700 transition cursor-pointer" title="طباعة بوليصة التحميل">
                  <Printer className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 flex-1 overflow-y-auto max-h-[440px]">
                <ul className="space-y-3">
                  {driverLoad.orders.map((order, idx) => {
                    const isBeingDragged = draggedOrder?.id === order.id;
                    const isDraggedOver = dragOverOrderId === order.id && !isBeingDragged;

                    return (
                      <li 
                        key={order.id}
                        draggable={true}
                        onDragStart={(e) => handleDragStart(e, order.id, driverLoad.driver)}
                        onDragOver={(e) => handleDragOverItem(e, order.id)}
                        onDragEnd={handleDragEnd}
                        onDrop={(e) => {
                          e.stopPropagation();
                          handleDropOnDriver(e, driverLoad.driver, order.id);
                        }}
                        className={cn(
                          "p-3 border rounded-xl bg-white shadow-2xs transition-all cursor-default",
                          isBeingDragged && "opacity-30 scale-95 bg-amber-50",
                          isDraggedOver && "border-t-4 border-t-amber-500 bg-amber-50/60",
                          !isBeingDragged && !isDraggedOver && "border-stone-200 hover:border-amber-300"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-stone-100">
                          <div className="flex items-center gap-1.5">
                            <span 
                              className="cursor-grab active:cursor-grabbing p-1 text-stone-400 hover:text-amber-600 rounded"
                              title="اسحب لتغيير الترتيب أو النقل لسائق آخر"
                            >
                              <GripVertical className="w-3.5 h-3.5" />
                            </span>
                            <span className="text-[10px] font-mono font-bold bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded">
                              #{idx + 1}
                            </span>
                            <span className="font-bold text-xs text-stone-900">{order.customer}</span>
                          </div>
                          
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => moveOrderItem(driverLoad.driver, order.id, "up")}
                              disabled={idx === 0}
                              title="تحريك لأعلى"
                              className="text-stone-300 hover:text-amber-600 disabled:opacity-20 p-0.5"
                            >
                              <ChevronUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveOrderItem(driverLoad.driver, order.id, "down")}
                              disabled={idx === driverLoad.orders.length - 1}
                              title="تحريك لأسفل"
                              className="text-stone-300 hover:text-amber-600 disabled:opacity-20 p-0.5"
                            >
                              <ChevronDown className="w-3 h-3" />
                            </button>
                            <span className="font-mono text-[10px] font-bold text-amber-600 mr-1">{order.id}</span>
                          </div>
                        </div>

                        <div className="text-[11px] text-stone-500 mb-2 font-medium">{order.area}</div>
                        <div className="text-[11px] font-medium text-stone-700 bg-stone-50 p-2 rounded-lg border border-stone-100 mb-2">
                          {order.items}
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-stone-100">
                          <span className="text-[10px] text-stone-500">المبلغ للتحصيل:</span>
                          <span className={cn("font-mono font-bold text-xs", order.cash > 0 ? "text-emerald-700" : "text-stone-400")}>
                            {formatCurrency(order.cash)}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                  {driverLoad.orders.length === 0 && (
                    <li className="p-8 border-2 border-dashed border-stone-200 rounded-xl text-center text-stone-400 text-xs font-bold">
                      لا توجد طلبات - اسحب طلبات إلى هنا
                    </li>
                  )}
                </ul>
              </div>
              <div className="p-4 border-t border-stone-100 bg-amber-50/30 rounded-b-2xl flex justify-between items-center">
                <span className="font-bold text-sm text-stone-900">إجمالي النقد المتوقع:</span>
                <span className="font-mono font-black text-lg text-amber-700">{formatCurrency(driverLoad.totalCash)}</span>
              </div>
            </div>
          );
        })}
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

      {/* ---------------- DONE / SUCCESS MODAL ---------------- */}
      {doneModalInfo.isOpen && (
        <div 
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
