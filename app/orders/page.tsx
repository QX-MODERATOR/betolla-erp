"use client";

import { useState } from "react";
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
  Printer,
  RotateCcw,
  XCircle,
  Calendar,
  DollarSign,
  Package
} from "lucide-react";
import { formatCurrency, ORDER_STATUS_LABELS } from "@/lib/utils";
import { parseWhatsAppOrderText } from "@/lib/order-parser";

const INITIAL_ORDERS = [
  {
    id: "BET-2026-001",
    customer_name: "سدين غنايم",
    customer_phone: "0793937385",
    city: "طبربور",
    address: "طبربور / شارع الامير حسين عماره 101",
    items_summary: "2 شامبو بلازما + 100مل تريتمنت",
    total_amount: 24.000,
    source: "سوشال ميديا (رحمه الجمّال)",
    status: "confirmed",
    order_date: "2026-09-08",
    payment_method: "cash_on_delivery",
    installment_notes: null,
  },
  {
    id: "BET-2026-002",
    customer_name: "ربى صبيح",
    customer_phone: "0799193505",
    city: "الزرقاء",
    address: "الزرقا الجبل الشمالي بالقرب من مركز امن ياجوز",
    items_summary: "3 بكجات مورفوزيس 250 + 2 ليف أن + 5 سيشتات",
    total_amount: 95.000,
    source: "مبيعات مباشرة (صابرين)",
    status: "processing",
    order_date: "2026-09-10",
    payment_method: "installment",
    installment_notes: "حجز شهر / أقساط",
  },
  {
    id: "BET-2026-003",
    customer_name: "صالون لمسة حرير",
    customer_phone: "0788812345",
    city: "إربد",
    address: "إربد - شارع الجامعة",
    items_summary: "بروتين ماراكوجا 1 لتر + سشوار جاما توربو ستار",
    total_amount: 150.000,
    source: "Sales (حنان)",
    status: "shipped",
    order_date: "2026-09-07",
    payment_method: "cash_on_delivery",
    installment_notes: null,
  }
];

export default function OrdersPage() {
  const [orders, setOrders] = useState(INITIAL_ORDERS);
  const [activeTab, setActiveTab] = useState<string>("all");
  
  // WhatsApp Parser Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [rawText, setRawText] = useState("");
  
  // Waybill / Invoice Printable Modal
  const [waybillOrder, setWaybillOrder] = useState<typeof INITIAL_ORDERS[0] | null>(null);

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
5سيشتات من كل نوع 
95
الزرقا الجيل الشمالي بالقرب من مركز امن ياجوز 
Sales 
شهر
صابرين`;

  // Auto live preview of parsed text
  const preview = rawText ? parseWhatsAppOrderText(rawText) : null;

  const handleParseAndCreateOrder = () => {
    if (!rawText.trim() || !preview) return;

    const newOrder = {
      id: `BET-2026-00${orders.length + 1}`,
      customer_name: preview.customerName,
      customer_phone: preview.phone,
      city: preview.city,
      address: preview.address,
      items_summary: preview.itemsSummary,
      total_amount: preview.totalAmount,
      source: `${preview.source} (${preview.repName})`,
      status: preview.isReservation ? "draft" : "confirmed",
      order_date: new Date().toISOString().split('T')[0],
      payment_method: preview.paymentMethod,
      installment_notes: preview.installmentNotes || null,
    };

    setOrders([newOrder, ...orders]);
    setRawText("");
    setModalOpen(false);
    alert(`تم تحويل الرسالة بنجاح وإنشاء الطلب (#${newOrder.id}) دون إدخال يدوي!`);
  };

  const advanceOrderStatus = (orderId: string, currentStatus: string) => {
    const nextMap: Record<string, string> = {
      draft: "confirmed",
      confirmed: "processing",
      processing: "shipped",
      shipped: "delivered",
    };
    const nextStatus = nextMap[currentStatus];
    if (nextStatus) {
      setOrders(orders.map(o => o.id === orderId ? { ...o, status: nextStatus } : o));
    }
  };

  const markOrderReturned = (orderId: string) => {
    setOrders(orders.map(o => o.id === orderId ? { ...o, status: "returned" } : o));
  };

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
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-sm rounded-xl shadow-xs transition"
        >
          <Sparkles className="w-4 h-4" />
          <span>تحويل رسالة واتساب لطلب رسمي</span>
        </button>
      </div>

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
                        {order.status !== 'delivered' && order.status !== 'returned' && (
                          <button 
                            onClick={() => advanceOrderStatus(order.id, order.status)}
                            className="px-2.5 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 text-white font-semibold text-[11px] shadow-2xs transition"
                          >
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
                            className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition"
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
              <button
                type="button"
                onClick={handleParseAndCreateOrder}
                disabled={!rawText.trim()}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 rounded-xl font-bold text-xs shadow-md shadow-amber-500/20 transition flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>اعتماد وتحويل الطلب فوراً</span>
              </button>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-medium"
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
