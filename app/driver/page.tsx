"use client";

import { useState, useEffect } from "react";
import { 
  Phone,
  MessageSquare, 
  MapPin, 
  CheckCircle2, 
  Clock, 
  RotateCcw, 
  Calendar as CalendarIcon,
  X,
  Check
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";

type Order = {
  id: string;
  customer_name: string;
  phone: string;
  area: string;
  address: string;
  products: string;
  cash_to_collect: number;
  receivables: number;
  status: 'pending' | 'delivered' | 'returned' | 'postponed' | 'remaining';
  postpone_date?: string;
  return_reason?: string;
};

export default function DriverPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [driver, setDriver] = useState({ name: "خالد المندوب", avatar: "خ" });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'delivered' | 'returned' | 'postponed'>('all');
  
  // Modals state
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [modalType, setModalType] = useState<'delivered' | 'returned' | 'postponed' | 'remaining' | null>(null);
  const [cashCollected, setCashCollected] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [postponeDate, setPostponeDate] = useState("");
  const [notes, setNotes] = useState("");

  const returnReasons = ["الزبون غير موجود", "رفض الاستلام", "منتج خاطئ", "أخرى"];

  useEffect(() => {
    fetch('/api/driver')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setOrders(data.orders);
          setDriver(data.driver);
        }
        setLoading(false);
      });
  }, []);

  const handleAction = async () => {
    if (!activeOrder || !modalType) return;
    
    // Optimistic UI update
    setOrders(prev => prev.map(o => {
      if (o.id === activeOrder.id) {
        return { 
          ...o, 
          status: modalType === 'remaining' ? 'remaining' : modalType,
          return_reason: returnReason || o.return_reason,
          postpone_date: postponeDate || o.postpone_date
        } as Order;
      }
      return o;
    }));

    // In a real app, send API request here
    await fetch('/api/driver', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_status',
        orderId: activeOrder.id,
        status: modalType === 'remaining' ? 'remaining' : modalType,
        notes,
        cashCollected: modalType === 'delivered' ? Number(cashCollected) : 0,
        returnReason,
        postponeDate
      })
    });

    closeModal();
  };

  const closeModal = () => {
    setActiveOrder(null);
    setModalType(null);
    setCashCollected("");
    setReturnReason("");
    setPostponeDate("");
    setNotes("");
  };

  const filteredOrders = orders.filter(o => {
    if (activeTab === 'all') return true;
    if (activeTab === 'pending') return o.status === 'pending' || o.status === 'remaining';
    return o.status === activeTab;
  });

  const totalOrders = orders.length;
  const deliveredCount = orders.filter(o => o.status === 'delivered').length;
  const remainingCount = orders.filter(o => o.status === 'pending' || o.status === 'remaining').length;
  const totalCashCollected = orders.filter(o => o.status === 'delivered').reduce((sum, o) => sum + o.cash_to_collect, 0);

  const todayStr = new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  if (loading) return <div className="min-h-screen bg-stone-50 flex items-center justify-center font-bold text-stone-500" dir="rtl">جاري التحميل...</div>;

  return (
    <div className="min-h-screen bg-stone-50 pb-28 font-sans text-stone-900" dir="rtl">
      {/* Header */}
      <div className="bg-white px-4 py-5 border-b border-stone-200 shadow-sm sticky top-0 z-20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-amber-500 text-white flex items-center justify-center text-2xl font-bold shadow-md shadow-amber-500/20">
              {driver.avatar}
            </div>
            <div>
              <h1 className="font-black text-xl">{driver.name}</h1>
              <p className="text-sm text-stone-500">{todayStr}</p>
            </div>
          </div>
        </div>
        
        <div className="flex bg-stone-100 rounded-2xl p-4 justify-between items-center text-center">
          <div className="flex-1">
            <p className="text-xs font-bold text-stone-500 mb-1">الطلبات</p>
            <p className="font-black text-xl">{totalOrders}</p>
          </div>
          <div className="w-px h-10 bg-stone-300"></div>
          <div className="flex-1">
            <p className="text-xs font-bold text-stone-500 mb-1">تم تسليمها</p>
            <p className="font-black text-xl text-emerald-600">{deliveredCount}</p>
          </div>
          <div className="w-px h-10 bg-stone-300"></div>
          <div className="flex-1">
            <p className="text-xs font-bold text-stone-500 mb-1">متبقي</p>
            <p className="font-black text-xl text-blue-600">{remainingCount}</p>
          </div>
        </div>
      </div>

      {/* Tabs Filter */}
      <div className="overflow-x-auto px-4 py-4 hide-scrollbar flex gap-2 sticky top-[138px] bg-stone-50/95 backdrop-blur z-10">
        {(['all', 'pending', 'delivered', 'returned', 'postponed'] as const).map(tab => {
          const labels = {
            all: 'الكل',
            pending: 'متبقي',
            delivered: 'مكتمل',
            returned: 'مرتجع',
            postponed: 'مؤجل'
          };
          
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "whitespace-nowrap px-5 py-3 rounded-full text-sm font-bold transition-all shrink-0 h-12 flex items-center justify-center",
                activeTab === tab 
                  ? "bg-amber-500 text-white shadow-md shadow-amber-500/20" 
                  : "bg-white text-stone-600 border border-stone-200 hover:border-amber-300"
              )}
            >
              {labels[tab]}
            </button>
          );
        })}
      </div>

      {/* Orders List */}
      <div className="px-4 space-y-4">
        {filteredOrders.map(order => (
          <div key={order.id} className="bg-white rounded-3xl p-5 shadow-sm border border-stone-200">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-black text-xl">{order.customer_name}</h3>
                <p className="text-sm text-stone-500 font-mono mt-1">{order.id}</p>
              </div>
              <StatusBadge status={order.status} />
            </div>

            <div className="flex gap-2 mb-4">
              <a href={`tel:${order.phone}`} className="flex-1 flex items-center justify-center gap-2 bg-emerald-50 text-emerald-700 h-14 rounded-xl text-base font-bold border border-emerald-100">
                <Phone className="w-5 h-5" />
                اتصال
              </a>
              <a href={`https://wa.me/${order.phone.replace(/^0/, '962')}`} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 text-white h-14 rounded-xl text-base font-bold shadow-md shadow-emerald-500/20">
                <MessageSquare className="w-5 h-5" />
                واتساب
              </a>
            </div>

            <div className="space-y-3 mb-5">
              <div className="flex gap-2 items-start text-base text-stone-700">
                <MapPin className="w-5 h-5 text-stone-400 shrink-0 mt-0.5" />
                <span><strong className="text-stone-900">{order.area}</strong> - {order.address}</span>
              </div>
              
              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 text-sm">
                <p className="text-stone-600 leading-relaxed font-medium">{order.products}</p>
              </div>

              <div className="flex justify-between items-center bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                <span className="font-bold text-emerald-800 text-base">تحصيل كاش:</span>
                <span className="font-black text-2xl text-emerald-600">{formatCurrency(order.cash_to_collect)}</span>
              </div>
              
              {order.receivables > 0 && (
                <div className="flex justify-between items-center bg-orange-50 p-3 rounded-xl border border-orange-100">
                  <span className="text-sm font-bold text-orange-800">ذمم سابقة (Receivables):</span>
                  <span className="text-base font-black text-orange-600">{formatCurrency(order.receivables)}</span>
                </div>
              )}
            </div>

            {/* Actions Grid (Large Touch Targets) */}
            <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-stone-100">
              <button 
                onClick={() => { setActiveOrder(order); setModalType('delivered'); setCashCollected(order.cash_to_collect.toString()); }}
                className="bg-emerald-500 text-white h-14 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 text-base"
              >
                <CheckCircle2 className="w-5 h-5" />
                تم التسليم
              </button>
              <button 
                onClick={() => { setActiveOrder(order); setModalType('remaining'); }}
                className="bg-blue-500 text-white h-14 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 text-base"
              >
                <Clock className="w-5 h-5" />
                متبقي لبكرا
              </button>
              <button 
                onClick={() => { setActiveOrder(order); setModalType('returned'); }}
                className="bg-rose-500 text-white h-14 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-md shadow-rose-500/20 text-base"
              >
                <RotateCcw className="w-5 h-5" />
                مرتجع
              </button>
              <button 
                onClick={() => { setActiveOrder(order); setModalType('postponed'); }}
                className="bg-stone-500 text-white h-14 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-md shadow-stone-500/20 text-base"
              >
                <CalendarIcon className="w-5 h-5" />
                تأجيل
              </button>
            </div>
          </div>
        ))}
        {filteredOrders.length === 0 && (
          <div className="bg-white p-8 rounded-3xl text-center border-2 border-dashed border-stone-200">
            <p className="font-bold text-stone-500 text-lg">لا توجد طلبات هنا</p>
          </div>
        )}
      </div>

      {/* Footer Summary */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 p-5 shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.05)] z-30 flex justify-between items-center pb-safe">
        <div>
          <p className="text-sm font-bold text-stone-500 mb-1">إجمالي الكاش اليوم</p>
          <p className="font-black text-emerald-600 text-2xl">{formatCurrency(totalCashCollected)}</p>
        </div>
        <div className="flex gap-4 text-center">
          <div>
            <p className="text-xs font-bold text-stone-400 mb-0.5">الطلبات</p>
            <p className="font-black text-lg text-stone-800">{totalOrders}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-stone-400 mb-0.5">مسلم</p>
            <p className="font-black text-lg text-emerald-600">{deliveredCount}</p>
          </div>
        </div>
      </div>

      {/* Action Modal */}
      {modalType && activeOrder && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white w-full sm:max-w-md rounded-t-[2rem] sm:rounded-3xl p-6 pb-10 sm:pb-6 animate-in slide-in-from-bottom-10">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-xl">
                {modalType === 'delivered' && 'تأكيد التسليم'}
                {modalType === 'returned' && 'تسجيل مرتجع'}
                {modalType === 'postponed' && 'تأجيل الطلب'}
                {modalType === 'remaining' && 'متبقي للغد'}
              </h3>
              <button onClick={closeModal} className="w-10 h-10 bg-stone-100 rounded-full text-stone-500 flex items-center justify-center active:bg-stone-200 transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-5">
              <div className="bg-stone-50 p-4 rounded-2xl mb-5 border border-stone-100">
                <p className="font-bold text-lg">{activeOrder.customer_name}</p>
                <p className="text-stone-500 font-mono text-sm mt-1">{activeOrder.id}</p>
              </div>

              {modalType === 'delivered' && (
                <div>
                  <label className="block text-base font-bold mb-3 text-stone-800">المبلغ المحصل (د.أ)</label>
                  <input 
                    type="number" 
                    value={cashCollected} 
                    onChange={e => setCashCollected(e.target.value)}
                    className="w-full border-2 border-stone-200 rounded-2xl p-5 text-2xl font-black focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 outline-none transition-all text-center"
                    dir="ltr"
                  />
                  {Number(cashCollected) !== activeOrder.cash_to_collect && (
                    <p className="text-orange-600 text-sm mt-3 font-bold bg-orange-50 p-3 rounded-xl border border-orange-100">
                      تنبيه: المبلغ يختلف عن المطلوب ({formatCurrency(activeOrder.cash_to_collect)})
                    </p>
                  )}
                </div>
              )}

              {modalType === 'returned' && (
                <div>
                  <label className="block text-base font-bold mb-3 text-stone-800">سبب الإرجاع</label>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {returnReasons.map(r => (
                      <button 
                        key={r}
                        onClick={() => setReturnReason(r)}
                        className={cn(
                          "h-14 rounded-2xl border text-sm font-bold transition-all",
                          returnReason === r 
                            ? "bg-rose-50 border-rose-500 text-rose-700 ring-2 ring-rose-500/20" 
                            : "bg-white border-stone-200 text-stone-600 active:bg-stone-50"
                        )}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  <label className="block text-sm font-bold mb-2 text-stone-800">ملاحظات إضافية (اختياري)</label>
                  <input 
                    type="text" 
                    placeholder="اكتب ملاحظة..." 
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="w-full border-2 border-stone-200 rounded-2xl p-4 text-base focus:border-amber-500 outline-none"
                  />
                </div>
              )}

              {modalType === 'postponed' && (
                <div>
                  <label className="block text-base font-bold mb-3 text-stone-800">تاريخ التأجيل الجديد</label>
                  <input 
                    type="date" 
                    value={postponeDate}
                    onChange={e => setPostponeDate(e.target.value)}
                    className="w-full border-2 border-stone-200 rounded-2xl p-4 text-lg font-bold focus:border-amber-500 outline-none"
                  />
                </div>
              )}

              {(modalType === 'remaining' || modalType === 'postponed') && (
                <div className="mt-4">
                  <label className="block text-base font-bold mb-3 text-stone-800">ملاحظات للمتابعة (اختياري)</label>
                  <input 
                    type="text" 
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="أضف ملاحظة..."
                    className="w-full border-2 border-stone-200 rounded-2xl p-4 text-base focus:border-amber-500 outline-none"
                  />
                </div>
              )}

              <button 
                onClick={handleAction}
                className={cn(
                  "w-full h-16 rounded-2xl font-black text-white text-lg mt-8 flex items-center justify-center gap-3 transition-transform active:scale-[0.98]",
                  modalType === 'delivered' ? "bg-emerald-500 shadow-lg shadow-emerald-500/30" :
                  modalType === 'returned' ? "bg-rose-500 shadow-lg shadow-rose-500/30" :
                  modalType === 'postponed' ? "bg-stone-700 shadow-lg shadow-stone-500/30" : 
                  "bg-blue-500 shadow-lg shadow-blue-500/30"
                )}
              >
                <Check className="w-6 h-6" />
                تأكيد وحفظ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Order['status'] }) {
  const styles = {
    pending: "bg-amber-100 text-amber-800 border-amber-200",
    remaining: "bg-blue-100 text-blue-800 border-blue-200",
    delivered: "bg-emerald-100 text-emerald-800 border-emerald-200",
    returned: "bg-rose-100 text-rose-800 border-rose-200",
    postponed: "bg-stone-200 text-stone-800 border-stone-300"
  };
  
  const labels = {
    pending: "قيد التوصيل",
    remaining: "متبقي",
    delivered: "تم التسليم",
    returned: "مرتجع",
    postponed: "مؤجل"
  };

  return (
    <span className={cn("px-3 py-1.5 rounded-xl text-xs font-black border", styles[status])}>
      {labels[status]}
    </span>
  );
}
