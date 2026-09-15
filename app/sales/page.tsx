"use client";

import { useState, useEffect, useCallback, Suspense, useRef } from "react";
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
  ChevronDown,
  UserCog,
  History,
  RotateCcw,
  Phone,
  FileSpreadsheet
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { generateGoogleCalendarUrl } from "@/lib/calendar";
import { getCurrentUser } from "@/lib/client-api";
import { useLanguage } from "@/lib/i18n";
import { useLoading } from "@/lib/loading-context";
import { useDateFilter } from "@/lib/date-context";
import { useProfile } from "@/lib/profile-context";

// Sales Reps configurations & personal targets
const SALES_REPS = [
  { id: "rahma", name: "رحمة", target_jd: 0.000, current_jd: 0.000, commission_rate: 3.5, calls_target: 0, calls_done: 0, avatar: "ر" },
  { id: "hamza", name: "حمزة", target_jd: 6000.000, current_jd: 5420.000, commission_rate: 3.5, calls_target: 40, calls_done: 34, avatar: "ح" },
  { id: "sabreen", name: "صابرين", target_jd: 3500.000, current_jd: 1940.000, commission_rate: 3.0, calls_target: 30, calls_done: 22, avatar: "ص" },
  { id: "sara", name: "سارة", target_jd: 2000.000, current_jd: 890.000, commission_rate: 2.5, calls_target: 20, calls_done: 12, avatar: "س" },
];

// Multi-day assigned customers with rich lead context (Today, Yesterday, Older days)
const MULTI_DAY_CUSTOMERS: Record<string, Record<string, any[]>> = {
  rahma: {},
  hamza: {
    "2026-09-08": [
      { id: "101", name: "صيدلية المقاصد", phone: "0770005000", city: "عمان", address: "الدوار السابع", purpose: "متابعة طلبية بكجات البلازما الشهرية", due: "11:00 ص", status: "today", lastNotes: "", nextDate: "", nextTime: "", callsCount: 4 },
    ],
    "2026-09-07": [
      { id: "h-yest-1", name: "صيدلية الرازي", phone: "0795554433", city: "عمان", address: "الشميساني", purpose: "توريد 10 بكجات بلازما", due: "10:00 ص", status: "completed", lastNotes: "تمت الموافقة", nextDate: "", nextTime: "", callsCount: 3 },
    ]
  }
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
  const { language, dir, t } = useLanguage();
  const { startLoading, stopLoading } = useLoading();
  const isArabic = language === "ar";

  const { selectedDate, isToday, resetToToday, formattedDateLabel } = useDateFilter();
  const { hananProfile, openProfileModal, allProfiles } = useProfile();

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeRepId, setActiveRepId] = useState("rahma");
  const [isRepDropdownOpen, setIsRepDropdownOpen] = useState(false);
  const repDropdownRef = useRef<HTMLDivElement>(null);
  const [multiDayCustomers, setMultiDayCustomers] = useState<Record<string, Record<string, any[]>>>(MULTI_DAY_CUSTOMERS);

  // Close rep dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (repDropdownRef.current && !repDropdownRef.current.contains(e.target as Node)) {
        setIsRepDropdownOpen(false);
      }
    }
    if (isRepDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isRepDropdownOpen]);

  // Load leads from persistent API store
  const loadLeads = useCallback(async (repId: string, date: string) => {
    try {
      const repNameParam =
        repId === "rahma" ? "رحمة" : repId === "hamza" ? "حمزة" : repId === "sabreen" ? "صابرين" : repId;
      const res = await fetch(`/api/leads?rep=${encodeURIComponent(repNameParam)}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();

      if (data.success && Array.isArray(data.leads) && data.leads.length > 0) {
        const mappedQueue = data.leads.map((l: any, idx: number) => ({
          id: l.id || `lead-${idx}`,
          name: l.name,
          phone: l.phone,
          city: l.city || "عمان",
          address: l.address || "",
          purpose: l.notes || "ليد جديد محول من الإدارة",
          due: "اليوم",
          status: "today",
          lastNotes: l.notes || "",
          nextDate: "",
          nextTime: "",
          callsCount: 0,
        }));

        setMultiDayCustomers((prev) => {
          const currentRepData = { ...(prev[repId] || {}) };
          const existingList = currentRepData[date] || [];

          const existingPhones = new Set(existingList.map((c) => c.phone));
          const newItems = mappedQueue.filter((item: any) => !existingPhones.has(item.phone));

          if (existingList.length === 0) {
            currentRepData[date] = mappedQueue;
          } else if (newItems.length > 0) {
            currentRepData[date] = [...newItems, ...existingList];
          }

          return {
            ...prev,
            [repId]: currentRepData,
          };
        });
      }
    } catch {
      // Ignore network glitch
    }
  }, []);

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
    const targetRep = user?.role === "sales_rep" && user?.repId ? user.repId : activeRepId;
    if (user?.role === "sales_rep" && user?.repId) {
      setActiveRepId(user.repId);
    }
    loadLeads(targetRep, selectedDate);
  }, [selectedDate, activeRepId, loadLeads]);

  const isSalesRep = currentUser?.role === "sales_rep";
  const rep = SALES_REPS.find(r => r.id === activeRepId) || SALES_REPS[0];
  const repCustomers = multiDayCustomers[activeRepId]?.[selectedDate] || [];

  const activeRepProfile = allProfiles[activeRepId] || (activeRepId === "rahma" ? hananProfile : null);
  const repDisplayName = activeRepProfile?.name || rep.name;
  const repPhone = activeRepProfile?.phone || "";
  const repCity = activeRepProfile?.city || "عمان والوسط";

  // Commission & Target calculations
  const targetProgress = rep.target_jd > 0 ? Math.min(Math.round((rep.current_jd / rep.target_jd) * 100), 100) : 0;
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

    startLoading({
      ar: "جاري توثيق الملاحظات ومزامنة تقويم Google...",
      en: "Logging call notes & syncing Google Calendar...",
    });

    setTimeout(() => {
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
      setMultiDayCustomers(prev => {
        const repData = { ...(prev[activeRepId] || {}) };
        const list = [...(repData[selectedDate] || [])];
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
        repData[selectedDate] = list;
        return { ...prev, [activeRepId]: repData };
      });

      stopLoading();

      if (!nextDate) {
        setCallLogModal(false);
        alert(`تم توثيق ملاحظات الاتصال بنجاح للعميل (${activeCustomer.name}).`);
      }
    }, 450);
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

    startLoading({
      ar: "جاري حفظ وتثبيت الطلبية في النظام وتجهيز الفاتورة...",
      en: "Saving order & preparing invoice in ERP...",
    });

    setTimeout(() => {
      const orderId = `BET-2026-${Math.floor(1000 + Math.random() * 9000)}`;

      // Generate WhatsApp Order Confirmation Link
      const selectedItemsText = Object.entries(orderCart).map(([sku, qty]) => {
        const item = CATALOG_FOR_ORDER.find(p => p.sku === sku);
        return `- ${item?.name} (${qty} قطعة) = ${formatCurrency((item?.price || 0) * qty)}`;
      }).join("\n");

      const fastOrderRepName = activeRepProfile?.name || rep.name;
      const fastOrderRepPhone = activeRepProfile?.phone || "";
      const repContact = fastOrderRepPhone ? ` (${fastOrderRepPhone})` : "";

      const whatsappMessage = `أهلاً بك عميلنا العزيز ${orderCustomerName} 🌸
تم تثبيت طلبك بنجاح من بيتولا كوزمتكس برقم (${orderId}):

📦 المنتجات:
${selectedItemsText}

💰 المجموع: ${formatCurrency(cartTotal)}
🚚 التوصيل: مجاني
📍 العنوان: ${orderCity} - ${orderAddress}
طريقة الدفع: ${orderPaymentMethod === "cash_on_delivery" ? "دفع عند الاستلام" : "حجز شهر / كليك"}

المندوبة المسؤولة: ${fastOrderRepName}${repContact}
شكراً لثقتكم بشركة بيتولا لمستحضرات التجميل!`;

      const whatsappUrl = `https://wa.me/${orderCustomerPhone.replace(/^0/, "962")}?text=${encodeURIComponent(whatsappMessage)}`;

      setOrderModal(false);
      setOrderCart({});
      stopLoading();

      // Confirmation with direct WhatsApp action
      if (confirm(`🎉 تم إنشاء الطلبية بنجاح برقم (${orderId}) بمبلغ (${formatCurrency(cartTotal)})!\n\nهل ترغبين بإرسال تفاصيل الفاتورة وتأكيد الطلب للعميل مباشرة عبر واتساب؟`)) {
        window.open(whatsappUrl, "_blank");
      }
    }, 550);
  };

  // Add New Lead
  const handleAddNewLead = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadName.trim() || !leadPhone.trim()) {
      alert("يرجى إدخال اسم العميل ورقم الهاتف.");
      return;
    }

    startLoading({
      ar: "جاري إضافة جهة الاتصال إلى قائمة الاتصال اليومية...",
      en: "Adding new lead to daily call schedule...",
    });

    setTimeout(() => {
      const newCust = {
        id: `lead-${Date.now()}`,
        name: leadName.trim(),
        phone: leadPhone.trim(),
        city: leadCity,
        address: leadAddress.trim() || "غير محدد",
        purpose: leadPurpose.trim() || "ليد جديد بحاجة إلى تواصل ومتابعة",
        due: isToday ? "اليوم" : selectedDate,
        status: isToday ? "today" : "scheduled",
        lastNotes: "تم إضافة الرقم حديثاً من قبل المندوبة",
        nextDate: "",
        nextTime: "",
        callsCount: 0,
      };

      setMultiDayCustomers(prev => {
        const repData = { ...(prev[activeRepId] || {}) };
        const list = [newCust, ...(repData[selectedDate] || [])];
        repData[selectedDate] = list;
        return { ...prev, [activeRepId]: repData };
      });

      setNewLeadModal(false);
      setLeadName("");
      setLeadPhone("");
      setLeadAddress("");
      setLeadPurpose("");
      stopLoading();
      alert(`تمت إضافة العميل (${newCust.name}) إلى قائمة اتصالاتك بنجاح!`);
    }, 450);
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

      {/* Past Date Calling Archive Notification Banner */}
      {!isToday && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-amber-500/15 border-2 border-amber-500/40 text-amber-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 shadow-sm">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-stone-950 flex items-center justify-center font-bold shrink-0 shadow-xs">
              <History className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-black text-sm text-amber-950">
                  {isArabic ? "أرشيف اتصالات يوم سابق" : "Past Date Calling Archive"}
                </p>
                <span className="text-xs font-mono font-bold bg-amber-200 text-amber-950 px-2 py-0.5 rounded-md shrink-0">
                  {selectedDate}
                </span>
              </div>
              <p className="text-xs text-amber-900/90 mt-0.5 leading-relaxed">
                {isArabic
                  ? `أنتِ تتصفحين الآن قائمة اتصالات وسجلات العملاء لتاريخ (${formattedDateLabel}). يمكنكِ مراجعة الأرقام وتحديث الملاحظات.`
                  : `You are viewing call logs and customer numbers for (${formattedDateLabel}). You can review notes and record updates.`}
              </p>
            </div>
          </div>
          <button
            onClick={resetToToday}
            className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer self-start sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{isArabic ? "العودة لاتصالات اليوم" : "Return to Today"}</span>
          </button>
        </div>
      )}

      {/* Top Identity & Personal Target Card */}
      <div className="relative overflow-hidden bg-gradient-to-r from-[#160f02] via-[#241a08] to-[#160f02] rounded-3xl p-5 sm:p-6 text-[#f4e5d0] border border-[#554625]/80 shadow-2xl space-y-4">
        {/* Top Gold Ambient Accent Line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#9e8959] to-transparent z-10" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#9e8959] to-[#c28a40] text-[#160f02] font-black text-xl flex items-center justify-center shadow-lg shadow-[#9e8959]/20 border border-[#bda66d]/40 shrink-0">
              {activeRepProfile?.avatar || (activeRepId === "rahma" ? hananProfile?.avatar : rep.avatar)}
            </div>
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#35270e] text-[#9e8959] border border-[#554625] text-[10px] font-bold">
                <Sparkles className="w-3 h-3 text-[#9e8959]" />
                <span>{t("sales_portal_badge")}</span>
              </div>
              <h2 className="text-xl font-bold text-white mt-0.5 truncate">{t("welcome_rep")}, {repDisplayName}! 👋</h2>
              {repPhone && (
                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-[#f4e5d0]/70 font-mono">
                  <span className="flex items-center gap-1">
                    <Phone className="w-3 h-3 text-[#9e8959]" />
                    <span>{repPhone}</span>
                  </span>
                  {repCity && <span className="text-[#554625]">• <span className="text-[#f4e5d0]/70">{repCity}</span></span>}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:self-auto justify-start sm:justify-end pt-1 sm:pt-0">
            {/* Quick Profile Settings Trigger - Always opens Hanan profile from sales workspace */}
            <button
              onClick={() => openProfileModal(activeRepId || "rahma")}
              className="px-3 py-1.5 bg-[#241a08] hover:bg-[#35270e] text-[#f4e5d0] hover:text-[#9e8959] border border-[#554625] hover:border-[#9e8959]/60 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer shrink-0 active:scale-95"
              title={isArabic ? "تعديل بياناتي ورقم هاتفي" : "Edit my profile & phone"}
            >
              <UserCog className="w-3.5 h-3.5 text-[#9e8959]" />
              <span>{isArabic ? "تعديل بياناتي ورقمي" : "Edit Profile"}</span>
            </button>

            {/* Rep Switcher (Visible only for Admin, locked for Sales Rep) */}
            {isSalesRep ? (
              <span className="px-3 py-1.5 bg-[#35270e] border border-[#554625] text-[#9e8959] rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#9e8959]" />
                <span>{isArabic ? "حساب مندوبة المبيعات" : "Sales Rep Account"}</span>
              </span>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#f4e5d0]/70">{isArabic ? "المندوب:" : "Rep:"}</span>
                  <div className="relative" ref={repDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setIsRepDropdownOpen((prev) => !prev)}
                      className="px-3 py-1.5 bg-[#241a08] border border-[#554625] text-[#f4e5d0] hover:text-[#9e8959] hover:border-[#9e8959]/60 rounded-xl text-xs font-bold flex items-center gap-2 focus:outline-none focus:border-[#9e8959] cursor-pointer transition shadow-xs select-none"
                      aria-haspopup="listbox"
                      aria-expanded={isRepDropdownOpen}
                    >
                      <span>{rep.name}</span>
                      <ChevronDown className={cn("w-3.5 h-3.5 text-[#9e8959] transition-transform duration-200", isRepDropdownOpen && "rotate-180")} />
                    </button>

                    {isRepDropdownOpen && (
                      <div 
                        role="listbox"
                        className={cn(
                          "absolute top-full mt-1.5 z-50 min-w-[140px] bg-[#160f02] border border-[#554625] rounded-xl shadow-2xl shadow-black/80 py-1 overflow-hidden no-scrollbar hide-scrollbar scrollbar-none animate-fadeIn",
                          dir === "rtl" ? "right-0" : "left-0"
                        )}
                      >
                        {SALES_REPS.map((r) => {
                          const isSelected = activeRepId === r.id;
                          return (
                            <button
                              key={r.id}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              onClick={() => {
                                setActiveRepId(r.id);
                                setIsRepDropdownOpen(false);
                              }}
                              className={cn(
                                "w-full px-3 py-2 text-xs font-bold text-start flex items-center justify-between gap-2 transition-colors cursor-pointer",
                                isSelected
                                  ? "bg-[#35270e] text-[#9e8959]"
                                  : "text-[#f4e5d0] hover:bg-[#241a08] hover:text-[#9e8959]"
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-md bg-[#241a08] border border-[#554625] text-[#9e8959] text-[10px] flex items-center justify-center font-black">
                                  {r.avatar}
                                </span>
                                <span>{r.name}</span>
                              </div>
                              {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-[#9e8959] shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Hidden select to preserve form/query compatibility */}
                  <select
                    value={activeRepId}
                    onChange={(e) => setActiveRepId(e.target.value)}
                    className="sr-only no-scrollbar hide-scrollbar scrollbar-none"
                    tabIndex={-1}
                    aria-hidden="true"
                  >
                    {SALES_REPS.map((r) => (
                      <option key={r.id} value={r.id} className="bg-[#160f02] text-[#f4e5d0]">
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Rep Target & Monthly Performance Grid - Responsive 1 col on mobile, 3 cols on sm+ */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4 pt-2 border-t border-[#3d3016]">
          <div className="bg-[#241a08]/90 p-3 rounded-2xl border border-[#554625]/80 shadow-inner">
            <p className="text-[10px] text-[#f4e5d0]/70 font-medium">{t("monthly_sales")}</p>
            <p className="text-base sm:text-lg font-black text-[#bda66d] mt-0.5 font-mono">
              {formatCurrency(rep.current_jd)}
            </p>
            <p className="text-[10px] text-[#f4e5d0]/60 mt-0.5">{t("of_target")} {formatCurrency(rep.target_jd)}</p>
          </div>

          <div className="bg-[#241a08]/90 p-3 rounded-2xl border border-[#554625]/80 shadow-inner">
            <p className="text-[10px] text-[#f4e5d0]/70 font-medium">{t("target_progress")}</p>
            <p className="text-base sm:text-lg font-black text-emerald-400 mt-0.5 font-mono">
              {targetProgress}%
            </p>
            <div className="w-full bg-[#160f02] border border-[#554625]/60 h-1.5 rounded-full mt-1.5 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-[#9e8959] to-[#bda66d] h-full rounded-full transition-all duration-500" 
                style={{ width: `${targetProgress}%` }} 
              />
            </div>
          </div>

          <div className="bg-[#241a08]/90 p-3 rounded-2xl border border-[#554625]/80 shadow-inner">
            <p className="text-[10px] text-[#f4e5d0]/70 font-medium">{t("commission_cash")}</p>
            <p className="text-base sm:text-lg font-black text-white mt-0.5 font-mono">
              {formatCurrency(estimatedCommission)}
            </p>
            <p className="text-[10px] text-[#9e8959] font-bold mt-0.5">{rep.commission_rate}{t("commission_rate")}</p>
          </div>
        </div>
      </div>

      {/* Main Calling Queue Section */}
      <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-base text-stone-900 flex items-center gap-2">
                <PhoneCall className="w-4 h-4 text-amber-500 shrink-0" />
                <span>{t("calls_queue_title")} ({repCustomers.length})</span>
              </h3>
              <span className="text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md shrink-0">
                {formattedDateLabel}
              </span>
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              {t("calls_queue_sub")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setNewLeadModal(true)}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{t("add_new_lead_btn")}</span>
            </button>
            <div className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-xl border border-emerald-200 shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{rep.calls_done} {t("calls_done_badge")}</span>
            </div>
          </div>
        </div>

        {/* Customer Call Cards or Empty State */}
        {repCustomers.length === 0 ? (
          <div className="py-12 px-4 text-center border-2 border-dashed border-stone-200 rounded-2xl space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
              <CalendarIcon className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-stone-800 text-sm">
                {isArabic ? "لا توجد أرقام مسجلة لهذا اليوم" : "No calling records for this date"}
              </h4>
              <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
                {isArabic 
                  ? `لم يتم تسجيل مكالمات بتاريخ (${formattedDateLabel}). يمكنك إضافة عميل جديد أو اختيار يوم آخر من التقويم بالأعلى.`
                  : `No calls scheduled for (${formattedDateLabel}). You can add a new lead or select another day from the calendar.`}
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setNewLeadModal(true)}
                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t("add_new_lead_btn")}</span>
              </button>
              {!isToday && (
                <button
                  onClick={resetToToday}
                  className="px-3.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isArabic ? "العودة لاتصالات اليوم" : "Back to Today"}</span>
                </button>
              )}
            </div>
          </div>
        ) : (
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
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-medium font-mono">
                        {t("calls_history_tag")} {cust.callsCount} {t("times")}
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
                        alert(isArabic ? `تم نسخ الرقم (${cust.phone}) إلى الحافظة.` : `Phone (${cust.phone}) copied to clipboard.`);
                      }}
                      title="Copy phone"
                      className="text-stone-400 hover:text-stone-700 transition cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <p className="text-xs text-stone-600">📌 {cust.purpose}</p>
                  <p className="text-[11px] text-stone-400 truncate max-w-sm">📍 {cust.address}</p>

                  {/* Display recorded notes directly on the card if present */}
                  {cust.lastNotes && (
                    <div className="p-2 rounded-xl bg-amber-50/80 border border-amber-200/80 text-[11px] text-amber-900 mt-2">
                      <span className="font-bold">{t("last_notes_recorded")} </span>
                      <span>{cust.lastNotes}</span>
                    </div>
                  )}

                  {cust.nextDate && (
                    <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
                      <CalendarIcon className="w-3 h-3 text-blue-600" />
                      <span>{t("next_call_scheduled")} {cust.nextDate} {cust.nextTime ? `(${cust.nextTime})` : ""}</span>
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
                  <span>{t("call_phone_btn")}</span>
                </a>

                {/* WhatsApp */}
                <a
                  href={`https://wa.me/${cust.phone.replace(/^0/, '962')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{t("whatsapp_chat_btn")}</span>
                </a>

                {/* Log Call & Next Call Date */}
                <button
                  onClick={() => handleOpenCallLog(cust)}
                  className="py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-xs transition cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  <span>{t("log_notes_btn")}</span>
                </button>

                {/* Full Order Builder */}
                <button
                  onClick={() => handleOpenOrderModal(cust)}
                  className="py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-xs transition cursor-pointer"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span>{t("create_order_btn")}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>

      {/* Full Options Order Builder Modal */}
      {orderModal && activeCustomer && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-stone-200 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-2 border-b border-stone-200">
              <div>
                <h3 className="font-bold text-base text-stone-900 flex items-center gap-1.5">
                  <ShoppingCart className="w-4 h-4 text-amber-500" />
                  <span>{t("order_modal_title")}</span>
                </h3>
                <p className="text-xs text-stone-500">
                  {t("order_rep_responsible")} {rep.name} • {t("order_date")} {new Date().toLocaleDateString(isArabic ? "ar-JO" : "en-US")}
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
              <span className="text-xs font-bold text-stone-800 block">{t("order_delivery_section")}</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-[11px] text-stone-500 mb-1">{t("cust_name_label")}</label>
                  <input
                    type="text"
                    value={orderCustomerName}
                    onChange={(e) => setOrderCustomerName(e.target.value)}
                    className="w-full p-2 bg-white border border-stone-300 rounded-xl font-medium focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-stone-500 mb-1">{t("cust_phone_label")}</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={orderCustomerPhone}
                    onChange={(e) => setOrderCustomerPhone(e.target.value)}
                    className="w-full p-2 bg-white border border-stone-300 rounded-xl font-mono font-medium focus:border-amber-500 focus:outline-none text-right"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-stone-500 mb-1">{t("cust_city_label")}</label>
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
                  <label className="block text-[11px] text-stone-500 mb-1">{t("cust_address_label")}</label>
                  <input
                    type="text"
                    value={orderAddress}
                    onChange={(e) => setOrderAddress(e.target.value)}
                    placeholder={t("address_placeholder")}
                    className="w-full p-2 bg-white border border-stone-300 rounded-xl font-medium focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-stone-500 mb-1">{t("driver_notes_label")}</label>
                <input
                  type="text"
                  value={orderDeliveryNotes}
                  onChange={(e) => setOrderDeliveryNotes(e.target.value)}
                  placeholder={t("driver_notes_placeholder")}
                  className="w-full p-2 text-xs bg-white border border-stone-300 rounded-xl focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Catalog Items Selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-800">{t("select_products_label")}</span>
                <span className="text-[11px] text-stone-400">{t("betolla_catalog_tag")}</span>
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
              <span className="font-bold text-stone-700 block">{t("payment_method_label")}</span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "cash_on_delivery", label: t("pay_cod") },
                  { id: "cliq", label: t("pay_cliq") },
                  { id: "installment", label: t("pay_installment") },
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
                <p className="text-xs text-amber-900 font-semibold">{t("total_order_due")}</p>
                <p className="text-[11px] text-amber-700">{t("free_delivery_tag")}</p>
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
                <span>{t("submit_order_btn")}</span>
              </button>
              <button
                type="button"
                onClick={() => setOrderModal(false)}
                className="px-4 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-medium cursor-pointer"
              >
                {t("cancel_btn")}
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
                <h3 className="font-bold text-base text-stone-900">{t("call_log_title")}</h3>
                <p className="text-xs text-stone-500">{activeCustomer.name} ({activeCustomer.phone})</p>
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
              <label className="text-xs font-bold text-stone-700 block">{t("call_outcome_label")}</label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { id: "answered", label: t("outcome_answered") },
                  { id: "no_answer", label: t("outcome_no_answer") },
                  { id: "whatsapp_sent", label: t("outcome_whatsapp_sent") },
                  { id: "order_placed", label: t("outcome_order_placed") },
                  { id: "callback_requested", label: t("outcome_callback") },
                  { id: "not_interested", label: t("outcome_not_interested") },
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
              <label className="text-xs font-bold text-stone-700 block">{t("call_notes_input_label")}</label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("call_notes_placeholder")}
                className="w-full p-2.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500 focus:bg-white transition"
              />
            </div>

            {/* Next Date & Google Calendar */}
            <div className="p-3 bg-amber-50/70 rounded-2xl border border-amber-200 space-y-2">
              <label className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                <CalendarIcon className="w-3.5 h-3.5 text-amber-600" />
                <span>{t("next_call_section")}</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-stone-500 mb-0.5">{t("next_date_label")}</label>
                  <input
                    type="date"
                    value={nextDate}
                    onChange={(e) => setNextDate(e.target.value)}
                    className="w-full p-2 text-xs bg-white border border-amber-300 rounded-xl font-mono focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-stone-500 mb-0.5">{t("next_time_label")}</label>
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
                  <span>{t("cal_saved_msg")}</span>
                </p>
                <a
                  href={generatedCalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition"
                >
                  <span>{t("open_calendar_btn")}</span>
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
                {generatedCalUrl ? t("close_btn") : t("save_call_btn")}
              </button>
              <button
                type="button"
                onClick={() => setCallLogModal(false)}
                className="px-4 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-medium cursor-pointer"
              >
                {t("cancel_btn")}
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
                  <span>{t("add_lead_title")}</span>
                </h3>
                <p className="text-xs text-stone-500">{t("add_lead_sub")}</p>
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
                <label className="block font-bold text-stone-700 mb-1">{t("lead_name_label")}</label>
                <input
                  type="text"
                  required
                  placeholder={isArabic ? "مثال: ليلى الأحمد" : "e.g. Layla Al-Ahmad"}
                  value={leadName}
                  onChange={(e) => setLeadName(e.target.value)}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:border-amber-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">{t("lead_phone_label")}</label>
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
                  <label className="block font-bold text-stone-700 mb-1">{t("lead_city_label")}</label>
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
                  <label className="block font-bold text-stone-700 mb-1">{t("lead_address_label")}</label>
                  <input
                    type="text"
                    placeholder={isArabic ? "المنطقة أو الحي" : "Area or Street"}
                    value={leadAddress}
                    onChange={(e) => setLeadAddress(e.target.value)}
                    className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:border-amber-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">{t("lead_purpose_label")}</label>
                <input
                  type="text"
                  placeholder={isArabic ? "مثال: استفسار عن بكج البلازما" : "e.g. Inquiry about Plasma set"}
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
                {t("submit_add_lead")}
              </button>
              <button
                type="button"
                onClick={() => setNewLeadModal(false)}
                className="px-4 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-medium cursor-pointer"
              >
                {t("cancel_btn")}
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
