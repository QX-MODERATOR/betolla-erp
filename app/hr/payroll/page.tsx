"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Wallet, Calculator, CheckCircle2, RotateCcw, Banknote, Download, AlertTriangle, X, Save, Plus, Ban, Eye, RefreshCw,
} from "lucide-react";
import { loadBusiness, saveBusiness } from "@/lib/business-client";
import { getCurrentUser } from "@/lib/client-api";
import { useToast } from "@/components/common/toast";
import { StatCard, LoadError } from "@/components/hr/hr-ui";
import { PayslipModal } from "@/components/hr/payslip-view";
import { cn, formatCurrency } from "@/lib/utils";
import { useConfirm } from "@/components/common/confirm-dialog";
import {
  ADJUSTMENT_KIND_LABELS, ADVANCE_STATUS_LABELS, DEFAULT_PAYROLL_SETTINGS, PAYROLL_STATUS_LABELS, PAYSLIP_WARNING_LABELS,
  monthLabel,
  type HrAdvance, type HrEmployee, type HrPayrollAdjustment, type HrPayrollRun, type HrPayslip, type PayrollAdjustmentKind,
  type PayrollSettings,
} from "@/lib/hr";

interface Overview {
  runs: HrPayrollRun[]; today: string; settings: { payroll?: Partial<PayrollSettings> };
  employees?: HrEmployee[]; advances?: HrAdvance[];
}

const inputCls = "w-full px-3 py-2 rounded-xl border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/60";
const labelCls = "block text-[11px] font-bold text-stone-500 mb-1";

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div data-dialog="" className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-start sm:items-center justify-center p-3 overflow-y-auto" onClick={onClose}>
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

function StatusBadge({ status }: { status: HrPayrollRun["status"] }) {
  const s = PAYROLL_STATUS_LABELS[status];
  return <span className={cn("inline-block text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap", s.color)}>{s.label}</span>;
}

// Shared submit helper for everything posted to /api/hr/payroll.
function usePayrollSubmit() {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const run = async <T,>(slot: string, body: Record<string, unknown>, done?: string): Promise<T | null> => {
    if (saving) return null;
    setSaving(true);
    setError("");
    try {
      const result = await saveBusiness<T>(slot, "/api/hr/payroll", body);
      if (done) showToast(done, "success");
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      showToast(msg, "error");
      return null;
    } finally {
      setSaving(false);
    }
  };
  return { saving, error, setError, run };
}

type TransitionAction = "approve" | "reopen" | "pay";
const TRANSITION_META: Record<TransitionAction, { title: string; button: string; color: string }> = {
  approve: { title: "اعتماد مسير الرواتب", button: "اعتماد وإرسال للمالية", color: "bg-emerald-600 hover:bg-emerald-700 text-white" },
  reopen: { title: "إعادة فتح المسير", button: "إعادة الفتح", color: "bg-stone-800 hover:bg-stone-900 text-white" },
  pay: { title: "تأكيد صرف الرواتب", button: "تأكيد الصرف", color: "bg-emerald-600 hover:bg-emerald-700 text-white" },
};

function TransitionModal({ run, action, onClose, onDone }: {
  run: HrPayrollRun; action: TransitionAction; onClose: () => void; onDone: () => void;
}) {
  const { showToast } = useToast();
  const [note, setNote] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const { saving, error, run: submit } = usePayrollSubmit();
  const meta = TRANSITION_META[action];

  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await submit<{ run: HrPayrollRun; changed: boolean }>(`hr-payroll-${action}-${run.id}`, {
      kind: "transition", id: run.id, action, note, payment_ref: paymentRef,
      ...(action === "approve" ? { expected_net: run.totals.net, expected_count: run.totals.count } : {}),
    });
    if (!result) return;
    if (result.changed) showToast("تغيّرت أرقام المسير منذ آخر مراجعة (بيانات جديدة). تم تحديثها — راجعها ثم اعتمد مجددًا.", "warning");
    else showToast(action === "approve" ? "تم اعتماد المسير وإشعار المالية." : action === "pay" ? "تم تأكيد صرف الرواتب وإشعار الموظفين." : "تمت إعادة فتح المسير.", "success");
    onDone();
  };

  return (
    <Modal title={`${meta.title} — ${monthLabel(run.month)}`} onClose={onClose}>
      <form onSubmit={go} className="p-4 space-y-3">
        <div className="bg-white rounded-xl border border-stone-200 p-3 text-sm grid grid-cols-2 gap-1">
          <span className="text-stone-500">عدد الموظفين</span><b>{run.totals.count}</b>
          <span className="text-stone-500">إجمالي الصافي</span><b>{formatCurrency(run.totals.net)}</b>
          <span className="text-stone-500">تكلفة الشركة</span><b>{formatCurrency(run.totals.employer_cost)}</b>
        </div>
        {action === "approve" && run.totals.warnings > 0 && (
          <p className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2">يوجد {run.totals.warnings} تنبيه في كشوف الرواتب. تأكد من مراجعتها.</p>
        )}
        {action === "approve" && <p className="text-xs text-stone-500">سيُعاد الاحتساب لحظة الاعتماد؛ إذا تغيّرت الأرقام لن يُعتمد المسير وستُعرض الأرقام الجديدة للمراجعة.</p>}
        {action === "pay" && (
          <div><label className={labelCls}>مرجع التحويل البنكي</label><input className={inputCls} value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} placeholder="رقم الحوالة / الدفعة" /></div>
        )}
        <div><label className={labelCls}>{action === "reopen" ? "سبب إعادة الفتح *" : "ملاحظة"}</label>
          <textarea rows={2} required={action === "reopen"} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-sm font-bold text-stone-600">رجوع</button>
          <button type="submit" disabled={saving} className={cn("px-5 py-2.5 rounded-xl text-sm font-black disabled:opacity-50", meta.color)}>
            {saving ? "جاري التنفيذ..." : meta.button}
          </button>
        </div>
      </form>
    </Modal>
  );
}

async function exportRun(run: HrPayrollRun) {
  const XLSX = await import("xlsx");
  const slips = run.payslips || [];
  const detail = slips.map((p) => ({
    "الرقم الوظيفي": p.employee_no, "الموظف": p.employee_name, "القسم": p.department_name || "",
    "أيام الخدمة": p.employed_days, "الأساسي": p.basic, "البدلات": p.allowances, "العمولة": p.commission,
    "إضافي": p.overtime, "مكافآت": p.bonuses, "الإجمالي": p.gross, "ضمان الموظف": p.ssc_employee,
    "ضمان الشركة": p.ssc_employer, "غياب": p.absence_deduction, "بدون راتب": p.unpaid_leave_deduction,
    "سلف": p.advance_deduction, "خصومات أخرى": p.other_deductions, "ضريبة": p.income_tax,
    "مجموع الاقتطاعات": p.total_deductions, "الصافي": p.net,
    "تنبيهات": p.warnings.map((w) => PAYSLIP_WARNING_LABELS[w] || w).join("، "),
  }));
  const bank = slips.filter((p) => p.net > 0).map((p) => ({
    "الموظف": p.employee_name, "الرقم الوظيفي": p.employee_no, "البنك": p.bank_name || "", "IBAN": p.iban || "", "المبلغ": p.net,
  }));
  const ssc = slips.filter((p) => p.ssc_employee > 0).map((p) => ({
    "الموظف": p.employee_name, "رقم الضمان": p.ssc_number || "", "الأجر الخاضع": p.ssc_base,
    "اقتطاع الموظف": p.ssc_employee, "مساهمة الشركة": p.ssc_employer, "المجموع": Math.round((p.ssc_employee + p.ssc_employer) * 1000) / 1000,
  }));
  const book = XLSX.utils.book_new();
  for (const [name, rows] of [["المسير", detail], ["تحويلات البنك", bank], ["الضمان الاجتماعي", ssc]] as const) {
    const sheet = XLSX.utils.json_to_sheet(rows as object[]);
    sheet["!views"] = [{ RTL: true }];
    XLSX.utils.book_append_sheet(book, sheet, name);
  }
  XLSX.writeFile(book, `betolla-payroll-${run.month}.xlsx`);
}

function RunsTab({ overview, isHr, canPay, reload }: { overview: Overview; isHr: boolean; canPay: boolean; reload: () => Promise<void> }) {
  const currentMonth = overview.today.slice(0, 7);
  const [selectedId, setSelectedId] = useState<string | null>(overview.runs[0]?.id ?? null);
  const [detail, setDetail] = useState<HrPayrollRun | null>(null);
  const [detailError, setDetailError] = useState("");
  const [newMonth, setNewMonth] = useState(currentMonth);
  const [transition, setTransition] = useState<TransitionAction | null>(null);
  const [slip, setSlip] = useState<HrPayslip | null>(null);
  const [search, setSearch] = useState("");
  const { saving, run: submit } = usePayrollSubmit();

  const loadDetail = useCallback(async (id: string) => {
    try {
      setDetail((await loadBusiness<{ run: HrPayrollRun }>(`/api/hr/payroll?id=${id}`)).run);
      setDetailError("");
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => { if (selectedId) void Promise.resolve().then(() => loadDetail(selectedId)); }, [selectedId, loadDetail]);

  const generate = async (month: string) => {
    const result = await submit<{ run: HrPayrollRun }>(`hr-payroll-generate-${month}`, { kind: "generate", month }, `تم احتساب رواتب ${monthLabel(month)}.`);
    if (!result) return;
    await reload();
    setSelectedId(result.run.id);
    setDetail(result.run);
  };

  const afterTransition = async () => {
    setTransition(null);
    await reload();
    if (selectedId) await loadDetail(selectedId);
  };

  const slips = (detail?.payslips || []).filter((p) => !search.trim() || p.employee_name.includes(search.trim()) || p.employee_no.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
      <div className="space-y-3">
        {isHr && (
          <div className="bg-white rounded-2xl border border-stone-200 p-3 space-y-2">
            <p className="text-xs font-black text-stone-700">احتساب رواتب شهر</p>
            <input type="month" max={currentMonth} value={newMonth} onChange={(e) => setNewMonth(e.target.value)} className={inputCls} />
            <button onClick={() => generate(newMonth)} disabled={saving || !newMonth}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 text-sm font-black">
              <Calculator className="w-4 h-4" /> {overview.runs.some((r) => r.month === newMonth) ? "إعادة الاحتساب" : "احتساب المسير"}
            </button>
          </div>
        )}
        <div className="bg-white rounded-2xl border border-stone-200 divide-y divide-stone-100 overflow-hidden">
          {!overview.runs.length ? <p className="p-4 text-sm text-stone-400">لا توجد مسيرات رواتب بعد.</p> : overview.runs.map((r) => (
            <button key={r.id} onClick={() => setSelectedId(r.id)}
              className={cn("w-full text-start px-3 py-2.5 hover:bg-amber-50/50", selectedId === r.id && "bg-amber-50")}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-black text-sm text-stone-900">{monthLabel(r.month)}</span>
                <StatusBadge status={r.status} />
              </div>
              <p className="text-[11px] text-stone-500 mt-0.5">{r.totals.count} موظف · صافي {formatCurrency(r.totals.net)}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="lg:col-span-3 space-y-4">
        {detailError && <LoadError message={detailError} onRetry={() => selectedId && void loadDetail(selectedId)} />}
        {!detail ? (
          <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center text-sm text-stone-400">
            {selectedId ? "جاري تحميل المسير..." : isHr ? "اختر شهرًا واضغط «احتساب المسير» للبدء." : "لا توجد مسيرات معتمدة بعد."}
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl border border-stone-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black text-stone-900">رواتب {monthLabel(detail.month)}</h3>
                  <StatusBadge status={detail.status} />
                </div>
                <p className="text-[11px] text-stone-500 mt-1">
                  آخر احتساب {new Date(detail.calculated_at).toLocaleString("en-GB")}
                  {detail.approved_at && ` · اعتمد ${detail.approved_by} ${detail.approved_at.slice(0, 10)}`}
                  {detail.paid_at && ` · صرف ${detail.paid_by} ${detail.paid_at.slice(0, 10)}${detail.payment_ref ? ` (${detail.payment_ref})` : ""}`}
                </p>
                {detail.notes && <p className="text-xs text-stone-600 mt-1">ملاحظة: {detail.notes}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {isHr && detail.status === "draft" && (
                  <>
                    <button onClick={() => generate(detail.month)} disabled={saving} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-200 bg-white text-xs font-bold hover:bg-stone-50 disabled:opacity-50">
                      <RefreshCw className="w-3.5 h-3.5" /> إعادة الاحتساب
                    </button>
                    <button onClick={() => setTransition("approve")} disabled={!detail.totals.count} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50">
                      <CheckCircle2 className="w-3.5 h-3.5" /> اعتماد
                    </button>
                  </>
                )}
                {isHr && detail.status === "approved" && (
                  <button onClick={() => setTransition("reopen")} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-200 bg-white text-xs font-bold hover:bg-stone-50">
                    <RotateCcw className="w-3.5 h-3.5" /> إعادة فتح
                  </button>
                )}
                {canPay && detail.status === "approved" && (
                  <button onClick={() => setTransition("pay")} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700">
                    <Banknote className="w-3.5 h-3.5" /> تأكيد الصرف
                  </button>
                )}
                <button onClick={() => void exportRun(detail)} disabled={!detail.payslips?.length} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-200 bg-white text-xs font-bold hover:bg-stone-50 disabled:opacity-50">
                  <Download className="w-3.5 h-3.5" /> Excel
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="إجمالي المستحقات" value={formatCurrency(detail.totals.gross)} hint={`${detail.totals.count} موظف`} />
              <StatCard label="صافي الرواتب (للتحويل)" value={formatCurrency(detail.totals.net)} tone="text-emerald-700" />
              <StatCard label="الضمان الاجتماعي (موظف + شركة)" value={formatCurrency(detail.totals.ssc_employee + detail.totals.ssc_employer)}
                hint={`موظف ${formatCurrency(detail.totals.ssc_employee)} · شركة ${formatCurrency(detail.totals.ssc_employer)}`} />
              <StatCard label="التكلفة الكلية على الشركة" value={formatCurrency(detail.totals.employer_cost)}
                hint={detail.totals.warnings ? `${detail.totals.warnings} تنبيه` : undefined} tone={detail.totals.warnings ? "text-amber-700" : "text-stone-900"} />
            </div>

            <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
              <div className="p-3 border-b border-stone-100">
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث باسم الموظف..." className={inputCls} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-stone-50 text-stone-500">
                    <tr>
                      {["الموظف", "الأساسي", "البدلات", "عمولة/إضافي/مكافأة", "الإجمالي", "الضمان", "اقتطاعات أخرى", "الصافي", ""].map((h, i) => (
                        <th key={i} className="text-start px-3 py-2 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {slips.map((p) => (
                      <tr key={p.id} className="hover:bg-amber-50/30">
                        <td className="px-3 py-2">
                          <p className="font-bold text-stone-900 flex items-center gap-1">
                            {p.employee_name}
                            {p.warnings.length > 0 && <span title={p.warnings.map((w) => PAYSLIP_WARNING_LABELS[w] || w).join("\n")}><AlertTriangle className={cn("w-3.5 h-3.5", p.warnings.includes("NEGATIVE_NET") ? "text-rose-600" : "text-amber-500")} /></span>}
                          </p>
                          <p className="text-[10px] text-stone-400">{p.employee_no}{p.employed_days < p.month_days ? ` · ${p.employed_days}/${p.month_days} يوم` : ""}</p>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatCurrency(p.basic)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatCurrency(p.allowances)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatCurrency(p.commission + p.overtime + p.bonuses)}</td>
                        <td className="px-3 py-2 whitespace-nowrap font-bold">{formatCurrency(p.gross)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-rose-700">{formatCurrency(p.ssc_employee)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-rose-700">{formatCurrency(p.total_deductions - p.ssc_employee)}</td>
                        <td className={cn("px-3 py-2 whitespace-nowrap font-black", p.net < 0 ? "text-rose-700" : "text-emerald-700")}>{formatCurrency(p.net)}</td>
                        <td className="px-3 py-2">
                          <button onClick={() => setSlip({ ...p, month: detail.month, run_status: detail.status, paid_at: detail.paid_at })}
                            className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-50" aria-label={`كشف راتب ${p.employee_name}`}>
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {transition && detail && <TransitionModal run={detail} action={transition} onClose={() => setTransition(null)} onDone={afterTransition} />}
      {slip && <PayslipModal slip={slip} showEmployer onClose={() => setSlip(null)} />}
    </div>
  );
}

function AdjustmentsTab({ overview }: { overview: Overview }) {
  const employees = (overview.employees || []).filter((e) => e.status !== "terminated");
  const [month, setMonth] = useState(overview.today.slice(0, 7));
  const [items, setItems] = useState<HrPayrollAdjustment[]>([]);
  const [form, setForm] = useState({ employee_id: employees[0]?.id || "", adjustment_kind: "bonus" as PayrollAdjustmentKind, amount: "", note: "" });
  const { saving, error, run } = usePayrollSubmit();
  const locked = overview.runs.some((r) => r.month === month && r.status !== "draft");

  const load = useCallback(async () => {
    try { setItems((await loadBusiness<{ adjustments: HrPayrollAdjustment[] }>(`/api/hr/payroll?adjustments=${month}`)).adjustments); }
    catch { setItems([]); }
  }, [month]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await run(`hr-payroll-adj-${month}`, { kind: "adjustment", action: "add", month, ...form, amount: form.amount }, "تمت إضافة الحركة وتحديث المسودة.")) {
      setForm((f) => ({ ...f, amount: "", note: "" }));
      await load();
    }
  };
  const voidItem = async (a: HrPayrollAdjustment) => {
    if (await run(`hr-payroll-adj-void-${a.id}`, { kind: "adjustment", action: "void", id: a.id }, "تم إلغاء الحركة.")) await load();
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-stone-200 p-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-stone-600">الشهر:</span>
        <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="px-3 py-1.5 rounded-xl border border-stone-200 text-sm font-bold" />
        {locked && <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">المسير معتمد — الحركات مقفلة</span>}
      </div>
      {!locked && (
        <form onSubmit={add} className="bg-white rounded-2xl border border-stone-200 p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div className="md:col-span-2"><label className={labelCls}>الموظف</label>
            <select required className={inputCls} value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name_ar}</option>)}
            </select>
          </div>
          <div><label className={labelCls}>النوع</label>
            <select className={inputCls} value={form.adjustment_kind} onChange={(e) => setForm({ ...form, adjustment_kind: e.target.value as PayrollAdjustmentKind })}>
              {Object.entries(ADJUSTMENT_KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div><label className={labelCls}>المبلغ (د.أ)</label><input required dir="ltr" inputMode="decimal" className={inputCls} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div className="md:col-span-4"><label className={labelCls}>الوصف *</label><input required className={inputCls} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="مثال: مكافأة تحقيق الهدف الشهري" /></div>
          <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 text-sm font-black">
            <Plus className="w-4 h-4" /> إضافة
          </button>
          {error && <p role="alert" className="md:col-span-5 text-xs font-bold text-rose-700">{error}</p>}
        </form>
      )}
      <div className="bg-white rounded-2xl border border-stone-200 divide-y divide-stone-100">
        {!items.length ? <p className="p-6 text-center text-sm text-stone-400">لا توجد حركات لهذا الشهر.</p> : items.map((a) => (
          <div key={a.id} className={cn("flex items-center justify-between gap-3 px-4 py-2.5", a.voided && "opacity-50")}>
            <div className="min-w-0">
              <p className="text-sm"><b>{a.employee_name}</b> · {ADJUSTMENT_KIND_LABELS[a.kind]} · <b className={a.kind === "bonus" || a.kind === "overtime" ? "text-emerald-700" : "text-rose-700"}>{formatCurrency(a.amount)}</b></p>
              <p className={cn("text-[11px] text-stone-500", a.voided && "line-through")}>{a.note} · {a.actor_id}</p>
            </div>
            {!a.voided && !locked && (
              <button onClick={() => voidItem(a)} disabled={saving} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs font-bold text-rose-700 hover:bg-rose-50">
                <Ban className="w-3.5 h-3.5" /> إلغاء
              </button>
            )}
            {a.voided && <span className="text-[11px] font-bold text-stone-400">ملغاة</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function AdvancesTab({ overview, reload }: { overview: Overview; reload: () => Promise<void> }) {
  const dialogs = useConfirm();
  const employees = (overview.employees || []).filter((e) => e.status !== "terminated");
  const [form, setForm] = useState({ employee_id: employees[0]?.id || "", amount: "", monthly_amount: "", start_month: overview.today.slice(0, 7), reason: "" });
  const { saving, error, run } = usePayrollSubmit();
  const advances = overview.advances || [];

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await run("hr-advance-create", { kind: "advance", action: "create", ...form }, "تم تسجيل السلفة.")) {
      setForm((f) => ({ ...f, amount: "", monthly_amount: "", reason: "" }));
      await reload();
    }
  };
  const cancel = async (a: HrAdvance) => {
    const reason = await dialogs.prompt({
      title: "إلغاء السلفة",
      message: `سلفة ${a.employee_name} — المتبقي ${formatCurrency(a.remaining)}`,
      label: "سبب الإلغاء",
      required: true,
      confirmLabel: "إلغاء السلفة",
      cancelLabel: "رجوع",
      danger: true,
    });
    if (reason === null) return;
    if (await run(`hr-advance-cancel-${a.id}`, { kind: "advance", action: "cancel", id: a.id, reason }, "تم إلغاء السلفة.")) await reload();
  };

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="bg-white rounded-2xl border border-stone-200 p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
        <div className="md:col-span-2"><label className={labelCls}>الموظف</label>
          <select required className={inputCls} value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name_ar}</option>)}
          </select>
        </div>
        <div><label className={labelCls}>مبلغ السلفة</label><input required dir="ltr" inputMode="decimal" className={inputCls} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
        <div><label className={labelCls}>القسط الشهري</label><input required dir="ltr" inputMode="decimal" className={inputCls} value={form.monthly_amount} onChange={(e) => setForm({ ...form, monthly_amount: e.target.value })} /></div>
        <div><label className={labelCls}>بدء الخصم من شهر</label><input required type="month" className={inputCls} value={form.start_month} onChange={(e) => setForm({ ...form, start_month: e.target.value })} /></div>
        <div className="md:col-span-4"><label className={labelCls}>السبب *</label><input required className={inputCls} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
        <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 text-sm font-black">
          <Plus className="w-4 h-4" /> تسجيل سلفة
        </button>
        {Number(form.amount) > 0 && Number(form.monthly_amount) > 0 && (
          <p className="md:col-span-5 text-[11px] text-stone-500">تُسدَّد خلال {Math.ceil(Number(form.amount) / Number(form.monthly_amount))} شهر.</p>
        )}
        {error && <p role="alert" className="md:col-span-5 text-xs font-bold text-rose-700">{error}</p>}
      </form>
      <div className="bg-white rounded-2xl border border-stone-200 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-stone-50 text-stone-500">
            <tr>{["الموظف", "المبلغ", "القسط", "من شهر", "المسدد", "المتبقي", "الحالة", ""].map((h, i) => <th key={i} className="text-start px-3 py-2">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {!advances.length ? <tr><td colSpan={8} className="p-6 text-center text-stone-400">لا توجد سلف.</td></tr> : advances.map((a) => (
              <tr key={a.id}>
                <td className="px-3 py-2"><b>{a.employee_name}</b><p className="text-[10px] text-stone-400">{a.reason}</p></td>
                <td className="px-3 py-2 whitespace-nowrap">{formatCurrency(a.amount)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{formatCurrency(a.monthly_amount)}</td>
                <td className="px-3 py-2 font-mono" dir="ltr">{a.start_month}</td>
                <td className="px-3 py-2 whitespace-nowrap text-emerald-700">{formatCurrency(a.repaid)}</td>
                <td className="px-3 py-2 whitespace-nowrap font-bold">{formatCurrency(a.remaining)}</td>
                <td className="px-3 py-2">{ADVANCE_STATUS_LABELS[a.status]}</td>
                <td className="px-3 py-2">
                  {a.status === "active" && (
                    <button onClick={() => cancel(a)} disabled={saving} className="text-rose-700 font-bold hover:underline">إلغاء</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-3 py-2 text-[11px] text-stone-400 border-t border-stone-100">المسدد يُحتسب من المسيرات المعتمدة/المصروفة فقط.</p>
      </div>
    </div>
  );
}

function SettingsTab({ overview, reload }: { overview: Overview; reload: () => Promise<void> }) {
  const [form, setForm] = useState<PayrollSettings>({ ...DEFAULT_PAYROLL_SETTINGS, ...(overview.settings.payroll || {}) });
  const { saving, error, run } = usePayrollSubmit();
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await run("hr-payroll-settings", { kind: "settings", ...form, ssc_max_wage: form.ssc_max_wage || 0 }, "تم حفظ إعدادات الرواتب.")) await reload();
  };
  return (
    <form onSubmit={save} className="bg-white rounded-2xl border border-stone-200 p-4 space-y-4 max-w-2xl">
      <p className="text-xs font-black text-amber-700">الضمان الاجتماعي (الأردن)</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div><label className={labelCls}>اقتطاع الموظف %</label><input type="number" step="0.01" min={0} max={100} required className={inputCls} value={form.ssc_employee_rate} onChange={(e) => setForm({ ...form, ssc_employee_rate: Number(e.target.value) })} /></div>
        <div><label className={labelCls}>مساهمة الشركة %</label><input type="number" step="0.01" min={0} max={100} required className={inputCls} value={form.ssc_employer_rate} onChange={(e) => setForm({ ...form, ssc_employer_rate: Number(e.target.value) })} /></div>
        <div><label className={labelCls}>الحد الأعلى للأجر الخاضع (0 = بلا حد)</label><input type="number" step="0.001" min={0} className={inputCls} value={form.ssc_max_wage} onChange={(e) => setForm({ ...form, ssc_max_wage: Number(e.target.value) })} /></div>
      </div>
      <p className="text-[11px] text-stone-500">الأجر الخاضع = الراتب الأساسي + البدلات المعلّمة «خاضعة للضمان». لا يُطبّق الضمان على نوع التوظيف «عمل حر». ضريبة الدخل تُسجّل كحركة شهرية.</p>
      <p className="text-xs font-black text-amber-700">الخصومات</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label className={labelCls}>أساس احتساب أجر اليوم (أيام)</label><input type="number" min={20} max={31} required className={inputCls} value={form.daily_basis} onChange={(e) => setForm({ ...form, daily_basis: Number(e.target.value) })} /></div>
        <label className="flex items-center gap-2 text-sm font-bold text-stone-700 self-end pb-2">
          <input type="checkbox" checked={form.deduct_absences} onChange={(e) => setForm({ ...form, deduct_absences: e.target.checked })} />
          خصم أيام الغياب تلقائيًا من سجل الحضور
        </label>
      </div>
      <p className="text-[11px] text-stone-500">الإجازة بدون راتب تُخصم دائمًا. خصم الغياب يعتمد على تسجيل الحضور؛ فعّله فقط بعد التأكد من التزام الموظفين بالتسجيل.</p>
      {error && <p role="alert" className="text-xs font-bold text-rose-700">{error}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 text-sm font-black">
          <Save className="w-4 h-4" /> حفظ (يُحدّث المسودات عند إعادة الاحتساب)
        </button>
      </div>
    </form>
  );
}

export default function PayrollPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"runs" | "adjustments" | "advances" | "settings">("runs");
  const [role, setRole] = useState<string>("");

  const reload = useCallback(async () => {
    try {
      setOverview(await loadBusiness<Overview>("/api/hr/payroll"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل الرواتب.");
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(async () => {
      setRole(getCurrentUser()?.role || "");
      await reload();
    });
  }, [reload]);

  // HR-only data is only returned to HR roles, so its presence is the source of truth for the UI.
  const isHr = !!overview?.employees;
  const canPay = ["finance", "admin", "general_manager"].includes(role);
  const tabs = useMemo(() => ([
    { id: "runs", label: "مسيرات الرواتب" },
    ...(isHr ? [
      { id: "adjustments", label: "مكافآت وخصومات الشهر" },
      { id: "advances", label: "السلف" },
      { id: "settings", label: "إعدادات الرواتب" },
    ] : []),
  ] as { id: typeof tab; label: string }[]), [isHr]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5">
          <Wallet className="w-6 h-6 text-amber-500" /> الرواتب
        </h2>
        <p className="text-xs sm:text-sm text-stone-500 mt-1">
          {isHr ? "احتساب مسير الرواتب الشهري واعتماده، ثم تسليمه للمالية للصرف" : "المسيرات المعتمدة من الموارد البشرية بانتظار الصرف"}
        </p>
      </div>

      {error && <LoadError message={error} onRetry={() => void reload()} />}

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition",
              tab === t.id ? "bg-stone-900 text-white" : "bg-white text-stone-600 hover:bg-stone-50 border border-stone-200")}>
            {t.label}
          </button>
        ))}
      </div>

      {!overview ? (
        !error && <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center text-sm text-stone-400">جاري التحميل...</div>
      ) : tab === "runs" ? (
        <RunsTab overview={overview} isHr={isHr} canPay={canPay} reload={reload} />
      ) : tab === "adjustments" ? (
        <AdjustmentsTab overview={overview} />
      ) : tab === "advances" ? (
        <AdvancesTab overview={overview} reload={reload} />
      ) : (
        <SettingsTab overview={overview} reload={reload} />
      )}
    </div>
  );
}
