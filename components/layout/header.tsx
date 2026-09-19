"use client";

import { Search, PlusCircle, CheckCircle2, LogOut, UserCog } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { logoutUser, getCurrentUser } from "@/lib/client-api";
import { useLanguage } from "@/lib/i18n";
import { useLoading } from "@/lib/loading-context";
import { useProfile } from "@/lib/profile-context";
import { LanguageSwitcher } from "@/components/common/language-switcher";
import { HeaderCalendarButton } from "@/components/common/header-calendar-button";
import { NotificationBell } from "@/components/layout/notification-bell";
import { HeaderPunchButton } from "@/components/hr/punch-card";
import { useSearch } from "@/lib/search-context";
import type { UserRole } from "@/lib/auth";
import { can } from "@/lib/permissions";

export function Header() {
  const router = useRouter();
  const { startNavigation, startLoading } = useLoading();
  const { profile, openProfileModal } = useProfile();
  const { openSearch } = useSearch();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const { language, dir, t } = useLanguage();
  const isArabic = language === "ar";

  useEffect(() => {
    setCurrentUser(getCurrentUser());
  }, []);

  // Before the role is known (first paint, right after mount) show no privileged quick actions
  // rather than defaulting to "admin". Deliberately currentUser only, not profile?.role — profile
  // starts out pointing at the admin profile until its own effect corrects it (see
  // profile-context.tsx), and reading that here would just reintroduce the same brief "admin" flash.
  const userRole: UserRole | null = (currentUser?.role || null) as UserRole | null;
  const canCreateOrder = can(userRole, "orders.create");
  // Whose screens are scoped to a day, and therefore need the day picker: the call queue (sales),
  // the delivery board (Diya) and the end-of-day reconciliation (finance).
  const canBrowseDays = !!userRole &&
    ["admin", "general_manager", "sales_manager", "sales_rep", "marketing_manager", "marketing", "driver_manager", "finance"].includes(userRole);

  return (
    <header className="sticky top-0 z-30 h-16 bg-[#faf7f2]/85 backdrop-blur-xl backdrop-saturate-150 border-b border-[#e8dfcf] px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-3 transition-colors">
      {/* Search Bar with space for mobile menu toggle */}
      <div className={`flex-1 min-w-0 max-w-xs sm:max-w-md ${dir === "rtl" ? "pr-12 lg:pr-0" : "pl-12 lg:pl-0"}`}>
        <button
          type="button"
          onClick={() => openSearch()}
          className={`w-full flex items-center justify-between ${
            dir === "rtl" ? "pr-3 pl-2.5 sm:pr-3.5 sm:pl-3" : "pl-3 pr-2.5 sm:pl-3.5 sm:pr-3"
          } py-1.5 sm:py-2 text-xs sm:text-sm bg-white/95 hover:bg-white border border-[#e8dfcf] hover:border-[#9e8959] rounded-xl text-[#2b2926] shadow-2xs hover:shadow-xs transition-all cursor-pointer group active:scale-[0.99]`}
          title={isArabic ? "البحث الفوري عن الطلبات برقم الهاتف أو الاسم (Ctrl+K)" : "Search orders by phone or name (Ctrl+K)"} aria-label={isArabic ? "البحث الفوري عن الطلبات برقم الهاتف أو الاسم (Ctrl+K)" : "Search orders by phone or name (Ctrl+K)"}
        >
          <div className="flex items-center gap-2 min-w-0 truncate">
            <Search className="w-4 h-4 text-[#9e8959] shrink-0 group-hover:scale-110 transition-transform" />
            <span className="text-stone-500 group-hover:text-stone-700 truncate font-medium">
              {isArabic ? "ابحث برقم الهاتف أو الطلب..." : "Search orders by phone..."}
            </span>
          </div>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-bold font-mono text-[#9e8959] bg-[#faf7f2] border border-[#e8dfcf] group-hover:border-[#9e8959]/50 rounded-md shrink-0 shadow-2xs">
            Ctrl K
          </kbd>
        </button>
      </div>

      {/* Quick Actions & Language Switcher */}
      <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 shrink-0">
        {/* Full English / Arabic Language Switcher Button */}
        <LanguageSwitcher variant="default" />

        {/* Day picker — shown to the roles whose screens are scoped to a single day */}
        {canBrowseDays && <HeaderCalendarButton />}

        {/* HR self-service check-in/out (only for accounts linked to an employee file) */}
        <HeaderPunchButton />

        {/* Notifications (real, per-user, database-backed) */}
        <NotificationBell />

        {/* Profile Settings Quick Button */}
        <button
          onClick={() => {
            openProfileModal();
          }}
          title={isArabic ? "إعدادات الملف الشخصي وتعديل البيانات" : "Profile Settings"}
          aria-label={isArabic ? "الملف الشخصي" : "Profile Settings"}
          className="hidden sm:flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl border border-[#e8dfcf] hover:border-[#9e8959] bg-white/80 hover:bg-[#f0e6d6]/60 text-[#2b2926] text-xs font-semibold active:scale-95 transition-all cursor-pointer shadow-2xs shrink-0"
        >
          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#9e8959] to-[#c28a40] text-[#160f02] font-black text-[10px] flex items-center justify-center shrink-0 shadow-xs">
            {currentUser?.name?.charAt(0) || profile?.avatar || (isArabic ? "ب" : "B")}
          </div>
          <span className="hidden md:inline max-w-[90px] truncate">{currentUser?.name || profile?.name || (isArabic ? "حسابي" : "Profile")}</span>
          <UserCog className="w-3.5 h-3.5 text-[#9e8959] hidden md:inline" />
        </button>

        {/* Quick New Order Button - Only for Sales & Admin roles */}
        {canCreateOrder && (
          <button 
            onClick={() => {
              startNavigation();
              router.push("/orders?new=true");
            }}
            title={t("new_order")} aria-label={t("new_order")}
            className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 bg-gradient-to-r from-[#9e8959] via-[#bda66d] to-[#9e8959] hover:from-[#bda66d] hover:to-[#9e8959] text-[#160f02] font-bold text-xs rounded-xl shadow-md shadow-[#9e8959]/25 active:scale-95 transition-all cursor-pointer shrink-0"
          >
            <PlusCircle className="w-4 h-4" />
            <span className="hidden md:inline">{t("new_order")}</span>
          </button>
        )}

        {/* Sync Status Badge - Betolla Luxury Green */}
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#533f16]/10 border border-[#533f16]/25 text-[#533f16] text-xs font-semibold shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5 text-[#533f16]" />
          <span>{t("system_online")}</span>
        </div>

        {/* Logout Quick Button */}
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
          className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl border border-[#e8dfcf] text-[#6b655d] hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 text-xs font-medium active:scale-95 transition-all cursor-pointer shrink-0 bg-white"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden md:inline">{t("logout_short")}</span>
        </button>
      </div>
    </header>
  );
}
