"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { 
  Search, 
  X, 
  Phone, 
  PhoneCall, 
  MessageSquare, 
  Copy, 
  Check, 
  Package, 
  MapPin, 
  User, 
  Calendar, 
  DollarSign, 
  CreditCard, 
  Truck, 
  Sparkles, 
  Clock, 
  Tag,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Layers,
  FileText
} from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { useSearch } from "@/lib/search-context";
import { useToast } from "@/components/common/toast";
import { formatCurrency, cn } from "@/lib/utils";

export interface SearchableOrder {
  id: string;
  customerName: string;
  phone: string;
  area: string;
  address: string;
  products: string;
  orderTotal: number;
  cashToCollect: number;
  receivables: number;
  paymentMethod: "cash" | "cliq";
  cliqIncludesDelivery?: boolean;
  deliveryFee?: number;
  status: "pending" | "delivered" | "returned" | "postponed" | "remaining" | "confirmed" | "processing";
  driver?: string | null;
  salesRep?: string;
  date: string;
  customerType?: string;
  notes?: string;
  postponeDate?: string;
  returnReason?: string;
}

// Master collection of ERP Orders (combining logistics, driver fleet, and CRM orders)
const MASTER_ORDERS: SearchableOrder[] = [
  {
    id: "BET-D-001",
    customerName: "سدين غنايم",
    phone: "0793937385",
    area: "طبربور",
    address: "طبربور - شارع الأمير حسين عمارة 101",
    products: "2x شامبو بلازما, 1x بلسم بلازما, 100مل تريتمنت",
    orderTotal: 24.000,
    cashToCollect: 24.000,
    receivables: 0,
    paymentMethod: "cash",
    cliqIncludesDelivery: false,
    deliveryFee: 0,
    status: "confirmed",
    driver: "خالد",
    salesRep: "حنان (مبيعات)",
    date: "2026-09-11",
    customerType: "شخصي",
    notes: "توصيل مسائي بعد الساعة 4",
  },
  {
    id: "BET-D-002",
    customerName: "ربى صبيح",
    phone: "0799193505",
    area: "عرجان",
    address: "عرجان - قرب مركز أمن ياجوز",
    products: "3x بكج مورفوسيس ريستركشر 250مل + 2 ليف أن",
    orderTotal: 95.000,
    cashToCollect: 0.000, // CliQ paid in full
    receivables: 0,
    paymentMethod: "cliq",
    cliqIncludesDelivery: true,
    deliveryFee: 0,
    status: "delivered",
    driver: "علي",
    salesRep: "حنين",
    date: "2026-09-10",
    customerType: "شخصي",
    notes: "مدفوع كليك بالكامل شامل التوصيل",
  },
  {
    id: "BET-D-003",
    customerName: "صالون لمسة حرير",
    phone: "0788812345",
    area: "ناعور",
    address: "ناعور - الشارع الرئيسي مجمع السلام",
    products: "1x بروتين ماراكوجا المطور 1 لتر + سشوار جاما",
    orderTotal: 150.000,
    cashToCollect: 3.000, // Products paid via CliQ, collects delivery fee only
    receivables: 50.000,
    paymentMethod: "cliq",
    cliqIncludesDelivery: false,
    deliveryFee: 3.000,
    status: "pending",
    driver: "خالد",
    salesRep: "حمزة",
    date: "2026-09-11",
    customerType: "صالون",
    notes: "تحصيل رسوم التوصيل 3 دنانير كاش",
  },
  {
    id: "BET-D-004",
    customerName: "مريم العلي",
    phone: "0791112233",
    area: "جبل التاج",
    address: "جبل التاج - طلوع المصدار قرب صيدلية النور",
    products: "1x سيروم بلازما المغذي لمعان فوري",
    orderTotal: 0.000,
    cashToCollect: 0.000,
    receivables: 0,
    paymentMethod: "cash",
    cliqIncludesDelivery: false,
    deliveryFee: 0,
    status: "pending",
    driver: null,
    salesRep: "رشا",
    date: "2026-09-11",
    customerType: "شخصي",
    notes: "هدية ترويجية لصالون جديد",
  },
  {
    id: "BET-D-005",
    customerName: "صالون جمالك للسيدات",
    phone: "0792223344",
    area: "المدينة الرياضية",
    address: "المدينة الرياضية - مقابل بوابة 3",
    products: "2x بروتين SP فضي المعالج",
    orderTotal: 120.000,
    cashToCollect: 0.000,
    receivables: 20.000,
    paymentMethod: "cliq",
    cliqIncludesDelivery: true,
    deliveryFee: 0,
    status: "pending",
    driver: "علي",
    salesRep: "حنان (مبيعات)",
    date: "2026-09-11",
    customerType: "صالون",
    notes: "تم تسديد الحساب عبر محفظة كليك",
  },
  {
    id: "BET-D-006",
    customerName: "ليلى حسن",
    phone: "0793334455",
    area: "وادي صقرة",
    address: "وادي صقرة - خلف البنك العربي",
    products: "1x شامبو بلازما (استبدال عبوة)",
    orderTotal: 0.000,
    cashToCollect: 0.000,
    receivables: 0,
    paymentMethod: "cash",
    cliqIncludesDelivery: false,
    deliveryFee: 0,
    status: "returned",
    driver: "خالد",
    salesRep: "حنين",
    date: "2026-09-10",
    customerType: "بيتي",
    returnReason: "العلبة الخارجية تالفة / استبدال",
  },
  {
    id: "BET-D-007",
    customerName: "سارة محمد",
    phone: "0794445566",
    area: "السابع",
    address: "الدوار السابع - قرب الميدان الطبي",
    products: "1x بكج مورفوسيس ريستركشر المتكامل",
    orderTotal: 35.000,
    cashToCollect: 35.000,
    receivables: 0,
    paymentMethod: "cash",
    cliqIncludesDelivery: false,
    deliveryFee: 0,
    status: "postponed",
    driver: "علي",
    salesRep: "حمزة",
    date: "2026-09-10",
    customerType: "شخصي",
    postponeDate: "2026-09-14",
    notes: "الزبونة طلبت التأجيل ليوم الأحد",
  },
  {
    id: "BET-D-008",
    customerName: "صالون الورد",
    phone: "0795556677",
    area: "طبربور",
    address: "طبربور - شارع اليرموك عمارة القصر",
    products: "دفعة تحصيل من الحساب القديم (سند قبض)",
    orderTotal: 50.000,
    cashToCollect: 50.000,
    receivables: 0,
    paymentMethod: "cash",
    cliqIncludesDelivery: false,
    deliveryFee: 0,
    status: "remaining",
    driver: "خالد",
    salesRep: "رشا",
    date: "2026-09-11",
    customerType: "صالون",
    notes: "دفعة نقدية استحقاق أسبوعي",
  },
  {
    id: "BET-D-009",
    customerName: "عمر عبدالله",
    phone: "0796667788",
    area: "عرجان",
    address: "عرجان - قرب مدرسة سكينة بنت الحسين",
    products: "2x معالج ماركوجا البرازيلي",
    orderTotal: 100.000,
    cashToCollect: 100.000,
    receivables: 0,
    paymentMethod: "cash",
    cliqIncludesDelivery: false,
    deliveryFee: 0,
    status: "pending",
    driver: null,
    salesRep: "حنان (مبيعات)",
    date: "2026-09-11",
    customerType: "شخصي",
  },
  {
    id: "BET-D-010",
    customerName: "صيدلية الشفاء الدولية",
    phone: "0797778899",
    area: "ناعور",
    address: "ناعور - الشارع العام بجانب مختبرات بيولاب",
    products: "10x بلسم بلازما الإيطالي 500مل",
    orderTotal: 80.000,
    cashToCollect: 0.000,
    receivables: 80.000,
    paymentMethod: "cash",
    cliqIncludesDelivery: false,
    deliveryFee: 0,
    status: "confirmed",
    driver: "علي",
    salesRep: "حمزة",
    date: "2026-09-11",
    customerType: "صيدلية",
    notes: "ذمم تجارية معتمدة - فاتورة مؤجلة",
  },
  {
    id: "BET-D-011",
    customerName: "نور الدين الخصاونة",
    phone: "0798889900",
    area: "المدينة الرياضية",
    address: "المدينة الرياضية - شارع صرح الشهيد",
    products: "1x سيروم بلازما المركز + ماسك كافيار",
    orderTotal: 15.000,
    cashToCollect: 2.500, // CliQ for product, cash for delivery
    receivables: 0,
    paymentMethod: "cliq",
    cliqIncludesDelivery: false,
    deliveryFee: 2.500,
    status: "pending",
    driver: "خالد",
    salesRep: "حنين",
    date: "2026-09-11",
    customerType: "شخصي",
    notes: "حق المنتج محول كليك - تحصيل 2.5 د.أ أجرة السائق",
  },
  {
    id: "BET-D-012",
    customerName: "صالون الأناقة الملكي",
    phone: "0799990011",
    area: "وادي صقرة",
    address: "وادي صقرة - شارع ميسلون",
    products: "3x بروتين SP فضي + 3x شامبو بلازما 1 لتر",
    orderTotal: 200.000,
    cashToCollect: 100.000,
    receivables: 100.000,
    paymentMethod: "cash",
    cliqIncludesDelivery: false,
    deliveryFee: 0,
    status: "delivered",
    driver: "علي",
    salesRep: "رشا",
    date: "2026-09-10",
    customerType: "صالون",
  },
  {
    id: "BET-2026-102",
    customerName: "بيان عادل",
    phone: "0770000088",
    area: "الطفيلة",
    address: "الطفيلة - حي المنشية قرب مسجد الأبرار",
    products: "1x بكج بلازما الرباعي المتكامل للتساقط",
    orderTotal: 33.300,
    cashToCollect: 33.300,
    receivables: 5.000,
    paymentMethod: "cash",
    cliqIncludesDelivery: false,
    deliveryFee: 0,
    status: "pending",
    driver: "BX Arabia (محافظات)",
    salesRep: "حنان (مبيعات)",
    date: "2026-09-11",
    customerType: "شخصي",
  },
  {
    id: "BET-2026-103",
    customerName: "صالون لورا بيوتي",
    phone: "0791234567",
    area: "الصويفية",
    address: "الصويفية - مجمع البركة التجاري الطابق الثاني",
    products: "1x بروتين ماراكوجا 1 لتر + 1x سشوار جاما",
    orderTotal: 150.000,
    cashToCollect: 0.000,
    receivables: 0,
    paymentMethod: "cliq",
    cliqIncludesDelivery: true,
    deliveryFee: 0,
    status: "delivered",
    driver: "خالد",
    salesRep: "حنان (مبيعات)",
    date: "2026-09-09",
    customerType: "صالون",
  },
  {
    id: "BET-2026-105",
    customerName: "صيدلية المقاصد الخيرية",
    phone: "0770005000",
    area: "السابع",
    address: "الدوار السابع - قرب فندق الديز إن",
    products: "10x بكج مورفوزيس ريستركشر لتر صالونات",
    orderTotal: 450.000,
    cashToCollect: 3.000,
    receivables: 0,
    paymentMethod: "cliq",
    cliqIncludesDelivery: false,
    deliveryFee: 3.000,
    status: "pending",
    driver: "خالد",
    salesRep: "حنان (مبيعات)",
    date: "2026-09-11",
    customerType: "صيدلية",
  },
  {
    id: "BET-2026-106",
    customerName: "ميساء العمري",
    phone: "0795551234",
    area: "خلدا",
    address: "خلدا - قرب سيتي مول خلف كارفور",
    products: "1x سيروم بلازما المغذي",
    orderTotal: 12.600,
    cashToCollect: 12.600,
    receivables: 0,
    paymentMethod: "cash",
    cliqIncludesDelivery: false,
    deliveryFee: 0,
    status: "returned",
    driver: "علي",
    salesRep: "حنان (مبيعات)",
    date: "2026-09-08",
    customerType: "شخصي",
    returnReason: "الزبون غير موجود / لا يجيب",
  }
];

export function OrderSearchModal() {
  const { isSearchOpen, closeSearch, searchQuery, setSearchQuery } = useSearch();
  const { language, dir } = useLanguage();
  const { showToast } = useToast();
  const isArabic = language === "ar";

  const [activeFilter, setActiveFilter] = useState<"all" | "phone" | "id" | "customer" | "area">("all");
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Focus search input when modal opens
  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 70);
    }
  }, [isSearchOpen]);

  // Clean phone string for comparison: strip non-digits and leading zeros/country code
  const normalizePhone = (p: string) => {
    return p.replace(/[^0-9]/g, "").replace(/^(?:00962|962|0)/, "");
  };

  // Normalize arabic text: unify alef & taa marbuta
  const normalizeText = (t: string) => {
    return t
      .trim()
      .toLowerCase()
      .replace(/[أإآ]/g, "ا")
      .replace(/[ة]/g, "ه")
      .replace(/[ى]/g, "ي");
  };

  // Filtered Results
  const filteredOrders = useMemo(() => {
    const rawQuery = searchQuery.trim();
    if (!rawQuery) return [];

    const normQuery = normalizeText(rawQuery);
    const digitsOnly = rawQuery.replace(/[^0-9]/g, "");
    const isLikelyPhone = digitsOnly.length >= 3;

    return MASTER_ORDERS.filter((order) => {
      const orderPhoneClean = normalizePhone(order.phone);
      const queryPhoneClean = normalizePhone(rawQuery);

      const matchesPhone =
        order.phone.includes(rawQuery) ||
        (isLikelyPhone && (order.phone.includes(digitsOnly) || orderPhoneClean.includes(queryPhoneClean)));

      const matchesId =
        order.id.toLowerCase().includes(normQuery) ||
        order.id.replace(/[^0-9]/g, "").includes(digitsOnly);

      const matchesCustomer = normalizeText(order.customerName).includes(normQuery);
      const matchesArea = normalizeText(order.area).includes(normQuery) || normalizeText(order.address).includes(normQuery);
      const matchesProducts = normalizeText(order.products).includes(normQuery);
      const matchesDriver = order.driver ? normalizeText(order.driver).includes(normQuery) : false;
      const matchesRep = order.salesRep ? normalizeText(order.salesRep).includes(normQuery) : false;

      // Check specific filter tab if selected
      if (activeFilter === "phone") return matchesPhone;
      if (activeFilter === "id") return matchesId;
      if (activeFilter === "customer") return matchesCustomer;
      if (activeFilter === "area") return matchesArea;

      // "All" filter: matches any field
      return (
        matchesPhone ||
        matchesId ||
        matchesCustomer ||
        matchesArea ||
        matchesProducts ||
        matchesDriver ||
        matchesRep
      );
    });
  }, [searchQuery, activeFilter]);

  const handleCopyPhone = (phone: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(phone);
    setCopiedPhone(phone);
    showToast(isArabic ? `تم نسخ رقم الهاتف: ${phone}` : `Phone copied: ${phone}`, "success");
    setTimeout(() => setCopiedPhone(null), 1800);
  };

  const handleCopyOrderSummary = (order: SearchableOrder, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const summary = `📦 طلبية رقم: ${order.id}
👤 العميل: ${order.customerName}
📞 الهاتف: ${order.phone}
📍 العنوان: ${order.area} - ${order.address}
🛍️ المنتجات: ${order.products}
💵 المبلغ المطلوب كاش: ${formatCurrency(order.cashToCollect)}
💳 الدفع: ${order.paymentMethod === 'cliq' ? (order.cliqIncludesDelivery ? 'CliQ شامل التوصيل' : 'CliQ تحصيل أجرة توصيل') : 'كاش عند الاستلام'}
🚚 السائق: ${order.driver || 'غير معين'}
📋 الحالة: ${getStatusLabel(order.status)}`;

    navigator.clipboard.writeText(summary);
    setCopiedOrderId(order.id);
    showToast(isArabic ? `تم نسخ ملخص الطلب (${order.id})` : `Order summary copied (${order.id})`, "success");
    setTimeout(() => setCopiedOrderId(null), 1800);
  };

  function getStatusBadge(status: SearchableOrder["status"]) {
    switch (status) {
      case "delivered":
        return {
          label: isArabic ? "تم التسليم" : "Delivered",
          color: "bg-emerald-950/80 text-emerald-300 border-emerald-500/40",
          dot: "bg-emerald-400",
        };
      case "confirmed":
        return {
          label: isArabic ? "مؤكد للتوصيل" : "Confirmed",
          color: "bg-blue-950/80 text-blue-300 border-blue-500/40",
          dot: "bg-blue-400",
        };
      case "pending":
        return {
          label: isArabic ? "قيد التوصيل" : "Out for Delivery",
          color: "bg-amber-950/80 text-amber-300 border-amber-500/40",
          dot: "bg-amber-400 animate-pulseDot",
        };
      case "returned":
        return {
          label: isArabic ? "مرتجع" : "Returned",
          color: "bg-rose-950/80 text-rose-300 border-rose-500/40",
          dot: "bg-rose-400",
        };
      case "postponed":
        return {
          label: isArabic ? "مؤجل" : "Postponed",
          color: "bg-stone-800 text-stone-300 border-stone-600",
          dot: "bg-stone-400",
        };
      case "remaining":
        return {
          label: isArabic ? "متبقي" : "Remaining",
          color: "bg-orange-950/80 text-orange-300 border-orange-500/40",
          dot: "bg-orange-400 animate-pulseDot",
        };
      default:
        return {
          label: status,
          color: "bg-stone-800 text-stone-300 border-stone-600",
          dot: "bg-stone-400",
        };
    }
  }

  function getStatusLabel(status: SearchableOrder["status"]): string {
    return getStatusBadge(status).label;
  }

  if (!isSearchOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSearch();
      }}
      className="fixed inset-0 z-[9999] flex items-start justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto no-scrollbar hide-scrollbar animate-backdropFadeIn pt-6 sm:pt-14"
      dir={dir}
    >
      {/* High-Contrast Luxury Modal Container */}
      <div className="relative w-full max-w-3xl bg-gradient-to-b from-[#130d02] via-[#1a1205] to-[#110b02] border border-[#554625] rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.98)] text-[#f4e5d0] ring-1 ring-[#9e8959]/35 overflow-hidden flex flex-col max-h-[88vh] animate-modalSlideUp">
        
        {/* Top Gold Shimmer Accent Line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#9e8959] to-transparent" />

        {/* Ambient Gold Glow Orbs */}
        <div className="absolute w-80 h-80 bg-[#9e8959]/10 rounded-full blur-3xl pointer-events-none -top-16 -right-16" />
        <div className="absolute w-80 h-80 bg-[#c28a40]/10 rounded-full blur-3xl pointer-events-none -bottom-16 -left-16" />

        {/* Modal Search Header */}
        <div className="p-4 sm:p-6 border-b border-[#3d3016] shrink-0 bg-[#0d0801]/90 backdrop-blur">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#9e8959] via-[#c28a40] to-[#7d6534] text-[#160f02] flex items-center justify-center font-black shadow-md shadow-[#9e8959]/20">
                <Search className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                  <span>{isArabic ? "البحث الفوري عن الطلبيات والشحنات" : "Instant Orders & Shipments Search"}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#241a08] text-[#cbb588] border border-[#554625] font-mono">
                    ERP Live
                  </span>
                </h2>
                <p className="text-xs text-[#a3998b]">
                  {isArabic ? "ابحث برقم هاتف العميل، رقم الطلبية، الاسم، أو السائق" : "Search by customer phone, order ID, customer name, or driver"}
                </p>
              </div>
            </div>

            <button
              onClick={closeSearch}
              className="p-2 text-[#a3998b] hover:text-white rounded-xl hover:bg-[#281c08] border border-transparent hover:border-[#3d3016] transition cursor-pointer active:scale-95"
              title={isArabic ? "إغلاق (Esc)" : "Close (Esc)"}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* High-Contrast Interactive Search Input */}
          <div className="relative">
            <Search className={`absolute ${dir === "rtl" ? "right-4" : "left-4"} top-1/2 -translate-y-1/2 w-5 h-5 text-[#9e8959]`} />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isArabic ? "اكتب رقم الهاتف (مثال: 0793937385) أو رقم الطلب أو اسم العميل..." : "Type customer phone, order #, or name..."}
              className={`w-full bg-[#080501] border-2 border-[#554625] rounded-2xl ${
                dir === "rtl" ? "pr-12 pl-24" : "pl-12 pr-24"
              } py-3.5 text-base sm:text-lg text-white font-medium placeholder-[#6b655d] focus:outline-none focus:border-[#9e8959] focus:ring-4 focus:ring-[#9e8959]/25 transition shadow-inner`}
            />

            {searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  inputRef.current?.focus();
                }}
                className={`absolute ${dir === "rtl" ? "left-3" : "right-3"} top-1/2 -translate-y-1/2 p-1.5 text-[#a3998b] hover:text-white hover:bg-[#241a08] rounded-lg transition cursor-pointer`}
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <kbd
                className={`absolute ${
                  dir === "rtl" ? "left-3.5" : "right-3.5"
                } top-1/2 -translate-y-1/2 px-2.5 py-1 text-[11px] font-mono font-bold text-[#cbb588] bg-[#1a1204] border border-[#3d3016] rounded-lg pointer-events-none`}
              >
                ESC
              </kbd>
            )}
          </div>

          {/* Filter Scope Tabs */}
          <div className="flex items-center gap-1.5 sm:gap-2 mt-3 overflow-x-auto pb-1 no-scrollbar hide-scrollbar text-xs">
            <button
              type="button"
              onClick={() => setActiveFilter("all")}
              className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer shrink-0 active:scale-95 ${
                activeFilter === "all"
                  ? "bg-gradient-to-r from-[#9e8959] to-[#c28a40] text-[#160f02] shadow-sm shadow-[#9e8959]/30"
                  : "bg-[#181104] text-[#a3998b] border border-[#3d3016] hover:text-[#f4e5d0] hover:border-[#554625]"
              }`}
            >
              {isArabic ? "🌐 الكل" : "All"}
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter("phone")}
              className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer shrink-0 active:scale-95 flex items-center gap-1.5 ${
                activeFilter === "phone"
                  ? "bg-gradient-to-r from-[#9e8959] to-[#c28a40] text-[#160f02] shadow-sm shadow-[#9e8959]/30"
                  : "bg-[#181104] text-[#a3998b] border border-[#3d3016] hover:text-[#f4e5d0] hover:border-[#554625]"
              }`}
            >
              <Phone className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isArabic ? "برقم الهاتف" : "By Phone"}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter("id")}
              className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer shrink-0 active:scale-95 flex items-center gap-1.5 ${
                activeFilter === "id"
                  ? "bg-gradient-to-r from-[#9e8959] to-[#c28a40] text-[#160f02] shadow-sm shadow-[#9e8959]/30"
                  : "bg-[#181104] text-[#a3998b] border border-[#3d3016] hover:text-[#f4e5d0] hover:border-[#554625]"
              }`}
            >
              <Tag className="w-3.5 h-3.5 text-[#9e8959]" />
              <span>{isArabic ? "برقم الطلب" : "By Order ID"}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter("customer")}
              className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer shrink-0 active:scale-95 flex items-center gap-1.5 ${
                activeFilter === "customer"
                  ? "bg-gradient-to-r from-[#9e8959] to-[#c28a40] text-[#160f02] shadow-sm shadow-[#9e8959]/30"
                  : "bg-[#181104] text-[#a3998b] border border-[#3d3016] hover:text-[#f4e5d0] hover:border-[#554625]"
              }`}
            >
              <User className="w-3.5 h-3.5 text-blue-400" />
              <span>{isArabic ? "باسم العميل / الصالون" : "By Customer"}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter("area")}
              className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer shrink-0 active:scale-95 flex items-center gap-1.5 ${
                activeFilter === "area"
                  ? "bg-gradient-to-r from-[#9e8959] to-[#c28a40] text-[#160f02] shadow-sm shadow-[#9e8959]/30"
                  : "bg-[#181104] text-[#a3998b] border border-[#3d3016] hover:text-[#f4e5d0] hover:border-[#554625]"
              }`}
            >
              <MapPin className="w-3.5 h-3.5 text-rose-400" />
              <span>{isArabic ? "بالمنطقة" : "By Area"}</span>
            </button>
          </div>
        </div>

        {/* Modal Results & Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5 no-scrollbar hide-scrollbar">
          
          {/* Active Search Results Count Bar */}
          {searchQuery.trim() && (
            <div className="flex items-center justify-between text-xs px-1 text-[#a3998b]">
              <span>
                {isArabic ? (
                  <>
                    نتائج البحث عن: <strong className="text-white">"{searchQuery}"</strong> (تم العثور على{" "}
                    <strong className="text-emerald-400">{filteredOrders.length}</strong> طلب)
                  </>
                ) : (
                  <>
                    Results for <strong className="text-white">"{searchQuery}"</strong> (Found{" "}
                    <strong className="text-emerald-400">{filteredOrders.length}</strong> orders)
                  </>
                )}
              </span>
              <span className="text-[11px] text-[#9e8959]">
                {isArabic ? "فرز حسب التطابق الدقيق" : "Exact match priority"}
              </span>
            </div>
          )}

          {/* Render List of Order Cards */}
          {filteredOrders.length > 0 ? (
            <div className="space-y-3">
              {filteredOrders.map((order, idx) => {
                const statusInfo = getStatusBadge(order.status);
                const isPhoneCopied = copiedPhone === order.phone;
                const isOrderCopied = copiedOrderId === order.id;

                return (
                  <div
                    key={order.id}
                    className="relative bg-[#191104] hover:bg-[#221706] border border-[#3e3017] hover:border-[#9e8959]/80 rounded-2xl p-4 sm:p-5 transition-all shadow-lg hover:shadow-black/70 group"
                  >
                    {/* Top Accent Shimmer on Card */}
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#9e8959] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                    {/* Card Header Row: Order ID, Date, Status, Payment */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#342610]">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-xl bg-gradient-to-r from-[#241a08] to-[#342610] text-[#f4e5d0] border border-[#554625] font-mono text-xs font-black tracking-wide">
                          {order.id}
                        </span>
                        <span className="text-[11px] text-[#a3998b] flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-[#9e8959]" />
                          <span>{order.date}</span>
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {/* Status Badge */}
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border inline-flex items-center gap-1.5 ${statusInfo.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusInfo.dot}`} />
                          <span>{statusInfo.label}</span>
                        </span>

                        {/* Payment Method Badge */}
                        {order.paymentMethod === "cliq" ? (
                          order.cliqIncludesDelivery ? (
                            <span className="px-2 py-0.5 rounded-full bg-purple-950/80 text-purple-300 border border-purple-500/40 text-[11px] font-bold inline-flex items-center gap-1">
                              <CreditCard className="w-3 h-3 text-purple-400" />
                              <span>CliQ (شامل التوصيل)</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-blue-950/80 text-blue-300 border border-blue-500/40 text-[11px] font-bold inline-flex items-center gap-1">
                              <CreditCard className="w-3 h-3 text-blue-400" />
                              <span>CliQ (تحصيل توصيل: {formatCurrency(order.deliveryFee ?? 2.5)})</span>
                            </span>
                          )
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-stone-900 text-stone-300 border border-stone-700 text-[11px] font-bold inline-flex items-center gap-1">
                            <DollarSign className="w-3 h-3 text-emerald-400" />
                            <span>كاش (COD)</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Customer & Direct Phone Actions Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-3 border-b border-[#342610]">
                      {/* Customer Name & Type */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-[#241a08] text-[#9e8959] border border-[#554625] flex items-center justify-center shrink-0 font-black text-sm">
                          {order.customerName.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-black text-white text-sm sm:text-base flex items-center gap-2 truncate">
                            <span>{order.customerName}</span>
                            {order.customerType && (
                              <span className="text-[10px] px-2 py-0.2 rounded-md bg-[#30220a] text-[#cbb588] border border-[#554625] shrink-0 font-normal">
                                {order.customerType}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-[#a3998b] flex items-center gap-1 mt-0.5 truncate">
                            <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                            <span className="font-semibold text-white/90">{order.area}</span>
                            <span className="text-stone-400">- {order.address}</span>
                          </p>
                        </div>
                      </div>

                      {/* Phone Number with Quick Actions (Call / WhatsApp / Copy) */}
                      <div className="flex items-center justify-start sm:justify-end gap-2">
                        <div className="flex items-center gap-1.5 bg-[#0e0902] border border-[#3e3017] rounded-xl px-3 py-1.5">
                          <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="text-sm font-bold font-mono text-emerald-400 tracking-wider" dir="ltr">
                            {order.phone}
                          </span>
                        </div>

                        {/* WhatsApp Button */}
                        <a
                          href={`https://wa.me/962${normalizePhone(order.phone)}?text=${encodeURIComponent(
                            `مرحباً ${order.customerName}، نتواصل معك من شركة بيتولا لمستحضرات التجميل بخصوص طلبك رقم (${order.id}).`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={isArabic ? "محادثة واتساب" : "Chat on WhatsApp"}
                          className="p-2 rounded-xl bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-500/40 hover:border-emerald-400 transition cursor-pointer active:scale-95 shadow-sm"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </a>

                        {/* Phone Call Button */}
                        <a
                          href={`tel:${order.phone}`}
                          title={isArabic ? "اتصال هاتفي" : "Direct Call"}
                          className="p-2 rounded-xl bg-sky-950/70 hover:bg-sky-900/80 text-sky-300 border border-sky-500/40 hover:border-sky-400 transition cursor-pointer active:scale-95 shadow-sm"
                        >
                          <PhoneCall className="w-4 h-4" />
                        </a>

                        {/* Copy Phone Button */}
                        <button
                          type="button"
                          onClick={(e) => handleCopyPhone(order.phone, e)}
                          title={isArabic ? "نسخ الرقم" : "Copy Phone"}
                          className="p-2 rounded-xl bg-[#241a08] hover:bg-[#342610] text-[#cbb588] hover:text-white border border-[#554625] transition cursor-pointer active:scale-95 shadow-sm"
                        >
                          {isPhoneCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Products Summary Row */}
                    <div className="py-2.5 text-xs text-[#d8c8b4] flex items-start gap-2 border-b border-[#342610]">
                      <Package className="w-4 h-4 text-[#9e8959] shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <span className="font-semibold text-white/90">{isArabic ? "المنتجات المطلوبة:" : "Products:"}</span>{" "}
                        <span>{order.products}</span>
                        {order.notes && (
                          <p className="text-[11px] text-[#a3998b] mt-1 bg-[#120c02] p-1.5 rounded-lg border border-[#342610]">
                            💬 <span className="font-semibold">{isArabic ? "ملاحظات:" : "Notes:"}</span> {order.notes}
                          </p>
                        )}
                        {order.returnReason && (
                          <p className="text-[11px] text-rose-300 mt-1 bg-rose-950/40 p-1.5 rounded-lg border border-rose-500/30">
                            ⚠️ <span className="font-semibold">{isArabic ? "سبب الإرجاع:" : "Return Reason:"}</span> {order.returnReason}
                          </p>
                        )}
                        {order.postponeDate && (
                          <p className="text-[11px] text-amber-300 mt-1 bg-amber-950/40 p-1.5 rounded-lg border border-amber-500/30">
                            ⏳ <span className="font-semibold">{isArabic ? "تاريخ التأجيل الجديد:" : "Postponed To:"}</span> {order.postponeDate}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Financial & Logistics Footer Row */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-3 text-xs">
                      <div className="flex flex-wrap items-center gap-3">
                        <div>
                          <span className="text-[#a3998b]">{isArabic ? "إجمالي الطلب:" : "Order Total:"} </span>
                          <span className="font-bold text-white font-mono">{formatCurrency(order.orderTotal)}</span>
                        </div>

                        <div className="px-2.5 py-0.5 rounded-lg bg-[#241a08] border border-[#554625]">
                          <span className="text-[#9e8959] font-bold">{isArabic ? "المطلوب كاش:" : "Cash to Collect:"} </span>
                          <span className={`font-black font-mono text-sm ${order.cashToCollect === 0 ? "text-emerald-400" : "text-amber-300"}`}>
                            {formatCurrency(order.cashToCollect)}
                          </span>
                        </div>

                        {order.driver && (
                          <div className="flex items-center gap-1 text-[#a3998b]">
                            <Truck className="w-3.5 h-3.5 text-sky-400" />
                            <span>{isArabic ? "السائق:" : "Driver:"}</span>
                            <span className="font-bold text-white">{order.driver}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {order.salesRep && (
                          <span className="text-[11px] text-[#a3998b]">
                            {isArabic ? "بواسطة:" : "By:"} <span className="text-[#cbb588] font-semibold">{order.salesRep}</span>
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={(e) => handleCopyOrderSummary(order, e)}
                          className="px-3 py-1.5 rounded-xl bg-[#241a08] hover:bg-[#342610] text-[#f4e5d0] border border-[#554625] hover:border-[#9e8959] transition flex items-center gap-1.5 font-bold text-xs cursor-pointer active:scale-95"
                        >
                          {isOrderCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-[#9e8959]" />}
                          <span>{isOrderCopied ? (isArabic ? "تم النسخ" : "Copied") : (isArabic ? "نسخ البيانات" : "Copy Info")}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : searchQuery.trim() ? (
            /* No Results Found State */
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#241a08] border border-[#554625] flex items-center justify-center mb-4 shadow-lg shadow-black/60">
                <AlertCircle className="w-8 h-8 text-[#9e8959]" />
              </div>
              <h3 className="text-lg font-bold text-white mb-1.5">
                {isArabic ? "لم يتم العثور على أي طلبيات مطابقة" : "No Matching Orders Found"}
              </h3>
              <p className="text-xs text-[#a3998b] max-w-sm leading-relaxed mb-4">
                {isArabic
                  ? `لا توجد نتائج مطابقة لـ "${searchQuery}". تأكد من صحة أرقام الهاتف أو جرب البحث برقم آخر أو باسم العميل.`
                  : `No orders matched "${searchQuery}". Check the digits or try another search term.`}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  inputRef.current?.focus();
                }}
                className="px-4 py-2 rounded-xl bg-[#241a08] border border-[#554625] hover:border-[#9e8959] text-xs text-[#f4e5d0] font-bold cursor-pointer active:scale-95 transition"
              >
                {isArabic ? "إعادة ضبط البحث" : "Reset Search"}
              </button>
            </div>
          ) : (
            /* Empty Search Initial State: Quick Suggestions & Sample Phones */
            <div className="py-8 px-2 sm:px-4 space-y-6">
              <div className="text-center max-w-md mx-auto">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#241a08] to-[#160f02] border border-[#554625] flex items-center justify-center mx-auto mb-3 shadow-md">
                  <Sparkles className="w-7 h-7 text-[#9e8959]" />
                </div>
                <h3 className="text-base font-bold text-white mb-1">
                  {isArabic ? "محرك البحث الذكي لطلبات بيتولا" : "Betolla Orders Smart Search"}
                </h3>
                <p className="text-xs text-[#a3998b]">
                  {isArabic
                    ? "اكتب أي رقم هاتف أو جزء منه (مثال: 079 أو 3937385) لاستدعاء بطاقة الطلب فورياً"
                    : "Type any phone number or part of it to instantly retrieve order cards"}
                </p>
              </div>

              {/* Sample Quick Clickable Search Suggestions */}
              <div className="bg-[#0f0a02] p-4 sm:p-5 rounded-2xl border border-[#3d3016] space-y-3">
                <p className="text-xs font-bold text-[#cbb588] flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{isArabic ? "أرقام هواتف وعينات للبحث السريع (اضغط للتجربة):" : "Sample Numbers to Test (Click to search):"}</span>
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {[
                    { phone: "0793937385", name: "سدين غنايم (طبربور)", id: "BET-D-001" },
                    { phone: "0799193505", name: "ربى صبيح (CliQ شامل التوصيل)", id: "BET-D-002" },
                    { phone: "0788812345", name: "صالون لمسة حرير (CliQ تحصيل)", id: "BET-D-003" },
                    { phone: "0770000088", name: "بيان عادل (الطفيلة - BX)", id: "BET-2026-102" },
                    { phone: "0791234567", name: "صالون لورا بيوتي (الصويفية)", id: "BET-2026-103" },
                    { phone: "0770005000", name: "صيدلية المقاصد الخيرية", id: "BET-2026-105" },
                  ].map((sample) => (
                    <button
                      key={sample.phone}
                      type="button"
                      onClick={() => {
                        setSearchQuery(sample.phone);
                        setActiveFilter("phone");
                      }}
                      className="p-2.5 rounded-xl bg-[#1a1204] hover:bg-[#251a08] border border-[#3d3016] hover:border-[#9e8959] transition flex items-center justify-between gap-2 text-right cursor-pointer group active:scale-95"
                    >
                      <div className="min-w-0 text-right">
                        <span className="font-mono font-bold text-emerald-400 text-xs block group-hover:text-emerald-300" dir="ltr">
                          {sample.phone}
                        </span>
                        <span className="text-[11px] text-[#a3998b] truncate block mt-0.5">
                          {sample.name}
                        </span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#241a08] text-[#cbb588] border border-[#554625] font-mono shrink-0">
                        {sample.id}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tips & Shortcuts Banner */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#a3998b] px-2">
                <span>
                  💡 {isArabic ? "مفتاح الاختصار السريع في أي صفحة:" : "Global shortcut anywhere:"}{" "}
                  <kbd className="px-1.5 py-0.5 rounded bg-[#241a08] border border-[#554625] font-mono text-[#f4e5d0]">
                    Ctrl + K
                  </kbd>
                </span>
                <span>{isArabic ? "مجموع الطلبات المتاحة للبحث: 16 طلبية معتمدة" : "Total searchable database: 16 orders"}</span>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-3.5 sm:p-4 border-t border-[#3d3016] bg-[#0c0801] flex items-center justify-between text-xs text-[#a3998b] shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulseDot" />
            <span className="font-medium text-white/90">
              {isArabic ? "نظام البحث المباشر عن طلبيات بيتولا" : "Betolla Live Orders Search"}
            </span>
          </div>

          <button
            type="button"
            onClick={closeSearch}
            className="px-4 py-1.5 rounded-xl border border-[#3d3016] bg-[#1a1204] text-[#f4e5d0] hover:bg-[#281c08] hover:border-[#554625] font-bold text-xs transition cursor-pointer active:scale-95"
          >
            {isArabic ? "إغلاق (Esc)" : "Close (Esc)"}
          </button>
        </div>

      </div>
    </div>
  );
}
