"use client";

import { Globe } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

interface LanguageSwitcherProps {
  variant?: "default" | "compact" | "pill";
  className?: string;
}

export function LanguageSwitcher({ variant = "default", className = "" }: LanguageSwitcherProps) {
  const { language, toggleLanguage, t } = useLanguage();
  const isArabic = language === "ar";

  if (variant === "compact") {
    return (
      <button
        onClick={toggleLanguage}
        title={isArabic ? "Switch to English" : "التحويل إلى العربية"}
        aria-label={isArabic ? "Switch to English" : "التحويل إلى العربية"}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-stone-200 hover:border-amber-400 bg-white hover:bg-amber-50/50 text-stone-700 hover:text-amber-700 text-xs font-bold transition shadow-xs cursor-pointer ${className}`}
      >
        <Globe className="w-3.5 h-3.5 text-amber-500" />
        <span className="font-mono">{isArabic ? "EN" : "عربي"}</span>
      </button>
    );
  }

  if (variant === "pill") {
    return (
      <button
        onClick={toggleLanguage}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-500/30 bg-stone-900/80 hover:bg-stone-850 text-amber-400 hover:text-amber-300 text-xs font-semibold backdrop-blur shadow-sm transition cursor-pointer ${className}`}
      >
        <Globe className="w-3.5 h-3.5 text-amber-400" />
        <span>{isArabic ? "Switch to English (LTR)" : "التحويل إلى العربية (RTL)"}</span>
      </button>
    );
  }

  return (
    <button
      onClick={toggleLanguage}
      title={isArabic ? "Switch to English" : "التحويل إلى العربية"}
      aria-label={isArabic ? "Switch to English" : "التحويل إلى العربية"}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border border-stone-200 hover:border-amber-400 bg-stone-50/80 hover:bg-amber-50/60 text-stone-700 hover:text-stone-900 text-xs font-bold transition shadow-2xs cursor-pointer ${className}`}
    >
      <Globe className="w-3.5 h-3.5 text-amber-500 shrink-0" />
      <span>{t("switch_lang_label")}</span>
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-800 font-mono">
        {isArabic ? "EN" : "عربي"}
      </span>
    </button>
  );
}
