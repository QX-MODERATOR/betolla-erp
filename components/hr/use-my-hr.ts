"use client";

import { useCallback, useEffect, useState } from "react";
import { loadBusiness } from "@/lib/business-client";
import {
  DEFAULT_ATTENDANCE_SETTINGS,
  type AttendanceSettings, type HrAttendance, type HrEmployee, type HrHoliday,
  type HrDocument, type HrLeaveBalance, type HrLeaveRequest, type HrLeaveType,
} from "@/lib/hr";

export interface MyHr {
  employee: HrEmployee | null;
  month: string; today: string; settings: AttendanceSettings;
  attendance: HrAttendance[]; todayRecord: HrAttendance | null; holidays: HrHoliday[];
  balances: HrLeaveBalance[]; balanceYear: number; types: HrLeaveType[];
  requests: HrLeaveRequest[]; teamRequests: HrLeaveRequest[]; documents: HrDocument[];
}

type Raw = Omit<MyHr, "settings"> & { settings?: { attendance?: Partial<AttendanceSettings> } };

export const attendanceSettingsOf = (raw?: { attendance?: Partial<AttendanceSettings> } | Record<string, unknown>) =>
  ({ ...DEFAULT_ATTENDANCE_SETTINGS, ...((raw as { attendance?: Partial<AttendanceSettings> })?.attendance || {}) });

// Loads the caller's own HR self-service payload (/api/hr/me), optionally for a given month.
export function useMyHr(month?: string) {
  const [data, setData] = useState<MyHr | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      const raw = await loadBusiness<Raw>(`/api/hr/me${month ? `?month=${month}` : ""}`);
      setData({ ...raw, settings: attendanceSettingsOf(raw.settings) });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل بياناتك الوظيفية.");
    } finally {
      setLoading(false);
    }
  }, [month]);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);

  return { data, loading, error, reload, setLoading };
}
