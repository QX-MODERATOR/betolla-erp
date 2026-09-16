"use client";

import { useMemo, useState } from "react";
import { Fingerprint, ChevronRight, ChevronLeft, Info } from "lucide-react";
import { useMyHr } from "@/components/hr/use-my-hr";
import { PunchCard } from "@/components/hr/punch-card";
import { StatCard, LoadError, Panel } from "@/components/hr/hr-ui";
import { cn } from "@/lib/utils";
import {
  DAY_STATUS_META, WEEKDAY_LABELS, dayStatus, dowOf, formatMinutes, leaveDateSet, monthDays, type DayStatus,
} from "@/lib/hr";

const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export default function MyAttendancePage() {
  const [month, setMonth] = useState<string | undefined>(undefined);
  const { data, loading, error, reload, setLoading } = useMyHr(month);

  const rows = useMemo(() => {
    if (!data?.employee) return [];
    const holidays = new Set(data.holidays.map((h) => h.date));
    const days = monthDays(data.month);
    const leaves = leaveDateSet(data.requests, data.employee.id, days[0], days.at(-1)!);
    return days.map((date) => {
      const record = data.attendance.find((a) => a.work_date === date);
      const status = dayStatus({
        date, today: data.today, settings: data.settings, holidays, record, onLeave: leaves.has(date),
        hireDate: data.employee!.hire_date, terminationDate: data.employee!.termination_date,
      });
      return { date, record, status, holiday: data.holidays.find((h) => h.date === date)?.name_ar };
    });
  }, [data]);

  const count = (s: DayStatus) => rows.filter((r) => r.status === s).length;
  const worked = rows.reduce((sum, r) => sum + (r.record?.worked_minutes || 0), 0);

  const header = (
    <div>
      <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5">
        <Fingerprint className="w-6 h-6 text-amber-500" /> حضوري وانصرافي
      </h2>
      <p className="text-xs sm:text-sm text-stone-500 mt-1">سجّل حضورك وانصرافك وتابع سجلك الشهري</p>
    </div>
  );

  if (loading && !data) return <div className="space-y-6">{header}<div className="bg-white rounded-2xl border border-stone-200 p-10 text-center text-sm text-stone-400">جاري التحميل...</div></div>;
  if (!data?.employee) {
    return (
      <div className="space-y-6">
        {header}
        {error ? <LoadError message={error} onRetry={() => { setLoading(true); void reload(); }} /> : (
          <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center">
            <Info className="w-10 h-10 text-amber-400 mx-auto mb-3" />
            <p className="font-bold text-stone-800">لم يتم ربط حسابك بملف وظيفي بعد</p>
            <p className="text-sm text-stone-500 mt-1">تواصل مع قسم الموارد البشرية لتفعيل تسجيل الحضور.</p>
          </div>
        )}
      </div>
    );
  }

  const isCurrentMonth = data.month === data.today.slice(0, 7);

  return (
    <div className="space-y-6">
      {header}
      {error && <LoadError message={error} onRetry={() => void reload()} />}

      {data.employee.status === "terminated" || data.employee.status === "suspended" ? (
        <div className="bg-stone-100 border border-stone-200 rounded-2xl p-4 text-sm text-stone-600">تسجيل الحضور غير متاح لحالة حسابك الوظيفية الحالية.</div>
      ) : (
        <PunchCard today={data.today} record={data.todayRecord} settings={data.settings} onChanged={reload} />
      )}

      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setMonth(shiftMonth(data.month, -1))} className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-white border border-stone-200 text-xs font-bold hover:bg-stone-50">
          <ChevronRight className="w-4 h-4" /> الشهر السابق
        </button>
        <p className="font-black text-stone-900" dir="ltr">{data.month}</p>
        <button onClick={() => setMonth(shiftMonth(data.month, 1))} disabled={isCurrentMonth}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-white border border-stone-200 text-xs font-bold hover:bg-stone-50 disabled:opacity-40">
          الشهر التالي <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="أيام الحضور" value={count("present") + count("late") + count("incomplete")} tone="text-emerald-600" />
        <StatCard label="أيام التأخير" value={count("late")} tone={count("late") ? "text-amber-600" : "text-stone-900"} />
        <StatCard label="أيام الغياب" value={count("absent")} tone={count("absent") ? "text-rose-600" : "text-stone-900"} />
        <StatCard label="أيام الإجازة" value={count("leave")} tone="text-violet-600" />
        <StatCard label="ساعات العمل" value={formatMinutes(worked)} />
      </div>

      <Panel title="السجل اليومي">
        <div className="overflow-x-auto -m-4">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-[11px] text-stone-500">
              <tr>
                <th className="text-start px-4 py-2">اليوم</th>
                <th className="text-start px-4 py-2">الحالة</th>
                <th className="text-start px-4 py-2">دخول</th>
                <th className="text-start px-4 py-2">خروج</th>
                <th className="text-start px-4 py-2 hidden sm:table-cell">المدة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.filter((r) => r.status !== "future" && r.status !== "none").reverse().map((r) => (
                <tr key={r.date} className={r.date === data.today ? "bg-amber-50/60" : undefined}>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className="font-bold text-stone-800">{WEEKDAY_LABELS[dowOf(r.date)]}</span>{" "}
                    <span dir="ltr" className="text-xs text-stone-500 font-mono">{r.date}</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded-full", DAY_STATUS_META[r.status].color)}>
                      {r.holiday || DAY_STATUS_META[r.status].label}
                    </span>
                    {r.record?.source === "hr" && <span className="ms-1 text-[10px] text-stone-400">(معدّل من HR)</span>}
                  </td>
                  <td dir="ltr" className="px-4 py-2 font-mono text-xs text-end">{r.record?.check_in || "—"}</td>
                  <td dir="ltr" className="px-4 py-2 font-mono text-xs text-end">{r.record?.check_out || "—"}</td>
                  <td className="px-4 py-2 text-xs hidden sm:table-cell">{formatMinutes(r.record?.worked_minutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
