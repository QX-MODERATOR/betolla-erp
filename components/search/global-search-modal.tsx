"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { 
  Search, 
  X, 
  Sparkles, 
  Users, 
  Package, 
  ShoppingCart, 
  PhoneCall, 
  BarChart3, 
  DollarSign, 
  ArrowRight, 
  ArrowLeft,
  Phone,
  Calendar,
  History
} from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { useLoading } from "@/lib/loading-context";

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Searchable Catalog
const SEARCHABLE_PRODUCTS = [
  { id: "p1", sku: "PL-SHAMP-01", nameAr: "شامبو الكيراتين الإيطالي اليومي", nameEn: "Italian Keratin Daily Shampoo", price: 16.5, category: "products", stock: "142 قطعة", badgeAr: "الأكثر طلباً", badgeEn: "Best Seller" },
  { id: "p2", sku: "PL-SHAMP-02", nameAr: "بلسم الكيراتين المكثف للشعر التالف", nameEn: "Intensive Keratin Conditioner", price: 18.0, category: "products", stock: "88 قطعة", badgeAr: "مخزون ممتاز", badgeEn: "In Stock" },
  { id: "p3", sku: "PL-SERUM-01", nameAr: "سيروم الأرغان النقي لمعان فوري", nameEn: "Pure Argan Instant Shine Serum", price: 22.0, category: "products", stock: "64 قطعة", badgeAr: "مطلوب للصالونات", badgeEn: "Salon Pick" },
  { id: "p4", sku: "PL-MASK-01", nameAr: "ماسك الكافيار والحرير المعالج 500 مل", nameEn: "Caviar & Silk Therapy Mask 500ml", price: 29.5, category: "products", stock: "35 قطعة", badgeAr: "علاجي فاخر", badgeEn: "Luxury Line" },
  { id: "p5", sku: "PL-OIL-01", nameAr: "زيت المكاديميا المركز لإصلاح الأطراف", nameEn: "Concentrated Macadamia Repair Oil", price: 19.0, category: "products", stock: "50 قطعة", badgeAr: "عناية يومية", badgeEn: "Daily Care" },
  { id: "p6", sku: "PL-PROT-01", nameAr: "معالج البروتين العضوي ماكس 1000 مل", nameEn: "Organic Protein Max Therapy 1000ml", price: 85.0, category: "products", stock: "22 قطعة", badgeAr: "صالونات فقط", badgeEn: "Pro Salons" },
];

// Searchable Customers / Salons
const SEARCHABLE_CUSTOMERS = [
  { id: "c1", nameAr: "صالون ليلى بيوتي سنتر", nameEn: "Layla Beauty Center", phone: "0795551234", city: "عمان - الصويفية", category: "customers", tier: "VIP", rep: "رحمة" },
  { id: "c2", nameAr: "صالون رنيم للتجميل والتزيين", nameEn: "Raneem Beauty Salon", phone: "0788884321", city: "إربد - شارع الجامعة", category: "customers", tier: "ذهبي", rep: "رحمة" },
  { id: "c3", nameAr: "مركز رزان هير سبا", nameEn: "Razan Hair Spa", phone: "0771234567", city: "الزرقاء - الجديدة", category: "customers", tier: "فضي", rep: "رحمة" },
  { id: "c4", nameAr: "صالون سدين غنايم للشعر", nameEn: "Sadeen Ghanayem Hair Lounge", phone: "0793937385", city: "عمان - طبربور", category: "customers", tier: "VIP", rep: "رحمة" },
  { id: "c5", nameAr: "مركز كريستال للسيدات", nameEn: "Crystal Ladies Center", phone: "0796667788", city: "عمان - عبدون", category: "customers", tier: "VIP", rep: "رحمة" },
  { id: "c6", nameAr: "صالون ميرا بيوتي بوتيك", nameEn: "Mira Beauty Boutique", phone: "0785559900", city: "السلط - مجمع قاقيش", category: "customers", tier: "برونزي", rep: "أحمد" },
];

// Searchable Orders
const SEARCHABLE_ORDERS = [
  { id: "BET-2026-9041", customerAr: "صالون ليلى بيوتي سنتر", customerEn: "Layla Beauty Center", total: "245.000 د.أ", totalEn: "245.000 JD", statusAr: "جاهزة للشحن", statusEn: "Ready to Ship", category: "orders" },
  { id: "BET-2026-8912", customerAr: "صالون رنيم للتجميل", customerEn: "Raneem Beauty Salon", total: "180.000 د.أ", totalEn: "180.000 JD", statusAr: "تم التوصيل", statusEn: "Delivered", category: "orders" },
  { id: "BET-2026-7854", customerAr: "صالون سدين غنايم", customerEn: "Sadeen Ghanayem Lounge", total: "110.000 د.أ", totalEn: "110.000 JD", statusAr: "قيد المعالجة", statusEn: "Processing", category: "orders" },
  { id: "BET-2026-6731", customerAr: "مركز كريستال للسيدات", customerEn: "Crystal Ladies Center", total: "490.000 د.أ", totalEn: "490.000 JD", statusAr: "مسدد بالكامل", statusEn: "Paid (CliQ)", category: "orders" },
];

// System Navigation Shortcuts
const SEARCHABLE_PAGES = [
  { href: "/sales", nameAr: "مساحة عمل المبيعات والاتصالات (Sales Workspace)", nameEn: "Sales & Calling Workspace", descAr: "جدول اتصالات رحمة، أرقام اليوم، وإنشاء الطلبيات السريعة", descEn: "Rahma's call queue, today's numbers, fast orders", icon: PhoneCall, category: "pages" },
  { href: "/orders?new=true", nameAr: "إنشاء طلبية وفاتورة جديدة (New Order)", nameEn: "Create New Order & Invoice", descAr: "مولد طلبيات الواتساب وحجز طلبيات الصالونات", descEn: "WhatsApp order generator & salon reservations", icon: ShoppingCart, category: "pages" },
  { href: "/customers", nameAr: "دليل الصالونات والعملاء (CRM 45K)", nameEn: "Salons & Customers CRM", descAr: "قاعدة بيانات 45,000 صالون ومركز تجميل في الأردن", descEn: "Directory of 45,000 beauty salons across Jordan", icon: Users, category: "pages" },
  { href: "/calls", nameAr: "جدول المكالمات وتقويم جوجل (Call Schedule)", nameEn: "Calls Schedule & Calendar", descAr: "مزامنة اتصالات المبيعات مع تقويم جوجل المباشر", descEn: "Direct sync of sales calls with Google Calendar", icon: Calendar, category: "pages" },
  { href: "/inventory", nameAr: "إدارة المخزون والمنتجات (Inventory)", nameEn: "Inventory & Stock Audit", descAr: "جرد مستودع بيتولا، كميات الشامبو، السيروم، والبروتين", descEn: "Betolla warehouse stock, shampoo, serum, and protein", icon: Package, category: "pages" },
  { href: "/finance", nameAr: "السجل المالي والمقبوضات (Finance & CliQ)", nameEn: "Finance & CliQ Receipts", descAr: "فواتير الصالونات، سندات القبض، وتحصيل الدفعات", descEn: "Salon invoices, payment vouchers, CliQ reconciliation", icon: DollarSign, category: "pages" },
  { href: "/analytics", nameAr: "لوحة مؤشرات الأداء والتقارير (Analytics BI)", nameEn: "Executive Analytics & BI", descAr: "أداء المندوبات، المبيعات اليومية، والربحية", descEn: "Rep performance, daily sales, and profitability", icon: BarChart3, category: "pages" },
];

export function GlobalSearchModal({ isOpen, onClose }: GlobalSearchModalProps) {
  const router = useRouter();
  const { language, dir } = useLanguage();
  const { startNavigation } = useLoading();
  const isArabic = language === "ar";

  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "customers" | "products" | "orders" | "pages">("all");

  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input automatically when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setTimeout(() => {
        inputRef.current?.focus();
      }, 80);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Filtered results
  const filteredResults = useMemo(() => {
    const q = query.trim().toLowerCase();

    // 1. Pages
    const pages = SEARCHABLE_PAGES.filter(p => {
      if (activeTab !== "all" && activeTab !== "pages") return false;
      if (!q) return true;
      return (
        p.nameAr.toLowerCase().includes(q) ||
        p.nameEn.toLowerCase().includes(q) ||
        p.descAr.toLowerCase().includes(q) ||
        p.descEn.toLowerCase().includes(q)
      );
    });

    // 2. Customers
    const customers = SEARCHABLE_CUSTOMERS.filter(c => {
      if (activeTab !== "all" && activeTab !== "customers") return false;
      if (!q) return true;
      return (
        c.nameAr.toLowerCase().includes(q) ||
        c.nameEn.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.city.toLowerCase().includes(q)
      );
    });

    // 3. Products
    const products = SEARCHABLE_PRODUCTS.filter(p => {
      if (activeTab !== "all" && activeTab !== "products") return false;
      if (!q) return true;
      return (
        p.nameAr.toLowerCase().includes(q) ||
        p.nameEn.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q)
      );
    });

    // 4. Orders
    const orders = SEARCHABLE_ORDERS.filter(o => {
      if (activeTab !== "all" && activeTab !== "orders") return false;
      if (!q) return true;
      return (
        o.id.toLowerCase().includes(q) ||
        o.customerAr.toLowerCase().includes(q) ||
        o.customerEn.toLowerCase().includes(q)
      );
    });

    return {
      pages,
      customers,
      products,
      orders,
      totalCount: pages.length + customers.length + products.length + orders.length,
    };
  }, [query, activeTab]);

  if (!isOpen) return null;

  const handleSelectPage = (href: string) => {
    onClose();
    startNavigation();
    router.push(href);
  };

  const handleSelectCustomer = (customer: any) => {
    onClose();
    startNavigation();
    router.push(`/customers?search=${encodeURIComponent(customer.phone)}`);
  };

  const handleSelectProduct = (product: any) => {
    onClose();
    startNavigation();
    router.push(`/inventory?search=${encodeURIComponent(product.sku)}`);
  };

  const handleSelectOrder = (order: any) => {
    onClose();
    startNavigation();
    router.push(`/orders?search=${encodeURIComponent(order.id)}`);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      dir={dir}
      className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 sm:pt-14 bg-stone-950/80 backdrop-blur-md animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl bg-stone-900 border border-amber-500/40 rounded-3xl shadow-2xl flex flex-col max-h-[90dvh] sm:max-h-[82vh] text-stone-100 overflow-hidden ring-1 ring-white/10">
        
        {/* Top Gold Ambient Light */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500/20 via-amber-400 to-amber-500/20" />

        {/* Search Input Bar (Sticky) */}
        <div className="p-3.5 sm:p-4 border-b border-stone-800 flex items-center gap-3 bg-stone-900/95 backdrop-blur shrink-0">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <Search className="w-4 h-4" />
          </div>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isArabic ? "ابحث عن صالون، هاتف، منتج، كود SKU، طلبية، أو صفحة..." : "Search salon, phone, SKU, product, order, or page..."}
            className="flex-1 bg-transparent text-sm sm:text-base text-white placeholder-stone-400 focus:outline-none font-medium min-w-0"
          />

          {query && (
            <button
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label={isArabic ? "مسح البحث" : "Clear search"}
              className="p-1 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg bg-stone-800/80 border border-stone-700 text-stone-400 text-[10px] font-mono">
            <span>ESC</span>
          </div>

          <button
            onClick={onClose}
            aria-label={isArabic ? "إغلاق" : "Close"}
            className="p-1.5 text-stone-400 hover:text-white rounded-xl hover:bg-stone-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Category Filter Pills (Sticky) */}
        <div className="px-3 sm:px-4 py-2 border-b border-stone-800/80 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 bg-stone-950/40 text-xs">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === "all"
                ? "bg-amber-500 text-stone-950 shadow-xs"
                : "text-stone-400 hover:text-stone-200 hover:bg-stone-800/60"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isArabic ? "الكل" : "All"}</span>
          </button>

          <button
            onClick={() => setActiveTab("customers")}
            className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === "customers"
                ? "bg-amber-500 text-stone-950 shadow-xs"
                : "text-stone-400 hover:text-stone-200 hover:bg-stone-800/60"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>{isArabic ? "الصالونات والعملاء" : "Salons & Customers"}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-stone-800 text-stone-300 font-mono">
              {filteredResults.customers.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("products")}
            className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === "products"
                ? "bg-amber-500 text-stone-950 shadow-xs"
                : "text-stone-400 hover:text-stone-200 hover:bg-stone-800/60"
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>{isArabic ? "المنتجات والمخزون" : "Products"}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-stone-800 text-stone-300 font-mono">
              {filteredResults.products.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("orders")}
            className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === "orders"
                ? "bg-amber-500 text-stone-950 shadow-xs"
                : "text-stone-400 hover:text-stone-200 hover:bg-stone-800/60"
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>{isArabic ? "الطلبيات والفواتير" : "Orders"}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-stone-800 text-stone-300 font-mono">
              {filteredResults.orders.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("pages")}
            className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === "pages"
                ? "bg-amber-500 text-stone-950 shadow-xs"
                : "text-stone-400 hover:text-stone-200 hover:bg-stone-800/60"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>{isArabic ? "الانتقال السريع" : "Pages"}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-stone-800 text-stone-300 font-mono">
              {filteredResults.pages.length}
            </span>
          </button>
        </div>

        {/* Scrollable Results Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 text-xs overscroll-contain">
          
          {/* Zero Results Notice */}
          {filteredResults.totalCount === 0 && (
            <div className="py-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                <Search className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-stone-200">
                {isArabic ? `لا توجد نتائج مطابقة لـ "${query}"` : `No matching results for "${query}"`}
              </p>
              <p className="text-stone-400 max-w-sm mx-auto text-[11px]">
                {isArabic 
                  ? "جربي البحث باسم صالون آخر، رقم هاتف يبدأ بـ 079، أو كود منتج مثل PL-SHAMP"
                  : "Try searching by another salon name, phone starting with 079, or product SKU."}
              </p>
            </div>
          )}

          {/* Section 1: Navigation / Pages */}
          {filteredResults.pages.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-2 px-1 flex items-center justify-between">
                <span>{isArabic ? "⚡ صفحات وأقسام النظام:" : "⚡ QUICK NAVIGATION:"}</span>
                <span>{filteredResults.pages.length}</span>
              </p>
              <div className="space-y-1.5">
                {filteredResults.pages.map((p) => {
                  const IconComp = p.icon;
                  return (
                    <button
                      key={p.href}
                      onClick={() => handleSelectPage(p.href)}
                      className="w-full p-2.5 rounded-2xl bg-stone-950/60 hover:bg-amber-500/15 border border-stone-800 hover:border-amber-500/40 text-right transition flex items-center justify-between group cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-stone-800 group-hover:bg-amber-500 group-hover:text-stone-950 text-amber-400 flex items-center justify-center transition shrink-0">
                          <IconComp className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-stone-100 group-hover:text-amber-300 text-xs sm:text-sm truncate">
                            {isArabic ? p.nameAr : p.nameEn}
                          </h4>
                          <p className="text-[11px] text-stone-400 truncate mt-0.5">
                            {isArabic ? p.descAr : p.descEn}
                          </p>
                        </div>
                      </div>
                      <div className="text-stone-500 group-hover:text-amber-400 shrink-0 px-1">
                        {dir === "rtl" ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 2: Salons / Customers */}
          {filteredResults.customers.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-2 px-1 flex items-center justify-between">
                <span>{isArabic ? "👥 الصالونات ومراكز التجميل:" : "👥 SALONS & CUSTOMERS:"}</span>
                <span>{filteredResults.customers.length}</span>
              </p>
              <div className="space-y-1.5">
                {filteredResults.customers.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleSelectCustomer(c)}
                    className="w-full p-2.5 rounded-2xl bg-stone-950/60 hover:bg-amber-500/15 border border-stone-800 hover:border-amber-500/40 text-right transition flex items-center justify-between group cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs shrink-0">
                        {c.nameAr.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-stone-100 group-hover:text-amber-300 text-xs sm:text-sm truncate">
                            {isArabic ? c.nameAr : c.nameEn}
                          </h4>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono shrink-0">
                            {c.tier}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px] text-stone-400">
                          <span className="flex items-center gap-1 font-mono text-amber-400/90" dir="ltr">
                            <Phone className="w-3 h-3 text-amber-500" />
                            <span>{c.phone}</span>
                          </span>
                          <span>• {c.city}</span>
                          <span>• {isArabic ? `المندوبة: ${c.rep}` : `Rep: ${c.rep}`}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-stone-500 group-hover:text-amber-400 shrink-0 px-1">
                      {dir === "rtl" ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Section 3: Products */}
          {filteredResults.products.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-2 px-1 flex items-center justify-between">
                <span>{isArabic ? "🧴 المنتجات ومستحضرات التجميل:" : "🧴 PRODUCTS & INVENTORY:"}</span>
                <span>{filteredResults.products.length}</span>
              </p>
              <div className="space-y-1.5">
                {filteredResults.products.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectProduct(p)}
                    className="w-full p-2.5 rounded-2xl bg-stone-950/60 hover:bg-amber-500/15 border border-stone-800 hover:border-amber-500/40 text-right transition flex items-center justify-between group cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-stone-800 group-hover:bg-amber-500 group-hover:text-stone-950 text-amber-400 flex items-center justify-center transition shrink-0">
                        <Package className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-stone-100 group-hover:text-amber-300 text-xs sm:text-sm truncate">
                            {isArabic ? p.nameAr : p.nameEn}
                          </h4>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono shrink-0">
                            {isArabic ? p.badgeAr : p.badgeEn}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-stone-400 font-mono">
                          <span className="text-amber-400 font-bold">{p.price.toFixed(3)} {isArabic ? "د.أ" : "JD"}</span>
                          <span>• SKU: {p.sku}</span>
                          <span>• {p.stock}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-stone-500 group-hover:text-amber-400 shrink-0 px-1">
                      {dir === "rtl" ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Section 4: Orders */}
          {filteredResults.orders.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-2 px-1 flex items-center justify-between">
                <span>{isArabic ? "📦 الطلبيات والفواتير السريعة:" : "📦 ORDERS & INVOICES:"}</span>
                <span>{filteredResults.orders.length}</span>
              </p>
              <div className="space-y-1.5">
                {filteredResults.orders.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => handleSelectOrder(o)}
                    className="w-full p-2.5 rounded-2xl bg-stone-950/60 hover:bg-amber-500/15 border border-stone-800 hover:border-amber-500/40 text-right transition flex items-center justify-between group cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center transition shrink-0">
                        <ShoppingCart className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-amber-400 text-xs sm:text-sm">
                            {o.id}
                          </span>
                          <span className="font-medium text-stone-200 text-xs truncate">
                            {isArabic ? o.customerAr : o.customerEn}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-stone-400 font-mono">
                          <span className="text-emerald-400 font-bold">{isArabic ? o.total : o.totalEn}</span>
                          <span>• {isArabic ? o.statusAr : o.statusEn}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-stone-500 group-hover:text-amber-400 shrink-0 px-1">
                      {dir === "rtl" ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer (Sticky) */}
        <div className="p-3 border-t border-stone-800 bg-stone-950/80 backdrop-blur flex items-center justify-between text-[11px] text-stone-400 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{isArabic ? "محرك بحث بيتولا الفوري الفائق" : "Betolla Real-time ERP Search"}</span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 font-medium transition cursor-pointer"
          >
            {isArabic ? "إغلاق (Esc)" : "Close (Esc)"}
          </button>
        </div>

      </div>
    </div>
  );
}
