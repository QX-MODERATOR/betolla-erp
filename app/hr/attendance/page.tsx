"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Fingerprint, ChevronRight, ChevronLeft, Settings2, Download, Search, X, Save, Trash2, Plus } from "lucide-react";
import { loadBusiness, saveBusiness } from "@/lib/business-client";
import { useToast } from "@/components/common/toast";
import { attendanceSettingsOf } from "@/components/hr/use-my-hr";
import { StatCard, LoadError, Avatar } from "@/components/hr/hr-ui";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/common/confirm-dialog";
import {
  DAY_STATUS_META, WEEKDAY_LABELS, dayStatus, dowOf, formatMinutes, leaveDateSet, monthDays,
  type AttendanceSettings, type DayStatus, type HrAttendance, type HrEmployee, type HrHoliday, type HrLeaveRequest,
} from "@/lib/hr";

interface Sheet {
  month: string; today: string; employees: HrEmployee[]; records: HrAttendance[];
  holidays: HrHoliday[]; settings: AttendanceSettings; leaves: HrLeaveRequest[];
}

const inputCls = "w-full px-3 py-2 rounded-xl border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/60";
const labelCls = "block text-[11px] font-bold text-stone-500 mb-1";

const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div data-dialog="" className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-start sm:items-center justify-center p-3 overflow-y-auto" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className={cn("bg-[#faf7f2] w-full rounded-3xl shadow-2xl border border-stone-200 my-4", wide ? "max-w-2xl" : "max-w-md")}>
        <div className="flex items-center justify-between p-4 border-b border-stone-200">
          <h3 className="font-black text-base text-stone-900">{title}</h3>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="p-2 rounded-xl hover:bg-stone-200/60"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CorrectionModal({ employee, date, record, onClose, onSaved }: {
  employee: HrEmployee; date: string; record?: HrAttendance; onClose: () => void; onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [checkIn, setCheckIn] = useState(record?.check_in || "");
  const [checkOut, setCheckOut] = useState(record?.check_out || "");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState(record?.note || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await saveBusiness(`hr-att-${employee.id}-${date}`, "/api/hr/attendance",
        { employee_id: employee.id, work_date: date, check_in: checkIn, check_out: checkOut, reason, note });
      showToast("تم تعديل سجل الحضور.", "success");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="تعديل حضور يوم" onClose={onClose}>
      <form onSubmit={submit} className="p-4 space-y-3">
        <p className="text-sm font-bold text-stone-800">{employee.full_name_ar} · {WEEKDAY_LABELS[dowOf(date)]} <span dir="ltr" className="font-mono">{date}</span></p>
        {record && <p className="text-xs text-stone-500">المسجل حاليًا: دخول {record.check_in || "—"} · خروج {record.check_out || "—"} ({record.source === "hr" ? "معدّل من HR" : "تسجيل ذاتي"})</p>}
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>وقت الدخول</label><input type="time" className={inputCls} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} /></div>
          <div><label className={labelCls}>وقت الخروج</label><input type="time" className={inputCls} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} /></div>
        </div>
        <p className="text-[11px] text-stone-400">اترك الوقتين فارغين لتسجيل اليوم كغياب.</p>
        <div><label className={labelCls}>سبب التعديل * (يُحفظ في سجل التغييرات)</label><input required className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: عطل في الإنترنت، مهمة خارجية..." /></div>
        <div><label className={labelCls}>ملاحظة على اليوم</label><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        {error && <p role="alert" className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-sm font-bold text-stone-600">إلغاء</button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 text-sm font-black">
            <Save className="w-4 h-4" /> {saving ? "جاري الحفظ..." : "حفظ التعديل"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SettingsModal({ settings, year, onClose, onSaved }: {
  settings: AttendanceSettings; year: number; onClose: () => void; onSaved: () => void;
}) {
  const dialogs = useConfirm();
  const { showToast } = useToast();
  const [form, setForm] = useState(settings);
  const [holidays, setHolidays] = useState<HrHoliday[]>([]);
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadHolidays = useCallback(async () => {
    try {
      setHolidays((await loadBusiness<{ holidays: HrHoliday[] }>(`/api/hr/settings?year=${year}`)).holidays);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [year]);
  useEffect(() => { void Promise.resolve().then(loadHolidays); }, [loadHolidays]);

  const run = async (slot: string, body: Record<string, unknown>, done: string) => {
    if (saving) return false;
    setSaving(true);
    setError("");
    try {
      await saveBusiness(slot, "/api/hr/settings", body);
      showToast(done, "success");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await run("hr-settings-attendance", { kind: "attendance", ...form }, "تم حفظ إعدادات الدوام.")) onSaved();
  };
  const addHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await run("hr-holiday-add", { kind: "holiday", action: "add", date: newDate, name_ar: newName }, "تمت إضافة العطلة.")) {
      setNewDate(""); setNewName(""); await loadHolidays();
    }
  };
  const removeHoliday = async (h: HrHoliday) => {
    if (!await dialogs.confirm({ title: "حذف العطلة", message: `حذف عطلة «${h.name_ar}» (${h.date})؟`, confirmLabel: "حذف", danger: true })) return;
    if (await run(`hr-holiday-remove-${h.id}`, { kind: "holiday", action: "remove", id: h.id }, "تم حذف العطلة.")) await loadHolidays();
  };

  const toggleDay = (d: number) =>
    setForm((f) => ({ ...f, weekend: f.weekend.includes(d) ? f.weekend.filter((x) => x !== d) : [...f.weekend, d] }));

  return (
    <Modal title="إعدادات الدوام والعطل" onClose={onClose} wide>
      <div className="p-4 space-y-5">
        <form onSubmit={saveSettings} className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
          <p className="text-xs font-black text-amber-700">ساعات الدوام</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div><label className={labelCls}>بداية الدوام</label><input type="time" required className={inputCls} value={form.work_start} onChange={(e) => setForm({ ...form, work_start: e.target.value })} /></div>
            <div><label className={labelCls}>نهاية الدوام</label><input type="time" required className={inputCls} value={form.work_end} onChange={(e) => setForm({ ...form, work_end: e.target.value })} /></div>
            <div><label className={labelCls}>فترة السماح (دقيقة)</label><input type="number" min={0} max={180} required className={inputCls} value={form.grace_minutes} onChange={(e) => setForm({ ...form, grace_minutes: Number(e.target.value) })} /></div>
          </div>
          <div>
            <label className={labelCls}>العطلة الأسبوعية</label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_LABELS.map((label, d) => (
                <button type="button" key={d} onClick={() => toggleDay(d)}
                  className={cn("px-3 py-1.5 rounded-lg text-xs font-bold border", form.weekend.includes(d) ? "bg-stone-900 text-amber-400 border-stone-900" : "bg-white text-stone-600 border-stone-200")}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div><label className={labelCls}>المنطقة الزمنية</label><input dir="ltr" className={inputCls} value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} /></div>
          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 text-sm font-black">
              <Save className="w-4 h-4" /> حفظ الإعدادات
            </button>
          </div>
        </form>

        <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
          <p className="text-xs font-black text-amber-700">العطل الرسمية لسنة {year}</p>
          {!holidays.length ? <p className="text-sm text-stone-400">لا توجد عطل مسجلة لهذه السنة.</p> : (
            <ul className="divide-y divide-stone-100">
              {holidays.map((h) => (
                <li key={h.id} className="flex items-center justify-between py-2 text-sm">
                  <span><span dir="ltr" className="font-mono text-xs text-stone-500">{h.date}</span> · <b>{h.name_ar}</b> <span className="text-xs text-stone-400">({WEEKDAY_LABELS[dowOf(h.date)]})</span></span>
                  <button onClick={() => removeHoliday(h)} disabled={saving} aria-label={`حذف ${h.name_ar}`} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={addHoliday} className="flex flex-col sm:flex-row gap-2">
            <input type="date" required className={inputCls} value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            <input required placeholder="اسم العطلة (مثال: عيد الاستقلال)" className={inputCls} value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-1 px-4 py-2 rounded-xl bg-stone-900 text-amber-400 text-sm font-bold shrink-0 disabled:opacity-50">
              <Plus className="w-4 h-4" /> إضافة
            </button>
          </form>
        </div>
        {error && <p role="alert" className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}
      </div>
    </Modal>
  );
}

export default function HrAttendancePage() {
  const [month, setMonth] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [editing, setEditing] = useState<{ employee: HrEmployee; date: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const reload = useCallback(async () => {
    try {
      const raw = await loadBusiness<Omit<Sheet, "settings"> & { settings: Record<string, unknown> }>(`/api/hr/attendance${month ? `?month=${month}` : ""}`);
      setSheet({ ...raw, settings: attendanceSettingsOf(raw.settings) });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل سجل الحضور.");
    } finally {
      setLoading(false);
    }
  }, [month]);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);

  const grid = useMemo(() => {
    if (!sheet) return null;
    const days = monthDays(sheet.month);
    const holidays = new Set(sheet.holidays.map((h) => h.date));
    const byKey = new Map(sheet.records.map((r) => [`${r.employee_id}|${r.work_date}`, r]));
    const rows = sheet.employees
      .filter((e) => e.status !== "terminated" || (e.termination_date && e.termination_date >= days[0]))
      .filter((e) => e.hire_date <= days.at(-1)!)
      .map((e) => {
        const leaves = leaveDateSet(sheet.leaves, e.id, days[0], days.at(-1)!);
        const cells = days.map((date) => {
          const record = byKey.get(`${e.id}|${date}`);
          return { date, record, status: dayStatus({ date, today: sheet.today, settings: sheet.settings, holidays, record, onLeave: leaves.has(date), hireDate: e.hire_date, terminationDate: e.termination_date }) };
        });
        const count = (s: DayStatus) => cells.filter((c) => c.status === s).length;
        return {
          employee: e, cells,
          totals: {
            present: count("present") + count("late") + count("incomplete"), late: count("late"),
            absent: count("absent"), leave: count("leave"),
            minutes: cells.reduce((sum, c) => sum + (c.record?.worked_minutes || 0), 0),
          },
        };
      });
    return { days, rows };
  }, [sheet]);

  const departments = useMemo(() => {
    const map = new Map<string, string>();
    sheet?.employees.forEach((e) => { if (e.department_id) map.set(e.department_id, e.department_name); });
    return [...map.entries()];
  }, [sheet]);

  const visibleRows = (grid?.rows || []).filter((r) =>
    (department === "all" || r.employee.department_id === department) &&
    (!search.trim() || r.employee.full_name_ar.includes(search.trim()) || r.employee.employee_no.toLowerCase().includes(search.trim().toLowerCase())));

  const todayIndex = grid && sheet ? grid.days.indexOf(sheet.today) : -1;
  const todayBoard = todayIndex >= 0 ? {
    in: visibleRows.filter((r) => ["present", "late"].includes(r.cells[todayIndex].status) && !r.cells[todayIndex].record?.check_out).length,
    late: visibleRows.filter((r) => r.cells[todayIndex].status === "late").length,
    notYet: visibleRows.filter((r) => r.cells[todayIndex].status === "pending"),
    leave: visibleRows.filter((r) => r.cells[todayIndex].status === "leave").length,
    out: visibleRows.filter((r) => r.cells[todayIndex].record?.check_out).length,
  } : null;

  const exportExcel = async () => {
    if (!grid || !sheet) return;
    const XLSX = await import("xlsx");
    const rows = visibleRows.map((r) => {
      const row: Record<string, string | number> = { "الرقم الوظيفي": r.employee.employee_no, "الموظف": r.employee.full_name_ar, "القسم": r.employee.department_name };
      r.cells.forEach((c) => {
        row[c.date.slice(8)] = c.record?.check_in ? `${c.record.check_in}-${c.record.check_out || "?"}` : DAY_STATUS_META[c.status].short;
      });
      Object.assign(row, { "حضور": r.totals.present, "تأخير": r.totals.late, "غياب": r.totals.absent, "إجازة": r.totals.leave, "ساعات": Math.round(r.totals.minutes / 6) / 10 });
      return row;
    });
    const sheetXls = XLSX.utils.json_to_sheet(rows);
    sheetXls["!views"] = [{ RTL: true }];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheetXls, sheet.month);
    XLSX.writeFile(book, `betolla-attendance-${sheet.month}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5">
            <Fingerprint className="w-6 h-6 text-amber-500" /> الحضور والانصراف
          </h2>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            {sheet ? `الدوام ${sheet.settings.work_start}–${sheet.settings.work_end} · سماح ${sheet.settings.grace_minutes} دقيقة · العطلة: ${sheet.settings.weekend.map((d) => WEEKDAY_LABELS[d]).join(" و ")}` : "كشف الحضور الشهري وتعديلات الموارد البشرية"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setShowSettings(true)} disabled={!sheet} className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 font-bold text-sm rounded-xl disabled:opacity-50">
            <Settings2 className="w-4 h-4" /> الدوام والعطل
          </button>
          <button onClick={exportExcel} disabled={!visibleRows.length} className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 font-bold text-sm rounded-xl disabled:opacity-50">
            <Download className="w-4 h-4" /> Excel
          </button>
        </div>
      </div>

      {error && <LoadError message={error} onRetry={() => { setLoading(true); void reload(); }} />}

      {todayBoard && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatCard label="داخل الدوام الآن" value={todayBoard.in} tone="text-emerald-600" />
          <StatCard label="متأخرون اليوم" value={todayBoard.late} tone={todayBoard.late ? "text-amber-600" : "text-stone-900"} />
          <StatCard label="لم يسجلوا بعد" value={todayBoard.notYet.length} tone={todayBoard.notYet.length ? "text-rose-600" : "text-stone-900"}
            hint={todayBoard.notYet.slice(0, 3).map((r) => r.employee.full_name_ar).join("، ") || undefined} />
          <StatCard label="في إجازة اليوم" value={todayBoard.leave} tone="text-violet-600" />
          <StatCard label="انصرفوا" value={todayBoard.out} />
        </div>
      )}

      <div className="bg-white rounded-2xl border border-stone-200 p-3 flex flex-col md:flex-row gap-2 md:items-center">
        <div className="flex items-center gap-1">
          <button onClick={() => sheet && setMonth(shiftMonth(sheet.month, -1))} aria-label="الشهر السابق" className="p-2 rounded-xl border border-stone-200 hover:bg-stone-50"><ChevronRight className="w-4 h-4" /></button>
          <input type="month" value={sheet?.month || ""} onChange={(e) => e.target.value && setMonth(e.target.value)} className="px-3 py-1.5 rounded-xl border border-stone-200 text-sm font-bold" />
          <button onClick={() => sheet && setMonth(shiftMonth(sheet.month, 1))} aria-label="الشهر التالي" className="p-2 rounded-xl border border-stone-200 hover:bg-stone-50"><ChevronLeft className="w-4 h-4" /></button>
        </div>
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-stone-400 absolute top-1/2 -translate-y-1/2 start-3" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو الرقم الوظيفي..."
            className="w-full ps-9 pe-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/60" />
        </div>
        <select value={department} onChange={(e) => setDepartment(e.target.value)} className="px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white">
          <option value="all">كل الأقسام</option>
          {departments.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap gap-2 text-[11px]">
        {(["present", "late", "incomplete", "absent", "leave", "holiday", "weekend"] as DayStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className={cn("w-5 h-5 rounded flex items-center justify-center font-bold", DAY_STATUS_META[s].color)}>{DAY_STATUS_META[s].short}</span>
            {DAY_STATUS_META[s].label}
          </span>
        ))}
        <span className="text-stone-400">· اضغط على أي يوم لتعديله</span>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center text-sm text-stone-400">جاري تحميل كشف الحضور...</div>
      ) : grid && sheet && (
        !visibleRows.length ? (
          <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center text-sm text-stone-400">لا يوجد موظفون لعرضهم في هذا الشهر.</div>
        ) : (
          <div className="bg-white rounded-2xl border border-stone-200 overflow-x-auto">
            <table className="text-xs border-separate border-spacing-0">
              <thead>
                <tr className="text-stone-500">
                  <th className="sticky start-0 z-10 bg-stone-50 text-start px-3 py-2 min-w-44 border-b border-stone-200">الموظف</th>
                  {grid.days.map((d) => (
                    <th key={d} className={cn("px-0.5 py-1 font-bold border-b border-stone-200 min-w-7", d === sheet.today ? "bg-amber-100 text-amber-900" : "bg-stone-50")}>
                      <div>{Number(d.slice(8))}</div>
                      <div className="text-[9px] font-normal">{WEEKDAY_LABELS[dowOf(d)].slice(0, 2)}</div>
                    </th>
                  ))}
                  {["حضور", "تأخير", "غياب", "إجازة", "ساعات"].map((h) => (
                    <th key={h} className="bg-stone-50 px-2 py-2 border-b border-stone-200 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.employee.id} className="hover:bg-amber-50/30">
                    <td className="sticky start-0 z-10 bg-white px-3 py-1.5 border-b border-stone-100">
                      <div className="flex items-center gap-2">
                        <Avatar name={row.employee.full_name_ar} className="w-7 h-7 text-[11px] rounded-lg" />
                        <div className="min-w-0">
                          <p className="font-bold text-stone-900 truncate max-w-32">{row.employee.full_name_ar}</p>
                          <p className="text-[10px] text-stone-400 truncate max-w-32">{row.employee.department_name || row.employee.employee_no}</p>
                        </div>
                      </div>
                    </td>
                    {row.cells.map((c) => {
                      const meta = DAY_STATUS_META[c.status];
                      const editable = c.status !== "future" && c.status !== "none";
                      const holidayName = sheet.holidays.find((h) => h.date === c.date)?.name_ar;
                      return (
                        <td key={c.date} className="p-0.5 border-b border-stone-100">
                          <button disabled={!editable} onClick={() => setEditing({ employee: row.employee, date: c.date })}
                            title={[c.date, holidayName || meta.label, c.record?.check_in && `دخول ${c.record.check_in}`, c.record?.check_out && `خروج ${c.record.check_out}`, c.record?.source === "hr" && "معدّل من HR"].filter(Boolean).join(" · ")} aria-label={[c.date, holidayName || meta.label, c.record?.check_in && `دخول ${c.record.check_in}`, c.record?.check_out && `خروج ${c.record.check_out}`, c.record?.source === "hr" && "معدّل من HR"].filter(Boolean).join(" · ")}
                            className={cn("w-6 h-6 rounded font-bold flex items-center justify-center transition", meta.color,
                              editable && "hover:ring-2 hover:ring-amber-400", c.record?.source === "hr" && "ring-1 ring-sky-400")}>
                            {meta.short}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-2 text-center font-bold text-emerald-700 border-b border-stone-100">{row.totals.present}</td>
                    <td className="px-2 text-center font-bold text-amber-700 border-b border-stone-100">{row.totals.late}</td>
                    <td className="px-2 text-center font-bold text-rose-700 border-b border-stone-100">{row.totals.absent}</td>
                    <td className="px-2 text-center font-bold text-violet-700 border-b border-stone-100">{row.totals.leave}</td>
                    <td className="px-2 text-center whitespace-nowrap border-b border-stone-100">{formatMinutes(row.totals.minutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {editing && sheet && (
        <CorrectionModal employee={editing.employee} date={editing.date}
          record={sheet.records.find((r) => r.employee_id === editing.employee.id && r.work_date === editing.date)}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} />
      )}
      {showSettings && sheet && (
        <SettingsModal settings={sheet.settings} year={Number(sheet.month.slice(0, 4))}
          onClose={() => { setShowSettings(false); void reload(); }} onSaved={() => { setShowSettings(false); void reload(); }} />
      )}
    </div>
  );
}
