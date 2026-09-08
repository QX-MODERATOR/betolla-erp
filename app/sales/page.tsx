"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { 
  PhoneCall, 
  MessageSquare, 
  Calendar as CalendarIcon, 
  ShoppingCart, 
  CheckCircle2, 
  Clock, 
  Plus, 
  Sparkles, 
  ExternalLink,
  MapPin,
  X,
  ShieldAlert,
  FileText,
  UserPlus,
  Send,
  Copy,
  ChevronDown
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { generateGoogleCalendarUrl } from "@/lib/calendar";
import { getCurrentUser } from "@/lib/client-api";

// Sales Reps configurations & personal targets
const SALES_REPS = [
  { id: "rahma", name: "رحمة", target_jd: 4500.000, current_jd: 3180.000, commission_rate: 3.5, calls_target: 35, calls_done: 28, avatar: "ر" },
  { id: "hamza", name: "حمزة", target_jd: 6000.000, current_jd: 5420.000, commission_rate: 3.5, calls_target: 40, calls_done: 34, avatar: "ح" },
  { id: "sabreen", name: "صابرين", target_jd: 3500.000, current_jd: 1940.000, commission_rate: 3.0, calls_target: 30, calls_done: 22, avatar: "ص" },
  { id: "hanan", name: "حنان", target_jd: 3000.000, current_jd: 1420.000, commission_rate: 3.0, calls_target: 25, calls_done: 18, avatar: "ح" },
  { id: "sara", name: "سارة", target_jd: 2000.000, current_jd: 890.000, commission_rate: 2.5, calls_target: 20, calls_done: 12, avatar: "س" },
];

// Initial assigned customers with rich lead context
const INITIAL_CUSTOMERS: Record<string, any[]> = {
  rahma: [
    { 
      id: "201", 
      name: "سدين غنايم", 
      phone: "0793937385", 
      city: "طبربور", 
      address: "شارع الامير حسين عمارة 101", 
      purpose: "متابعة نتائج شامبو البلازما وتأكيد بكج التريتمنت", 
      due: "10:30 ص", 
      status: "today",
      lastNotes: "أبدت إعجابها الشديد بالشامبو وترغب بإضافة بلسم وسيروم",
      nextDate: "2026-09-10",
      nextTime: "11:00",
      callsCount: 3
    },
    { 
      id: "202", 
      name: "بيان عادل", 
      phone: "0770000088", 
      city: "الطفيلة", 
      address: "حي المنشية قرب مسجد الأبرار", 
      purpose: "متابعة نتائج شامبو بلازما بعد أسبوعين وعرض بكج مورفوزيس ريبير", 
      due: "01:15 م", 
      status: "today",
      lastNotes: "تنتظر استلام الراتب يوم 15 في الشهر لتثبيت الطلب",
      nextDate: "2026-09-15",
      nextTime: "14:00",
      callsCount: 1
    },
    { 
      id: "203", 
      name: "صالون لورا بيوتي", 
      phone: "0791234567", 
      city: "عمان", 
      address: "الصويفية - مجمع البركة التجاري الطابق الثاني", 
      purpose: "عرض أسعار جملة بروتين ماراكوجا 1 لتر وسشوار جاما", 
      due: "03:00 م", 
      status: "today",
      lastNotes: "مهتمة بطلب تجريبي، طلبت إرسال تفاصيل الفاتورة عبر واتساب",
      nextDate: "2026-09-09",
      nextTime: "10:30",
      callsCount: 2
    },
    { 
      id: "204", 
      name: "روان الخطيب", 
      phone: "0789876543", 
      city: "إربد", 
      address: "حي القصيلة قرب دوار القبة", 
      purpose: "استفسار عن طقم عدسات بيتو فينوس وعلاج تساقط الشعر", 
      due: "04:30 م", 
      status: "today",
      lastNotes: "",
      nextDate: "",
      nextTime: "",
      callsCount: 0
    },
  ],
  hamza: [
    { id: "101", name: "صيدلية المقاصد", phone: "0770005000", city: "عمان", address: "الدوار السابع", purpose: "متابعة طلبية بكجات البلازما الشهرية", due: "11:00 ص", status: "today", lastNotes: "", nextDate: "", nextTime: "", callsCount: 4 },
  ],
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

const JORDAN_CITIES = [
  "عمان", "الزرقاء", "إربد", "العقبة", "السلط", "المفرق", "مادبا", "جرش", "عجلون", "الكرك", "الطفيلة", "معان"
];

function SalesAppContent() {
  const searchParams = useSearchParams();
  const isRestrictedNotice = searchParams.get("restricted") === "true";

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeRepId, setActiveRepId] = useState("rahma");
  const [customers, setCustomers] = useState<Record<string, any[]>>(INITIAL_CUSTOMERS);

  // Active customer for modals
  const [activeCustomer, setActiveCustomer] = useState<any>(null);

  // Modals
  const [callLogModal, setCallLogModal] = useState(false);
  const [orderModal, setOrderModal] = useState(false);
  const [newLeadModal, setNewLeadModal] = useState(false);

  // Call form state
  const [outcome, setOutcome] = useState("answered");
  const [notes, setNotes] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [nextTime, setNextTime] = useState("11:30");
  const [generatedCalUrl, setGeneratedCalUrl] = useState<string | null>(null);

  // Order form state
  const [orderCustomerName, setOrderCustomerName] = useState("");
  const [orderCustomerPhone, setOrderCustomerPhone] = useState("");
  const [orderCity, setOrderCity] = useState("عمان");
  const [orderAddress, setOrderAddress] = useState("");
  const [orderDeliveryNotes, setOrderDeliveryNotes] = useState("");
  const [orderCart, setOrderCart] = useState<Record<string, number>>({});
  const [orderPaymentMethod, setOrderPaymentMethod] = useState("cash_on_delivery");

  // New Lead form state
  const [leadName, setLeadName] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadCity, setLeadCity] = useState("عمان");
  const [leadAddress, setLeadAddress] = useState("");
  const [leadPurpose, setLeadPurpose] = useState("");

  useEffect(() => {
    const user = getCurrentUser();
    setCurrentUser(user);
    if (user?.role === "sales_rep" && user?.repId) {
      setActiveRepId(user.repId);
    }
  }, []);

  const isSalesRep = currentUser?.role === "sales_rep";
  const rep = SALES_REPS.find(r => r.id === activeRepId) || SALES_REPS[0];
  const repCustomers = customers[activeRepId] || [];

  // Commission & Target calculations
  const targetProgress = Math.min(Math.round((rep.current_jd / rep.target_jd) * 100), 100);
  const estimatedCommission = (rep.current_jd * (rep.commission_rate / 100));

  // Cart Total Calculation
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

  // Open Call Log Modal
  const handleOpenCallLog = (cust: any) => {
    setActiveCustomer(cust);
    setOutcome("answered");
    setNotes(cust.lastNotes || "");
    setNextDate(cust.nextDate || new Date().toISOString().split("T")[0]);
    setNextTime(cust.nextTime || "12:00");
    setGeneratedCalUrl(null);
    setCallLogModal(true);
  };

  // Save Call Outcome
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
    }

    // Update customer in local state
    setCustomers(prev => {
      const list = [...(prev[activeRepId] || [])];
      const idx = list.findIndex(c => c.id === activeCustomer.id);
      if (idx !== -1) {
        list[idx] = {
          ...list[idx],
          lastNotes: notes,
          nextDate: nextDate,
          nextTime: nextTime,
          callsCount: (list[idx].callsCount || 0) + 1,
        };
      }
      return { ...prev, [activeRepId]: list };
    });

    if (!nextDate) {
      setCallLogModal(false);
      alert(`تم توثيق ملاحظات الاتصال بنجاح للعميل (${activeCustomer.name}).`);
    }
  };

  // Open Order Modal
  const handleOpenOrderModal = (cust: any) => {
    setActiveCustomer(cust);
    setOrderCustomerName(cust.name);
    setOrderCustomerPhone(cust.phone);
    setOrderCity(cust.city || "عمان");
    setOrderAddress(cust.address || "");
    setOrderDeliveryNotes("");
    setOrderCart({});
    setOrderModal(true);
  };

  // Submit Order
  const handleSubmitFastOrder = () => {
    if (cartTotal <= 0) {
      alert("يرجى اختيار منتج واحد على الأقل لإنشاء الطلبية.");
      return;
    }
    if (!orderCustomerName.trim() || !orderCustomerPhone.trim()) {
      alert("يرجى التأكد من اسم العميل ورقم هاتفه.");
      return;
    }

    const orderId = `BET-2026-${Math.floor(1000 + Math.random() * 9000)}`;

    // Generate WhatsApp Order Confirmation Link
    const selectedItemsText = Object.entries(orderCart).map(([sku, qty]) => {
      const item = CATALOG_FOR_ORDER.find(p => p.sku === sku);
      return `- ${item?.name} (${qty} قطعة) = ${formatCurrency((item?.price || 0) * qty)}`;
    }).join("\n");

    const whatsappMessage = `أهلاً بك عميلنا العزيز ${orderCustomerName} 🌸
تم تثبيت طلبك بنجاح من بيتولا كوزمتكس برقم (${orderId}):

📦 المنتجات:
${selectedItemsText}

💰 المجموع: ${formatCurrency(cartTotal)}
🚚 التوصيل: مجاني
📍 العنوان: ${orderCity} - ${orderAddress}
طريقة الدفع: ${orderPaymentMethod === "cash_on_delivery" ? "دفع عند الاستلام" : "حجز شهر / كليك"}

المندوبة المسؤولة: ${rep.name}
شكراً لثقتكم بشركة بيتولا لمستحضرات التجميل!`;

    const whatsappUrl = `https://wa.me/${orderCustomerPhone.replace(/^0/, "962")}?text=${encodeURIComponent(whatsappMessage)}`;

    setOrderModal(false);
    setOrderCart({});

    // Confirmation with direct WhatsApp action
    if (confirm(`🎉 تم إنشاء الطلبية بنجاح برقم (${orderId}) بمبلغ (${formatCurrency(cartTotal)})!\n\nهل ترغبين بإرسال تفاصيل الفاتورة وتأكيد الطلب للعميل مباشرة عبر واتساب؟`)) {
      window.open(whatsappUrl, "_blank");
    }
  };

  // Add New Lead
  const handleAddNewLead = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadName.trim() || !leadPhone.trim()) {
      alert("يرجى إدخال اسم العميل ورقم الهاتف.");
      return;
    }

    const newCust = {
      id: `lead-${Date.now()}`,
      name: leadName.trim(),
      phone: leadPhone.trim(),
      city: leadCity,
      address: leadAddress.trim() || "غير محدد",
      purpose: leadPurpose.trim() || "ليد جديد بحاجة إلى تواصل ومتابعة",
      due: "اليوم",
      status: "today",
      lastNotes: "تم إضافة الرقم حديثاً من قبل المندوبة",
      nextDate: "",
      nextTime: "",
      callsCount: 0,
    };

    setCustomers(prev => ({
      ...prev,
      [activeRepId]: [newCust, ...(prev[activeRepId] || [])],
    }));

    setNewLeadModal(false);
    setLeadName("");
    setLeadPhone("");
    setLeadAddress("");
    setLeadPurpose("");
    alert(`تمت إضافة العميل (${newCust.name}) إلى قائمة اتصالاتك بنجاح!`);
  };

  return (
    <div className="space-y-5 pb-12 max-w-4xl mx-auto">
      
      {/* RBAC Security Restriction Notice Banner */}
      {isRestrictedNotice && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold text-amber-300 text-sm">تنبيه الصلاحيات (Role-Based Access Control)</p>
            <p className="text-stone-300 mt-1 leading-relaxed">
              حسابك مسجل بصلاحية <strong>مندوبة مبيعات (Sales Rep)</strong>. تم حصر صلاحياتك في مساحة عمل إدارة المبيعات والمكالمات والطلبات، وتم تقييد الوصول للأقسام المالية والتقارير التنفيذية.
            </p>
          </div>
        </div>
      )}

      {/* Top Identity & Personal Target Card */}
      <div className="bg-gradient-to-r from-stone-900 via-stone-850 to-stone-900 rounded-3xl p-5 sm:p-6 text-white border border-stone-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-300 text-stone-950 font-black text-xl flex items-center justify-center shadow-md shadow-amber-500/20">
              {rep.avatar}
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold">
                <Sparkles className="w-3 h-3" />
                <span>بوابة المبيعات المعتمدة (Sales Representative Portal)</span>
              </div>
              <h2 className="text-xl font-bold mt-0.5">مرحباً، {rep.name}! 👋</h2>
            </div>
          </div>

          {/* Rep Switcher (Visible only for Admin, locked for Sales Rep) */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {isSalesRep ? (
              <span className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl text-xs font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>حساب مندوبة المبيعات</span>
              </span>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-stone-400">معاينة المندوب:</span>
                <select
                  value={activeRepId}
                  onChange={(e) => setActiveRepId(e.target.value)}
                  className="px-3 py-1.5 bg-stone-800 border border-stone-700 text-amber-400 rounded-xl text-xs font-bold focus:outline-none focus:border-amber-500"
                >
                  {SALES_REPS.map((r) => (
                    <option key={r.id} value={r.id}>
                      المندوبة {r.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
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

      {/* Main Calling Queue Section */}
      <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100">
          <div>
            <h3 className="font-bold text-base text-stone-900 flex items-center gap-2">
              <PhoneCall className="w-4 h-4 text-amber-500" />
              <span>قائمة أرقام الهواتف والعملاء للاتصال اليوم ({repCustomers.length})</span>
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              الأرقام المسندة إليك للمتابعة، تسجيل الملاحظات، وتثبيت الطلبات
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setNewLeadModal(true)}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>إضافة رقم جديد للاتصال</span>
            </button>
            <div className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-xl border border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{rep.calls_done} مكالمة منجزة</span>
            </div>
          </div>
        </div>

        {/* Customer Call Cards */}
        <div className="space-y-3">
          {repCustomers.map((cust) => (
            <div 
              key={cust.id} 
              className="p-4 rounded-2xl border border-stone-200 hover:border-amber-400/80 bg-stone-50/60 hover:bg-amber-50/20 transition-all space-y-3"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-stone-900">{cust.name}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-white border border-stone-200 font-semibold text-stone-700">
                      {cust.city}
                    </span>
                    {cust.callsCount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-medium">
                        تم الاتصال {cust.callsCount} مرات
                      </span>
                    )}
                  </div>

                  {/* Phone number display */}
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-amber-900 bg-amber-100/70 px-2 py-0.5 rounded-md font-bold" dir="ltr">
                      {cust.phone}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(cust.phone);
                        alert(`تم نسخ الرقم (${cust.phone}) إلى الحافظة.`);
                      }}
                      title="نسخ الرقم"
                      className="text-stone-400 hover:text-stone-700 transition"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <p className="text-xs text-stone-600">📌 {cust.purpose}</p>
                  <p className="text-[11px] text-stone-400 truncate max-w-sm">📍 {cust.address}</p>

                  {/* Display recorded notes directly on the card if present */}
                  {cust.lastNotes && (
                    <div className="p-2 rounded-xl bg-amber-50/80 border border-amber-200/80 text-[11px] text-amber-900 mt-2">
                      <span className="font-bold">آخر الملاحظات المسجلة: </span>
                      <span>{cust.lastNotes}</span>
                    </div>
                  )}

                  {cust.nextDate && (
                    <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
                      <CalendarIcon className="w-3 h-3 text-blue-600" />
                      <span>موعد الاتصال القادم: {cust.nextDate} الساعة {cust.nextTime || "12:00"}</span>
                    </div>
                  )}
                </div>

                <div className="text-left">
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                    <Clock className="w-3 h-3" />
                    <span>{cust.due}</span>
                  </span>
                </div>
              </div>

              {/* 1-Tap Action Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-stone-200/60">
                {/* Phone Call */}
                <a
                  href={`tel:${cust.phone}`}
                  className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  <span>اتصال هاتفي</span>
                </a>

                {/* WhatsApp */}
                <a
                  href={`https://wa.me/${cust.phone.replace(/^0/, '962')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>محادثة واتساب</span>
                </a>

                {/* Log Call & Next Call Date */}
                <button
                  onClick={() => handleOpenCallLog(cust)}
                  className="py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-xs transition cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  <span>تسجيل الملاحظات</span>
                </button>

                {/* Full Order Builder */}
                <button
                  onClick={() => handleOpenOrderModal(cust)}
                  className="py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-xs transition cursor-pointer"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span>إنشاء طلبية</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Full Options Order Builder Modal */}
      {orderModal && activeCustomer && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-stone-200 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-2 border-b border-stone-200">
              <div>
                <h3 className="font-bold text-base text-stone-900 flex items-center gap-1.5">
                  <ShoppingCart className="w-4 h-4 text-amber-500" />
                  <span>إنشاء وتثبيت طلبية جديدة</span>
                </h3>
                <p className="text-xs text-stone-500">
                  المندوبة المسؤولة: {rep.name} • تاريخ الطلب: {new Date().toLocaleDateString("ar-JO")}
                </p>
              </div>
              <button 
                onClick={() => setOrderModal(false)}
                className="p-1.5 rounded-lg bg-stone-100 text-stone-500 hover:bg-stone-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Customer Details Form */}
            <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200 space-y-3">
              <span className="text-xs font-bold text-stone-800 block">بيانات العميل والتوصيل:</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-[11px] text-stone-500 mb-1">اسم العميل:</label>
                  <input
                    type="text"
                    value={orderCustomerName}
                    onChange={(e) => setOrderCustomerName(e.target.value)}
                    className="w-full p-2 bg-white border border-stone-300 rounded-xl font-medium focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-stone-500 mb-1">رقم الهاتف:</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={orderCustomerPhone}
                    onChange={(e) => setOrderCustomerPhone(e.target.value)}
                    className="w-full p-2 bg-white border border-stone-300 rounded-xl font-mono font-medium focus:border-amber-500 focus:outline-none text-right"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-stone-500 mb-1">المحافظة / المدينة:</label>
                  <select
                    value={orderCity}
                    onChange={(e) => setOrderCity(e.target.value)}
                    className="w-full p-2 bg-white border border-stone-300 rounded-xl font-medium focus:border-amber-500 focus:outline-none"
                  >
                    {JORDAN_CITIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-stone-500 mb-1">العنوان التفصيلي:</label>
                  <input
                    type="text"
                    value={orderAddress}
                    onChange={(e) => setOrderAddress(e.target.value)}
                    placeholder="الشارع، رقم العمارة، أقرب معلم"
                    className="w-full p-2 bg-white border border-stone-300 rounded-xl font-medium focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-stone-500 mb-1">ملاحظات التوصيل للسائق:</label>
                <input
                  type="text"
                  value={orderDeliveryNotes}
                  onChange={(e) => setOrderDeliveryNotes(e.target.value)}
                  placeholder="مثال: التوصيل بعد الساعة 3 عصراً، الاتصال قبل الوصول"
                  className="w-full p-2 text-xs bg-white border border-stone-300 rounded-xl focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Catalog Items Selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-800">اختيار المنتجات والكميات:</span>
                <span className="text-[11px] text-stone-400">كتالوج بيتولا الرسمي</span>
              </div>
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {CATALOG_FOR_ORDER.map((product) => {
                  const qty = orderCart[product.sku] || 0;

                  return (
                    <div 
                      key={product.sku}
                      className={`p-2.5 rounded-xl border transition flex items-center justify-between text-xs ${
                        qty > 0 ? "bg-amber-50/80 border-amber-400" : "bg-stone-50 border-stone-200"
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
                            className="w-7 h-7 rounded-lg bg-stone-200 hover:bg-stone-300 font-bold flex items-center justify-center text-sm cursor-pointer"
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
                          className="w-7 h-7 rounded-lg bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold flex items-center justify-center text-sm shadow-2xs cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Payment Mode Selection */}
            <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200 space-y-2 text-xs">
              <span className="font-bold text-stone-700 block">طريقة الدفع المتفق عليها:</span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "cash_on_delivery", label: "دفع عند الاستلام (كاش)" },
                  { id: "cliq", label: "تحويل كليك (CliQ)" },
                  { id: "installment", label: "حجز شهر (أقساط صالونات)" },
                ].map((pm) => (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => setOrderPaymentMethod(pm.id)}
                    className={`py-2 px-2 rounded-xl text-xs font-bold border transition text-center cursor-pointer ${
                      orderPaymentMethod === pm.id
                        ? "bg-stone-900 text-white border-stone-900 shadow-xs"
                        : "bg-white text-stone-700 border-stone-200 hover:bg-stone-100"
                    }`}
                  >
                    {pm.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Total JD Banner */}
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 flex items-center justify-between">
              <div>
                <p className="text-xs text-amber-900 font-semibold">إجمالي الطلبية المستحق:</p>
                <p className="text-[11px] text-amber-700">توصيل مجاني لكافة محافظات المملكة</p>
              </div>
              <p className="text-xl font-black font-mono text-amber-950">
                {formatCurrency(cartTotal)}
              </p>
            </div>

            {/* Submit & WhatsApp Actions */}
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                type="button"
                onClick={handleSubmitFastOrder}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>حفظ وتثبيت الطلبية في النظام</span>
              </button>
              <button
                type="button"
                onClick={() => setOrderModal(false)}
                className="px-4 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-medium cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Call Outcome, Notes, & Next Call Date Modal */}
      {callLogModal && activeCustomer && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-stone-200 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-base text-stone-900">تسجيل ملاحظات الاتصال والمتابعة</h3>
                <p className="text-xs text-stone-500">العميل: {activeCustomer.name} ({activeCustomer.phone})</p>
              </div>
              <button 
                onClick={() => setCallLogModal(false)}
                className="p-1.5 rounded-lg bg-stone-100 text-stone-500 hover:bg-stone-200 cursor-pointer"
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
                    className={`p-2 rounded-xl text-right font-medium border transition cursor-pointer ${
                      outcome === item.id
                        ? "bg-amber-50 border-amber-500 text-amber-900 font-bold"
                        : "bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-700 block">تسجيل تفاصيل وملاحظات المكالمة:</label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="أدخلي هنا ما تم الاتفاق عليه مع العميل، أي استفسارات أو تفضيلات خاصة..."
                className="w-full p-2.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500 focus:bg-white transition"
              />
            </div>

            {/* Next Date & Google Calendar */}
            <div className="p-3 bg-amber-50/70 rounded-2xl border border-amber-200 space-y-2">
              <label className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                <CalendarIcon className="w-3.5 h-3.5 text-amber-600" />
                <span>تاريخ ووقت المكالمة القادمة (جدولة تذكير تقويم):</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-stone-500 mb-0.5">تاريخ المتابعة:</label>
                  <input
                    type="date"
                    value={nextDate}
                    onChange={(e) => setNextDate(e.target.value)}
                    className="w-full p-2 text-xs bg-white border border-amber-300 rounded-xl font-mono focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-stone-500 mb-0.5">الوقت المحدد:</label>
                  <input
                    type="time"
                    value={nextTime}
                    onChange={(e) => setNextTime(e.target.value)}
                    className="w-full p-2 text-xs bg-white border border-amber-300 rounded-xl font-mono focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Calendar Link Button if generated */}
            {generatedCalUrl && (
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 space-y-2">
                <p className="text-xs text-blue-900 font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-blue-600" />
                  <span>تم حفظ الموعد! اضغطي لفتحه في Google Calendar:</span>
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
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
              >
                {generatedCalUrl ? "إغلاق والعودة" : "حفظ الملاحظات والموعد"}
              </button>
              <button
                type="button"
                onClick={() => setCallLogModal(false)}
                className="px-4 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-medium cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Lead Modal */}
      {newLeadModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <form onSubmit={handleAddNewLead} className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-stone-200 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-base text-stone-900 flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-amber-500" />
                  <span>إضافة رقم جديد لقائمة الاتصال والمتابعة</span>
                </h3>
                <p className="text-xs text-stone-500">سيسند هذا الرقم فوراً لقائمة مهامك</p>
              </div>
              <button 
                type="button"
                onClick={() => setNewLeadModal(false)}
                className="p-1.5 rounded-lg bg-stone-100 text-stone-500 hover:bg-stone-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-stone-700 mb-1">اسم العميل / الصالون:</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: ليلى الأحمد"
                  value={leadName}
                  onChange={(e) => setLeadName(e.target.value)}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:border-amber-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">رقم الهاتف:</label>
                <input
                  type="tel"
                  required
                  dir="ltr"
                  placeholder="0791234567"
                  value={leadPhone}
                  onChange={(e) => setLeadPhone(e.target.value)}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl font-mono focus:border-amber-500 focus:bg-white focus:outline-none text-right"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">المحافظة:</label>
                  <select
                    value={leadCity}
                    onChange={(e) => setLeadCity(e.target.value)}
                    className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:border-amber-500 focus:outline-none"
                  >
                    {JORDAN_CITIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-stone-700 mb-1">العنوان:</label>
                  <input
                    type="text"
                    placeholder="المنطقة أو الحي"
                    value={leadAddress}
                    onChange={(e) => setLeadAddress(e.target.value)}
                    className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:border-amber-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">سبب الاتصال / المنتجات المهتم بها:</label>
                <input
                  type="text"
                  placeholder="مثال: استفسار عن بكج البلازما بعد مشاهدة إعلان إنستغرام"
                  value={leadPurpose}
                  onChange={(e) => setLeadPurpose(e.target.value)}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:border-amber-500 focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
              >
                إضافة الرقم والبدء بالاتصال
              </button>
              <button
                type="button"
                onClick={() => setNewLeadModal(false)}
                className="px-4 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-medium cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default function SalesAppPage() {
  return (
    <Suspense fallback={
      <div className="min-h-96 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <SalesAppContent />
    </Suspense>
  );
}
