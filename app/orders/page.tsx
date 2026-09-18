"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  ShoppingCart,
  Plus,
  MessageSquare,
  CheckCircle2,
  Clock,
  Truck,
  AlertCircle,
  FileText,
  Sparkles,
  MapPin,
  ChevronDown,
  ChevronUp,
  Printer,
  RotateCcw,
  XCircle,
  Calendar,
  DollarSign,
  Package,
  LayoutGrid,
  Table as TableIcon,
  Phone,
  GripVertical,
  X
} from "lucide-react";
import { formatCurrency, ORDER_STATUS_LABELS, cn } from "@/lib/utils";
import { parseWhatsAppOrderText } from "@/lib/order-parser";
import { useLoading } from "@/lib/loading-context";

import {loadBusiness,saveBusiness,pendingBusiness} from '@/lib/business-client';
import type {BusinessOrder,OrderChange} from '@/lib/business';
import { useCan } from "@/lib/use-permission";
import { useToast } from "@/components/common/toast";
import { useConfirm } from "@/components/common/confirm-dialog";
import { printArea } from "@/lib/print";
import { OrderChangeLog } from "@/components/common/order-change-log";

function OrdersContent() {
  const { showToast } = useToast();
  const dialogs = useConfirm();
  const searchParams = useSearchParams();
  const { startLoading, stopLoading } = useLoading();
  const [orders, setOrders] = useState<BusinessOrder[]>([]);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [loaded,setLoaded]=useState(false);
  const [saving,setSaving]=useState(false);
  const busy=useRef(false);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Details Modal
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<BusinessOrder | null>(null);

  // WhatsApp Parser Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [rawText, setRawText] = useState("");

  // Waybill / Invoice Printable Modal
  const [waybillOrder, setWaybillOrder] = useState<BusinessOrder | null>(null);

  // Drag and Drop
  const [draggedOrderId, setDraggedOrderId] = useState<string | null>(null);
  const [dragOverOrderId, setDragOverOrderId] = useState<string | null>(null);

  const reload=useCallback(async()=>{
    try{setOrders((await loadBusiness<{orders:BusinessOrder[]}>('/api/orders')).orders);setError('');setLoaded(true);const pending=pendingBusiness('order-create');if(pending){setRawText(pending.rawText);setModalOpen(true);}}
    catch(e){setError(e instanceof Error?e.message:'تعذر تحميل الطلبات.');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void Promise.resolve().then(reload);},[reload]);

  // Header "New Order" shortcut (/orders?new=true) opens the WhatsApp order
  // creation modal directly, instead of landing on the board with no way in.
  useEffect(() => {
    if (searchParams.get('new') === 'true') setModalOpen(true);
  }, [searchParams]);

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

  // Sample templates from user
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

  // Auto live preview of parsed text
  const preview = rawText ? parseWhatsAppOrderText(rawText) : null;

  const handleParseAndCreateOrder = async () => {
    if(busy.current||!rawText.trim()||!preview)return;
    busy.current=true;setSaving(true);setError('');startLoading({ar:'جاري حفظ الطلب...',en:'Saving order...'});
    try{
      const {order}=await saveBusiness<{order:BusinessOrder}>('order-create','/api/orders',{rawText});
      setOrders(prev=>[order,...prev.filter(o=>o.id!==order.id)]);
      setRawText('');setModalOpen(false);
      showToast('تم حفظ الطلب '+order.id,'success');
    }catch(e){setError(e instanceof Error?e.message:'تعذر تأكيد حفظ الطلب. أعد المحاولة.');}
    finally{busy.current=false;setSaving(false);stopLoading();}
  };
  async function changeStatus(orderId:string,status:string){
    if(busy.current)return;
    const order=orders.find(o=>o.id===orderId);if(!order)return;
    busy.current=true;setSaving(true);setError('');startLoading({ar:'جاري حفظ الحالة...',en:'Saving status...'});
    try{
      const slot='order-status:'+orderId;
      const {order:updated}=await saveBusiness<{order:BusinessOrder}>(slot,'/api/orders',
        pendingBusiness(slot)??{id:orderId,status,expected_status:order.status},'PATCH');
      setOrders(prev=>prev.map(o=>o.id===orderId?updated:o));
      setSelectedOrderForDetails(prev=>prev?.id===orderId?updated:prev);
    }catch(e){setError(e instanceof Error?e.message:'تعذر حفظ الحالة.');}
    finally{busy.current=false;setSaving(false);stopLoading();}
  }
  const canCreate=useCan('orders.create'),canStatus=useCan('orders.status'),canEdit=useCan('orders.edit');
  const advanceOrderStatus=(id:string,status:string)=>{
    const next:Record<string,string>={draft:'confirmed',confirmed:'processing',processing:'shipped',shipped:'delivered'};
    if(next[status])void changeStatus(id,next[status]);
  };
  const markOrderReturned=(id:string)=>{void changeStatus(id,'returned');};
  const CANCELLABLE_STATUSES=['draft','confirmed','processing'];

  // Editing an already-placed order (draft/confirmed/processing only — matches CANCELLABLE_STATUSES,
  // the same "not once shipped" boundary business_order_update enforces server-side).
  // Edit mode and the fetched history are both tagged with the order they belong to, so opening a
  // different order drops them on the next render instead of through a state-resetting effect.
  const [editingOrderId,setEditingOrderId]=useState<string|null>(null);
  const editingOrder=!!selectedOrderForDetails&&editingOrderId===selectedOrderForDetails.id;
  const [editCustomerName,setEditCustomerName]=useState('');
  const [editCustomerPhone,setEditCustomerPhone]=useState('');
  const [editCity,setEditCity]=useState('');
  const [editAddress,setEditAddress]=useState('');
  const [editNotes,setEditNotes]=useState('');
  const [editItems,setEditItems]=useState<{name:string;qty:number;price:number|null}[]>([]);
  const [history,setHistory]=useState<{id:string;entries:OrderChange[]}|null>(null);
  const orderHistory=history&&history.id===selectedOrderForDetails?.id?history.entries:[];

  const startEditingOrder=()=>{
    if(!selectedOrderForDetails)return;
    setEditCustomerName(selectedOrderForDetails.customer_name);
    setEditCustomerPhone(selectedOrderForDetails.customer_phone);
    setEditCity(selectedOrderForDetails.city);
    setEditAddress(selectedOrderForDetails.address);
    setEditNotes(selectedOrderForDetails.installment_notes||'');
    setEditItems(selectedOrderForDetails.items.map(i=>({name:i.name,qty:i.qty,price:i.price})));
    setEditingOrderId(selectedOrderForDetails.id);
  };
  const saveOrderEdit=async()=>{
    if(!selectedOrderForDetails||busy.current)return;
    if(!editItems.length||editItems.some(i=>!i.name.trim()||!(i.qty>0))){
      showToast('أدخل صنفًا واحدًا على الأقل باسم وكمية صحيحة.','error');return;
    }
    busy.current=true;setSaving(true);startLoading({ar:'جاري حفظ التعديلات...',en:'Saving changes...'});
    try{
      const id=selectedOrderForDetails.id;
      const {order:updated}=await saveBusiness<{order:BusinessOrder}>('order-edit:'+id,'/api/orders',{
        action:'edit',id,customer_name:editCustomerName.trim(),customer_phone:editCustomerPhone.trim(),
        city:editCity.trim(),address:editAddress.trim(),notes:editNotes.trim(),
        items:editItems.map(i=>({name:i.name.trim(),qty:i.qty,price:i.price}))
      },'PATCH');
      setOrders(prev=>prev.map(o=>o.id===id?updated:o));
      setSelectedOrderForDetails(updated);
      setEditingOrderId(null);
      loadOrderHistory(id); // the edit just added an entry; the panel must show it without reopening
      showToast('تم حفظ تعديلات الطلب.','success');
    }catch(e){showToast(e instanceof Error?e.message:'تعذر حفظ التعديلات.','error');}
    finally{busy.current=false;setSaving(false);stopLoading();}
  };
  const markOrderCancelled=async(id:string)=>{
    if(!await dialogs.confirm({title:'إلغاء الطلب',message:'سيتم إرجاع أي كمية محجوزة إلى المخزون تلقائياً.',confirmLabel:'إلغاء الطلب',cancelLabel:'رجوع',danger:true}))return;
    void changeStatus(id,'cancelled');
  };
  // The change history of whichever order is open, re-read after every edit this page saves.
  const loadOrderHistory=useCallback((id:string)=>{
    loadBusiness<{changes:OrderChange[]}>('/api/orders?changes='+encodeURIComponent(id))
      .then(d=>setHistory({id,entries:d.changes}))
      .catch(()=>{});
  },[]);
  useEffect(()=>{
    const id=selectedOrderForDetails?.id;
    if(id)loadOrderHistory(id);
  },[selectedOrderForDetails?.id,loadOrderHistory]);

  const filteredOrders = orders.filter(o => {
    if (activeTab === "all") return true;
    return o.status === activeTab;
  });

  if(!loaded)return (
    <div role="status" className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-stone-500">
      <span>{loading?'جاري تحميل الطلبات...':error}</span>
      {!loading&&<button type="button" onClick={()=>void reload()} className="rounded-xl bg-stone-900 px-4 py-2 text-xs font-bold text-white">إعادة المحاولة</button>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button type="button" onClick={()=>void reload()} disabled={saving||loading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-1.5 font-bold text-stone-700 hover:bg-stone-50 disabled:opacity-50">
          {loading?'جاري التحديث...':'تحديث الطلبات'}
        </button>
        {error&&<p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 font-bold text-rose-700">{error}</p>}
        <span className="text-stone-500">الترتيب بالسحب والأسهم مؤقت للعرض فقط.</span>
      </div>
      {/* Header Title & View Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5">
            <ShoppingCart className="w-6 h-6 text-amber-500" />
            <span>إدارة وتأكيد الطلبات (Order Lifecycle)</span>
          </h2>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            تحويل طلبيات الواتساب آلياً، إدارة دورة التوصيل، وعرض الطلبات كشبكة تفاعلية بالسحب والإفلات
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* View Switcher: Grid Network vs Table */}
          <div className="flex items-center bg-stone-100 p-1 rounded-xl border border-stone-200">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                viewMode === 'grid'
                  ? "bg-white text-stone-900 shadow-xs"
                  : "text-stone-500 hover:text-stone-800"
              )}
              title="عرض كشبكة طلبات" aria-label="عرض كشبكة طلبات"
            >
              <LayoutGrid className="w-4 h-4 text-amber-500" />
              <span>شبكة الطلبات</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                viewMode === 'table'
                  ? "bg-white text-stone-900 shadow-xs"
                  : "text-stone-500 hover:text-stone-800"
              )}
              title="عرض كجدول بيانات" aria-label="عرض كجدول بيانات"
            >
              <TableIcon className="w-4 h-4 text-amber-500" />
              <span>جدول البيانات</span>
            </button>
          </div>

          <button
            hidden={!canCreate}
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>تحويل رسالة واتساب لطلب</span>
          </button>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div
        className="flex items-center gap-2 border-b border-stone-200 pb-2 overflow-x-auto hide-scrollbar no-scrollbar [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
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
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
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

      {/* ---------------- GRID NETWORK VIEW (Default) ---------------- */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
          {filteredOrders.map((order, index) => {
            const statusInfo = ORDER_STATUS_LABELS[order.status] || { label: order.status, color: "bg-stone-100" };
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
                  "bg-white rounded-xl sm:rounded-2xl p-2.5 sm:p-4 border transition-all flex flex-col justify-between shadow-xs select-none relative group",
                  isBeingDragged && "opacity-40 scale-[0.98] bg-amber-50 ring-2 ring-amber-400",
                  isDraggedOver && "border-amber-500 ring-2 ring-amber-400 bg-amber-50/70",
                  !isBeingDragged && !isDraggedOver && "border-stone-200 hover:border-amber-300 hover:shadow-md"
                )}
              >
                <div>
                  {/* Card Header: Reorder handle + Order ID + Status */}
                  <div className="flex items-center justify-between pb-1.5 sm:pb-2.5 mb-1.5 sm:mb-2.5 border-b border-stone-100">
                    <div className="flex items-center gap-1 min-w-0">
                      <span
                        className="cursor-grab active:cursor-grabbing p-0.5 sm:p-1 bg-stone-100 hover:bg-amber-100 text-stone-500 rounded transition shrink-0"
                        title="اسحب لإعادة الترتيب"
                      >
                        <GripVertical className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </span>
                      <span className="font-mono text-[10px] sm:text-xs font-bold text-amber-600 truncate">
                        {order.id}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold border ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                      <div className="flex items-center">
                        <button
                          type="button"
                          aria-label={`تحريك الطلب ${order.id} لأعلى`}
                          onClick={(e) => { e.stopPropagation(); moveOrder(order.id, "up"); }}
                          disabled={index === 0}
                          className="text-stone-300 hover:text-amber-600 disabled:opacity-20 p-0.5"
                        >
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          aria-label={`تحريك الطلب ${order.id} لأسفل`}
                          onClick={(e) => { e.stopPropagation(); moveOrder(order.id, "down"); }}
                          disabled={index === filteredOrders.length - 1}
                          className="text-stone-300 hover:text-amber-600 disabled:opacity-20 p-0.5"
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Card Body (Clickable for Details Modal) */}
                  <div
                    onClick={() => setSelectedOrderForDetails(order)}
                    className="cursor-pointer space-y-1.5 sm:space-y-2"
                  >
                    <div>
                      <h3 className="font-bold text-xs sm:text-base text-stone-900 group-hover:text-amber-600 transition-colors truncate">
                        {order.customer_name}
                      </h3>
                      <p className="text-[10px] sm:text-[11px] font-mono text-stone-400" dir="ltr">{order.customer_phone}</p>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] sm:text-xs text-stone-600 truncate">
                      <MapPin className="w-3 h-3 text-stone-400 shrink-0" />
                      <span className="font-bold text-stone-800 shrink-0">{order.city}</span>
                      <span className="text-stone-400 truncate text-[10px] sm:text-xs">- {order.address}</span>
                    </div>

                    <div className="bg-stone-50 p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl border border-stone-100 text-[10px] sm:text-xs text-stone-700 line-clamp-1 sm:line-clamp-2">
                      <Package className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-stone-400 inline ml-1 shrink-0" />
                      {order.items_summary}
                    </div>

                    <div className="flex items-center justify-between text-[10px] sm:text-xs pt-0.5">
                      <span className="text-stone-400 text-[10px] sm:text-[11px] truncate">{order.source}</span>
                      {order.payment_method === 'installment' && (
                        <span className="text-[9px] sm:text-[10px] font-bold bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200 shrink-0">
                          حجز / أقساط
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Bar: Amount & Actions */}
                <div className="pt-1.5 sm:pt-2 mt-1.5 sm:mt-2 border-t border-stone-100 flex items-center justify-between gap-1.5">
                  <div>
                    <span className="text-[9px] sm:text-[10px] text-stone-400 block">المبلغ:</span>
                    <span className="font-mono font-black text-xs sm:text-sm text-stone-900">
                      {formatCurrency(order.total_amount)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {order.status !== 'delivered' && order.status !== 'returned' && (
                      <button
                        type="button"
                        hidden={!canStatus}
                        onClick={(e) => { e.stopPropagation(); advanceOrderStatus(order.id, order.status); }}
                        className="px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white font-semibold text-[10px] sm:text-xs shadow-2xs transition cursor-pointer shrink-0"
                      >
                        {order.status === 'draft' && 'تأكيد'}
                        {order.status === 'confirmed' && 'تجهيز'}
                        {order.status === 'processing' && 'توصيل'}
                        {order.status === 'shipped' && 'تسليم'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setWaybillOrder(order); }}
                      className="p-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 transition cursor-pointer"
                      title="طباعة بوليصة التوصيل" aria-label="طباعة بوليصة التوصيل"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedOrderForDetails(order)}
                      className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg text-xs font-bold transition cursor-pointer"
                      title="عرض التفاصيل" aria-label="عرض التفاصيل"
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
        /* ---------------- TABLE VIEW ---------------- */
        <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-stone-100 flex items-center justify-between">
            <h3 className="font-bold text-sm text-stone-900">سجل طلبيات التوصيل</h3>
            <span className="text-xs text-stone-400">إجمالي {filteredOrders.length} طلب</span>
          </div>

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

                  return (
                    <tr
                      key={order.id}
                      className="hover:bg-stone-50/80 transition cursor-pointer"
                      onClick={() => setSelectedOrderForDetails(order)}
                    >
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
                      <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          {order.status !== 'delivered' && order.status !== 'returned' && (
                            <button
                              hidden={!canStatus}
                              onClick={() => advanceOrderStatus(order.id, order.status)}
                              className="px-2.5 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 text-white font-semibold text-[11px] shadow-2xs transition cursor-pointer"
                            >
                              {order.status === 'draft' && 'تأكيد'}
                              {order.status === 'confirmed' && 'تجهيز'}
                              {order.status === 'processing' && 'إرسال للتوصيل'}
                              {order.status === 'shipped' && 'تم التسليم'}
                            </button>
                          )}

                          <button
                            onClick={() => setWaybillOrder(order)}
                            className="p-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 transition cursor-pointer"
                            title="طباعة بوليصة التوصيل / سند التسليم" aria-label="طباعة بوليصة التوصيل / سند التسليم"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>

                          {order.status === 'shipped' && (
                            <button
                              hidden={!canStatus}
                              onClick={() => markOrderReturned(order.id)}
                              className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition cursor-pointer"
                              title="تسجيل كطلب مرتجع" aria-label="تسجيل كطلب مرتجع"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {CANCELLABLE_STATUSES.includes(order.status) && (
                            <button
                              hidden={!canStatus}
                              onClick={() => markOrderCancelled(order.id)}
                              className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition cursor-pointer"
                              title="إلغاء الطلب" aria-label="إلغاء الطلب"
                            >
                              <XCircle className="w-3.5 h-3.5" />
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
        </div>
      )}

      {/* ---------------- ORDER DETAILS MODAL ---------------- */}
      {selectedOrderForDetails && (
        <div data-dialog=""
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setSelectedOrderForDetails(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-stone-200 space-y-4 max-h-[90dvh] overflow-y-auto hide-scrollbar no-scrollbar [&::-webkit-scrollbar]:hidden text-right animate-in zoom-in-95"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <div className="flex items-start justify-between pb-3 border-b border-stone-100">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2.5 py-0.5 bg-stone-900 text-amber-400 rounded-lg text-xs font-mono font-bold">
                    {selectedOrderForDetails.id}
                  </span>
                  <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-bold border", (ORDER_STATUS_LABELS[selectedOrderForDetails.status] || { color: "bg-stone-100" }).color)}>
                    {(ORDER_STATUS_LABELS[selectedOrderForDetails.status] || { label: selectedOrderForDetails.status }).label}
                  </span>
                </div>
                <h3 className="font-black text-xl text-stone-900">{selectedOrderForDetails.customer_name}</h3>
                <p className="text-xs text-stone-400 mt-0.5">المصدر: {selectedOrderForDetails.source} • التاريخ: {selectedOrderForDetails.order_date}</p>
              </div>
              <button aria-label="إغلاق"
                onClick={() => setSelectedOrderForDetails(null)}
                className="w-9 h-9 rounded-full bg-stone-100 text-stone-500 hover:bg-stone-200 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Actions (Call & WhatsApp) */}
            <div className="grid grid-cols-2 gap-2.5">
              <a
                href={`tel:${selectedOrderForDetails.customer_phone}`}
                className="flex items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 h-11 rounded-xl text-xs font-bold border border-emerald-200 transition"
              >
                <Phone className="w-4 h-4 text-emerald-600" />
                <span>اتصال: {selectedOrderForDetails.customer_phone}</span>
              </a>
              <a
                href={`https://wa.me/${selectedOrderForDetails.customer_phone.replace(/^0/, '962')}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white h-11 rounded-xl text-xs font-bold shadow-xs transition"
              >
                <MessageSquare className="w-4 h-4" />
                <span>محادثة واتساب</span>
              </a>
            </div>

            {editingOrder ? (
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <input value={editCustomerName} onChange={e=>setEditCustomerName(e.target.value)} placeholder="اسم العميل"
                    className="rounded-xl border border-stone-200 p-2.5 text-xs" />
                  <input value={editCustomerPhone} onChange={e=>setEditCustomerPhone(e.target.value)} placeholder="رقم الهاتف" dir="ltr"
                    className="rounded-xl border border-stone-200 p-2.5 text-xs font-mono" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input value={editCity} onChange={e=>setEditCity(e.target.value)} placeholder="المدينة"
                    className="rounded-xl border border-stone-200 p-2.5 text-xs" />
                  <input value={editAddress} onChange={e=>setEditAddress(e.target.value)} placeholder="العنوان التفصيلي"
                    className="rounded-xl border border-stone-200 p-2.5 text-xs" />
                </div>
                <textarea value={editNotes} onChange={e=>setEditNotes(e.target.value)} placeholder="ملاحظات" rows={2}
                  className="w-full rounded-xl border border-stone-200 p-2.5 text-xs resize-none" />
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-stone-500">الأصناف:</h4>
                  {editItems.map((item,idx)=>(
                    <div key={idx} className="flex gap-1.5 items-center">
                      <input value={item.name} onChange={e=>setEditItems(prev=>prev.map((it,i)=>i===idx?{...it,name:e.target.value}:it))}
                        placeholder="اسم الصنف" className="flex-1 min-w-0 rounded-lg border border-stone-200 p-2 text-xs" />
                      <input type="number" min={1} value={item.qty} onChange={e=>setEditItems(prev=>prev.map((it,i)=>i===idx?{...it,qty:Number(e.target.value)||1}:it))}
                        className="w-14 rounded-lg border border-stone-200 p-2 text-xs text-center" />
                      <input type="number" min={0} step="0.001" value={item.price??''} placeholder="السعر"
                        onChange={e=>setEditItems(prev=>prev.map((it,i)=>i===idx?{...it,price:e.target.value===''?null:Number(e.target.value)}:it))}
                        className="w-20 rounded-lg border border-stone-200 p-2 text-xs text-center" />
                      <button type="button" onClick={()=>setEditItems(prev=>prev.filter((_,i)=>i!==idx))}
                        className="w-8 h-8 shrink-0 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={()=>setEditItems(prev=>[...prev,{name:'',qty:1,price:null}])}
                    className="text-xs font-bold text-amber-700 flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /><span>إضافة صنف</span>
                  </button>
                </div>
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  سيتم تحديث إجمالي الطلب تلقائياً بحسب الأصناف والأسعار المدخلة، وتعديل المخزون المحجوز إذا تغيرت الكميات.
                </p>
                <div className="flex gap-2">
                  <button type="button" disabled={saving} onClick={saveOrderEdit}
                    className="flex-1 py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl font-bold text-xs disabled:opacity-50">
                    حفظ التعديلات
                  </button>
                  <button type="button" onClick={()=>setEditingOrderId(null)}
                    className="px-4 py-2.5 bg-stone-100 text-stone-700 rounded-xl font-bold text-xs">
                    إلغاء
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Address */}
                <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-100 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-stone-900">
                    <MapPin className="w-4 h-4 text-amber-500" />
                    <span>{selectedOrderForDetails.city}</span>
                  </div>
                  <p className="text-stone-600 pr-5">{selectedOrderForDetails.address}</p>
                </div>

                {/* Products List */}
                <div>
                  <h4 className="text-xs font-bold text-stone-500 mb-1.5 flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-stone-400" />
                    <span>المنتجات المطلوبة:</span>
                  </h4>
                  <div className="p-3 bg-stone-50 rounded-2xl border border-stone-100 text-xs font-medium text-stone-800 leading-relaxed">
                    {selectedOrderForDetails.items_summary}
                  </div>
                </div>

                {/* Financial Details */}
                <div className="bg-amber-50/60 p-3.5 rounded-2xl border border-amber-200/70 flex justify-between items-center text-xs">
                  <div>
                    <span className="text-stone-500 block">طريقة السداد:</span>
                    <span className="font-bold text-stone-900">
                      {selectedOrderForDetails.payment_method === 'installment' ? 'حجز شهر / أقساط' : 'دفع عند الاستلام (COD)'}
                    </span>
                  </div>
                  <div className="text-left">
                    <span className="text-stone-500 block">المبلغ المطلوب:</span>
                    <span className="font-black text-lg text-amber-900 font-mono">
                      {formatCurrency(selectedOrderForDetails.total_amount)}
                    </span>
                  </div>
                </div>

                {/* Change history — visible to whoever can already see this order (Diya included) */}
                <OrderChangeLog entries={orderHistory} />
              </>
            )}

            {/* Modal Bottom Actions */}
            {!editingOrder && (
            <div className="flex gap-2 pt-2 border-t border-stone-100 flex-wrap">
              {selectedOrderForDetails.status !== 'delivered' && selectedOrderForDetails.status !== 'returned' && (
                <button
                  hidden={!canStatus}
                  onClick={() => advanceOrderStatus(selectedOrderForDetails.id, selectedOrderForDetails.status)}
                  className="flex-1 py-3 bg-stone-900 hover:bg-stone-800 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4 text-amber-400" />
                  <span>
                    {selectedOrderForDetails.status === 'draft' && 'تأكيد الطلب'}
                    {selectedOrderForDetails.status === 'confirmed' && 'بدء التجهيز'}
                    {selectedOrderForDetails.status === 'processing' && 'إرسال مع السائق'}
                    {selectedOrderForDetails.status === 'shipped' && 'تأكيد التسليم'}
                  </span>
                </button>
              )}
              {CANCELLABLE_STATUSES.includes(selectedOrderForDetails.status) && canEdit && (
                <button
                  type="button"
                  onClick={startEditingOrder}
                  className="px-4 py-3 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <FileText className="w-4 h-4" />
                  <span>تعديل الطلب</span>
                </button>
              )}
              {CANCELLABLE_STATUSES.includes(selectedOrderForDetails.status) && (
                <button
                  type="button"
                  hidden={!canStatus}
                  onClick={() => markOrderCancelled(selectedOrderForDetails.id)}
                  className="px-4 py-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <XCircle className="w-4 h-4" />
                  <span>إلغاء الطلب</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => { setWaybillOrder(selectedOrderForDetails); setSelectedOrderForDetails(null); }}
                className="px-4 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة البوليصة</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedOrderForDetails(null)}
                className="px-4 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                إغلاق
              </button>
            </div>
            )}
          </div>
        </div>
      )}

      {/* WhatsApp Parsing Automation Modal */}
      {modalOpen && (
        <div data-dialog="" className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div
            className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-stone-200 space-y-4 max-h-[90dvh] overflow-y-auto hide-scrollbar no-scrollbar [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
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
                className="p-1.5 rounded-lg bg-stone-100 text-stone-500 hover:bg-stone-200 cursor-pointer"
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
                  className="px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium transition cursor-pointer"
                >
                  طلب التسويق (سدين غنايم - 24 د)
                </button>
                <button
                  type="button"
                  onClick={() => setRawText(sample2)}
                  className="px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium transition cursor-pointer"
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
                    <span className="font-mono font-bold text-stone-900" dir="ltr">{preview.phone}</span>
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
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              {error&&<p role="alert" className="text-red-700 text-sm">{error}</p>}
              <button
                type="button"
                onClick={handleParseAndCreateOrder}
                disabled={saving || !preview}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 rounded-xl font-bold text-xs shadow-md shadow-amber-500/20 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>اعتماد وتحويل الطلب فوراً</span>
              </button>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-medium cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Delivery Waybill / Dispatch Slip Modal */}
      {waybillOrder && (
        <div data-dialog="" className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="print-area bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-stone-200 space-y-5">
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
                className="p-1 rounded-lg bg-stone-100 text-stone-500 cursor-pointer"
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
            <div className="no-print flex gap-2 pt-2">
              <button
                type="button"
                onClick={printArea}
                className="flex-1 py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة البوليصة للسائق</span>
              </button>
              <button
                type="button"
                onClick={() => setWaybillOrder(null)}
                className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-medium cursor-pointer"
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

export default function OrdersPage() {
  return (
    <Suspense fallback={
      <div className="min-h-96 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <OrdersContent />
    </Suspense>
  );
}
