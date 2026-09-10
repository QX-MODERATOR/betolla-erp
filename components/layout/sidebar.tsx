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
  ClipboardList
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
  // Which roles can see this item. If omitted, admin/sales_manager can see it.
  roles?: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  {
    title: "لوحة التحكم",
    enTitle: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
    roles: ["admin", "sales_manager"],
  },
  {
    title: "بوابة المندوبين (Sales App)",
    enTitle: "Sales Rep Portal",
    href: "/sales",
    icon: Sparkles,
    badge: "تطبيق المبيعات",
    enBadge: "Sales App",
    roles: ["admin", "sales_manager", "sales_rep"],
  },
  {
    title: "العملاء والليدات",
    enTitle: "CRM & Customers",
    href: "/customers",
    icon: Users,
    badge: "45K+",
    enBadge: "45K+",
    roles: ["admin", "sales_manager", "sales_rep"],
  },
  {
    title: "متابعة المكالمات",
    enTitle: "Call Schedule",
    href: "/calls",
    icon: PhoneCall,
    badge: "اليوم",
    enBadge: "Today",
    roles: ["admin", "sales_manager", "sales_rep"],
  },
  {
    title: "إدارة الطلبات",
    enTitle: "Orders",
    href: "/orders",
    icon: ShoppingCart,
    roles: ["admin", "sales_manager", "sales_rep", "driver_manager"],
  },
  {
    title: "إدارة السائقين",
    enTitle: "Driver Management",
    href: "/drivers",
    icon: Truck,
    badge: "اليوم",
    enBadge: "Today",
    roles: ["admin", "sales_manager", "driver_manager"],
  },
  {
    title: "طلبات التوصيل",
    enTitle: "My Deliveries",
    href: "/driver",
    icon: ClipboardList,
    roles: ["driver"],
  },
  {
    title: "المنتجات والمخزون",
    enTitle: "Inventory",
    href: "/inventory",
    icon: Package,
    badge: "31",
    enBadge: "31",
    roles: ["admin", "sales_manager", "driver_manager"],
  },
  {
    title: "المالية والفواتير",
    enTitle: "Finance",
    href: "/finance",
    icon: Receipt,
    roles: ["admin", "sales_manager", "finance"],
  },
  {
    title: "تقارير الأداء",
    enTitle: "Analytics",
    href: "/analytics",
    icon: BarChart3,
    roles: ["admin", "sales_manager", "finance"],
  },
  {
    title: "الإعدادات",
    enTitle: "Settings",
    href: "/settings",
    icon: Settings,
    roles: ["admin"],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const { language, dir, t } = useLanguage();
  const { startNavigation, startLoading } = useLoading();
  const { profile, openProfileModal } = useProfile();
  const isArabic = language === "ar";

  useEffect(() => {
    setCurrentUser(getCurrentUser());
  }, []);

  const userRole: UserRole = (currentUser?.role || profile?.role || "admin") as UserRole;

  // Role-Based Access Control on Navigation Links
  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (!item.roles) return userRole === "admin" || userRole === "sales_manager";
    return item.roles.includes(userRole);
  });

  // Subtitle based on role
  const getRoleSubtitle = () => {
    switch (userRole) {
      case "sales_rep": return t("sales_portal_sub");
      case "driver_manager": return isArabic ? "إدارة التوصيل والسائقين" : "Driver Management";
      case "driver": return isArabic ? "تطبيق التوصيل" : "Delivery App";
      case "finance": return isArabic ? "القسم المالي" : "Finance Department";
      default: return t("brand_subtitle");
    }
  };

  return (
    <>
      {/* Mobile Menu Toggle Button */}
      <div className={cn(
        "lg:hidden fixed top-3 z-50 bg-white/90 backdrop-blur shadow-md rounded-xl p-2 border border-stone-200",
        dir === "rtl" ? "right-3" : "left-3"
      )}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isArabic ? "القائمة" : "Menu"}
          className="text-stone-700 hover:text-stone-900 cursor-pointer"
        >
          {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Backdrop for Mobile */}
      {isOpen && (
        <div 
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 lg:hidden"
        />
      )}

      {/* Sidebar Panel with Direction Awareness */}
      <aside className={cn(
        "fixed lg:sticky top-0 h-screen w-72 bg-stone-900 text-stone-100 flex flex-col z-40 transition-transform duration-300 ease-in-out",
        dir === "rtl"
          ? "right-0 border-l border-stone-800 " + (isOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0")
          : "left-0 border-r border-stone-800 " + (isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0")
      )}>
        {/* Brand Header */}
        <div className="p-5 border-b border-stone-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center text-stone-950 font-bold shadow-lg shadow-amber-500/20 shrink-0">
            <Sparkles className="w-5 h-5 text-stone-950" />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-lg text-white tracking-wide truncate">
              {t("brand_title")}
            </h1>
            <p className="text-xs text-amber-400 font-medium truncate">
              {getRoleSubtitle()}
            </p>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-3.5 space-y-1.5 overflow-y-auto">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href + "/"));
            const itemTitle = isArabic ? item.title : (item.enTitle || item.title);
            const itemBadge = isArabic ? item.badge : (item.enBadge || item.badge);

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
                  "flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all group",
                  isActive
                    ? "bg-amber-500 text-stone-950 font-semibold shadow-md shadow-amber-500/25"
                    : "text-stone-300 hover:bg-stone-800/80 hover:text-white"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={cn(
                    "w-5 h-5 shrink-0 transition-transform group-hover:scale-110",
                    isActive ? "text-stone-950" : "text-stone-400 group-hover:text-amber-400"
                  )} />
                  <span className="truncate">{itemTitle}</span>
                </div>
                {itemBadge && (
                  <span className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 font-mono",
                    isActive
                      ? "bg-stone-950 text-amber-400"
                      : "bg-stone-800 text-amber-400 border border-amber-500/20"
                  )}>
                    {itemBadge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Quick Status & Logout */}
        <div className="p-3 border-t border-stone-800 bg-stone-950/60 flex items-center justify-between gap-2">
          {/* Clickable Profile Summary */}
          <button
            onClick={() => openProfileModal(currentUser?.username || undefined)}
            title={isArabic ? "فتح إعدادات الملف الشخصي" : "Open Profile Settings"}
            className="flex items-center gap-2.5 min-w-0 flex-1 p-1 -m-1 rounded-xl hover:bg-stone-850/80 transition text-right cursor-pointer"
          >
            <div className={cn(
              "w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0",
              "bg-amber-500 text-stone-950 shadow-md shadow-amber-500/20"
            )}>
              {profile?.avatar || (isArabic ? "أ" : "A")}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-white truncate hover:text-amber-400 transition">
                {profile?.name || currentUser?.name || t("admin_title")}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <span className="text-[10px] text-amber-400 font-mono truncate">
                  {profile?.email || currentUser?.username || "betolla"}
                </span>
              </div>
            </div>
          </button>

          {/* Profile Settings Quick Button */}
          <button
            onClick={() => openProfileModal(currentUser?.username || undefined)}
            title={isArabic ? "إعدادات الحساب" : "Account Settings"}
            aria-label={isArabic ? "إعدادات الحساب" : "Account Settings"}
            className="p-2 text-stone-400 hover:text-amber-400 hover:bg-stone-900 rounded-lg transition cursor-pointer"
          >
            <UserCog className="w-4 h-4" />
          </button>

          {/* Logout Button */}
          <button
            onClick={() => {
              startLoading({
                ar: "جاري تسجيل الخروج الآمن...",
                en: "Signing out securely..."
              });
              logoutUser();
            }}
            title={t("logout")}
            aria-label={t("logout")}
            className="p-2 text-stone-400 hover:text-rose-400 hover:bg-stone-900 rounded-lg transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>
    </>
  );
}
