"use client";

import { useLoading } from "@/lib/loading-context";
import { useLanguage } from "@/lib/i18n";
import { Sparkles, ShieldCheck } from "lucide-react";

export function LoadingOverlay() {
  const { isLoading, loadingMessage } = useLoading();
  const { language, dir, t } = useLanguage();
  const isArabic = language === "ar";

  if (!isLoading) return null;

  // Resolve message text
  let messageText = t("loading_default") || (isArabic ? "جاري المعالجة الآمنة وتحديث البيانات..." : "Processing securely & updating data...");
  if (typeof loadingMessage === "string") {
    messageText = loadingMessage;
  } else if (loadingMessage && typeof loadingMessage === "object") {
    messageText = isArabic 
      ? (loadingMessage.ar || loadingMessage.en || messageText)
      : (loadingMessage.en || loadingMessage.ar || messageText);
  }

  const subText = isArabic
    ? "يرجى الانتظار، جاري إتمام العملية بأعلى معايير الأمان..."
    : "Please wait, finalizing transaction securely...";

  const securityBadge = isArabic
    ? "معالجة فورية مشفرة ومحمية"
    : "Encrypted Realtime Operation";

  return (
    <div
      role="status"
      aria-live="assertive"
      aria-busy="true"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-stone-950/75 backdrop-blur-md transition-all duration-300 animate-fadeIn"
      dir={dir}
    >
      {/* Background ambient lighting */}
      <div className="absolute w-72 h-72 bg-amber-500/15 rounded-full blur-3xl pointer-events-none -translate-y-4" />

      {/* Main luxury card */}
      <div className="relative w-full max-w-sm rounded-3xl bg-gradient-to-b from-stone-900/95 via-stone-900/98 to-stone-950/98 border border-amber-500/30 p-7 sm:p-8 shadow-2xl shadow-amber-500/20 text-center overflow-hidden ring-1 ring-white/10">
        
        {/* Top gold shimmer bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-amber-400 to-transparent" />

        {/* Brand logo & dual glowing rings */}
        <div className="relative flex items-center justify-center mx-auto mb-5 w-20 h-20">
          {/* Outer Ring */}
          <div className="absolute inset-0 rounded-full border-2 border-amber-500/20 border-t-amber-400 border-r-amber-400 animate-spin" />
          
          {/* Inner Counter-Rotating Ring */}
          <div className="absolute inset-2 rounded-full border-2 border-amber-400/25 border-b-amber-300 border-l-amber-300 animate-spin [animation-direction:reverse] [animation-duration:1.3s]" />
          
          {/* Center glowing badge */}
          <div className="relative flex items-center justify-center w-11 h-11 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 shadow-lg shadow-amber-500/40 text-stone-950">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
        </div>

        {/* Brand Subtitle */}
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-[10px] font-mono font-bold tracking-widest text-amber-400 uppercase mb-3">
          <span>BETOLLA COSMETICS</span>
        </div>

        {/* Dynamic Loading Message */}
        <h3 className="text-base sm:text-lg font-bold text-stone-100 leading-snug">
          {messageText}
        </h3>

        {/* Subtitle / Reassurance */}
        <p className="text-xs text-stone-400 mt-2 font-normal">
          {subText}
        </p>

        {/* Animated Progress Track */}
        <div className="relative mt-6 w-full h-1.5 bg-stone-800/90 rounded-full overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-400 to-transparent animate-shimmer" />
        </div>

        {/* Security / System Footer */}
        <div className="mt-5 pt-4 border-t border-stone-800/80 flex items-center justify-center gap-1.5 text-[11px] text-stone-400">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>{securityBadge}</span>
        </div>
      </div>
    </div>
  );
}
