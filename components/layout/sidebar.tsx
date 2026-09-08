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
  X
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  {
    title: "لوحة التحكم",
    enTitle: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    title: "العملاء والليدات",
    enTitle: "CRM & Customers",
    href: "/customers",
    icon: Users,
    badge: "45K+",
  },
  {
    title: "متابعة المكالمات",
    enTitle: "Call Schedule",
    href: "/calls",
    icon: PhoneCall,
    badge: "اليوم",
  },
  {
    title: "إدارة الطلبات",
    enTitle: "Orders",
    href: "/orders",
    icon: ShoppingCart,
  },
  {
    title: "المنتجات والمخزون",
    enTitle: "Inventory",
    href: "/inventory",
    icon: Package,
    badge: "31",
  },
  {
    title: "المالية والفواتير",
    enTitle: "Finance",
    href: "/finance",
    icon: Receipt,
  },
  {
    title: "تقارير الأداء",
    enTitle: "Analytics",
    href: "/analytics",
    icon: BarChart3,
  },
  {
    title: "الإعدادات",
    enTitle: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Mobile Menu Toggle Button */}
      <div className="lg:hidden fixed top-3 right-3 z-50 bg-white/90 backdrop-blur shadow-md rounded-xl p-2 border border-stone-200">
        <button
          onClick={() => setIsOpen(!isOpen)}
          aria-label="القائمة"
          className="text-stone-700 hover:text-stone-900"
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

      {/* Sidebar Panel */}
      <aside className={cn(
        "fixed lg:sticky top-0 right-0 h-screen w-72 bg-stone-900 text-stone-100 flex flex-col border-l border-stone-800 z-40 transition-transform duration-300 ease-in-out",
        isOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
      )}>
        {/* Brand Header */}
        <div className="p-5 border-b border-stone-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center text-stone-950 font-bold shadow-lg shadow-amber-500/20">
            <Sparkles className="w-5 h-5 text-stone-950" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-white tracking-wide">بيتولا كوزمتكس</h1>
            <p className="text-xs text-amber-400/90 font-medium">نظام الإدارة المتكامل ERP</p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={cn(
                  "flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all group",
                  isActive
                    ? "bg-amber-500 text-stone-950 font-semibold shadow-md shadow-amber-500/25"
                    : "text-stone-300 hover:bg-stone-800/80 hover:text-white"
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className={cn(
                    "w-5 h-5 transition-transform group-hover:scale-110",
                    isActive ? "text-stone-950" : "text-stone-400 group-hover:text-amber-400"
                  )} />
                  <span>{item.title}</span>
                </div>
                {item.badge && (
                  <span className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full font-semibold",
                    isActive
                      ? "bg-stone-950 text-amber-400"
                      : "bg-stone-800 text-amber-400 border border-amber-500/20"
                  )}>
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sales Rep / User Quick Status */}
        <div className="p-4 border-t border-stone-800 bg-stone-950/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center font-bold text-sm">
              أدمن
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-stone-200 truncate">إدارة المبيعات المركزية</p>
              <p className="text-xs text-stone-400 truncate">Betolla Admin Panel</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
