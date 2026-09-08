"use client";

import { Search, Calendar, PlusCircle, CheckCircle2, LogOut } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { logoutUser } from "@/lib/client-api";
import { useLanguage } from "@/lib/i18n";
import { useLoading } from "@/lib/loading-context";
import { LanguageSwitcher } from "@/components/common/language-switcher";

export function Header() {
  const router = useRouter();
  const { startNavigation, startLoading } = useLoading();
  const [searchTerm, setSearchTerm] = useState("");
  const { language, dir, t } = useLanguage();

  const currentDate = new Date().toLocaleDateString(language === "ar" ? "ar-JO" : "en-US", { 
    weekday: "long", 
    year: "numeric", 
    month: "long", 
    day: "numeric" 
  });

  return (
    <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur border-b border-stone-200 px-4 sm:px-6 flex items-center justify-between gap-3">
      {/* Search Bar with space for mobile menu toggle */}
      <div className={`flex-1 max-w-md ${dir === "rtl" ? "pr-12 lg:pr-0" : "pl-12 lg:pl-0"}`}>
        <div className="relative">
          <Search className={`absolute ${dir === "rtl" ? "right-3.5" : "left-3.5"} top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400`} />
          <input
            type="text"
            placeholder={t("search_placeholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full ${dir === "rtl" ? "pr-10 pl-4" : "pl-10 pr-4"} py-2 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-stone-800 transition`}
          />
        </div>
      </div>

      {/* Quick Actions & Language Switcher */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Full English / Arabic Language Switcher Button */}
        <LanguageSwitcher variant="default" />

        {/* Date Display */}
        <div className="hidden lg:flex items-center gap-2 text-xs font-medium text-stone-500 bg-stone-100 px-3 py-1.5 rounded-lg border border-stone-200">
          <Calendar className="w-3.5 h-3.5 text-amber-600" />
          <span>{currentDate}</span>
        </div>

        {/* Quick New Order Button */}
        <button 
          onClick={() => {
            startNavigation();
            router.push("/orders?new=true");
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-stone-950 font-semibold text-xs rounded-xl shadow-xs transition cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" />
          <span className="hidden sm:inline">{t("new_order")}</span>
        </button>

        {/* Sync Status Badge */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
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
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-stone-200 text-stone-600 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 text-xs font-medium transition cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t("logout_short")}</span>
        </button>
      </div>
    </header>
  );
}

