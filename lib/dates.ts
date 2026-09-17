// Calendar dates for the business, which runs on Amman time. `new Date().toISOString().slice(0,10)`
// is the UTC date: between 00:00 and 03:00 in Amman it is still "yesterday".

export const BUSINESS_TIME_ZONE = "Asia/Amman";

const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

// YYYY-MM-DD of the given moment in Amman.
export function ammanDate(at: Date | string | number = new Date()): string {
  const d = at instanceof Date ? at : new Date(at);
  return Number.isNaN(d.getTime()) ? "" : ymd.format(d);
}

export const ammanToday = (): string => ammanDate(new Date());

// Whole-day arithmetic on YYYY-MM-DD strings (no timezone involved).
export function shiftDate(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type AnalyticsPeriod = "week" | "month" | "year" | "all";

// Start (YYYY-MM-DD) of a calendar period containing `today`, or null for all time.
// The week starts on Saturday, the month on the 1st, the year on 1 January.
export function periodStart(period: AnalyticsPeriod, today: string): string | null {
  if (period === "all") return null;
  if (period === "year") return today.slice(0, 4) + "-01-01";
  if (period === "month") return today.slice(0, 8) + "01";
  const dow = new Date(today + "T00:00:00Z").getUTCDay(); // 0 = Sunday … 6 = Saturday
  return shiftDate(today, -((dow + 1) % 7));
}
