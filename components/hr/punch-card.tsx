"use client";

import { useEffect, useState } from "react";
import { LogIn, LogOut, CheckCircle2, Clock } from "lucide-react";
import { saveBusiness } from "@/lib/business-client";
import { secureFetch } from "@/lib/client-api";
import { useToast } from "@/components/common/toast";
import { cn } from "@/lib/utils";
import { formatMinutes, isLate, type AttendanceSettings, type HrAttendance } from "@/lib/hr";

// Sends a check-in/out for the signed-in user. Each day+action gets its own retry slot.
export async function punch(action: "check_in" | "check_out", today: string) {
  return saveBusiness<{ attendance: HrAttendance }>(`hr-punch-${action}-${today}`, "/api/hr/me/attendance", { action });
}

function useClock(timeZone: string) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);
  if (!now) return "--:--:--";
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(now);
  } catch {
    return now.toLocaleTimeString("en-GB");
  }
}

// Big self-service check-in/out card (used on /hr/me/attendance and /hr/me).
export function PunchCard({ today, record, settings, onChanged }: {
  today: string; record: HrAttendance | null; settings: AttendanceSettings; onChanged: () => void | Promise<void>;
}) {
  const { showToast } = useToast();
  const clock = useClock(settings.timezone);
  const [busy, setBusy] = useState(false);
  const state = !record?.check_in ? "in" : !record.check_out ? "out" : "done";

  const act = async () => {
    if (busy || state === "done") return;
    setBusy(true);
    try {
      const { attendance } = await punch(state === "in" ? "check_in" : "check_out", today);
      showToast(state === "in"
        ? `تم تسجيل حضورك الساعة ${attendance.check_in}${isLate(attendance.check_in, settings) ? " (متأخر)" : ""}`
        : `تم تسجيل انصرافك الساعة ${attendance.check_out}`, state === "in" && isLate(attendance.check_in, settings) ? "warning" : "success");
      window.dispatchEvent(new Event("hr-attendance-changed"));
      await onChanged();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-[#160f02] to-[#35270e] text-[#f4e5d0] rounded-3xl p-5 sm:p-6 shadow-lg">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div>
          <p className="text-xs text-[#9e8959] font-bold">الدوام الرسمي {settings.work_start} – {settings.work_end} · اليوم <span dir="ltr">{today}</span></p>
          <p dir="ltr" className="text-4xl sm:text-5xl font-black tracking-wider mt-1 text-white text-end sm:text-start font-mono">{clock}</p>
          <div className="flex flex-wrap gap-2 mt-3 text-xs">
            <span className="px-2.5 py-1 rounded-full bg-white/10">دخول: <b dir="ltr">{record?.check_in || "—"}</b></span>
            <span className="px-2.5 py-1 rounded-full bg-white/10">خروج: <b dir="ltr">{record?.check_out || "—"}</b></span>
            {record?.worked_minutes ? <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-200">ساعات العمل: {formatMinutes(record.worked_minutes)}</span> : null}
            {isLate(record?.check_in ?? null, settings) && <span className="px-2.5 py-1 rounded-full bg-amber-500/25 text-amber-200">متأخر</span>}
          </div>
        </div>
        <button onClick={act} disabled={busy || state === "done"}
          className={cn("shrink-0 inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-base font-black transition active:scale-95 disabled:cursor-not-allowed",
            state === "in" && "bg-emerald-500 hover:bg-emerald-400 text-emerald-950 shadow-lg shadow-emerald-500/30",
            state === "out" && "bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-lg shadow-amber-500/30",
            state === "done" && "bg-white/10 text-[#f4e5d0]/70",
            busy && "opacity-60")}>
          {state === "in" && <><LogIn className="w-5 h-5" /> تسجيل الحضور</>}
          {state === "out" && <><LogOut className="w-5 h-5" /> تسجيل الانصراف</>}
          {state === "done" && <><CheckCircle2 className="w-5 h-5" /> انتهى دوام اليوم</>}
        </button>
      </div>
    </div>
  );
}

// Compact header button, shown only to accounts linked to an employee file.
export function HeaderPunchButton() {
  const { showToast } = useToast();
  const [status, setStatus] = useState<{ linked: boolean; today?: string; record?: HrAttendance | null } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await secureFetch("/api/hr/me/attendance", { cache: "no-store" });
      setStatus(res.ok ? await res.json() : { linked: false });
    } catch {
      setStatus({ linked: false });
    }
  };
  useEffect(() => {
    void Promise.resolve().then(load);
    // Pages like /hr/me/attendance punch too; they broadcast so this button stays in sync.
    const onChange = () => void load();
    window.addEventListener("hr-attendance-changed", onChange);
    return () => window.removeEventListener("hr-attendance-changed", onChange);
  }, []);

  if (!status?.linked || !status.today) return null;
  const record = status.record;
  const state = !record?.check_in ? "in" : !record.check_out ? "out" : "done";

  const act = async () => {
    if (busy || state === "done") return;
    setBusy(true);
    try {
      const { attendance } = await punch(state === "in" ? "check_in" : "check_out", status.today!);
      showToast(state === "in" ? `تم تسجيل الحضور ${attendance.check_in}` : `تم تسجيل الانصراف ${attendance.check_out}`, "success");
      window.dispatchEvent(new Event("hr-attendance-changed"));
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button onClick={act} disabled={busy || state === "done"}
      title={state === "in" ? "تسجيل الحضور" : state === "out" ? `حاضر منذ ${record?.check_in} — اضغط لتسجيل الانصراف` : `دخول ${record?.check_in} · خروج ${record?.check_out}`} aria-label={state === "in" ? "تسجيل الحضور" : state === "out" ? `حاضر منذ ${record?.check_in} — اضغط لتسجيل الانصراف` : `دخول ${record?.check_in} · خروج ${record?.check_out}`}
      className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border active:scale-95 transition-all shrink-0 disabled:cursor-default",
        state === "in" && "bg-emerald-500 border-emerald-600 text-white hover:bg-emerald-600 shadow-md shadow-emerald-500/25",
        state === "out" && "bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100",
        state === "done" && "bg-white border-[#e8dfcf] text-stone-400",
        busy && "opacity-60")}>
      {state === "in" ? <LogIn className="w-3.5 h-3.5" /> : state === "out" ? <LogOut className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
      <span className="hidden sm:inline">{state === "in" ? "تسجيل الحضور" : state === "out" ? "انصراف" : "انتهى الدوام"}</span>
    </button>
  );
}
