"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Calendar, ChevronDown, Check, History, X } from "lucide-react";
import { useDateFilter } from "@/lib/date-context";
import { useLanguage } from "@/lib/i18n";
import { useLoading } from "@/lib/loading-context";

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function HeaderCalendarButton() {
  const { selectedDate, todayDate, setSelectedDate, resetToToday, formattedDateLabel, isToday } = useDateFilter();
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

  const todayObj = useMemo(() => {
    const [y, m, d] = todayDate.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [todayDate]);

  // Quick preset dates, computed relative to the real current date.
  const PRESETS = useMemo(() => {
    const offsets = [0, -1, -2, -3, -5, -7];
    return offsets.map((offset) => {
      const d = new Date(todayObj);
      d.setDate(d.getDate() + offset);
      const dateStr = toDateStr(d);
      const labelAr = d.toLocaleDateString("ar-JO", { weekday: "long", day: "numeric", month: "long" });
      const labelEn = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const badge =
        offset === 0
          ? { ar: "نشط", en: "Live", color: "bg-emerald-500 text-white" }
          : offset === -1
          ? { ar: "سجل أمس", en: "Yesterday", color: "bg-amber-500 text-stone-950 font-bold" }
          : { ar: "أرشيف", en: "Archived", color: "bg-stone-200 text-stone-700" };
      return {
        date: dateStr,
        labelAr: offset === 0 ? `اليوم (${labelAr})` : offset === -1 ? `أمس (${labelAr})` : labelAr,
        labelEn: offset === 0 ? `Today (${labelEn})` : offset === -1 ? `Yesterday (${labelEn})` : labelEn,
        badge: isArabic ? badge.ar : badge.en,
        badgeColor: badge.color,
      };
    });
  }, [todayObj, isArabic]);

  // Real current-month grid: correct day count and correct weekday offset for any month.
  const monthGrid = useMemo(() => {
    const year = todayObj.getFullYear();
    const month = todayObj.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstWeekday = new Date(year, month, 1).getDay(); // 0 = Sunday
    const monthLabel = todayObj.toLocaleDateString(isArabic ? "ar-JO" : "en-US", { month: "long", year: "numeric" });
    return {
      year,
      month,
      days: Array.from({ length: daysInMonth }, (_, i) => i + 1),
      leadingBlanks: Array.from({ length: firstWeekday }, (_, i) => i),
      monthLabel,
    };
  }, [todayObj, isArabic]);

  return (
    <div className="relative shrink-0" ref={containerRef}>
      {/* Desktop Button */}
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        title={isArabic ? "اضغطي لاختيار يوم محدد وعرض أرقام الأمس أو الأيام السابقة" : "Click to view yesterday or older days' calling queue"}
        aria-label={isArabic ? "تقويم الأيام" : "Calendar of days"}
        className={`hidden lg:flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg border transition shadow-xs cursor-pointer ${
          !isToday
            ? "bg-amber-500/15 border-amber-400 text-amber-900 font-bold hover:bg-amber-500/20"
            : "text-stone-700 bg-stone-100 hover:bg-stone-200/80 border-stone-200"
        }`}
      >
        <Calendar className={`w-3.5 h-3.5 ${!isToday ? "text-amber-700" : "text-amber-600"}`} />
        <span className="truncate max-w-[150px] xl:max-w-none">
          {formattedDateLabel}
        </span>
        {!isToday && (
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500 text-stone-950 font-bold">
            {isArabic ? "سابق" : "Past"}
          </span>
        )}
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Mobile & Tablet Compact Icon Button */}
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        title={isArabic ? `التقويم: ${formattedDateLabel}` : `Calendar: ${formattedDateLabel}`}
        aria-label={isArabic ? "تقويم الأيام" : "Calendar of days"}
        className={`flex lg:hidden items-center justify-center w-11 h-11 rounded-xl border transition shadow-2xs cursor-pointer relative shrink-0 ${
          !isToday
            ? "bg-amber-500/20 border-amber-400 text-amber-900 font-bold"
            : "text-stone-700 bg-stone-50/80 hover:bg-amber-50/60 border-stone-200"
        }`}
      >
        <Calendar className={`w-3.5 h-3.5 ${!isToday ? "text-amber-700" : "text-amber-600"}`} />
        {!isToday && (
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white" />
        )}
      </button>

      {/* Calendar of Days Dropdown Dialog */}
      {isOpen && (
        <div
          onKeyDown={(e) => { if (e.key === "Escape") { setIsOpen(false); containerRef.current?.querySelector<HTMLButtonElement>("button:not(.hidden)")?.focus(); } }}
          className={`fixed top-[4.5rem] inset-x-3 sm:absolute sm:top-full sm:mt-2 sm:inset-x-auto ${dir === "rtl" ? "sm:left-0" : "sm:right-0"} sm:w-[340px] max-h-[calc(100dvh-6rem)] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-stone-200 p-3 sm:p-4 z-50 text-stone-900`}
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

          {/* Interactive Current-Month Calendar Grid */}
          <div className="mt-4 pt-3 border-t border-stone-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-stone-800">
                {monthGrid.monthLabel}
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
              {monthGrid.leadingBlanks.map((b) => (
                <div key={`blank-${b}`} className="py-1.5" />
              ))}

              {monthGrid.days.map((dayNum) => {
                const dateObj = new Date(monthGrid.year, monthGrid.month, dayNum);
                const dateStr = toDateStr(dateObj);
                const isSelected = selectedDate === dateStr;
                const isTodayDay = dateStr === todayDate;
                const isPast = dateStr < todayDate;
                const isFuture = dateStr > todayDate;

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
                        dateObj.toLocaleDateString(isArabic ? "ar-JO" : "en-US", { day: "numeric", month: "long", year: "numeric" })
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
                {isArabic ? "العودة لليوم" : "Reset to Today"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
