"use client";

import { useState, useRef, useEffect } from "react";
import { Calendar, ChevronDown, Check, Clock, History, X, Sparkles } from "lucide-react";
import { useDateFilter, TODAY_DATE } from "@/lib/date-context";
import { useLanguage } from "@/lib/i18n";
import { useLoading } from "@/lib/loading-context";

export function HeaderCalendarButton() {
  const { selectedDate, setSelectedDate, resetToToday, formattedDateLabel, isToday } = useDateFilter();
  const { startLoading, stopLoading } = useLoading();
  const { language, dir } = useLanguage();
  const isArabic = language === "ar";

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleSelectDate = (date: string, label: string) => {
    setIsOpen(false);
    if (date === selectedDate) return;

    startLoading({
      ar: `جاري تحميل أرقام وسجل اتصالات يوم (${label})...`,
      en: `Loading calling queue for (${label})...`,
    });

    setTimeout(() => {
      setSelectedDate(date);
      stopLoading();
    }, 350);
  };

  // Quick preset dates
  const PRESETS = [
    {
      date: "2026-09-08",
      labelAr: "اليوم (الثلاثاء، ٨ أيلول)",
      labelEn: "Today (Tue, Sep 8)",
      badge: isArabic ? "نشط" : "Live",
      badgeColor: "bg-emerald-500 text-white",
    },
    {
      date: "2026-09-07",
      labelAr: "أمس (الإثنين، ٧ أيلول)",
      labelEn: "Yesterday (Mon, Sep 7)",
      badge: isArabic ? "سجل أمس" : "Yesterday",
      badgeColor: "bg-amber-500 text-stone-950 font-bold",
    },
    {
      date: "2026-09-06",
      labelAr: "أول أمس (الأحد، ٦ أيلول)",
      labelEn: "2 Days Ago (Sun, Sep 6)",
      badge: isArabic ? "مكتمل" : "Logged",
      badgeColor: "bg-stone-200 text-stone-700",
    },
    {
      date: "2026-09-05",
      labelAr: "السبت، ٥ أيلول ٢٠٢٦",
      labelEn: "Sat, Sep 5, 2026",
      badge: isArabic ? "أرشيف" : "Archived",
      badgeColor: "bg-stone-200 text-stone-700",
    },
    {
      date: "2026-09-03",
      labelAr: "الخميس، ٣ أيلول ٢٠٢٦",
      labelEn: "Thu, Sep 3, 2026",
      badge: isArabic ? "أرشيف" : "Archived",
      badgeColor: "bg-stone-200 text-stone-700",
    },
    {
      date: "2026-09-01",
      labelAr: "الثلاثاء، ١ أيلول (بداية الشهر)",
      labelEn: "Tue, Sep 1 (Month Start)",
      badge: isArabic ? "أرشيف" : "Archived",
      badgeColor: "bg-stone-200 text-stone-700",
    },
  ];

  // September 2026 days (1 to 30)
  // Sep 1, 2026 is a Tuesday (index 2 in Sun=0, Mon=1, Tue=2)
  const sepDays = Array.from({ length: 30 }, (_, i) => i + 1);

  return (
    <div className="relative" ref={containerRef}>
      {/* 
        This is the exact requested styling class, upgraded with interactive hover, 
        active status highlight, and click behavior
      */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title={isArabic ? "اضغطي لاختيار يوم محدد وعرض أرقام الأمس أو الأيام السابقة" : "Click to view yesterday or older days' calling queue"}
        aria-label={isArabic ? "تقويم الأيام" : "Calendar of days"}
        className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg border transition shadow-xs cursor-pointer ${
          !isToday
            ? "bg-amber-500/15 border-amber-400 text-amber-900 font-bold hover:bg-amber-500/20"
            : "text-stone-700 bg-stone-100 hover:bg-stone-200/80 border-stone-200"
        }`}
      >
        <Calendar className={`w-3.5 h-3.5 ${!isToday ? "text-amber-700" : "text-amber-600"}`} />
        <span className="truncate max-w-[150px] sm:max-w-none">
          {formattedDateLabel}
        </span>
        {!isToday && (
          <span className="hidden sm:inline-block text-[10px] px-1.5 py-0.2 rounded bg-amber-500 text-stone-950 font-bold">
            {isArabic ? "أمس / سابق" : "Past"}
          </span>
        )}
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Calendar of Days Dropdown Dialog */}
      {isOpen && (
        <div
          className={`absolute top-full mt-2 ${
            dir === "rtl" ? "right-0 sm:right-auto sm:left-0" : "left-0 sm:left-auto sm:right-0"
          } w-[340px] sm:w-[380px] bg-white rounded-2xl shadow-2xl border border-stone-200 p-4 z-50 animate-fadeIn text-stone-900`}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-700">
                <History className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-stone-900 leading-none">
                  {isArabic ? "تقويم أيام العمل وقوائم الاتصال" : "Calling Calendar & Archives"}
                </h4>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  {isArabic ? "اختاري يوماً لعرض أرقام الأمس أو الأيام السابقة" : "Access yesterday or previous days' queues"}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Presets Chips */}
          <div className="mt-3">
            <p className="text-[11px] font-bold text-stone-400 uppercase tracking-wider mb-2">
              {isArabic ? "⚡ وصول سريع لأيام الأسبوع:" : "⚡ QUICK PRESETS:"}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {PRESETS.map((preset) => {
                const isSelected = selectedDate === preset.date;
                return (
                  <button
                    key={preset.date}
                    onClick={() => handleSelectDate(preset.date, isArabic ? preset.labelAr : preset.labelEn)}
                    className={`flex items-center justify-between p-2 rounded-xl text-xs text-right transition cursor-pointer ${
                      isSelected
                        ? "bg-amber-500 text-stone-950 font-bold shadow-xs border border-amber-600"
                        : "bg-stone-50 hover:bg-amber-50/70 border border-stone-200 text-stone-700"
                    }`}
                  >
                    <span className="truncate">{isArabic ? preset.labelAr : preset.labelEn}</span>
                    {isSelected ? (
                      <Check className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${preset.badgeColor}`}>
                        {preset.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interactive September 2026 Calendar Grid */}
          <div className="mt-4 pt-3 border-t border-stone-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-stone-800">
                {isArabic ? "أيلول (سبتمبر) ٢٠٢٦" : "September 2026"}
              </span>
              <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                {isArabic ? "الشهر الحالي" : "Current Month"}
              </span>
            </div>

            {/* Days of Week Header */}
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-stone-400 mb-1">
              {(isArabic ? ["ح", "ن", "ث", "ر", "خ", "ج", "س"] : ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]).map((d, idx) => (
                <div key={idx} className="py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar Days Matrix */}
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {/* Offset for Sep 1 (Tuesday = offset 2 from Sunday) */}
              <div className="py-1.5" />
              <div className="py-1.5" />

              {sepDays.map((dayNum) => {
                const dateStr = `2026-09-${String(dayNum).padStart(2, "0")}`;
                const isSelected = selectedDate === dateStr;
                const isTodayDay = dateStr === TODAY_DATE;
                const isPast = dayNum < 8;
                const isFuture = dayNum > 8;

                return (
                  <button
                    key={dayNum}
                    onClick={() => {
                      if (isFuture) {
                        alert(isArabic ? "هذا التاريخ في المستقبل، يمكنك فقط استعراض أيام اليوم والأيام السابقة." : "Future dates have no past call logs.");
                        return;
                      }
                      handleSelectDate(
                        dateStr,
                        isArabic ? `${dayNum} أيلول ٢٠٢٦` : `Sep ${dayNum}, 2026`
                      );
                    }}
                    className={`py-1.5 rounded-lg font-mono text-xs transition relative cursor-pointer ${
                      isSelected
                        ? "bg-amber-500 text-stone-950 font-bold shadow-xs scale-105"
                        : isTodayDay
                        ? "bg-amber-100 text-amber-900 font-bold border border-amber-400"
                        : isPast
                        ? "hover:bg-amber-50 text-stone-800 font-medium"
                        : "text-stone-300 hover:bg-stone-50 cursor-not-allowed opacity-50"
                    }`}
                  >
                    <span>{dayNum}</span>
                    {/* Activity dot for past active calling days */}
                    {[7, 6, 5, 4, 3, 2, 1].includes(dayNum) && !isSelected && (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-amber-500" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reset Action */}
          {!isToday && (
            <div className="mt-3 pt-3 border-t border-stone-100 flex items-center justify-between">
              <span className="text-xs text-amber-800 font-medium">
                {isArabic ? "يتم الآن عرض يوم سابق" : "Viewing past date"}
              </span>
              <button
                onClick={() => {
                  setIsOpen(false);
                  resetToToday();
                }}
                className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs rounded-lg transition cursor-pointer"
              >
                {isArabic ? "العودة لليوم (٨ أيلول)" : "Reset to Today (Sep 8)"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
