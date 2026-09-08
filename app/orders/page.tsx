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
  ChevronDown
} from "lucide-react";
import { formatCurrency, ORDER_STATUS_LABELS } from "@/lib/utils";

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
  },
  {
    id: "BET-2026-002",
    customer_name: "ربى صبيح",
    customer_phone: "0799193505",
    city: "الزرقاء",
    address: "الزرقا الجيل الشمالي بالقرب من مركز امن ياجوز",
    items_summary: "3 بكجات مورفوزيس 250 + 2 ليف أن + 5 سيشتات",
    total_amount: 95.000,
    source: "مبيعات مباشرة (صابرين)",
    status: "processing",
    order_date: "2026-09-10",
    payment_method: "installment",
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
  }
];

export default function OrdersPage() {
  const [orders, setOrders] = useState(INITIAL_ORDERS);
  const [modalOpen, setModalOpen] = useState(false);
  const [rawText, setRawText] = useState("");

  // Sample templates for one-click testing
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

  const handleParseAndCreateOrder = () => {
    if (!rawText.trim()) return;

    // Intelligent auto-parsing of Arabic WhatsApp template
    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
    const phoneMatch = rawText.match(/07\d{8}/);
    const priceMatch = rawText.match(/(\d+)\s*(د|JD|دينار)?/);
    
    const newOrder = {
      id: `BET-2026-00${orders.length + 1}`,
      customer_name: lines[1] || "عميل واتساب",
      customer_phone: phoneMatch ? phoneMatch[0] : "07xxxxxxxx",
      city: rawText.includes("الزرقا") ? "الزرقاء" : rawText.includes("طبربور") ? "طبربور" : "عمان",
      address: lines.find(l => l.includes("شارع") || l.includes("عمارة") || l.includes("قرب") || l.includes("الجبل")) || "العنوان من الواتساب",
      items_summary: lines.filter(l => l.includes("شامبو") || l.includes("مورفوزيس") || l.includes("بكج") || l.includes("تريتمنت") || l.includes("ليف")).join(" + ") || "مستحضرات عناية",
      total_amount: priceMatch ? parseFloat(priceMatch[1]) : 30.000,
      source: "واتساب آلي (n8n Automation)",
      status: "draft",
      order_date: new Date().toISOString().split('T')[0],
      payment_method: rawText.includes("شهر") ? "installment" : "cash_on_delivery",
    };

    setOrders([newOrder, ...orders]);
    setRawText("");
    setModalOpen(false);
    alert(`تم تحويل رسالة الواتساب إلى طلب رسمي بنجاح (#${newOrder.id}) دون إدخال يدوي!`);
  };

  return (
    <div className="space-y-6">
      {/* Header Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5">
            <ShoppingCart className="w-6 h-6 text-amber-500" />
            <span>إدارة وتأكيد الطلبات (Orders Management)</span>
          </h2>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            تحويل طلبيات الواتساب ورسائل التسويق إلى طلبات رسمية مؤكدة آلياً
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

      {/* Quick Order Status Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "طلبات جديدة (مسودات)", count: orders.filter(o => o.status === 'draft').length, color: "border-amber-400 bg-amber-50/60 text-amber-900" },
          { label: "تم التأكيد", count: orders.filter(o => o.status === 'confirmed').length, color: "border-blue-400 bg-blue-50/60 text-blue-900" },
          { label: "قيد التجهيز والتوصيل", count: orders.filter(o => o.status === 'processing' || o.status === 'shipped').length, color: "border-purple-400 bg-purple-50/60 text-purple-900" },
          { label: "تم التسليم", count: orders.filter(o => o.status === 'delivered').length, color: "border-emerald-400 bg-emerald-50/60 text-emerald-900" },
        ].map((stat, i) => (
          <div key={i} className={`p-4 rounded-2xl border ${stat.color} shadow-2xs`}>
            <p className="text-xs font-semibold">{stat.label}</p>
            <p className="text-2xl font-black mt-1">{stat.count}</p>
          </div>
        ))}
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-stone-100 flex items-center justify-between">
          <h3 className="font-bold text-sm text-stone-900">سجل الطلبيات والمبيعات النشطة</h3>
          <span className="text-xs text-stone-500">إجمالي {orders.length} طلب</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-stone-50 text-stone-500 font-bold border-b border-stone-200">
              <tr>
                <th className="py-3 px-4">رقم الطلب</th>
                <th className="py-3 px-4">العميل</th>
                <th className="py-3 px-4">المنتجات المطلوبة</th>
                <th className="py-3 px-4">العنوان والمدينة</th>
                <th className="py-3 px-4">المبلغ الإجمالي</th>
                <th className="py-3 px-4">حالة الطلب</th>
                <th className="py-3 px-4 text-center">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {orders.map((order) => {
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
                    <td className="py-3.5 px-4 font-bold text-stone-900 font-mono text-sm">
                      {formatCurrency(order.total_amount)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button 
                        onClick={() => {
                          const nextStatus = order.status === 'draft' ? 'confirmed' : order.status === 'confirmed' ? 'processing' : 'delivered';
                          setOrders(orders.map(o => o.id === order.id ? { ...o, status: nextStatus } : o));
                        }}
                        className="px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white font-semibold text-[11px] shadow-2xs transition"
                      >
                        {order.status === 'draft' ? 'تأكيد الطلب' : order.status === 'confirmed' ? 'بدء التجهيز' : 'تحديث'}
                      </button>
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
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-stone-200 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-lg text-stone-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  <span>محرك الأتمتة: تحويل رسائل الواتساب إلى طلبات</span>
                </h3>
                <p className="text-xs text-stone-500 mt-1">
                  قم بلصق نص الطلب المستلم عبر الواتساب (من التسويق أو المبيعات) ليتم تفكيكه آلياً
                </p>
              </div>
              <button 
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg bg-stone-100 text-stone-500"
              >
                ✕
              </button>
            </div>

            {/* Quick Test Samples */}
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-stone-600 block">نماذج سريعة للتجربة:</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setRawText(sample1)}
                  className="px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium transition"
                >
                  نموذج طلب التسويق (سدين غنايم)
                </button>
                <button
                  type="button"
                  onClick={() => setRawText(sample2)}
                  className="px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium transition"
                >
                  نموذج طلب المبيعات (ربى صبيح)
                </button>
              </div>
            </div>

            {/* Textarea */}
            <div className="space-y-1">
              <textarea
                rows={7}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="الصق نص الرسالة من الواتساب هنا..."
                className="w-full p-3 text-xs bg-stone-50 border border-stone-200 rounded-2xl focus:outline-none focus:border-amber-500 font-mono leading-relaxed"
              />
            </div>

            <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200 text-xs text-amber-900">
              ⚡ <strong>بدون طباعة أوراق:</strong> يقوم المحرك الآلي (أو n8n webhook) باستخراج اسم العميل، رقم الهاتف، العنوان، المنتجات، والسعر فورا وحفظها في قاعدة البيانات.
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleParseAndCreateOrder}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-stone-950 rounded-xl font-bold text-xs shadow-md shadow-amber-500/20 transition flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>تحويل وإنشاء الطلب آلياً</span>
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
    </div>
  );
}
