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
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md transition-all duration-300 animate-fadeIn"
      dir={dir}
    >
      {/* Background ambient gold lighting */}
      <div className="absolute w-80 h-80 bg-[#9e8959]/15 rounded-full blur-3xl pointer-events-none -translate-y-4" />

      {/* Main luxury Betolla card */}
      <div className="relative w-full max-w-sm rounded-3xl bg-gradient-to-b from-[#160f02]/98 via-[#241a08]/98 to-[#160f02]/98 border border-[#554625] p-7 sm:p-8 shadow-2xl shadow-black/80 text-center overflow-hidden ring-1 ring-white/10">
        
        {/* Top gold shimmer bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#9e8959] to-transparent" />

        {/* Brand logo & dual glowing rings */}
        <div className="relative flex items-center justify-center mx-auto mb-5 w-20 h-20">
          {/* Outer Ring */}
          <div className="absolute inset-0 rounded-full border-2 border-[#554625]/40 border-t-[#9e8959] border-r-[#bda66d] animate-spin" />
          
          {/* Inner Counter-Rotating Ring */}
          <div className="absolute inset-2 rounded-full border-2 border-[#9e8959]/30 border-b-[#f4e5d0] border-l-[#ffd9a1] animate-spin [animation-direction:reverse] [animation-duration:1.3s]" />
          
          {/* Center glowing badge */}
          <div className="relative flex items-center justify-center w-11 h-11 rounded-full bg-gradient-to-br from-[#9e8959] to-[#c28a40] shadow-lg shadow-[#9e8959]/40 text-[#160f02]">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
        </div>

        {/* Brand Subtitle Pill */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#35270e] border border-[#554625] text-[10px] font-mono font-bold tracking-widest text-[#f4e5d0] uppercase mb-3 shadow-xs">
          <span>BETOLLA COSMETICS</span>
        </div>

        {/* Dynamic Loading Message */}
        <h3 className="text-base sm:text-lg font-bold text-white leading-snug font-sans">
          {messageText}
        </h3>

        {/* Subtitle / Reassurance */}
        <p className="text-xs text-[#f4e5d0]/70 mt-2 font-normal">
          {subText}
        </p>

        {/* Animated Progress Track */}
        <div className="relative mt-6 w-full h-1.5 bg-[#160f02] border border-[#554625]/50 rounded-full overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#9e8959] to-transparent animate-shimmer" />
        </div>

        {/* Security / System Footer */}
        <div className="mt-5 pt-4 border-t border-[#3d3016] flex items-center justify-center gap-1.5 text-[11px] text-[#f4e5d0]/70 font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>{securityBadge}</span>
        </div>
      </div>
    </div>
  );
}
