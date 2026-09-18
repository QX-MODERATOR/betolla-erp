"use client";

import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import { useLanguage } from "@/lib/i18n";
import { ammanToday } from "@/lib/dates";

interface DateFilterContextType {
  selectedDate: string; // YYYY-MM-DD
  todayDate: string; // YYYY-MM-DD, computed from the real current date
  isToday: boolean;
  setSelectedDate: (date: string) => void;
  resetToToday: () => void;
  formattedDateLabel: string;
  isPastDate: boolean;
  isFutureDate: boolean; // a scheduled day: orders and calls booked for later
}

export function getTodayDateString(): string {
  return ammanToday();
}

const DateFilterContext = createContext<DateFilterContextType>({
  selectedDate: getTodayDateString(),
  todayDate: getTodayDateString(),
  isToday: true,
  setSelectedDate: () => {},
  resetToToday: () => {},
  formattedDateLabel: "",
  isPastDate: false,
  isFutureDate: false,
});

export function DateFilterProvider({ children }: { children: React.ReactNode }) {
  const [todayDate] = useState<string>(getTodayDateString);
  const [selectedDate, setSelectedDateState] = useState<string>(todayDate);
  const { language } = useLanguage();
  const isArabic = language === "ar";

  const isToday = selectedDate === todayDate;
  const isPastDate = selectedDate < todayDate;
  const isFutureDate = selectedDate > todayDate;

  const setSelectedDate = (date: string) => {
    setSelectedDateState(date);
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem("betolla_selected_date", date);
      } catch {}
    }
  };

  const resetToToday = () => {
    setSelectedDate(todayDate);
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("betolla_selected_date");
      if (saved) {
        setSelectedDateState(saved);
      }
    }
  }, []);

  const formattedDateLabel = useMemo(() => {
    try {
      const [year, month, day] = selectedDate.split("-").map(Number);
      const dateObj = new Date(year, month - 1, day);

      if (selectedDate === todayDate) {
        return dateObj.toLocaleDateString(isArabic ? "ar-JO" : "en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });
      }

      const [tYear, tMonth, tDay] = todayDate.split("-").map(Number);
      const neighbour = (offset: number) => {
        const d = new Date(tYear, tMonth - 1, tDay + offset);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      };
      const named = (prefixAr: string, prefixEn: string) =>
        isArabic
          ? `${prefixAr} (${dateObj.toLocaleDateString("ar-JO", { weekday: "long", day: "numeric", month: "long" })})`
          : `${prefixEn} (${dateObj.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })})`;
      if (selectedDate === neighbour(-1)) return named("أمس", "Yesterday");
      if (selectedDate === neighbour(1)) return named("غداً", "Tomorrow");

      const formatted = dateObj.toLocaleDateString(isArabic ? "ar-JO" : "en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      if (selectedDate > todayDate) return isArabic ? `${formatted} (قادم)` : `${formatted} (Upcoming)`;
      return isArabic ? `${formatted} (سابق)` : `${formatted} (Past)`;
    } catch {
      return selectedDate;
    }
  }, [selectedDate, todayDate, isArabic]);

  return (
    <DateFilterContext.Provider
      value={{
        selectedDate,
        todayDate,
        isToday,
        setSelectedDate,
        resetToToday,
        formattedDateLabel,
        isPastDate,
        isFutureDate,
      }}
    >
      {children}
    </DateFilterContext.Provider>
  );
}

export function useDateFilter() {
  return useContext(DateFilterContext);
}
