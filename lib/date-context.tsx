"use client";

import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import { useLanguage } from "@/lib/i18n";

interface DateFilterContextType {
  selectedDate: string; // YYYY-MM-DD
  todayDate: string; // 2026-09-08
  isToday: boolean;
  setSelectedDate: (date: string) => void;
  resetToToday: () => void;
  formattedDateLabel: string;
  isPastDate: boolean;
}

const DateFilterContext = createContext<DateFilterContextType>({
  selectedDate: "2026-09-08",
  todayDate: "2026-09-08",
  isToday: true,
  setSelectedDate: () => {},
  resetToToday: () => {},
  formattedDateLabel: "",
  isPastDate: false,
});

export const TODAY_DATE = "2026-09-08";

export function DateFilterProvider({ children }: { children: React.ReactNode }) {
  const [selectedDate, setSelectedDateState] = useState<string>(TODAY_DATE);
  const { language } = useLanguage();
  const isArabic = language === "ar";

  const isToday = selectedDate === TODAY_DATE;
  const isPastDate = selectedDate < TODAY_DATE;

  const setSelectedDate = (date: string) => {
    setSelectedDateState(date);
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem("betolla_selected_date", date);
      } catch {}
    }
  };

  const resetToToday = () => {
    setSelectedDate(TODAY_DATE);
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

      if (selectedDate === TODAY_DATE) {
        return dateObj.toLocaleDateString(isArabic ? "ar-JO" : "en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });
      }

      // Check if yesterday
      const yesterday = new Date(2026, 8, 7); // Sep 7, 2026
      if (selectedDate === "2026-09-07") {
        return isArabic ? "أمس (الإثنين، ٧ أيلول ٢٠٢٦)" : "Yesterday (Mon, Sep 7, 2026)";
      }

      const formatted = dateObj.toLocaleDateString(isArabic ? "ar-JO" : "en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      return isArabic ? `${formatted} (سابق)` : `${formatted} (Past)`;
    } catch {
      return selectedDate;
    }
  }, [selectedDate, isArabic]);

  return (
    <DateFilterContext.Provider
      value={{
        selectedDate,
        todayDate: TODAY_DATE,
        isToday,
        setSelectedDate,
        resetToToday,
        formattedDateLabel,
        isPastDate,
      }}
    >
      {children}
    </DateFilterContext.Provider>
  );
}

export function useDateFilter() {
  return useContext(DateFilterContext);
}
