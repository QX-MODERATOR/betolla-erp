"use client";

import { Search, PlusCircle, CheckCircle2, LogOut, UserCog } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { logoutUser } from "@/lib/client-api";
import { useLanguage } from "@/lib/i18n";
import { useLoading } from "@/lib/loading-context";
import { useProfile } from "@/lib/profile-context";
import { LanguageSwitcher } from "@/components/common/language-switcher";
import { HeaderCalendarButton } from "@/components/common/header-calendar-button";

export function Header() {
  const router = useRouter();
  const { startNavigation, startLoading } = useLoading();
  const { profile, openProfileModal } = useProfile();
  const [searchTerm, setSearchTerm] = useState("");
  const { language, dir, t } = useLanguage();
  const isArabic = language === "ar";

  return (
    <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur border-b border-stone-200 px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-3">
      {/* Search Bar with space for mobile menu toggle */}
      <div className={`flex-1 min-w-0 max-w-xs sm:max-w-md ${dir === "rtl" ? "pr-11 lg:pr-0" : "pl-11 lg:pl-0"}`}>
        <div className="relative">
          <Search className={`absolute ${dir === "rtl" ? "right-3 sm:right-3.5" : "left-3 sm:left-3.5"} top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400`} />
          <input
            type="text"
            placeholder={t("search_placeholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full ${dir === "rtl" ? "pr-9 pl-3 sm:pr-10 sm:pl-4" : "pl-9 pr-3 sm:pl-10 sm:pr-4"} py-1.5 sm:py-2 text-xs sm:text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-stone-800 transition`}
          />
        </div>
      </div>

      {/* Quick Actions & Language Switcher */}
      <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 shrink-0">
        {/* Full English / Arabic Language Switcher Button */}
        <LanguageSwitcher variant="default" />

        {/* Interactive Calendar of Days Button (Requested Class) */}
        <HeaderCalendarButton />

        {/* Profile Settings Quick Button - hidden on small mobile, accessible via sidebar on mobile */}
        <button
          onClick={() => {
            const isSales = typeof window !== "undefined" && window.location.pathname.includes("/sales");
            openProfileModal(isSales ? "rahma" : undefined);
          }}
          title={isArabic ? "إعدادات الملف الشخصي وتعديل البيانات" : "Profile Settings"}
          aria-label={isArabic ? "الملف الشخصي" : "Profile Settings"}
          className="hidden sm:flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl border border-stone-200 hover:border-amber-400 bg-stone-50/80 hover:bg-amber-50/60 text-stone-700 hover:text-stone-900 text-xs font-semibold transition cursor-pointer shadow-2xs shrink-0"
        >
          <div className="w-4 h-4 rounded-full bg-amber-500 text-stone-950 font-bold text-[10px] flex items-center justify-center shrink-0">
            {profile?.avatar || (isArabic ? "ر" : "R")}
          </div>
          <span className="hidden md:inline max-w-[90px] truncate">{profile?.name || (isArabic ? "حسابي" : "Profile")}</span>
          <UserCog className="w-3.5 h-3.5 text-amber-600 hidden md:inline" />
        </button>

        {/* Quick New Order Button */}
        <button 
          onClick={() => {
            startNavigation();
            router.push("/orders?new=true");
          }}
          title={t("new_order")}
          className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-stone-950 font-semibold text-xs rounded-xl shadow-xs transition cursor-pointer shrink-0"
        >
          <PlusCircle className="w-4 h-4" />
          <span className="hidden md:inline">{t("new_order")}</span>
        </button>

        {/* Sync Status Badge */}
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5" />
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
          className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl border border-stone-200 text-stone-600 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 text-xs font-medium transition cursor-pointer shrink-0"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden md:inline">{t("logout_short")}</span>
        </button>
      </div>
    </header>
  );
}


