"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  Users, 
  PhoneCall, 
  ShoppingCart, 
  Package, 
  Receipt, 
  BarChart3, 
  Settings, 
  Sparkles, 
  Menu, 
  X, 
  LogOut,
  UserCog,
  Truck,
  ClipboardList,
  ShieldCheck,
  Calculator,
  BriefcaseBusiness,
  Contact,
  IdCard,
  Fingerprint,
  CalendarDays,
  CalendarCheck,
  Wallet,
  FileText
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { logoutUser, getCurrentUser } from "@/lib/client-api";
import { useLanguage } from "@/lib/i18n";
import { useLoading } from "@/lib/loading-context";
import { useProfile } from "@/lib/profile-context";
import type { UserRole } from "@/lib/auth";

interface NavItem {
  title: string;
  enTitle: string;
  href: string;
  icon: any;
  badge?: string;
  enBadge?: string;
  roles?: UserRole[];
}

interface NavCategory {
  id: string;
  title: string;
  enTitle: string;
  items: NavItem[];
}

const NAV_CATEGORIES: NavCategory[] = [
  {
    id: "core",
    title: "الرئيسية والمبيعات",
    enTitle: "Core & Sales",
    items: [
      {
        title: "لوحة التحكم",
        enTitle: "Dashboard",
        href: "/",
        icon: LayoutDashboard,
        roles: ["admin", "general_manager", "sales_manager", "hr_operations"],
      },
      {
        title: "بوابة المندوبين (Sales App)",
        enTitle: "Sales Rep Portal",
        href: "/sales",
        icon: Sparkles,
        badge: "تطبيق المبيعات",
        enBadge: "Sales App",
        roles: ["admin", "general_manager", "sales_manager", "sales_rep"],
      },
      {
        title: "العملاء والليدات",
        enTitle: "CRM & Customers",
        href: "/customers",
        icon: Users,
        roles: ["admin", "general_manager", "sales_manager", "sales_rep", "marketing_manager", "marketing", "hr_operations"],
      },
      {
        title: "متابعة المكالمات",
        enTitle: "Call Schedule",
        href: "/calls",
        icon: PhoneCall,
        badge: "اليوم",
        enBadge: "Today",
        roles: ["admin", "general_manager", "sales_manager", "sales_rep", "hr_operations"],
      },
    ],
  },
  {
    id: "operations",
    title: "العمليات واللوجستيات",
    enTitle: "Operations & Logistics",
    items: [
      {
        title: "إدارة الطلبات",
        enTitle: "Orders",
        href: "/orders",
        icon: ShoppingCart,
        roles: ["admin", "general_manager", "sales_manager", "sales_rep", "driver_manager", "finance", "hr_operations", "marketing_manager"],
      },
      {
        title: "إدارة السائقين",
        enTitle: "Driver Management",
        href: "/drivers",
        icon: Truck,
        badge: "اليوم",
        enBadge: "Today",
        roles: ["admin", "general_manager", "sales_manager", "driver_manager", "hr_operations"],
      },
      {
        title: "طلبات التوصيل",
        enTitle: "My Deliveries",
        href: "/driver",
        icon: ClipboardList,
        roles: ["driver", "admin", "general_manager", "driver_manager"],
      },
      {
        title: "إغلاق الوردية وكشف الكاش",
        enTitle: "Shift Close & Cash",
        href: "/driver/shift",
        icon: Calculator,
        badge: "نهاية اليوم",
        enBadge: "EOD",
        roles: ["driver", "admin", "general_manager", "driver_manager"],
      },
      {
        title: "تسوية عهدة السائقين",
        enTitle: "Driver Reconciliation",
        href: "/drivers/reconcile",
        icon: Receipt,
        roles: ["admin", "general_manager", "sales_manager", "driver_manager", "finance"],
      },
      {
        title: "المنتجات والمخزون",
        enTitle: "Inventory",
        href: "/inventory",
        icon: Package,
        roles: ["admin", "general_manager", "sales_manager", "driver_manager", "finance", "hr_operations"],
      },
    ],
  },
  {
    id: "hr",
    title: "الموارد البشرية",
    enTitle: "Human Resources",
    items: [
      {
        title: "لوحة الموارد البشرية",
        enTitle: "HR Dashboard",
        href: "/hr",
        icon: BriefcaseBusiness,
        roles: ["admin", "general_manager", "hr_operations"],
      },
      {
        title: "ملفات الموظفين",
        enTitle: "Employees",
        href: "/hr/employees",
        icon: Contact,
        roles: ["admin", "general_manager", "hr_operations"],
      },
      {
        title: "الحضور والانصراف",
        enTitle: "Attendance",
        href: "/hr/attendance",
        icon: Fingerprint,
        roles: ["admin", "general_manager", "hr_operations"],
      },
      {
        title: "إدارة الإجازات",
        enTitle: "Leave Management",
        href: "/hr/leave",
        icon: CalendarDays,
        roles: ["admin", "general_manager", "hr_operations"],
      },
      {
        title: "الرواتب",
        enTitle: "Payroll",
        href: "/hr/payroll",
        icon: Wallet,
        roles: ["admin", "general_manager", "hr_operations", "finance"],
      },
    ],
  },
  {
    id: "self_service",
    title: "خدماتي الوظيفية",
    enTitle: "My Workspace",
    items: [
      {
        title: "ملفي الوظيفي",
        enTitle: "My Profile",
        href: "/hr/me",
        icon: IdCard,
        roles: ["admin", "general_manager", "sales_manager", "sales_rep", "marketing_manager", "marketing", "finance", "hr_operations", "driver_manager", "driver"],
      },
      {
        title: "حضوري وانصرافي",
        enTitle: "My Attendance",
        href: "/hr/me/attendance",
        icon: Fingerprint,
        roles: ["admin", "general_manager", "sales_manager", "sales_rep", "marketing_manager", "marketing", "finance", "hr_operations", "driver_manager", "driver"],
      },
      {
        title: "إجازاتي",
        enTitle: "My Leave",
        href: "/hr/me/leave",
        icon: CalendarCheck,
        roles: ["admin", "general_manager", "sales_manager", "sales_rep", "marketing_manager", "marketing", "finance", "hr_operations", "driver_manager", "driver"],
      },
      {
        title: "كشوف رواتبي",
        enTitle: "My Payslips",
        href: "/hr/me/payslips",
        icon: FileText,
        roles: ["admin", "general_manager", "sales_manager", "sales_rep", "marketing_manager", "marketing", "finance", "hr_operations", "driver_manager", "driver"],
      },
    ],
  },
  {
    id: "admin",
    title: "الإدارة والتقارير",
    enTitle: "Management & Reports",
    items: [
      {
        title: "المالية والفواتير",
        enTitle: "Finance",
        href: "/finance",
        icon: Receipt,
        roles: ["admin", "general_manager", "finance"],
      },
      {
        title: "تقارير الأداء",
        enTitle: "Analytics",
        href: "/analytics",
        icon: BarChart3,
        roles: ["admin", "general_manager", "sales_manager", "marketing_manager", "finance"],
      },
      {
        title: "الإعدادات والنظام",
        enTitle: "Settings",
        href: "/settings",
        icon: Settings,
        roles: ["admin", "general_manager", "hr_operations"],
      },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [productCount, setProductCount] = useState<number | null>(null);
  const { language, dir, t } = useLanguage();
  const { startNavigation, startLoading } = useLoading();
  const { profile, openProfileModal, isProfileModalOpen } = useProfile();
  const isArabic = language === "ar";

  useEffect(() => {
    setCurrentUser(getCurrentUser());
  }, []);

  // Real live product count for the Inventory nav badge (was a hardcoded "31").
  useEffect(() => {
    fetch("/api/inventory", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.catalog) setProductCount(data.catalog.length);
      })
      .catch(() => {});
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Close mobile drawer when profile modal opens
  useEffect(() => {
    if (isProfileModalOpen) {
      setIsOpen(false);
    }
  }, [isProfileModalOpen]);

  const userRole: UserRole = (currentUser?.role || profile?.role || "admin") as UserRole;

  // Filter categories and items based on user role
  const visibleCategories = NAV_CATEGORIES.map((category) => {
    const visibleItems = category.items.filter((item) => {
      if (!item.roles) return userRole === "admin" || userRole === "general_manager" || userRole === "sales_manager";
      return item.roles.includes(userRole);
    });
    return { ...category, items: visibleItems };
  }).filter((category) => category.items.length > 0);

  // Find the single best matching navigation href (exact match or longest matching prefix)
  const activeHref = visibleCategories
    .flatMap((c) => c.items.map((i) => i.href))
    .filter((href) => pathname === href || (href !== "/" && pathname.startsWith(href + "/")))
    .sort((a, b) => b.length - a.length)[0] || null;

  // Subtitle based on role
  const getRoleSubtitle = () => {
    switch (userRole) {
      case "general_manager": return isArabic ? "الإدارة العامة والتنفيذية" : "Executive Management";
      case "sales_manager": return isArabic ? "إدارة وتطوير المبيعات" : "Sales Management";
      case "sales_rep": return t("sales_portal_sub") || (isArabic ? "بوابة المندوبين والمبيعات" : "Sales Representative");
      case "marketing_manager": return isArabic ? "إدارة التسويق والحملات" : "Marketing Management";
      case "marketing": return isArabic ? "أخصائي التسويق والليدات" : "Marketing Specialist";
      case "hr_operations": return isArabic ? "الموارد البشرية والعمليات" : "HR & Operations";
      case "driver_manager": return isArabic ? "إدارة سائقي التوصيل" : "Fleet & Dispatch Manager";
      case "driver": return isArabic ? "تطبيق السائقين والتوصيل" : "Delivery Driver";
      case "finance": return isArabic ? "المدير المالي والخزينة" : "Finance & Accounting";
      default: return isArabic ? "نظام إدارة العمليات المتكامل" : "Enterprise Operations";
    }
  };

  return (
    <>
      {/* Mobile Menu Toggle Button - Sleek floating gold trigger */}
      <div className={cn(
        "lg:hidden fixed top-3.5 z-50 transition-all duration-200",
        dir === "rtl" ? "right-3.5" : "left-3.5"
      )}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isArabic ? "القائمة الرئيسية" : "Main Menu"}
          className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#160f02]/95 backdrop-blur-md border border-[#554625] text-[#f4e5d0] hover:text-[#9e8959] shadow-lg shadow-black/40 cursor-pointer active:scale-95 transition-transform"
        >
          {isOpen ? <X className="w-5 h-5 text-[#9e8959]" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Backdrop for Mobile */}
      {isOpen && (
        <div 
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-black/70 backdrop-blur-xs z-40 lg:hidden animate-backdropFadeIn"
          aria-hidden="true"
        />
      )}

      {/* Sidebar Panel with Direction Awareness */}
      <aside className={cn(
        "fixed lg:sticky top-0 h-screen w-72 bg-[#160f02] text-[#f4e5d0] flex flex-col z-50 transition-transform duration-300 ease-in-out shadow-2xl",
        dir === "rtl"
          ? "right-0 border-l border-[#3d3016] " + (isOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0")
          : "left-0 border-r border-[#3d3016] " + (isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0")
      )}>
        {/* Top Gold Ambient Accent Line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#9e8959] to-transparent z-10" />

        {/* Brand Header */}
        <div className="p-4 sm:p-5 border-b border-[#3d3016] bg-[#1a1204]/60 flex items-center justify-between gap-3 relative">
          <Link 
            href="/"
            onClick={() => {
              setIsOpen(false);
              if (pathname !== "/") startNavigation();
            }}
            className="flex items-center gap-3 min-w-0 group"
          >
            {/* Official Betolla Brand Logo */}
            <div className="relative w-11 h-11 rounded-xl bg-gradient-to-br from-[#241a08] to-[#160f02] border border-[#554625] p-1.5 flex items-center justify-center shadow-lg shadow-black/50 shrink-0 group-hover:border-[#9e8959] transition-colors">
              <img 
                src="/brand/betolla-logo-clean.png" 
                alt="Betolla Cosmetics" 
                className="w-full h-full object-contain filter brightness-0 invert opacity-95 group-hover:opacity-100 transition-opacity"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-base text-white tracking-wide truncate font-heading">
                  BETOLLA
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-[#35270e] text-[#9e8959] border border-[#554625]/60">
                  ERP
                </span>
              </div>
              <p className="text-[11px] text-[#9e8959] font-medium truncate mt-0.5">
                {getRoleSubtitle()}
              </p>
            </div>
          </Link>

          {/* Internal Mobile Close Button */}
          <button
            onClick={() => setIsOpen(false)}
            aria-label={isArabic ? "إغلاق القائمة" : "Close Menu"}
            className="lg:hidden p-2 rounded-xl text-[#f4e5d0]/70 hover:text-white hover:bg-[#241a08] border border-transparent hover:border-[#554625] transition cursor-pointer active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Categories and Links */}
        <nav className="flex-1 p-3 space-y-4 overflow-y-auto hide-scrollbar">
          {visibleCategories.map((category) => (
            <div key={category.id} className="space-y-1">
              {/* Category Header Label */}
              <div className="px-3 pt-2 pb-1 flex items-center justify-between">
                <span className="text-[10px] font-bold text-[#9e8959]/90 tracking-wider uppercase">
                  {isArabic ? category.title : category.enTitle}
                </span>
                <div className="flex-1 h-px bg-gradient-to-r from-[#554625]/50 to-transparent ms-2" />
              </div>

              {/* Category Nav Items */}
              {category.items.map((item) => {
                const Icon = item.icon;
                const isActive = item.href === activeHref;
                const itemTitle = isArabic ? item.title : (item.enTitle || item.title);
                const itemBadge = item.href === "/inventory"
                  ? (productCount !== null ? String(productCount) : undefined)
                  : (isArabic ? item.badge : (item.enBadge || item.badge));

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => {
                      setIsOpen(false);
                      if (pathname !== item.href) {
                        startNavigation();
                      }
                    }}
                    className={cn(
                      "flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 group relative",
                      isActive
                        ? "bg-gradient-to-r from-[#9e8959] via-[#bda66d] to-[#9e8959] text-[#160f02] font-bold shadow-[0_4px_20px_rgba(158,137,89,0.35)] ring-1 ring-white/20"
                        : "text-stone-300 hover:text-[#f4e5d0] hover:bg-[#241a08]/90"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon className={cn(
                        "w-4 h-4 sm:w-5 sm:h-5 shrink-0 transition-transform duration-200 group-hover:scale-110",
                        isActive 
                          ? "text-[#160f02]" 
                          : "text-stone-400 group-hover:text-[#9e8959]"
                      )} />
                      <span className="truncate">{itemTitle}</span>
                    </div>

                    {itemBadge && (
                      <span className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 font-mono transition-colors",
                        isActive
                          ? "bg-[#160f02] text-[#9e8959] shadow-xs"
                          : "bg-[#35270e] text-[#f4e5d0] border border-[#554625]"
                      )}>
                        {itemBadge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User Quick Status & Luxury Footer */}
        <div className="p-3 border-t border-[#3d3016] bg-[#1a1204]/90">
          <div className="rounded-2xl bg-[#241a08] border border-[#554625]/80 p-2.5 flex items-center justify-between gap-2 shadow-inner">
            {/* Clickable Profile Summary */}
            <button
              onClick={() => {
                setIsOpen(false);
                openProfileModal(currentUser?.id || undefined);
              }}
              title={isArabic ? "فتح إعدادات الملف الشخصي" : "Open Profile Settings"}
              className="flex items-center gap-2.5 min-w-0 flex-1 text-right cursor-pointer group"
            >
              <div className="relative shrink-0">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs bg-gradient-to-br from-[#9e8959] to-[#c28a40] text-[#160f02] shadow-md shadow-[#9e8959]/20 group-hover:scale-105 transition-transform">
                  {profile?.avatar || (isArabic ? "ب" : "B")}
                </div>
                {/* Active Online Indicator */}
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#241a08]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-white truncate group-hover:text-[#9e8959] transition-colors">
                  {profile?.name || currentUser?.name || (isArabic ? "مدير النظام" : "Administrator")}
                </div>
                <div className="text-[10px] text-[#f4e5d0]/70 font-mono truncate">
                  {currentUser?.role ? `@${currentUser.role}` : "@admin"}
                </div>
              </div>
            </button>

            {/* Quick Profile Settings Trigger */}
            <button
              onClick={() => {
                setIsOpen(false);
                openProfileModal(currentUser?.id || undefined);
              }}
              title={isArabic ? "إعدادات الحساب" : "Account Settings"}
              aria-label={isArabic ? "إعدادات الحساب" : "Account Settings"}
              className="p-1.5 text-[#f4e5d0]/70 hover:text-[#9e8959] hover:bg-[#35270e] rounded-lg transition cursor-pointer active:scale-95"
            >
              <UserCog className="w-4 h-4" />
            </button>

            {/* Logout Trigger */}
            <button
              onClick={() => {
                setIsOpen(false);
                startLoading({
                  ar: "جاري تسجيل الخروج الآمن...",
                  en: "Signing out securely..."
                });
                logoutUser();
              }}
              title={t("logout")}
              aria-label={t("logout")}
              className="p-1.5 text-[#f4e5d0]/70 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition cursor-pointer active:scale-95"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          {/* Luxury Brand Copyright Stamp */}
          <div className="mt-2 text-center text-[10px] text-[#9e8959]/60 font-mono flex items-center justify-center gap-1">
            <ShieldCheck className="w-3 h-3 text-[#9e8959]/80" />
            <span>BETOLLA COSMETICS &copy; 2026</span>
          </div>
        </div>
      </aside>
    </>
  );
}
