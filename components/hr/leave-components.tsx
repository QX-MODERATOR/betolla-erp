"use client";

import { useMemo, useState } from "react";
import { X, Send, Check, Ban, Undo2, CalendarDays } from "lucide-react";
import { saveBusiness } from "@/lib/business-client";
import { useToast } from "@/components/common/toast";
import { cn } from "@/lib/utils";
import {
  LEAVE_STATUS_LABELS, leaveWorkingDays,
  type AttendanceSettings, type HrEmployee, type HrHoliday, type HrLeaveBalance, type HrLeaveRequest, type HrLeaveType,
} from "@/lib/hr";

const inputCls = "w-full px-3 py-2 rounded-xl border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/60";
const labelCls = "block text-[11px] font-bold text-stone-500 mb-1";

export function LeaveStatusBadge({ status }: { status: HrLeaveRequest["status"] }) {
  const s = LEAVE_STATUS_LABELS[status];
  return <span className={cn("inline-block text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap", s.color)}>{s.label}</span>;
}

export const leaveRange = (r: Pick<HrLeaveRequest, "start_date" | "end_date" | "half_day">) =>
  r.start_date === r.end_date ? `${r.start_date}${r.half_day ? " (نصف يوم)" : ""}` : `${r.start_date} ← ${r.end_date}`;

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div data-dialog="" className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-start sm:items-center justify-center p-3 overflow-y-auto" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-[#faf7f2] w-full max-w-lg rounded-3xl shadow-2xl border border-stone-200 my-4">
        <div className="flex items-center justify-between p-4 border-b border-stone-200">
          <h3 className="font-black text-base text-stone-900 flex items-center gap-2"><CalendarDays className="w-5 h-5 text-amber-500" />{title}</h3>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="p-2 rounded-xl hover:bg-stone-200/60"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// New leave request. mode "self" posts to /api/hr/me/leave; mode "hr" picks an employee and may approve directly.
export function LeaveRequestModal({
  mode, types, balances, holidays, settings, employees = [], today, onClose, onSaved,
}: {
  mode: "self" | "hr";
  types: HrLeaveType[]; balances: HrLeaveBalance[]; holidays: HrHoliday[]; settings: AttendanceSettings;
  employees?: HrEmployee[]; today: string;
  onClose: () => void; onSaved: (r: HrLeaveRequest) => void;
}) {
  const { showToast } = useToast();
  const activeEmployees = employees.filter((e) => e.status !== "terminated");
  const [employeeId, setEmployeeId] = useState(mode === "hr" ? activeEmployees[0]?.id || "" : "");
  const employee = activeEmployees.find((e) => e.id === employeeId);
  const eligibleTypes = types.filter((t) => t.is_active && (mode === "self" || !t.gender || t.gender === employee?.gender));
  const [pickedTypeId, setTypeId] = useState(eligibleTypes[0]?.id || "");
  // Switching employee (HR mode) can make the picked type ineligible; fall back to the first eligible one.
  const typeId = eligibleTypes.some((t) => t.id === pickedTypeId) ? pickedTypeId : eligibleTypes[0]?.id || "";
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState("");
  const [autoApprove, setAutoApprove] = useState(mode === "hr");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const type = eligibleTypes.find((t) => t.id === typeId);
  const holidaySet = useMemo(() => new Set(holidays.map((h) => h.date)), [holidays]);
  const days = leaveWorkingDays(start, end, halfDay && start === end, settings.weekend, holidaySet);
  const balance = balances.find((b) => b.leave_type_id === typeId && (mode === "self" || b.employee_id === employeeId));
  const sameYear = balance && start.slice(0, 4) === today.slice(0, 4);
  const exceeds = !!(type?.requires_balance && sameYear && balance && days > balance.available);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    const body = { leave_type_id: typeId, start_date: start, end_date: end, half_day: halfDay && start === end, reason };
    try {
      const { request } = mode === "self"
        ? await saveBusiness<{ request: HrLeaveRequest }>("hr-leave-self", "/api/hr/me/leave", body)
        : await saveBusiness<{ request: HrLeaveRequest }>("hr-leave-hr", "/api/hr/leave",
            { kind: "request", employee_id: employeeId, auto_approve: autoApprove, ...body });
      showToast(request.status === "approved" ? "تم تسجيل الإجازة واعتمادها." : "تم إرسال طلب الإجازة للموافقة.", "success");
      onSaved(request);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={mode === "self" ? "طلب إجازة جديد" : "تسجيل إجازة لموظف"} onClose={onClose}>
      <form onSubmit={submit} className="p-4 space-y-3">
        {mode === "hr" && (
          <div><label className={labelCls}>الموظف *</label>
            <select required className={inputCls} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              {activeEmployees.map((emp) => <option key={emp.id} value={emp.id}>{emp.full_name_ar} ({emp.employee_no})</option>)}
            </select>
          </div>
        )}
        <div><label className={labelCls}>نوع الإجازة *</label>
          <select required className={inputCls} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            {eligibleTypes.map((t) => <option key={t.id} value={t.id}>{t.name_ar}{t.paid ? "" : " (غير مدفوعة)"}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>من *</label>
            <input required type="date" className={inputCls} value={start} onChange={(e) => { setStart(e.target.value); if (e.target.value > end) setEnd(e.target.value); }} />
          </div>
          <div><label className={labelCls}>إلى *</label>
            <input required type="date" min={start} className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        {start === end && (
          <label className="flex items-center gap-2 text-sm font-bold text-stone-700">
            <input type="checkbox" checked={halfDay} onChange={(e) => setHalfDay(e.target.checked)} /> نصف يوم
          </label>
        )}
        <div><label className={labelCls}>السبب / ملاحظات</label>
          <textarea rows={2} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {mode === "hr" && (
          <label className="flex items-center gap-2 text-sm font-bold text-stone-700">
            <input type="checkbox" checked={autoApprove} onChange={(e) => setAutoApprove(e.target.checked)} />
            اعتماد مباشر (مثل تسجيل إجازة مرضية سابقة)
          </label>
        )}

        <div className={cn("rounded-xl border p-3 text-xs font-bold flex flex-wrap items-center justify-between gap-2",
          days <= 0 || exceeds ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-white border-stone-200 text-stone-700")}>
          <span>أيام العمل المحتسبة: <b className="text-base">{days}</b></span>
          {type?.requires_balance && balance && (
            <span>الرصيد المتاح: <b>{balance.available}</b> من {balance.entitled + balance.adjustments}</span>
          )}
          {days <= 0 && <span className="w-full">الفترة لا تحتوي أيام عمل (عطل أسبوعية/رسمية).</span>}
          {exceeds && <span className="w-full">المدة تتجاوز الرصيد المتاح.</span>}
        </div>

        {error && <p role="alert" className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-sm font-bold text-stone-600">إلغاء</button>
          <button type="submit" disabled={saving || days <= 0 || !typeId || (mode === "hr" && !employeeId)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 text-sm font-black">
            <Send className="w-4 h-4" /> {saving ? "جاري الإرسال..." : mode === "hr" && autoApprove ? "تسجيل واعتماد" : "إرسال الطلب"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

export type LeaveAction = "approve" | "reject" | "cancel";
const ACTION_META: Record<LeaveAction, { title: string; button: string; color: string; icon: typeof Check }> = {
  approve: { title: "الموافقة على طلب الإجازة", button: "موافقة", color: "bg-emerald-600 hover:bg-emerald-700 text-white", icon: Check },
  reject: { title: "رفض طلب الإجازة", button: "رفض الطلب", color: "bg-rose-600 hover:bg-rose-700 text-white", icon: Ban },
  cancel: { title: "إلغاء الإجازة", button: "إلغاء الإجازة", color: "bg-stone-800 hover:bg-stone-900 text-white", icon: Undo2 },
};

// Confirms approve/reject/cancel (reject requires a reason). endpoint: /api/hr/leave or /api/hr/me/leave.
export function LeaveDecisionModal({ request, action, endpoint, onClose, onDone }: {
  request: HrLeaveRequest; action: LeaveAction; endpoint: string; onClose: () => void; onDone: () => void;
}) {
  const { showToast } = useToast();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const meta = ACTION_META[action];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await saveBusiness(`hr-leave-${action}-${request.id}`, endpoint, { id: request.id, action, note }, "PATCH");
      showToast(action === "approve" ? "تمت الموافقة على الإجازة." : action === "reject" ? "تم رفض الطلب." : "تم إلغاء الإجازة.", "success");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={meta.title} onClose={onClose}>
      <form onSubmit={submit} className="p-4 space-y-3">
        <div className="bg-white rounded-xl border border-stone-200 p-3 text-sm space-y-1">
          <p className="font-black text-stone-900">{request.employee_name} · {request.type_name}</p>
          <p className="text-stone-600"><span dir="ltr">{leaveRange(request)}</span> · {request.days} يوم عمل</p>
          {request.reason && <p className="text-xs text-stone-500">السبب: {request.reason}</p>}
        </div>
        <div><label className={labelCls}>{action === "reject" ? "سبب الرفض *" : "ملاحظة (اختياري)"}</label>
          <textarea rows={2} required={action === "reject"} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-sm font-bold text-stone-600">رجوع</button>
          <button type="submit" disabled={saving} className={cn("inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black disabled:opacity-50", meta.color)}>
            <meta.icon className="w-4 h-4" /> {saving ? "جاري الحفظ..." : meta.button}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// One request row with optional actions.
export function LeaveRequestRow({ r, showEmployee, actions, onAction }: {
  r: HrLeaveRequest; showEmployee?: boolean; actions: LeaveAction[]; onAction: (a: LeaveAction) => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {showEmployee && <span className="font-black text-sm text-stone-900">{r.employee_name}</span>}
          <span className={cn("text-sm", showEmployee ? "text-stone-600" : "font-black text-stone-900")}>{r.type_name}</span>
          <LeaveStatusBadge status={r.status} />
          {!r.paid && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-stone-100 text-stone-500">بدون راتب</span>}
        </div>
        <p className="text-xs text-stone-500 mt-0.5">
          <span dir="ltr" className="font-mono">{leaveRange(r)}</span> · <b>{r.days}</b> يوم عمل
          {showEmployee && r.department_name ? ` · ${r.department_name}` : ""}
        </p>
        {r.reason && <p className="text-xs text-stone-500">السبب: {r.reason}</p>}
        {r.decision_note && r.status !== "pending" && <p className="text-xs text-stone-500">ملاحظة القرار: {r.decision_note}</p>}
      </div>
      {actions.length > 0 && (
        <div className="flex items-center gap-1.5 shrink-0">
          {actions.map((a) => {
            const meta = ACTION_META[a];
            return (
              <button key={a} onClick={() => onAction(a)}
                className={cn("inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold",
                  a === "approve" ? "bg-emerald-600 text-white hover:bg-emerald-700" : a === "reject" ? "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100" : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50")}>
                <meta.icon className="w-3.5 h-3.5" /> {a === "cancel" ? "إلغاء" : meta.button}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
