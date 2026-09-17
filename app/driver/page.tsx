"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Phone,
  MessageSquare,
  MapPin,
  CheckCircle2,
  Clock,
  RotateCcw,
  Calendar as CalendarIcon,
  X,
  Check,
  GripVertical,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  LayoutGrid,
  List,
  ExternalLink,
  Package,
  Banknote,
  Calculator,
  CreditCard,
  AlertTriangle
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { loadBusiness, saveBusiness } from "@/lib/business-client";
import { useToast } from "@/components/common/toast";

type Order = {
  id: string;
  customer_name: string;
  phone: string;
  area: string;
  address: string;
  products: string;
  cash_to_collect: number;
  receivables: number;
  order_total?: number;
  payment_method?: 'cash' | 'cliq';
  cliq_includes_delivery?: boolean;
  delivery_fee?: number;
  status: 'pending' | 'delivered' | 'returned' | 'postponed' | 'remaining';
  postpone_date?: string;
  return_reason?: string;
  dbStatus: string;
  cash_collected: number | null;
};

// Drivers act only on orders that are with them and not finished yet.
const canAct = (o: Order) => (o.dbStatus === 'processing' || o.dbStatus === 'shipped') && o.status !== 'delivered' && o.status !== 'returned';
const collectedOf = (o: Order) => (o.status === 'delivered' ? (o.cash_collected ?? o.cash_to_collect) : 0);

export default function DriverPage() {
  const { showToast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [driver, setDriver] = useState({ name: "", avatar: "" });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'delivered' | 'returned' | 'postponed'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');

  // Done / Success Modal state
  const [doneModalInfo, setDoneModalInfo] = useState<{
    isOpen: boolean;
    title: string;
    subtitle: string;
    orderId?: string;
    customerName?: string;
    badgeText?: string;
    badgeColor?: string;
    cashAmount?: number;
  }>({
    isOpen: false,
    title: "",
    subtitle: "",
  });

  // Order Details Modal state
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<Order | null>(null);

  // Status Action Modal state
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [modalType, setModalType] = useState<'delivered' | 'returned' | 'postponed' | 'remaining' | null>(null);
  const [cashCollected, setCashCollected] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [postponeDate, setPostponeDate] = useState("");
  const [notes, setNotes] = useState("");

  const returnReasons = ["الزبون غير موجود", "رفض الاستلام", "منتج خاطئ", "أخرى"];

  // Drag and Drop Route Sorting
  const [draggedOrderId, setDraggedOrderId] = useState<string | null>(null);
  const [dragOverOrderId, setDragOverOrderId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedOrderId(id);
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (id !== dragOverOrderId) {
      setDragOverOrderId(id);
    }
  };

  const handleDragEnd = () => {
    setDraggedOrderId(null);
    setDragOverOrderId(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedOrderId || draggedOrderId === targetId) {
      handleDragEnd();
      return;
    }

    setOrders((prev) => {
      const fromIndex = prev.findIndex((o) => o.id === draggedOrderId);
      const toIndex = prev.findIndex((o) => o.id === targetId);
      if (fromIndex === -1 || toIndex === -1) return prev;

      const newOrders = [...prev];
      const [movedOrder] = newOrders.splice(fromIndex, 1);
      newOrders.splice(toIndex, 0, movedOrder);
      return newOrders;
    });

    handleDragEnd();
  };

  const moveOrder = (id: string, direction: "up" | "down") => {
    setOrders((prev) => {
      const index = prev.findIndex((o) => o.id === id);
      if (index === -1) return prev;
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;

      const newOrders = [...prev];
      const temp = newOrders[index];
      newOrders[index] = newOrders[targetIndex];
      newOrders[targetIndex] = temp;
      return newOrders;
    });
  };

  const sortByArea = () => {
    setOrders((prev) => [...prev].sort((a, b) => a.area.localeCompare(b.area, "ar")));
  };

  const loadOrders = async () => {
    try {
      // The server works out which driver this account is; no name is sent from the browser.
      const data = await loadBusiness<{ orders: Order[]; driver: { name: string; avatar: string } }>('/api/driver');
      setOrders(data.orders || []);
      if (data.driver) setDriver(data.driver);
      setLoadError("");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "تعذر تحميل طلباتك.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const openActionModal = (order: Order, type: 'delivered' | 'returned' | 'postponed' | 'remaining') => {
    setActiveOrder(order);
    setModalType(type);
    if (type === 'delivered') {
      setCashCollected(order.cash_to_collect.toString());
    } else {
      setCashCollected("");
    }
    setReturnReason("");
    setPostponeDate("");
    setNotes("");
  };

  const handleAction = async () => {
    if (!activeOrder || !modalType || saving) return;
    const targetOrder = activeOrder;
    const currentModalType = modalType;
    const trimmedCash = cashCollected.trim();
    const collected = Number(trimmedCash);
    if (currentModalType === 'delivered' && (trimmedCash === "" || !Number.isFinite(collected) || collected < 0)) {
      showToast("أدخل المبلغ المستلم فعلًا (اكتب 0 إذا لم يُدفع شيء).", "warning", 5000);
      return;
    }

    setSaving(true);
    try {
      const { order } = await saveBusiness<{ order: Order }>(`driver-status:${targetOrder.id}`, '/api/driver', {
        action: 'update_status',
        orderId: targetOrder.id,
        expectedStatus: targetOrder.dbStatus,
        status: currentModalType,
        notes: notes,
        cashCollected: currentModalType === 'delivered' ? collected : undefined,
        returnReason: currentModalType === 'returned' ? returnReason : undefined,
        postponeDate: currentModalType === 'postponed' ? (postponeDate || undefined) : undefined,
      });
      setOrders(prev => prev.map(o => (o.id === order.id ? order : o)));
      closeActionModal();
      setSelectedOrderForDetails(null);

      const doneText = {
        delivered: { title: "تم تسليم الطلب 🎉", subtitle: "تم حفظ التسليم والمبلغ المستلم في قاعدة البيانات.", badge: "تم التسليم", color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
        returned: { title: "تم تسجيل الطلب كمرتجع 🔄", subtitle: `سبب الإرجاع: ${order.return_reason || "غير محدد"}.`, badge: "مرتجع للمستودع", color: "bg-rose-100 text-rose-800 border-rose-300" },
        postponed: { title: "تم تأجيل الطلب ⏳", subtitle: `موعد التسليم الجديد: ${order.postpone_date || "لاحقًا"}.`, badge: "مؤجل", color: "bg-stone-200 text-stone-800 border-stone-300" },
        remaining: { title: "تم ترحيل الطلب للجولة القادمة 📋", subtitle: "بقي الطلب معك كمتبقي.", badge: "متبقي", color: "bg-blue-100 text-blue-800 border-blue-300" },
      }[currentModalType];
      setDoneModalInfo({
        isOpen: true,
        title: doneText.title,
        subtitle: doneText.subtitle,
        orderId: order.id,
        customerName: order.customer_name,
        badgeText: doneText.badge,
        badgeColor: doneText.color,
        cashAmount: currentModalType === 'delivered' ? collectedOf(order) : undefined,
      });
    } catch (e) {
      showToast(e instanceof Error ? e.message : "تعذر حفظ حالة الطلب. أعد المحاولة.", "error", 6000);
      await loadOrders();
    } finally {
      setSaving(false);
    }
  };

  const closeActionModal = () => {
    setActiveOrder(null);
    setModalType(null);
    setCashCollected("");
    setReturnReason("");
    setPostponeDate("");
    setNotes("");
  };

  const [search, setSearch] = useState("");
  const filteredOrders = orders.filter(o => {
    if (![o.customer_name, o.phone, o.area, o.id].join(" ").toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (activeTab === 'all') return true;
    if (activeTab === 'pending') return o.status === 'pending' || o.status === 'remaining';
    return o.status === activeTab;
  });

  const totalOrders = orders.length;
  const deliveredCount = orders.filter(o => o.status === 'delivered').length;
  const remainingCount = orders.filter(o => o.status === 'pending' || o.status === 'remaining').length;
  const totalCashCollected = orders.reduce((sum, o) => sum + collectedOf(o), 0);
  const completionPercentage = totalOrders > 0 ? Math.round((deliveredCount / totalOrders) * 100) : 0;

  const todayStr = new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  if (loading) return <div className="min-h-screen bg-stone-50 flex items-center justify-center font-bold text-stone-500" dir="rtl">جاري التحميل...</div>;
  if (loadError && orders.length === 0) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-6" dir="rtl">
      <p role="alert" className="font-bold text-rose-700">{loadError}</p>
      <button type="button" onClick={() => { setLoading(true); loadOrders(); }} className="px-5 py-3 rounded-2xl bg-[#533f16] text-white font-bold">إعادة المحاولة</button>
    </div>
  );

  return (
    <div className="delivery-workspace min-h-screen pb-28 font-sans text-stone-900" dir="rtl">
      {/* Header - Unfrozen, scrolls naturally with the page */}
      <div className="delivery-hero bg-white px-4 sm:px-6 py-6 border border-[#e8dfcf] rounded-3xl mb-5">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 shrink-0 rounded-2xl bg-[#e5d0a1] text-[#533f16] flex items-center justify-center text-2xl font-bold shadow-md shadow-[#9e8959]/25">
              {driver.avatar}
            </div>
            <div>
              <p className="text-xs font-bold text-[#9e8959] mb-1">BETOLLA · التوصيل</p><h1 className="font-bold text-2xl text-[#533f16]">رحلتك اليوم، بكل وضوح</h1><p className="text-sm text-stone-600 mt-1">أهلًا {driver.name}</p>
              <p className="text-sm text-[#6b655d]">{todayStr}</p>
            </div>
          </div>

          {/* View Mode Toggle: Grid Network vs List View */}
          <div className="flex items-center bg-[#faf7f2] p-1 rounded-xl border border-[#e8dfcf]">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                "flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                viewMode === 'grid'
                  ? "bg-white text-[#2b2926] shadow-xs border border-[#e8dfcf]"
                  : "text-[#6b655d] hover:text-[#2b2926]"
              )}
              title="عرض بطاقات الطلبات"
            >
              <LayoutGrid className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#9e8959]" />
              <span>بطاقات</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                "flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                viewMode === 'list'
                  ? "bg-white text-[#2b2926] shadow-xs border border-[#e8dfcf]"
                  : "text-[#6b655d] hover:text-[#2b2926]"
              )}
              title="عرض كقائمة مفصلة (عمود واحد)"
            >
              <List className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#9e8959]" />
              <span>قائمة مفصلة</span>
            </button>
          </div>
        </div>

        <div className="flex bg-[#faf7f2] border border-[#e8dfcf] rounded-2xl p-4 justify-between items-center text-center">
          <div className="flex-1">
            <p className="text-xs font-bold text-[#6b655d] mb-1">الطلبات</p>
            <p className="font-black text-xl text-[#2b2926]">{totalOrders}</p>
          </div>
          <div className="w-px h-10 bg-[#e8dfcf]"></div>
          <div className="flex-1">
            <p className="text-xs font-bold text-[#6b655d] mb-1">تم تسليمها</p>
            <p className="font-black text-xl text-[#533f16]">{deliveredCount}</p>
          </div>
          <div className="w-px h-10 bg-[#e8dfcf]"></div>
          <div className="flex-1">
            <p className="text-xs font-bold text-[#6b655d] mb-1">متبقي</p>
            <p className="font-black text-xl text-blue-600">{remainingCount}</p>
          </div>
        </div>
      </div>

      <label className="delivery-search flex items-center gap-3 bg-white border border-[#e8dfcf] rounded-2xl px-4 mb-3"><span className="text-sm font-bold text-[#533f16] shrink-0">ابحث عن طلب</span><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="اسم العميل، الهاتف أو المنطقة" className="w-full min-w-0 bg-transparent py-4 text-base outline-none" /></label>
      {/* Tabs Filter & Action Toolbar */}
      <div
        className="overflow-x-auto px-1 py-2 hide-scrollbar no-scrollbar [&::-webkit-scrollbar]:hidden flex items-center justify-between gap-2 mb-2"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <div className="flex gap-2">
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
                  "whitespace-nowrap px-4 py-2.5 rounded-full text-xs font-bold transition-all shrink-0 flex items-center justify-center cursor-pointer active:scale-95",
                  activeTab === tab
                    ? "bg-[#533f16] text-white shadow-sm"
                    : "bg-white text-stone-600 border border-stone-200 hover:border-amber-300"
                )}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={sortByArea}
            className="whitespace-nowrap px-3.5 py-2.5 rounded-full text-xs font-bold transition-all flex items-center justify-center gap-1.5 bg-white text-stone-700 border border-stone-200 hover:border-amber-400 hover:bg-amber-50 cursor-pointer shadow-2xs active:scale-95"
            title="ترتيب محطات اليوم حسب المنطقة الجغرافية"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-amber-500" />
            <span>ترتيب حسب المنطقة</span>
          </button>
        </div>
      </div>

      {/* Instructions banner */}
      <div className="px-4 mb-3">
        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-900 rounded-xl px-3 py-2 text-xs flex items-center justify-between">
          <span className="font-medium">
            تفاصيل العميل وإجراءات التوصيل في مكان واحد. استخدم الأسهم لترتيب محطاتك.
          </span>
          <span className="font-bold text-[11px] text-amber-700 font-mono">
            {filteredOrders.length} محطة
          </span>
        </div>
      </div>

      {/* Orders Grid Network View (Default) */}
      {viewMode === 'grid' ? (
        <div className="px-2 sm:px-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
          {filteredOrders.map((order, index) => {
            const isBeingDragged = draggedOrderId === order.id;
            const isDraggedOver = dragOverOrderId === order.id && !isBeingDragged;

            return (
              <div
                key={order.id}
                draggable={true}
                onDragStart={(e) => handleDragStart(e, order.id)}
                onDragOver={(e) => handleDragOver(e, order.id)}
                onDragEnd={handleDragEnd}
                onDrop={(e) => handleDrop(e, order.id)}
                className={cn(
                  "bg-white rounded-xl sm:rounded-2xl p-2.5 sm:p-4 shadow-xs sm:shadow-sm border transition-all flex flex-col justify-between group select-none relative animate-slideUp hover:-translate-y-0.5 hover:shadow-lg",
                  isBeingDragged && "opacity-40 scale-[0.98] bg-amber-50 border-amber-300 ring-2 ring-amber-400",
                  isDraggedOver && "border-amber-500 ring-2 ring-amber-400 bg-amber-50/70",
                  !isBeingDragged && !isDraggedOver && "border-stone-200 hover:border-amber-400"
                )}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div>
                  {/* Top Bar: Reorder Controls & Stop Pill */}
                  <div className="flex items-center justify-between pb-1.5 sm:pb-2.5 mb-1.5 sm:mb-2.5 border-b border-stone-100">
                    <div className="flex items-center gap-1 min-w-0">
                      <span
                        className="cursor-grab active:cursor-grabbing p-1 bg-stone-100 hover:bg-amber-100 hover:text-amber-700 text-stone-500 rounded-md transition shrink-0"
                        title="اسحب لتغيير ترتيب المحطة"
                      >
                        <GripVertical className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </span>
                      <span className="px-1.5 py-0.5 bg-stone-900 text-amber-400 rounded-md text-[10px] sm:text-[11px] font-mono font-bold shrink-0">
                        #{index + 1}
                      </span>
                    </div>

                    <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); moveOrder(order.id, "up"); }}
                        disabled={index === 0}
                        title="تقديم المحطة للأمام"
                        className="p-1 rounded border border-stone-200 bg-white hover:bg-amber-50 hover:text-amber-600 disabled:opacity-20 text-stone-600 transition cursor-pointer"
                      >
                        <ChevronUp className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); moveOrder(order.id, "down"); }}
                        disabled={index === filteredOrders.length - 1}
                        title="تأخير المحطة للخلف"
                        className="p-1 rounded border border-stone-200 bg-white hover:bg-amber-50 hover:text-amber-600 disabled:opacity-20 text-stone-600 transition cursor-pointer"
                      >
                        <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Order Main Info (Clickable for Modal) */}
                  <div
                    onClick={() => setSelectedOrderForDetails(order)}
                    className="cursor-pointer"
                  >
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 mb-1.5 sm:mb-2">
                      <div className="min-w-0">
                        <h3 className="font-bold text-xs sm:text-base text-stone-900 group-hover:text-amber-600 transition-colors truncate">
                          {order.customer_name}
                        </h3>
                        <p className="text-[10px] sm:text-xs text-stone-400 font-mono">{order.id}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0 self-start sm:self-auto">
                        <StatusBadge status={order.status} />
                        <PaymentBadge order={order} />
                      </div>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] sm:text-xs text-stone-600 mb-1.5 truncate">
                      <MapPin className="w-3 h-3 text-stone-400 shrink-0" />
                      <span className="font-bold text-stone-800 shrink-0">{order.area}</span>
                      <span className="text-stone-400 truncate text-[10px] sm:text-xs">- {order.address}</span>
                    </div>

                    <div className="bg-stone-50 p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl border border-stone-100 text-[10px] sm:text-xs text-stone-600 mb-2 sm:mb-3 line-clamp-1 sm:line-clamp-2">
                      <Package className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-stone-400 inline ml-1 shrink-0" />
                      {order.products}
                    </div>
                  </div>
                </div>

                {/* Bottom Financials & Quick Actions */}
                <div className="pt-1.5 sm:pt-2 border-t border-stone-100 space-y-1.5 sm:space-y-2">
                  <div className="flex items-center justify-between text-[11px] sm:text-xs">
                    <span className="text-stone-500 font-medium">
                      {order.payment_method === 'cliq' && !order.cliq_includes_delivery
                        ? "تحصيل أجرة التوصيل:"
                        : "كاش مطلوب:"}
                    </span>
                    <div className="text-left font-mono">
                      {order.payment_method === 'cliq' && order.cliq_includes_delivery ? (
                        <span className="font-black text-xs sm:text-sm text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                          0.000 د.أ (مدفوع)
                        </span>
                      ) : order.payment_method === 'cliq' && !order.cliq_includes_delivery ? (
                        <span className="font-black text-xs sm:text-sm text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                          {formatCurrency(order.cash_to_collect)}
                        </span>
                      ) : (
                        <span className="font-black text-xs sm:text-sm text-emerald-600">
                          {formatCurrency(order.cash_to_collect)}
                        </span>
                      )}
                    </div>
                  </div>

                  {order.receivables > 0 && (
                    <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                      <span>ذمم سابقة:</span>
                      <span className="font-bold font-mono">{formatCurrency(order.receivables)}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-1 sm:gap-1.5 pt-1">
                    <a
                      href={`tel:${order.phone}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 flex items-center justify-center gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 h-8 sm:h-9 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold border border-emerald-200 transition active:scale-95"
                      title="اتصال هاتفي"
                    >
                      <Phone className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      <span className="hidden sm:inline">اتصال</span>
                    </a>
                    <a
                      href={`https://wa.me/${order.phone.replace(/^0/, '962')}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 flex items-center justify-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white h-8 sm:h-9 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold shadow-xs transition active:scale-95"
                      title="مراسلة واتساب"
                    >
                      <MessageSquare className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      <span className="hidden sm:inline">واتساب</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => setSelectedOrderForDetails(order)}
                      className="px-2 sm:px-3 bg-stone-900 hover:bg-stone-800 text-amber-400 h-8 sm:h-9 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold transition cursor-pointer shrink-0 active:scale-95"
                      title="عرض التفاصيل وتسجيل الحالة"
                    >
                      تفاصيل
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Orders List View (Single Column Detailed) */
        <div className="px-4 space-y-4">
          {filteredOrders.map((order, index) => {
            const isBeingDragged = draggedOrderId === order.id;
            const isDraggedOver = dragOverOrderId === order.id && !isBeingDragged;

            return (
              <div
                key={order.id}
                draggable={true}
                onDragStart={(e) => handleDragStart(e, order.id)}
                onDragOver={(e) => handleDragOver(e, order.id)}
                onDragEnd={handleDragEnd}
                onDrop={(e) => handleDrop(e, order.id)}
                className={cn(
                  "bg-white rounded-3xl p-5 shadow-sm border border-stone-200 transition-all cursor-pointer",
                  isBeingDragged && "opacity-40 scale-[0.98] bg-amber-50",
                  isDraggedOver && "border-t-4 border-t-amber-500 bg-amber-50/50"
                )}
                onClick={() => setSelectedOrderForDetails(order)}
              >
                {/* Route Stop Header */}
                <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-stone-100">
                  <div className="flex items-center gap-2">
                    <span
                      className="cursor-grab active:cursor-grabbing p-1.5 bg-stone-100 hover:bg-amber-100 hover:text-amber-700 text-stone-500 rounded-lg transition"
                      title="اسحب لتغيير ترتيب المحطة"
                    >
                      <GripVertical className="w-4 h-4" />
                    </span>
                    <span className="px-2.5 py-1 bg-stone-900 text-amber-400 rounded-lg text-xs font-mono font-bold">
                      محطة #{index + 1}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[11px] text-stone-400">ترتيب:</span>
                    <button
                      type="button"
                      onClick={() => moveOrder(order.id, "up")}
                      disabled={index === 0}
                      className="p-1.5 rounded-lg border border-stone-200 bg-white hover:bg-amber-50 hover:text-amber-600 disabled:opacity-20 text-stone-600 transition cursor-pointer"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveOrder(order.id, "down")}
                      disabled={index === filteredOrders.length - 1}
                      className="p-1.5 rounded-lg border border-stone-200 bg-white hover:bg-amber-50 hover:text-amber-600 disabled:opacity-20 text-stone-600 transition cursor-pointer"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-black text-xl">{order.customer_name}</h3>
                    <p className="text-sm text-stone-500 font-mono mt-1">{order.id}</p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5">
                    <StatusBadge status={order.status} />
                    <PaymentBadge order={order} />
                  </div>
                </div>

                <div className="flex gap-2 mb-4" onClick={(e) => e.stopPropagation()}>
                  <a href={`tel:${order.phone}`} className="flex-1 flex items-center justify-center gap-2 bg-emerald-50 text-emerald-700 h-12 rounded-xl text-sm font-bold border border-emerald-100">
                    <Phone className="w-4 h-4" />
                    اتصال
                  </a>
                  <a href={`https://wa.me/${order.phone.replace(/^0/, '962')}`} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 text-white h-12 rounded-xl text-sm font-bold shadow-md shadow-emerald-500/20">
                    <MessageSquare className="w-4 h-4" />
                    واتساب
                  </a>
                </div>

                <div className="space-y-2.5 mb-4">
                  <div className="flex gap-2 items-start text-sm text-stone-700">
                    <MapPin className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />
                    <span><strong className="text-stone-900">{order.area}</strong> - {order.address}</span>
                  </div>

                  <div className="bg-stone-50 p-3 rounded-2xl border border-stone-100 text-xs text-stone-600">
                    {order.products}
                  </div>

                  <div className={cn(
                    "flex justify-between items-center p-3 rounded-xl border",
                    order.payment_method === 'cliq'
                      ? (order.cliq_includes_delivery
                          ? "bg-purple-50 border-purple-200"
                          : "bg-blue-50 border-blue-200")
                      : "bg-emerald-50 border-emerald-100"
                  )}>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm">
                        {order.payment_method === 'cliq'
                          ? (order.cliq_includes_delivery
                              ? "مدفوع كليك (شامل التوصيل بالكامل):"
                              : "كليك (المطلوب تحصيل أجرة التوصيل فقط):")
                          : "تحصيل كاش مطلوب:"}
                      </span>
                    </div>
                    <span className={cn(
                      "font-black text-xl font-mono",
                      order.payment_method === 'cliq'
                        ? (order.cliq_includes_delivery ? "text-purple-700" : "text-blue-700")
                        : "text-emerald-600"
                    )}>
                      {formatCurrency(order.cash_to_collect)}
                    </span>
                  </div>
                </div>

                {canAct(order) && (
                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-stone-100" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => openActionModal(order, 'delivered')}
                    className="bg-emerald-500 text-white h-12 rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-sm text-sm"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    تم التسليم
                  </button>
                  <button
                    onClick={() => openActionModal(order, 'remaining')}
                    className="bg-blue-500 text-white h-12 rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-sm text-sm"
                  >
                    <Clock className="w-4 h-4" />
                    متبقي لبكرا
                  </button>
                </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {filteredOrders.length === 0 && (
        <div className="px-4">
          <div className="bg-white p-10 rounded-3xl text-center border-2 border-dashed border-stone-200 animate-slideUp">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-100 to-amber-50 flex items-center justify-center mx-auto mb-5 shadow-sm">
              <Package className="w-9 h-9 text-amber-400" />
            </div>
            <p className="font-bold text-stone-700 text-lg mb-1.5">لا توجد طلبات حالياً</p>
            <p className="text-sm text-stone-500">جرّب تغيير البحث أو تصنيف الطلبات</p>
          </div>
        </div>
      )}

      {/* Floating Luxury Glass Dock (iOS / Modern ERP Style) */}
      <div className="fixed bottom-3 inset-x-2 xs:inset-x-3 sm:bottom-5 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-40 max-w-xl w-auto">
        <div className="relative rounded-2xl sm:rounded-3xl bg-white/95 backdrop-blur-xl border border-[#e8dfcf] shadow-lg shadow-[#533f16]/10 p-2 sm:px-4 sm:py-2.5 text-[#533f16] flex items-center justify-between gap-1.5 xs:gap-2 sm:gap-4 overflow-hidden ring-1 ring-white/10">

          {/* Top subtle gold accent glow line */}
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#9e8959] to-transparent" />

          {/* Right: Total Collected Cash */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-[#f6efdf] border border-[#e5d0a1] flex items-center justify-center text-emerald-400 shrink-0 shadow-xs">
              <Banknote className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[9px] sm:text-[10px] text-[#756035] font-bold whitespace-nowrap">كاش مستلم</p>
              <p className="font-black text-emerald-400 text-xs sm:text-base font-mono whitespace-nowrap" dir="ltr">
                {formatCurrency(totalCashCollected)}
              </p>
            </div>
          </div>

          {/* Center: Delivery Progress - Fully Fluid & Responsive */}
          <div className="flex flex-col items-center justify-center px-1.5 sm:px-3 py-0.5 border-x border-[#554625]/60 flex-1 min-w-[55px] max-w-[140px]">
            <div className="flex items-center gap-1 mb-0.5 whitespace-nowrap">
              <span className="text-[10px] sm:text-[11px] text-[#9e8959] font-black font-mono">{completionPercentage}%</span>
              <span className="text-[9px] sm:text-[10px] text-[#756035] font-medium">
                ({deliveredCount}/{totalOrders})
              </span>
            </div>
            <div className="w-full h-1.5 bg-[#241a08] border border-[#554625]/80 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#9e8959] to-[#bda66d] rounded-full transition-all duration-500"
                style={{ width: `${Math.min(Math.max(completionPercentage, 0), 100)}%` }}
              />
            </div>
          </div>

          {/* Left: Quick Dispatch / Supervisor Contact Actions */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <a
              href="tel:0791858928"
              title="اتصال سريع بالمشرف (ضياء)"
              aria-label="اتصال سريع بالمشرف ضياء"
              className="w-8 h-8 sm:w-auto sm:px-2.5 sm:py-1.5 rounded-lg sm:rounded-xl bg-[#241a08] hover:bg-[#35270e] text-[#f4e5d0] hover:text-[#9e8959] border border-[#554625] flex items-center justify-center gap-1 text-xs font-bold transition active:scale-95 shadow-xs shrink-0"
            >
              <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#9e8959]" />
              <span className="hidden md:inline">اتصال</span>
            </a>
            <a
              href="https://wa.me/962791858928"
              target="_blank"
              rel="noreferrer"
              title="محادثة المشرف ضياء عبر واتساب"
              aria-label="محادثة المشرف ضياء عبر واتساب"
              className="w-8 h-8 sm:w-auto sm:px-2.5 sm:py-1.5 rounded-lg sm:rounded-xl bg-[#f6efdf] hover:bg-[#e5d0a1] text-emerald-400 border border-[#e5d0a1] flex items-center justify-center gap-1 text-xs font-bold transition active:scale-95 shadow-xs shrink-0"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="hidden md:inline">المشرف</span>
            </a>
            <Link
              href="/driver/shift"
              title="إغلاق الوردية وكشف الكاش"
              aria-label="إغلاق الوردية وكشف الكاش"
              className="w-8 h-8 sm:w-auto sm:px-2.5 sm:py-1.5 rounded-lg sm:rounded-xl bg-gradient-to-r from-[#9e8959] via-[#bda66d] to-[#9e8959] text-[#160f02] border border-white/20 flex items-center justify-center gap-1 text-xs font-black transition active:scale-95 shadow-md shadow-[#9e8959]/25 shrink-0"
            >
              <Calculator className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">الوردية</span>
            </Link>
          </div>
        </div>
      </div>

      {/* ---------------- ORDER DETAILS MODAL (Driver Clicks Any Order) ---------------- */}
      {selectedOrderForDetails && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 animate-backdropFadeIn"
          onClick={() => setSelectedOrderForDetails(null)}
        >
          <div
            className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-stone-200 max-h-[90dvh] overflow-y-auto hide-scrollbar no-scrollbar [&::-webkit-scrollbar]:hidden space-y-5 animate-modalSlideUp"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-stone-100">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2.5 py-0.5 bg-stone-900 text-amber-400 rounded-lg text-xs font-mono font-bold">
                    طلب #{selectedOrderForDetails.id}
                  </span>
                  <StatusBadge status={selectedOrderForDetails.status} />
                </div>
                <h2 className="font-black text-xl text-stone-900">{selectedOrderForDetails.customer_name}</h2>
              </div>
              <button
                onClick={() => setSelectedOrderForDetails(null)}
                className="w-9 h-9 rounded-full bg-stone-100 text-stone-500 hover:bg-stone-200 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Contact & Map Actions */}
            <div className="grid grid-cols-2 gap-2.5">
              <a
                href={`tel:${selectedOrderForDetails.phone}`}
                className="flex items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 h-12 rounded-2xl text-sm font-bold border border-emerald-200 transition"
              >
                <Phone className="w-4 h-4 text-emerald-600" />
                <span>اتصال: {selectedOrderForDetails.phone}</span>
              </a>
              <a
                href={`https://wa.me/${selectedOrderForDetails.phone.replace(/^0/, '962')}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white h-12 rounded-2xl text-sm font-bold shadow-md shadow-emerald-500/20 transition"
              >
                <MessageSquare className="w-4 h-4" />
                <span>محادثة واتساب</span>
              </a>
            </div>

            {/* Address & Google Maps Link */}
            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 space-y-2">
              <div className="flex items-start gap-2">
                <MapPin className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold text-sm text-stone-900">{selectedOrderForDetails.area}</p>
                  <p className="text-xs text-stone-600 mt-0.5 leading-relaxed">{selectedOrderForDetails.address}</p>
                </div>
              </div>
              <div className="pt-2 border-t border-stone-200 flex justify-end">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedOrderForDetails.area + ' ' + selectedOrderForDetails.address)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-amber-700 hover:text-amber-800 font-bold"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>فتح في خرائط جوجل</span>
                </a>
              </div>
            </div>

            {/* Products List */}
            <div>
              <h4 className="text-xs font-bold text-stone-500 mb-2 flex items-center gap-1.5">
                <Package className="w-4 h-4 text-stone-400" />
                <span>المنتجات المطلوبة في هذا الطلب:</span>
              </h4>
              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100">
                <p className="text-sm font-semibold text-stone-800 leading-relaxed">
                  {selectedOrderForDetails.products}
                </p>
              </div>
            </div>

            {/* Financial & Payment Details Card */}
            <div className={cn(
              "p-4 rounded-2xl border space-y-3",
              selectedOrderForDetails.payment_method === 'cliq'
                ? (selectedOrderForDetails.cliq_includes_delivery
                    ? "bg-purple-50/90 border-purple-200"
                    : "bg-blue-50/90 border-blue-200")
                : "bg-amber-50/60 border-amber-200/70"
            )}>
              {/* Header: Payment Method & Badge */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className={cn(
                    "w-5 h-5",
                    selectedOrderForDetails.payment_method === 'cliq' ? "text-purple-600" : "text-amber-600"
                  )} />
                  <span className="font-black text-sm text-stone-900">طريقة الدفع والحساب:</span>
                </div>
                <PaymentBadge order={selectedOrderForDetails} />
              </div>

              {/* Explanatory Banner for Driver */}
              {selectedOrderForDetails.payment_method === 'cliq' ? (
                <div className="pt-2 border-t border-stone-200/60 space-y-2 text-xs">
                  {selectedOrderForDetails.cliq_includes_delivery ? (
                    <div className="flex items-start gap-2 bg-purple-100 text-purple-900 p-3 rounded-xl border border-purple-200 font-bold">
                      <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="block text-sm font-black">مدفوع بالكامل عبر كليك (شامل التوصيل) ✅</span>
                        <p className="text-[11px] text-purple-800 font-medium mt-0.5">
                          العميل حوّل كامل قيمة البضاعة والتوصيل مسبقاً. <strong>لا تقبض أي نقد من الزبون.</strong>
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 bg-blue-100 text-blue-950 p-3 rounded-xl border border-blue-200 font-bold">
                      <AlertTriangle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="block text-sm font-black">كليك ثمن المنتجات فقط (غير شامل التوصيل) ⚠️</span>
                        <p className="text-[11px] text-blue-900 font-medium mt-0.5">
                          المنتج مدفوع كليك، والمطلوب منك فقط تحصيل <strong>أجرة التوصيل ({formatCurrency(selectedOrderForDetails.cash_to_collect)})</strong> نقداً عند التسليم.
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedOrderForDetails.order_total && (
                    <div className="flex justify-between items-center text-stone-600 text-xs px-1">
                      <span>إجمالي فاتورة المنتجات:</span>
                      <span className="font-mono font-bold">{formatCurrency(selectedOrderForDetails.order_total)}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="pt-2 border-t border-amber-200/50 text-xs text-stone-700 flex justify-between items-center px-1">
                  <span>نوع التحصيل:</span>
                  <span className="font-bold text-stone-900">دفع نقدي كامل عند الاستلام (COD)</span>
                </div>
              )}

              {/* Exact Cash to Collect Highlight */}
              <div className="flex justify-between items-center pt-2 border-t border-stone-200/80">
                <span className="text-xs font-bold text-stone-900">
                  {selectedOrderForDetails.payment_method === 'cliq' && !selectedOrderForDetails.cliq_includes_delivery
                    ? "المطلوب كاش (أجرة التوصيل فقط):"
                    : "المبلغ المطلوب تحصيله كاش باليد:"}
                </span>
                <span className={cn(
                  "font-black text-2xl font-mono",
                  selectedOrderForDetails.payment_method === 'cliq' && selectedOrderForDetails.cliq_includes_delivery
                    ? "text-purple-700"
                    : "text-emerald-700"
                )}>
                  {formatCurrency(selectedOrderForDetails.cash_to_collect)}
                </span>
              </div>

              {selectedOrderForDetails.receivables > 0 && (
                <div className="flex justify-between items-center pt-2 border-t border-amber-200/50 text-xs text-orange-700">
                  <span className="font-medium">ذمم سابقة مسجلة على العميل:</span>
                  <span className="font-bold font-mono">{formatCurrency(selectedOrderForDetails.receivables)}</span>
                </div>
              )}
            </div>

            {/* Additional Status Notes if any */}
            {selectedOrderForDetails.return_reason && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                <strong>سبب الإرجاع:</strong> {selectedOrderForDetails.return_reason}
              </div>
            )}
            {selectedOrderForDetails.postpone_date && (
              <div className="p-3 bg-stone-100 border border-stone-200 rounded-xl text-xs text-stone-800">
                <strong>مؤجل حتى تاريخ:</strong> {selectedOrderForDetails.postpone_date}
              </div>
            )}

            {/* Delivery Action Buttons */}
            {canAct(selectedOrderForDetails) && (
            <div>
              <p className="text-xs font-bold text-stone-500 mb-2">تسجيل حالة التوصيل للطلب:</p>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={() => openActionModal(selectedOrderForDetails, 'delivered')}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white h-13 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 text-sm transition cursor-pointer active:scale-95"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  تم التسليم
                </button>
                <button
                  onClick={() => openActionModal(selectedOrderForDetails, 'remaining')}
                  className="bg-blue-500 hover:bg-blue-600 text-white h-13 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 text-sm transition cursor-pointer active:scale-95"
                >
                  <Clock className="w-5 h-5" />
                  متبقي لبكرا
                </button>
                <button
                  onClick={() => openActionModal(selectedOrderForDetails, 'returned')}
                  className="bg-rose-500 hover:bg-rose-600 text-white h-13 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-md shadow-rose-500/20 text-sm transition cursor-pointer active:scale-95"
                >
                  <RotateCcw className="w-5 h-5" />
                  مرتجع
                </button>
                <button
                  onClick={() => openActionModal(selectedOrderForDetails, 'postponed')}
                  className="bg-stone-600 hover:bg-stone-700 text-white h-13 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-md shadow-stone-600/20 text-sm transition cursor-pointer active:scale-95"
                >
                  <CalendarIcon className="w-5 h-5" />
                  تأجيل
                </button>
              </div>
            </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------- ACTION CONFIRMATION MODAL ---------------- */}
      {modalType && activeOrder && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-backdropFadeIn">
          <div
            className="bg-white w-full sm:max-w-md rounded-t-[2rem] sm:rounded-3xl p-6 pb-10 sm:pb-6 animate-modalSlideUp max-h-[90dvh] overflow-y-auto hide-scrollbar no-scrollbar [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-xl">
                {modalType === 'delivered' && 'تأكيد التسليم'}
                {modalType === 'returned' && 'تسجيل مرتجع'}
                {modalType === 'postponed' && 'تأجيل الطلب'}
                {modalType === 'remaining' && 'متبقي للغد'}
              </h3>
              <button onClick={closeActionModal} className="w-10 h-10 bg-stone-100 rounded-full text-stone-500 flex items-center justify-center active:bg-stone-200 transition-colors">
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
                  <label className="block text-base font-bold mb-2 text-stone-800">المبلغ المستلم كاش (دينار)</label>
                  {activeOrder.payment_method === 'cliq' && (
                    <div className="mb-3 p-3 rounded-xl bg-purple-50 border border-purple-200 text-xs font-bold text-purple-900 leading-relaxed">
                      {activeOrder.cliq_includes_delivery ? (
                        <span>💡 هذا الطلب مدفوع مسبقاً بالكامل عبر CliQ شاملاً التوصيل (المبلغ المستلم المطلوب: 0.000 د.أ).</span>
                      ) : (
                        <span>💡 منتجات الطلب مدفوعة كليك. المطلوب تحصيل رسوم التوصيل فقط ({formatCurrency(activeOrder.cash_to_collect)}).</span>
                      )}
                    </div>
                  )}

                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.001"
                    aria-label="المبلغ المستلم كاش"
                    value={cashCollected}
                    onChange={e => setCashCollected(e.target.value)}
                    className="w-full border-2 border-stone-200 rounded-2xl p-5 text-2xl font-black focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 outline-none transition-all text-center"
                    dir="ltr"
                  />
                  {Number(cashCollected) !== activeOrder.cash_to_collect && (
                    <p className="text-orange-600 text-sm font-bold bg-orange-50 p-3 rounded-xl border border-orange-100 mt-2">
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
                disabled={saving}
                className={cn(
                  "w-full h-16 rounded-2xl font-black text-white text-lg mt-8 flex items-center justify-center gap-3 transition-transform active:scale-[0.98] disabled:opacity-60",
                  modalType === 'delivered' ? "bg-emerald-500 shadow-lg shadow-emerald-500/30" :
                  modalType === 'returned' ? "bg-rose-500 shadow-lg shadow-rose-500/30" :
                  modalType === 'postponed' ? "bg-stone-700 shadow-lg shadow-stone-500/30" :
                  "bg-blue-500 shadow-lg shadow-blue-500/30"
                )}
              >
                <Check className="w-6 h-6" />
                {saving ? "جاري الحفظ..." : "تأكيد وحفظ"}
              </button>
            </div>
          </div>
        </div>
      )}

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

            {doneModalInfo.orderId && (
              <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-100 space-y-2 text-right">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-stone-400">رقم الطلب:</span>
                  <span className="font-mono font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    {doneModalInfo.orderId}
                  </span>
                </div>
                {doneModalInfo.customerName && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-stone-400">العميل:</span>
                    <span className="font-bold text-stone-800">{doneModalInfo.customerName}</span>
                  </div>
                )}
                {doneModalInfo.badgeText && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-stone-400">الحالة المعتمدة:</span>
                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold border", doneModalInfo.badgeColor)}>
                      {doneModalInfo.badgeText}
                    </span>
                  </div>
                )}
                {doneModalInfo.cashAmount !== undefined && (
                  <div className="flex justify-between items-center text-xs pt-1 border-t border-stone-200">
                    <span className="text-stone-600 font-bold">المبلغ المقبوض:</span>
                    <span className="font-mono font-black text-emerald-600 text-sm">
                      {formatCurrency(doneModalInfo.cashAmount)}
                    </span>
                  </div>
                )}
              </div>
            )}

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

  const dotColors = {
    pending: "bg-amber-500",
    remaining: "bg-blue-500",
    delivered: "bg-emerald-500",
    returned: "bg-rose-500",
    postponed: "bg-stone-500"
  };

  const isActive = status === 'pending' || status === 'remaining';

  return (
    <span className={cn("px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-md sm:rounded-xl text-[10px] sm:text-xs font-bold sm:font-black border inline-flex items-center gap-1 whitespace-nowrap", styles[status])}>
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotColors[status], isActive && "animate-pulseDot")} />
      {labels[status]}
    </span>
  );
}

function PaymentBadge({ order }: { order: Order }) {
  if (order.payment_method === 'cliq') {
    if (order.cliq_includes_delivery) {
      return (
        <span
          title="مدفوع مسبقاً عبر كليك شاملاً رسوم التوصيل"
          className="px-1.5 sm:px-2 py-0.5 rounded-md sm:rounded-lg bg-purple-100 text-purple-900 border border-purple-300 text-[10px] sm:text-[11px] font-black inline-flex items-center gap-1 shadow-2xs whitespace-nowrap"
        >
          <CreditCard className="w-3 h-3 text-purple-700 shrink-0" />
          <span>CliQ (شامل التوصيل)</span>
        </span>
      );
    } else {
      return (
        <span
          title="مدفوع ثمن المنتج عبر كليك - المطلوب تحصيل أجرة التوصيل فقط"
          className="px-1.5 sm:px-2 py-0.5 rounded-md sm:rounded-lg bg-blue-100 text-blue-900 border border-blue-300 text-[10px] sm:text-[11px] font-black inline-flex items-center gap-1 shadow-2xs whitespace-nowrap"
        >
          <CreditCard className="w-3 h-3 text-blue-700 shrink-0" />
          <span>CliQ (تحصيل توصيل فقط)</span>
        </span>
      );
    }
  }

  return (
    <span className="px-1.5 sm:px-2 py-0.5 rounded-md sm:rounded-lg bg-stone-100 text-stone-700 border border-stone-200 text-[10px] sm:text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap">
      <Banknote className="w-3 h-3 text-emerald-600 shrink-0" />
      <span>كاش (عند الاستلام)</span>
    </span>
  );
}
