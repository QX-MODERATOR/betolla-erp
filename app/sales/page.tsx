"use client";

import { useState } from "react";
import { 
  PhoneCall, 
  MessageSquare, 
  Calendar as CalendarIcon, 
  ShoppingCart, 
  CheckCircle2, 
  Clock, 
  Plus, 
  UserCheck, 
  TrendingUp, 
  DollarSign, 
  Sparkles, 
  ExternalLink,
  MapPin,
  Package,
  X,
  Target,
  Award,
  ChevronRight,
  Filter
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { generateGoogleCalendarUrl } from "@/lib/calendar";

// Sales Reps configurations & personal targets
const SALES_REPS = [
  { id: "hamza", name: "حمزة", target_jd: 6000.000, current_jd: 5420.000, commission_rate: 3.5, calls_target: 40, calls_done: 34, avatar: "ح" },
  { id: "rahma", name: "رحمه", target_jd: 4500.000, current_jd: 3180.000, commission_rate: 3.5, calls_target: 35, calls_done: 28, avatar: "ر" },
  { id: "sabreen", name: "صابرين", target_jd: 3500.000, current_jd: 1940.000, commission_rate: 3.0, calls_target: 30, calls_done: 22, avatar: "ص" },
  { id: "hanan", name: "حنان", target_jd: 3000.000, current_jd: 1420.000, commission_rate: 3.0, calls_target: 25, calls_done: 18, avatar: "ح" },
  { id: "sara", name: "سارة", target_jd: 2000.000, current_jd: 890.000, commission_rate: 2.5, calls_target: 20, calls_done: 12, avatar: "س" },
];

const REP_CUSTOMERS_SAMPLE: Record<string, any[]> = {
  hamza: [
    { id: "101", name: "صيدلية المقاصد", phone: "0770005000", city: "عمان", address: "الدوار السابع", purpose: "متابعة طلبية بكجات البلازما الشهرية", due: "11:00 ص", status: "today" },
    { id: "102", name: "دبي ماجيك - صالونات", phone: "0770010004", city: "المفرق", address: "وسط البلد", purpose: "عرض أسعار جملة بروتين ماراكوجا لتر", due: "12:30 م", status: "today" },
    { id: "103", name: "شمس - استخدام منزلي", phone: "0770017373", city: "جرش", address: "جرش", purpose: "متابعة نتائج شامبو هايدرو", due: "02:00 م", status: "today" },
  ],
  rahma: [
    { id: "201", name: "سدين غنايم", phone: "0793937385", city: "طبربور", address: "شارع الامير حسين عمارة 101", purpose: "تأكيد استلام 2 شامبو بلازما وتريتمنت", due: "10:30 ص", status: "today" },
    { id: "202", name: "بيان عادل", phone: "0770000088", city: "الطفيلة", address: "الطفيلة", purpose: "متابعة نتائج شامبو بلازما بعد أسبوعين", due: "01:15 م", status: "today" },
  ],
  sabreen: [
    { id: "301", name: "ربى صبيح", phone: "0799193505", city: "الزرقاء", address: "الجبل الشمالي قرب مركز أمن ياجوز", purpose: "حجز شهر: 3 بكجات مورفوزيس 250 + 2 ليف ان", due: "12:00 م", status: "today" },
  ],
  hanan: [
    { id: "401", name: "صالون لمسة حرير", phone: "0788812345", city: "إربد", address: "شارع الجامعة", purpose: "عرض سعر بروتين ماراكوجا 1000 مل + سشوار جاما", due: "01:00 م", status: "today" },
  ],
  sara: [
    { id: "501", name: "نور الهدى - بيتي", phone: "0798765432", city: "السلط", address: "السلط", purpose: "استفسار عن طقم عدسات بيتو فينوس", due: "11:45 ص", status: "today" },
  ]
};

// 31 Betolla Catalog for Quick Order Builder
const CATALOG_FOR_ORDER = [
  { sku: "PL-SET4-05", name: "بكج بلازما الرباعي المتكامل", price: 33.300, cat: "بلازما" },
  { sku: "PL-SHAMP-02", name: "شامبو بلازما للشعر 500 مل", price: 11.700, cat: "بلازما" },
  { sku: "PL-COND-04", name: "بلسم بلازما للشعر 500 مل", price: 11.700, cat: "بلازما" },
  { sku: "PL-SERUM-01", name: "سيروم بلازما المغذي", price: 12.600, cat: "بلازما" },
  { sku: "MOR-REST-SET-250", name: "بكج مورفوزيس ريستركتشر 250 مل", price: 20.700, cat: "مورفوزيس" },
  { sku: "MOR-LEAV-125", name: "ليف ان مورفوزيس ريستركتشر 125 مل", price: 18.000, cat: "مورفوزيس" },
  { sku: "MOR-REST-SET-1L", name: "بكج مورفوزيس ريستركتشر لتر", price: 45.000, cat: "مورفوزيس" },
  { sku: "MOR-REP-SET-1L", name: "بكج مورفوزيس ريبير لتر", price: 45.000, cat: "مورفوزيس" },
  { sku: "ARG-REP-SET-500", name: "بكج أرجان ريبير (شامبو + بلسم)", price: 28.800, cat: "أرجان" },
  { sku: "PROT-MARACUJA-1L", name: "بروتين ماراكوجا 1000 مل (لتر)", price: 105.000, cat: "بروتين" },
  { sku: "PROT-MARACUJA-250", name: "بروتين ماراكوجا 250 مل", price: 40.000, cat: "بروتين" },
  { sku: "LENS-VENUS-02", name: "عدسات بيتو فينوس اللاصقة", price: 22.500, cat: "عدسات" },
  { sku: "EL-GAMMA-01", name: "سشوار جاما توربو ستار 2500 واط", price: 45.000, cat: "أجهزة" },
  { sku: "EL-MAC-02", name: "مملس الشعر الاحترافي ماك", price: 35.000, cat: "أجهزة" },
];

export default function SalesAppPage() {
  const [activeRepId, setActiveRepId] = useState("rahma");
  const [activeCustomer, setActiveCustomer] = useState<any>(null);

  // Modals
  const [callLogModal, setCallLogModal] = useState(false);
  const [orderModal, setOrderModal] = useState(false);

  // Call form
  const [outcome, setOutcome] = useState("answered");
  const [notes, setNotes] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [nextTime, setNextTime] = useState("11:30");
  const [generatedCalUrl, setGeneratedCalUrl] = useState<string | null>(null);

  // Quick Order Builder State
  const [orderCart, setOrderCart] = useState<Record<string, number>>({});
  const [orderPaymentMethod, setOrderPaymentMethod] = useState("cash_on_delivery");
  const [orderInstallmentTerm, setOrderInstallmentTerm] = useState("حجز شهر");

  const rep = SALES_REPS.find(r => r.id === activeRepId) || SALES_REPS[0];
  const repCustomers = REP_CUSTOMERS_SAMPLE[activeRepId] || [];

  // Commission & Target calculations
  const targetProgress = Math.min(Math.round((rep.current_jd / rep.target_jd) * 100), 100);
  const estimatedCommission = (rep.current_jd * (rep.commission_rate / 100));

  // Cart Calculation
  const cartTotal = Object.entries(orderCart).reduce((acc, [sku, qty]) => {
    const item = CATALOG_FOR_ORDER.find(p => p.sku === sku);
    return acc + (item ? item.price * qty : 0);
  }, 0);

  const handleUpdateCart = (sku: string, delta: number) => {
    setOrderCart(prev => {
      const current = prev[sku] || 0;
      const next = current + delta;
      if (next <= 0) {
        const copy = { ...prev };
        delete copy[sku];
        return copy;
      }
      return { ...prev, [sku]: next };
    });
  };

  const handleSaveCallOutcome = () => {
    if (!activeCustomer) return;

    let calUrl = null;
    if (nextDate) {
      calUrl = generateGoogleCalendarUrl({
        customerName: activeCustomer.name,
        customerPhone: activeCustomer.phone,
        startDate: nextDate,
        startTime: nextTime,
        notes: `${outcome} - ${notes}`,
        address: activeCustomer.address,
        repName: rep.name,
      });
      setGeneratedCalUrl(calUrl);
    } else {
      setCallLogModal(false);
      alert(`تم توثيق الاتصال بنجاح للعميل (${activeCustomer.name}).`);
    }
  };

  const handleSubmitFastOrder = () => {
    if (cartTotal <= 0) {
      alert("يرجى اختيار منتج واحد على الأقل لإنشاء الطلبية.");
      return;
    }

    const orderId = `BET-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    setOrderModal(false);
    setOrderCart({});
    alert(`🎉 مبارك يا ${rep.name}! تم إنشاء الطلبية بنجاح برقم (${orderId}) بمبلغ (${formatCurrency(cartTotal)}).`);
  };

  return (
    <div className="space-y-5 pb-12 max-w-4xl mx-auto">
      {/* Top Mobile Rep Identity & Switcher */}
      <div className="bg-gradient-to-r from-stone-900 via-stone-850 to-stone-900 rounded-3xl p-5 sm:p-6 text-white border border-stone-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-300 text-stone-950 font-black text-xl flex items-center justify-center shadow-md shadow-amber-500/20">
              {rep.avatar}
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold">
                <Sparkles className="w-3 h-3" />
                <span>تطبيق مبيعات بيتولا الميداني (Android & Web)</span>
              </div>
              <h2 className="text-xl font-bold mt-0.5">مرحباً، {rep.name}! 👋</h2>
            </div>
          </div>

          {/* Quick Rep Switcher */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <span className="text-xs text-stone-400">تبديل المندوب:</span>
            <select
              value={activeRepId}
              onChange={(e) => setActiveRepId(e.target.value)}
              className="px-3 py-1.5 bg-stone-800 border border-stone-700 text-amber-400 rounded-xl text-xs font-bold focus:outline-none focus:border-amber-500"
            >
              {SALES_REPS.map((r) => (
                <option key={r.id} value={r.id}>
                  المندوب {r.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Rep Target & Monthly Performance Grid */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 pt-2 border-t border-stone-800/80">
          <div className="bg-stone-800/50 p-3 rounded-2xl border border-stone-700/50">
            <p className="text-[10px] text-stone-400 font-medium">مبيعاتي هذا الشهر</p>
            <p className="text-base sm:text-lg font-black text-amber-400 mt-0.5 font-mono">
              {formatCurrency(rep.current_jd)}
            </p>
            <p className="text-[10px] text-stone-400 mt-0.5">من الهدف: {formatCurrency(rep.target_jd)}</p>
          </div>

          <div className="bg-stone-800/50 p-3 rounded-2xl border border-stone-700/50">
            <p className="text-[10px] text-stone-400 font-medium">نسبة تحقيق الهدف</p>
            <p className="text-base sm:text-lg font-black text-emerald-400 mt-0.5 font-mono">
              {targetProgress}%
            </p>
            <div className="w-full bg-stone-700 h-1 rounded-full mt-1 overflow-hidden">
              <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${targetProgress}%` }} />
            </div>
          </div>

          <div className="bg-stone-800/50 p-3 rounded-2xl border border-stone-700/50">
            <p className="text-[10px] text-stone-400 font-medium">عمولتي المقدرة (كاش)</p>
            <p className="text-base sm:text-lg font-black text-white mt-0.5 font-mono">
              {formatCurrency(estimatedCommission)}
            </p>
            <p className="text-[10px] text-amber-400 font-bold mt-0.5">{rep.commission_rate}% عمولة بيع</p>
          </div>
        </div>
      </div>

      {/* Main Calling Queue: My Today's Calls */}
      <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div>
            <h3 className="font-bold text-base text-stone-900 flex items-center gap-2">
              <PhoneCall className="w-4 h-4 text-amber-500" />
              <span>قائمة اتصالاتي ومتابعاتي اليومية ({repCustomers.length})</span>
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              الأرقام المسندة إليك والمجدولة للاتصال والمتابعة اليوم
            </p>
          </div>

          <div className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{rep.calls_done} من {rep.calls_target} تم إنجازها</span>
          </div>
        </div>

        {/* Customer Call Cards */}
        <div className="space-y-3">
          {repCustomers.map((cust) => {
            const calUrl = generateGoogleCalendarUrl({
              customerName: cust.name,
              customerPhone: cust.phone,
              startDate: new Date().toISOString().split('T')[0],
              startTime: cust.due,
              notes: cust.purpose,
              address: cust.address,
              repName: rep.name,
            });

            return (
              <div 
                key={cust.id} 
                className="p-4 rounded-2xl border border-stone-200 hover:border-amber-400/80 bg-stone-50/50 hover:bg-amber-50/20 transition-all space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-stone-900">{cust.name}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded-md bg-white border border-stone-200 font-semibold text-stone-700">
                        {cust.city}
                      </span>
                    </div>
                    <p className="font-mono text-xs text-stone-500 font-bold" dir="ltr">{cust.phone}</p>
                    <p className="text-xs text-stone-600 mt-1">📌 {cust.purpose}</p>
                    <p className="text-[11px] text-stone-400 truncate max-w-sm">📍 {cust.address}</p>
                  </div>

                  <div className="text-left">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                      <Clock className="w-3 h-3" />
                      <span>{cust.due}</span>
                    </span>
                  </div>
                </div>

                {/* 1-Tap Action Row (Mobile Touch Optimized: 2 cols on mobile, 4 on desktop) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-stone-200/60">
                  {/* Phone Call */}
                  <a
                    href={`tel:${cust.phone}`}
                    className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition"
                  >
                    <PhoneCall className="w-3.5 h-3.5" />
                    <span>اتصال</span>
                  </a>

                  {/* WhatsApp */}
                  <a
                    href={`https://wa.me/${cust.phone.replace(/^0/, '962')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>واتساب</span>
                  </a>

                  {/* Log Call */}
                  <button
                    onClick={() => {
                      setActiveCustomer(cust);
                      setGeneratedCalUrl(null);
                      setCallLogModal(true);
                    }}
                    className="py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-xs transition"
                  >
                    <span>توثيق النتيجة</span>
                  </button>

                  {/* Fast Order */}
                  <button
                    onClick={() => {
                      setActiveCustomer(cust);
                      setOrderCart({});
                      setOrderModal(true);
                    }}
                    className="py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-xs transition"
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                    <span>إنشاء طلب</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Fast Mobile Order Builder Modal */}
      {orderModal && activeCustomer && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-stone-200 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-2 border-b border-stone-200">
              <div>
                <h3 className="font-bold text-base text-stone-900 flex items-center gap-1.5">
                  <ShoppingCart className="w-4 h-4 text-amber-500" />
                  <span>إنشاء طلبية سريعة أثناء المكالمة</span>
                </h3>
                <p className="text-xs text-stone-500">
                  العميل: {activeCustomer.name} ({activeCustomer.phone}) • المندوب: {rep.name}
                </p>
              </div>
              <button 
                onClick={() => setOrderModal(false)}
                className="p-1.5 rounded-lg bg-stone-100 text-stone-500"
              >
                ✕
              </button>
            </div>

            {/* Catalog Items Selector */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-stone-700 block">اختر الأصناف والكميات بالضغط:</span>
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {CATALOG_FOR_ORDER.map((product) => {
                  const qty = orderCart[product.sku] || 0;

                  return (
                    <div 
                      key={product.sku}
                      className={`p-2.5 rounded-xl border transition flex items-center justify-between text-xs ${
                        qty > 0 ? "bg-amber-50 border-amber-400" : "bg-stone-50 border-stone-200"
                      }`}
                    >
                      <div>
                        <p className="font-bold text-stone-900">{product.name}</p>
                        <p className="font-mono text-[11px] text-amber-700 font-semibold">{formatCurrency(product.price)}</p>
                      </div>

                      {/* Quantity Controls */}
                      <div className="flex items-center gap-2">
                        {qty > 0 && (
                          <button
                            type="button"
                            onClick={() => handleUpdateCart(product.sku, -1)}
                            className="w-7 h-7 rounded-lg bg-stone-200 hover:bg-stone-300 font-bold flex items-center justify-center text-sm"
                          >
                            -
                          </button>
                        )}
                        {qty > 0 && (
                          <span className="font-mono font-bold text-sm min-w-5 text-center">{qty}</span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleUpdateCart(product.sku, 1)}
                          className="w-7 h-7 rounded-lg bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold flex items-center justify-center text-sm shadow-2xs"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Payment & Installment Mode */}
            <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="font-bold text-stone-700">طريقة السداد:</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setOrderPaymentMethod("cash_on_delivery")}
                    className={`px-3 py-1 rounded-lg font-bold border transition ${
                      orderPaymentMethod === "cash_on_delivery" ? "bg-stone-900 text-white" : "bg-white text-stone-700"
                    }`}
                  >
                    دفع عند الاستلام
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderPaymentMethod("installment")}
                    className={`px-3 py-1 rounded-lg font-bold border transition ${
                      orderPaymentMethod === "installment" ? "bg-purple-700 text-white" : "bg-white text-stone-700"
                    }`}
                  >
                    حجز شهر (أقساط)
                  </button>
                </div>
              </div>
            </div>

            {/* Total JD Banner */}
            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-300 flex items-center justify-between">
              <div>
                <p className="text-xs text-amber-900 font-semibold">المجموع النهائي للطلبية:</p>
                <p className="text-xs text-amber-700">توصيل مجاني لعملاء الصالونات والمنازل</p>
              </div>
              <p className="text-xl font-black font-mono text-amber-950">
                {formatCurrency(cartTotal)}
              </p>
            </div>

            {/* Submit */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleSubmitFastOrder}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs rounded-xl shadow-xs transition"
              >
                تأكيد الطلبية وإرسالها للمستودع
              </button>
              <button
                type="button"
                onClick={() => setOrderModal(false)}
                className="px-4 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-medium"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fast Call Outcome & Calendar Modal */}
      {callLogModal && activeCustomer && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-stone-200 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-base text-stone-900">توثيق نتيجة الاتصال والمتابعة</h3>
                <p className="text-xs text-stone-500">{activeCustomer.name} ({activeCustomer.phone})</p>
              </div>
              <button 
                onClick={() => setCallLogModal(false)}
                className="p-1.5 rounded-lg bg-stone-100 text-stone-500"
              >
                ✕
              </button>
            </div>

            {/* Outcome Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-700 block">نتيجة المكالمة:</label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { id: "answered", label: "تم الرد بنجاح" },
                  { id: "no_answer", label: "لم يتم الرد" },
                  { id: "whatsapp_sent", label: "تم إرسال واتساب" },
                  { id: "order_placed", label: "تم تثبيت طلبية" },
                  { id: "callback_requested", label: "طلب موعد آخر" },
                  { id: "not_interested", label: "غير مهتم حالياً" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setOutcome(item.id)}
                    className={`p-2 rounded-xl text-right font-medium border transition ${
                      outcome === item.id
                        ? "bg-amber-50 border-amber-500 text-amber-900 font-bold"
                        : "bg-stone-50 border-stone-200 text-stone-700"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-700 block">ملاحظات سريعة:</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="أدخل ملخص الاتفاق مع العميل..."
                className="w-full p-2.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Next Date & Google Calendar */}
            <div className="p-3 bg-amber-50/70 rounded-2xl border border-amber-200 space-y-2">
              <label className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                <CalendarIcon className="w-3.5 h-3.5 text-amber-600" />
                <span>تاريخ المتابعة القادم (تذكير Google Calendar):</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={nextDate}
                  onChange={(e) => setNextDate(e.target.value)}
                  className="w-full p-2 text-xs bg-white border border-amber-300 rounded-xl font-mono"
                />
                <input
                  type="time"
                  value={nextTime}
                  onChange={(e) => setNextTime(e.target.value)}
                  className="w-full p-2 text-xs bg-white border border-amber-300 rounded-xl font-mono"
                />
              </div>
            </div>

            {/* Calendar Link Button if generated */}
            {generatedCalUrl && (
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 space-y-2">
                <p className="text-xs text-blue-900 font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-blue-600" />
                  <span>اضغط أدناه لفتح الموعد في تطبيق Google Calendar:</span>
                </p>
                <a
                  href={generatedCalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition"
                >
                  <span>فتح في تقويم Google 📅</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleSaveCallOutcome}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs rounded-xl shadow-xs transition"
              >
                {generatedCalUrl ? "إغلاق والعودة" : "حفظ الموعد وتوليد التقويم"}
              </button>
              <button
                type="button"
                onClick={() => setCallLogModal(false)}
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
