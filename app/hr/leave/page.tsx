"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Plus, Search, SlidersHorizontal, X, Save, Settings2 } from "lucide-react";
import { loadBusiness, saveBusiness } from "@/lib/business-client";
import { useToast } from "@/components/common/toast";
import { attendanceSettingsOf } from "@/components/hr/use-my-hr";
import { StatCard, LoadError, Avatar } from "@/components/hr/hr-ui";
import { LeaveRequestModal, LeaveDecisionModal, LeaveRequestRow, type LeaveAction } from "@/components/hr/leave-components";
import { cn } from "@/lib/utils";
import {
  LEAVE_STATUS_LABELS, WEEKDAY_LABELS, dowOf, monthDays,
  type AttendanceSettings, type HrEmployee, type HrHoliday, type HrLeaveAdjustment, type HrLeaveBalance,
  type HrLeaveRequest, type HrLeaveType, type LeaveStatus,
} from "@/lib/hr";

interface LeaveData {
  year: number; today: string; requests: HrLeaveRequest[]; balances: HrLeaveBalance[]; types: HrLeaveType[];
  adjustments: HrLeaveAdjustment[]; employees: HrEmployee[]; holidays: HrHoliday[]; settings: AttendanceSettings;
}

const TABS = [
  { id: "pending", label: "بانتظار الموافقة" },
  { id: "all", label: "كل الطلبات" },
  { id: "balances", label: "الأرصدة" },
  { id: "calendar", label: "تقويم الإجازات" },
  { id: "types", label: "أنواع الإجازات" },
] as const;

const inputCls = "w-full px-3 py-2 rounded-xl border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/60";
const labelCls = "block text-[11px] font-bold text-stone-500 mb-1";

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-start sm:items-center justify-center p-3 overflow-y-auto" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-[#faf7f2] w-full max-w-md rounded-3xl shadow-2xl border border-stone-200 my-4">
        <div className="flex items-center justify-between p-4 border-b border-stone-200">
          <h3 className="font-black text-base text-stone-900">{title}</h3>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="p-2 rounded-xl hover:bg-stone-200/60"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function useSubmit() {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const run = async (slot: string, body: Record<string, unknown>, done: string) => {
    if (saving) return false;
    setSaving(true);
    setError("");
    try {
      await saveBusiness(slot, "/api/hr/leave", body);
      showToast(done, "success");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setSaving(false);
    }
  };
  return { saving, error, run };
}

function AdjustmentModal({ employee, type, year, onClose, onSaved }: {
  employee: HrEmployee; type: HrLeaveType; year: number; onClose: () => void; onSaved: () => void;
}) {
  const [days, setDays] = useState("1");
  const [reason, setReason] = useState("");
  const { saving, error, run } = useSubmit();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await run(`hr-leave-adjust-${employee.id}-${type.id}`,
      { kind: "adjustment", employee_id: employee.id, leave_type_id: type.id, year, days: Number(days), reason }, "تم تعديل الرصيد.")) onSaved();
  };
  return (
    <Modal title="تعديل رصيد إجازة" onClose={onClose}>
      <form onSubmit={submit} className="p-4 space-y-3">
        <p className="text-sm font-bold text-stone-800">{employee.full_name_ar} · {type.name_ar} · {year}</p>
        <div><label className={labelCls}>عدد الأيام (موجب للإضافة، سالب للخصم)</label>
          <input type="number" step="0.5" min={-365} max={365} required dir="ltr" className={inputCls} value={days} onChange={(e) => setDays(e.target.value)} />
        </div>
        <div><label className={labelCls}>السبب *</label>
          <input required className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: ترحيل رصيد السنة السابقة، احتساب نسبي للتعيين..." />
        </div>
        {error && <p role="alert" className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-sm font-bold text-stone-600">إلغاء</button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 text-sm font-black">
            <Save className="w-4 h-4" /> حفظ
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TypeModal({ type, onClose, onSaved }: { type: HrLeaveType | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    code: type?.code || "", name_ar: type?.name_ar || "", annual_days: String(type?.annual_days ?? 0),
    paid: type?.paid ?? true, requires_balance: type?.requires_balance ?? true, gender: type?.gender || "", is_active: type?.is_active ?? true,
  });
  const { saving, error, run } = useSubmit();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = type
      ? { kind: "type", id: type.id, name_ar: form.name_ar, annual_days: Number(form.annual_days), paid: form.paid, requires_balance: form.requires_balance, gender: form.gender, is_active: form.is_active }
      : { kind: "type", code: form.code, name_ar: form.name_ar, annual_days: Number(form.annual_days), paid: form.paid, requires_balance: form.requires_balance, gender: form.gender };
    if (await run(`hr-leave-type-${type?.id || "new"}`, body, "تم حفظ نوع الإجازة.")) onSaved();
  };
  return (
    <Modal title={type ? `تعديل: ${type.name_ar}` : "نوع إجازة جديد"} onClose={onClose}>
      <form onSubmit={submit} className="p-4 space-y-3">
        {!type && (
          <div><label className={labelCls}>الرمز (إنجليزي) *</label>
            <input required dir="ltr" pattern="[a-z][a-z0-9_]{1,39}" className={inputCls} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase() })} placeholder="study" />
          </div>
        )}
        <div><label className={labelCls}>الاسم *</label><input required className={inputCls} value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>الأيام السنوية</label>
            <input type="number" step="0.5" min={0} max={365} dir="ltr" className={inputCls} value={form.annual_days} onChange={(e) => setForm({ ...form, annual_days: e.target.value })} />
          </div>
          <div><label className={labelCls}>متاحة لـ</label>
            <select className={inputCls} value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="">الجميع</option><option value="female">الإناث فقط</option><option value="male">الذكور فقط</option>
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold text-stone-700"><input type="checkbox" checked={form.paid} onChange={(e) => setForm({ ...form, paid: e.target.checked })} /> مدفوعة الأجر</label>
        <label className="flex items-center gap-2 text-sm font-bold text-stone-700"><input type="checkbox" checked={form.requires_balance} onChange={(e) => setForm({ ...form, requires_balance: e.target.checked })} /> تُخصم من رصيد سنوي</label>
        {type && <label className="flex items-center gap-2 text-sm font-bold text-stone-700"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> مفعّلة</label>}
        {error && <p role="alert" className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-sm font-bold text-stone-600">إلغاء</button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 text-sm font-black">
            <Save className="w-4 h-4" /> حفظ
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function HrLeavePage() {
  const [year, setYear] = useState<number | null>(null);
  const [data, setData] = useState<LeaveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("pending");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | LeaveStatus>("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [calendarMonth, setCalendarMonth] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [decision, setDecision] = useState<{ request: HrLeaveRequest; action: LeaveAction } | null>(null);
  const [adjusting, setAdjusting] = useState<{ employee: HrEmployee; type: HrLeaveType } | null>(null);
  const [editingType, setEditingType] = useState<HrLeaveType | null | "new">(null);

  const reload = useCallback(async () => {
    try {
      const raw = await loadBusiness<Omit<LeaveData, "settings"> & { settings: Record<string, unknown> }>(`/api/hr/leave${year ? `?year=${year}` : ""}`);
      setData({ ...raw, settings: attendanceSettingsOf(raw.settings) });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل بيانات الإجازات.");
    } finally {
      setLoading(false);
    }
  }, [year]);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);

  const today = data?.today || "";
  const pending = data?.requests.filter((r) => r.status === "pending") || [];
  const onLeaveToday = data?.requests.filter((r) => r.status === "approved" && r.start_date <= today && r.end_date >= today) || [];
  const matchesSearch = (name: string, no: string) => !search.trim() || name.includes(search.trim()) || no.toLowerCase().includes(search.trim().toLowerCase());
  const filtered = (data?.requests || []).filter((r) =>
    (statusFilter === "all" || r.status === statusFilter) && (typeFilter === "all" || r.leave_type_id === typeFilter) && matchesSearch(r.employee_name, r.employee_no));

  const balanceTypes = (data?.types || []).filter((t) => t.requires_balance && t.is_active);
  const balanceMap = useMemo(() => new Map((data?.balances || []).map((b) => [`${b.employee_id}|${b.leave_type_id}`, b])), [data]);

  const month = calendarMonth || (data ? (String(data.year) === today.slice(0, 4) ? today.slice(0, 7) : `${data.year}-01`) : "");
  const calendar = useMemo(() => {
    if (!data || !month) return [];
    const days = monthDays(month);
    const approved = data.requests.filter((r) => r.status === "approved" && r.end_date >= days[0] && r.start_date <= days.at(-1)!);
    return days.map((date) => ({ date, people: approved.filter((r) => r.start_date <= date && r.end_date >= date) }));
  }, [data, month]);

  const actionsFor = (r: HrLeaveRequest): LeaveAction[] =>
    r.status === "pending" ? ["approve", "reject", "cancel"] : r.status === "approved" ? ["cancel"] : [];

  const yearOptions = (() => {
    const base = Number((today || new Date().toISOString()).slice(0, 4));
    return [base - 2, base - 1, base, base + 1];
  })();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5">
            <CalendarDays className="w-6 h-6 text-amber-500" /> إدارة الإجازات
          </h2>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">الموافقات، الأرصدة، تقويم الغياب، وأنواع الإجازات</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={data?.year || ""} onChange={(e) => { setYear(Number(e.target.value)); setCalendarMonth(null); }} className="px-3 py-2.5 rounded-xl border border-stone-200 text-sm font-bold bg-white">
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => setShowNew(true)} disabled={!data} className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 font-bold text-sm rounded-xl">
            <Plus className="w-4 h-4" /> تسجيل إجازة
          </button>
        </div>
      </div>

      {error && <LoadError message={error} onRetry={() => { setLoading(true); void reload(); }} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="بانتظار الموافقة" value={pending.length} tone={pending.length ? "text-amber-600" : "text-stone-900"} />
        <StatCard label="في إجازة اليوم" value={onLeaveToday.length} tone="text-violet-600" hint={onLeaveToday.slice(0, 3).map((r) => r.employee_name).join("، ") || undefined} />
        <StatCard label={`أيام معتمدة ${data?.year ?? ""}`} value={(data?.requests || []).filter((r) => r.status === "approved").reduce((s, r) => s + r.days, 0)} />
        <StatCard label="إجازات بدون راتب" value={(data?.requests || []).filter((r) => r.status === "approved" && !r.paid).reduce((s, r) => s + r.days, 0)} hint="أيام — تؤثر على الرواتب" />
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition",
              tab === t.id ? "bg-stone-900 text-white" : "bg-white text-stone-600 hover:bg-stone-50 border border-stone-200")}>
            {t.label}{t.id === "pending" && pending.length ? ` (${pending.length})` : ""}
          </button>
        ))}
      </div>

      {(tab === "all" || tab === "balances") && (
        <div className="bg-white rounded-2xl border border-stone-200 p-3 flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute top-1/2 -translate-y-1/2 start-3" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث باسم الموظف أو الرقم الوظيفي..."
              className="w-full ps-9 pe-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/60" />
          </div>
          {tab === "all" && (
            <>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white">
                <option value="all">كل الحالات</option>
                {Object.entries(LEAVE_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white">
                <option value="all">كل الأنواع</option>
                {data?.types.map((t) => <option key={t.id} value={t.id}>{t.name_ar}</option>)}
              </select>
            </>
          )}
        </div>
      )}

      {loading || !data ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center text-sm text-stone-400">جاري التحميل...</div>
      ) : tab === "pending" ? (
        <div className="bg-white rounded-2xl border border-stone-200 divide-y divide-stone-100">
          {!pending.length ? <p className="p-8 text-center text-sm text-stone-400">لا توجد طلبات بانتظار الموافقة 🎉</p> :
            pending.map((r) => <LeaveRequestRow key={r.id} r={r} showEmployee actions={actionsFor(r)} onAction={(action) => setDecision({ request: r, action })} />)}
        </div>
      ) : tab === "all" ? (
        <div className="bg-white rounded-2xl border border-stone-200 divide-y divide-stone-100">
          {!filtered.length ? <p className="p-8 text-center text-sm text-stone-400">لا توجد طلبات مطابقة.</p> :
            filtered.map((r) => <LeaveRequestRow key={r.id} r={r} showEmployee actions={actionsFor(r)} onAction={(action) => setDecision({ request: r, action })} />)}
        </div>
      ) : tab === "balances" ? (
        <div className="bg-white rounded-2xl border border-stone-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-[11px] text-stone-500">
              <tr>
                <th className="text-start px-4 py-2">الموظف</th>
                {balanceTypes.map((t) => <th key={t.id} className="px-3 py-2 whitespace-nowrap">{t.name_ar} <span className="text-stone-400">({t.annual_days})</span></th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.employees.filter((e) => e.status !== "terminated" && matchesSearch(e.full_name_ar, e.employee_no)).map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar name={e.full_name_ar} className="w-7 h-7 text-[11px] rounded-lg" />
                      <span className="font-bold text-stone-900 whitespace-nowrap">{e.full_name_ar}</span>
                    </div>
                  </td>
                  {balanceTypes.map((t) => {
                    const b = balanceMap.get(`${e.id}|${t.id}`);
                    if (!b) return <td key={t.id} className="px-3 py-2 text-center text-stone-300">—</td>;
                    return (
                      <td key={t.id} className="px-3 py-2 text-center">
                        <button onClick={() => setAdjusting({ employee: e, type: t })} title={`المستحق ${b.entitled} · تعديلات ${b.adjustments} · مستخدم ${b.used} · معلّق ${b.pending} — اضغط لتعديل الرصيد`}
                          className="inline-flex flex-col items-center px-2 py-1 rounded-lg hover:bg-amber-50 group">
                          <span className={cn("font-black", b.available <= 0 ? "text-rose-600" : "text-stone-900")}>{b.available}</span>
                          <span className="text-[10px] text-stone-400 group-hover:text-amber-700 flex items-center gap-0.5">
                            {b.used}/{b.entitled + b.adjustments}{b.adjustments ? " *" : ""} <SlidersHorizontal className="w-2.5 h-2.5" />
                          </span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-2 text-[11px] text-stone-400 border-t border-stone-100">الرقم الكبير = المتاح. الصغير = المستخدم / المستحق (* يشمل تعديلات يدوية). اضغط على أي رصيد لإضافة أو خصم أيام.</p>
        </div>
      ) : tab === "calendar" ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input type="month" min={`${data.year}-01`} max={`${data.year}-12`} value={month} onChange={(e) => e.target.value && setCalendarMonth(e.target.value)}
              className="px-3 py-2 rounded-xl border border-stone-200 text-sm font-bold bg-white" />
          </div>
          <div className="grid grid-cols-7 gap-1 text-[11px]">
            {WEEKDAY_LABELS.map((d) => <div key={d} className="text-center font-bold text-stone-500 py-1">{d}</div>)}
            {calendar.length > 0 && Array.from({ length: dowOf(calendar[0].date) }).map((_, i) => <div key={`pad-${i}`} />)}
            {calendar.map(({ date, people }) => {
              const holiday = data.holidays.find((h) => h.date === date);
              const weekend = data.settings.weekend.includes(dowOf(date));
              return (
                <div key={date} className={cn("min-h-20 rounded-xl border p-1.5",
                  date === today ? "border-amber-400 bg-amber-50" : weekend || holiday ? "bg-stone-50 border-stone-100" : "bg-white border-stone-200")}>
                  <div className="flex items-center justify-between">
                    <span className="font-black text-stone-700">{Number(date.slice(8))}</span>
                    {people.length > 0 && <span className="text-[10px] font-bold text-violet-700">{people.length}</span>}
                  </div>
                  {holiday && <p className="text-[10px] text-stone-500 truncate">{holiday.name_ar}</p>}
                  <div className="space-y-0.5 mt-0.5">
                    {people.slice(0, 3).map((r) => (
                      <p key={r.id} title={`${r.employee_name} — ${r.type_name}`} className="truncate rounded bg-violet-100 text-violet-800 px-1">{r.employee_name}</p>
                    ))}
                    {people.length > 3 && <p className="text-[10px] text-stone-400">+{people.length - 3}</p>}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-stone-400">يعرض الإجازات المعتمدة فقط.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => setEditingType("new")} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-stone-900 text-amber-400 text-sm font-bold">
              <Plus className="w-4 h-4" /> نوع جديد
            </button>
          </div>
          <div className="bg-white rounded-2xl border border-stone-200 divide-y divide-stone-100">
            {data.types.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className={cn("font-bold text-sm", t.is_active ? "text-stone-900" : "text-stone-400 line-through")}>{t.name_ar}</p>
                  <p className="text-[11px] text-stone-500">
                    <span dir="ltr" className="font-mono">{t.code}</span> · {t.requires_balance ? `${t.annual_days} يوم سنويًا` : "بدون رصيد"} · {t.paid ? "مدفوعة" : "غير مدفوعة"}
                    {t.gender ? ` · ${t.gender === "female" ? "للإناث" : "للذكور"}` : ""}
                  </p>
                </div>
                <button onClick={() => setEditingType(t)} className="p-2 rounded-xl border border-stone-200 hover:bg-stone-50" aria-label={`تعديل ${t.name_ar}`}>
                  <Settings2 className="w-4 h-4 text-stone-600" />
                </button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-stone-400">القيم الافتراضية مبنية على قانون العمل الأردني ويمكن تعديلها حسب سياسة الشركة.</p>
        </div>
      )}

      {showNew && data && (
        <LeaveRequestModal mode="hr" types={data.types} balances={data.balances} holidays={data.holidays}
          settings={data.settings} employees={data.employees} today={today}
          onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); void reload(); }} />
      )}
      {decision && (
        <LeaveDecisionModal request={decision.request} action={decision.action} endpoint="/api/hr/leave"
          onClose={() => setDecision(null)} onDone={() => { setDecision(null); void reload(); }} />
      )}
      {adjusting && data && (
        <AdjustmentModal employee={adjusting.employee} type={adjusting.type} year={data.year}
          onClose={() => setAdjusting(null)} onSaved={() => { setAdjusting(null); void reload(); }} />
      )}
      {editingType && (
        <TypeModal type={editingType === "new" ? null : editingType}
          onClose={() => setEditingType(null)} onSaved={() => { setEditingType(null); void reload(); }} />
      )}
    </div>
  );
}
