"use client";

import { useState, useRef, useMemo, useCallback } from "react";
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, History, X } from "lucide-react";
import { useDateFilter } from "@/lib/date-context";
import { useLanguage } from "@/lib/i18n";
import { useLoading } from "@/lib/loading-context";
import { HeaderPopover } from "@/components/common/header-popover";

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function HeaderCalendarButton() {
  const { selectedDate, todayDate, setSelectedDate, resetToToday, formattedDateLabel, isToday, isFutureDate } = useDateFilter();
  const { startLoading, stopLoading } = useLoading();
  const { language, dir } = useLanguage();
  const isArabic = language === "ar";

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setIsOpen(false), []);

  const handleSelectDate = (date: string, label: string) => {
    setIsOpen(false);
    if (date === selectedDate) return;

    startLoading({
      ar: `جاري تحميل بيانات يوم (${label})...`,
      en: `Loading (${label})...`,
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

  // The month on show, navigable in both directions: a scheduled day is often in the next month,
  // and a grid locked to the current month simply cannot reach it.
  const [monthOffset, setMonthOffset] = useState(0);
  const monthGrid = useMemo(() => {
    const base = new Date(todayObj.getFullYear(), todayObj.getMonth() + monthOffset, 1);
    const year = base.getFullYear();
    const month = base.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstWeekday = new Date(year, month, 1).getDay(); // 0 = Sunday
    return {
      year,
      month,
      days: Array.from({ length: daysInMonth }, (_, i) => i + 1),
      leadingBlanks: Array.from({ length: firstWeekday }, (_, i) => i),
      monthLabel: base.toLocaleDateString(isArabic ? "ar-JO" : "en-US", { month: "long", year: "numeric" }),
    };
  }, [todayObj, monthOffset, isArabic]);

  return (
    <div className="relative shrink-0" ref={containerRef}>
      {/* Desktop Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title={isArabic ? "اضغطي لاختيار يوم محدد: الأيام السابقة أو الأيام القادمة المجدولة" : "Pick a day: past archives or upcoming scheduled days"}
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
          <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${isFutureDate ? "bg-sky-500 text-white" : "bg-amber-500 text-stone-950"}`}>
            {isFutureDate ? (isArabic ? "قادم" : "Upcoming") : isArabic ? "سابق" : "Past"}
          </span>
        )}
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Mobile & Tablet Compact Icon Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title={isArabic ? `التقويم: ${formattedDateLabel}` : `Calendar: ${formattedDateLabel}`}
        aria-label={isArabic ? "تقويم الأيام" : "Calendar of days"}
        className={`flex lg:hidden items-center justify-center w-8 h-8 rounded-xl border transition shadow-2xs cursor-pointer relative shrink-0 ${
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
      <HeaderPopover
        anchorRef={containerRef}
        open={isOpen}
        onClose={close}
        dir={dir === "rtl" ? "rtl" : "ltr"}
        width={360}
        label={isArabic ? "تقويم الأيام" : "Calendar of days"}
        className="bg-white border border-stone-200 p-3 sm:p-4 animate-fadeIn text-stone-900"
      >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-700">
                <History className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-stone-900 leading-none">
                  {isArabic ? "تقويم أيام العمل والطلبات المجدولة" : "Work Calendar & Scheduled Days"}
                </h4>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  {isArabic ? "اختاري يوماً سابقاً للأرشيف، أو يوماً قادماً للطلبات والمكالمات المجدولة" : "Past days for archives, upcoming days for scheduled orders and calls"}
                </p>
              </div>
            </div>
            <button aria-label="إغلاق"
              onClick={() => setIsOpen(false)}
              className="p-1 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* The month, and nothing else: just the dates, with today in bold. */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-2 gap-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setMonthOffset((m) => m - 1)}
                  aria-label={isArabic ? "الشهر السابق" : "Previous month"}
                  className="p-1 rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-800 transition cursor-pointer"
                >
                  {isArabic ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
                </button>
                <span className="text-xs font-bold text-stone-800 min-w-[6.5rem] text-center">
                  {monthGrid.monthLabel}
                </span>
                <button
                  type="button"
                  onClick={() => setMonthOffset((m) => m + 1)}
                  aria-label={isArabic ? "الشهر القادم" : "Next month"}
                  className="p-1 rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-800 transition cursor-pointer"
                >
                  {isArabic ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              </div>
              {monthOffset === 0 ? (
                <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                  {isArabic ? "الشهر الحالي" : "Current Month"}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setMonthOffset(0)}
                  className="text-[10px] text-stone-600 bg-stone-100 hover:bg-stone-200 border border-stone-200 px-2 py-0.5 rounded-full font-medium cursor-pointer"
                >
                  {isArabic ? "الشهر الحالي" : "Current month"}
                </button>
              )}
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
                const isFuture = dateStr > todayDate;

                return (
                  <button
                    key={dayNum}
                    onClick={() =>
                      handleSelectDate(
                        dateStr,
                        dateObj.toLocaleDateString(isArabic ? "ar-JO" : "en-US", { day: "numeric", month: "long", year: "numeric" })
                      )
                    }
                    aria-current={isTodayDay ? "date" : undefined}
                    className={`py-1.5 rounded-lg font-mono transition relative cursor-pointer ${
                      isTodayDay ? "text-sm font-black" : "text-xs font-normal"
                    } ${
                      isSelected
                        ? "bg-amber-500 text-stone-950 shadow-xs scale-105"
                        : isTodayDay
                        ? "bg-amber-100 text-amber-900 border border-amber-400"
                        : isFuture
                        ? "hover:bg-sky-50 text-sky-800"
                        : "hover:bg-amber-50 text-stone-800"
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
              <span className={`text-xs font-medium ${isFutureDate ? "text-sky-800" : "text-amber-800"}`}>
                {isFutureDate
                  ? isArabic ? "يتم الآن عرض يوم قادم (مجدول)" : "Viewing an upcoming (scheduled) day"
                  : isArabic ? "يتم الآن عرض يوم سابق" : "Viewing past date"}
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
      </HeaderPopover>
    </div>
  );
}
