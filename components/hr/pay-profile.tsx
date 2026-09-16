"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Save, X, Wallet } from "lucide-react";
import { loadBusiness, saveBusiness } from "@/lib/business-client";
import { useToast } from "@/components/common/toast";
import { Panel } from "@/components/hr/hr-ui";
import { cn, formatCurrency } from "@/lib/utils";
import { ADVANCE_STATUS_LABELS, type HrAdvance, type HrEmployee, type HrSalaryComponent } from "@/lib/hr";

const inputCls = "w-full px-3 py-2 rounded-xl border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/60";

interface Draft { id?: string; component_kind: "allowance" | "deduction"; name_ar: string; amount: string; ssc_subject: boolean; is_active: boolean }

// Recurring salary components + advances for one employee (HR only). Changes refresh any draft payroll.
export function PayProfile({ employee }: { employee: HrEmployee }) {
  const { showToast } = useToast();
  const [components, setComponents] = useState<HrSalaryComponent[]>([]);
  const [advances, setAdvances] = useState<HrAdvance[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await loadBusiness<{ components: HrSalaryComponent[]; advances: HrAdvance[] }>(`/api/hr/payroll?employee=${employee.id}`);
      setComponents(data.components);
      setAdvances(data.advances);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [employee.id]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft || saving) return;
    setSaving(true);
    setError("");
    const body = draft.id
      ? { kind: "component", id: draft.id, name_ar: draft.name_ar, amount: draft.amount, ssc_subject: draft.ssc_subject, is_active: draft.is_active }
      : { kind: "component", employee_id: employee.id, component_kind: draft.component_kind, name_ar: draft.name_ar, amount: draft.amount, ssc_subject: draft.ssc_subject };
    try {
      await saveBusiness(`hr-component-${draft.id || employee.id}`, "/api/hr/payroll", body);
      showToast("تم حفظ بند الراتب.", "success");
      setDraft(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const active = components.filter((c) => c.is_active);
  const allowances = active.filter((c) => c.kind === "allowance").reduce((s, c) => s + c.amount, 0);
  const deductions = active.filter((c) => c.kind === "deduction").reduce((s, c) => s + c.amount, 0);

  return (
    <div className="space-y-4">
      <Panel title="بنود الراتب الشهرية الثابتة" icon={<Wallet className="w-4 h-4 text-amber-500" />}
        action={!draft && (
          <button onClick={() => setDraft({ component_kind: "allowance", name_ar: "", amount: "", ssc_subject: false, is_active: true })}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-stone-900 text-amber-400 text-xs font-bold">
            <Plus className="w-3.5 h-3.5" /> بند جديد
          </button>
        )}>
        <div className="grid grid-cols-3 gap-2 mb-3 text-center text-xs">
          <div className="rounded-xl bg-stone-50 p-2"><p className="text-stone-500">الأساسي</p><p className="font-black">{formatCurrency(employee.basic_salary)}</p></div>
          <div className="rounded-xl bg-emerald-50 p-2"><p className="text-emerald-700">+ البدلات</p><p className="font-black">{formatCurrency(allowances)}</p></div>
          <div className="rounded-xl bg-rose-50 p-2"><p className="text-rose-700">− الاقتطاعات الثابتة</p><p className="font-black">{formatCurrency(deductions)}</p></div>
        </div>
        {!components.length && !draft && <p className="text-sm text-stone-400">لا توجد بدلات أو اقتطاعات ثابتة.</p>}
        <ul className="divide-y divide-stone-100">
          {components.map((c) => (
            <li key={c.id} className={cn("flex items-center justify-between gap-2 py-2", !c.is_active && "opacity-50")}>
              <div className="min-w-0">
                <p className="text-sm font-bold text-stone-900">{c.name_ar} {!c.is_active && <span className="text-[10px] text-stone-400">(موقوف)</span>}</p>
                <p className="text-[11px] text-stone-500">{c.kind === "allowance" ? "بدل" : "اقتطاع"}{c.ssc_subject ? " · خاضع للضمان" : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("text-sm font-black", c.kind === "allowance" ? "text-emerald-700" : "text-rose-700")}>{c.kind === "allowance" ? "+" : "−"}{formatCurrency(c.amount)}</span>
                <button onClick={() => setDraft({ id: c.id, component_kind: c.kind, name_ar: c.name_ar, amount: String(c.amount), ssc_subject: c.ssc_subject, is_active: c.is_active })}
                  className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-50" aria-label={`تعديل ${c.name_ar}`}><Pencil className="w-3.5 h-3.5" /></button>
              </div>
            </li>
          ))}
        </ul>
        {draft && (
          <form onSubmit={save} className="mt-3 rounded-2xl border border-amber-300 p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {!draft.id && (
              <select className={inputCls} value={draft.component_kind} onChange={(e) => setDraft({ ...draft, component_kind: e.target.value as Draft["component_kind"] })}>
                <option value="allowance">بدل (يُضاف)</option>
                <option value="deduction">اقتطاع ثابت (يُخصم)</option>
              </select>
            )}
            <input required placeholder="الاسم (مثال: بدل مواصلات)" className={inputCls} value={draft.name_ar} onChange={(e) => setDraft({ ...draft, name_ar: e.target.value })} />
            <input required dir="ltr" inputMode="decimal" placeholder="المبلغ الشهري" className={inputCls} value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
            {draft.component_kind === "allowance" && (
              <label className="flex items-center gap-2 text-xs font-bold text-stone-700"><input type="checkbox" checked={draft.ssc_subject} onChange={(e) => setDraft({ ...draft, ssc_subject: e.target.checked })} /> خاضع للضمان الاجتماعي</label>
            )}
            {draft.id && (
              <label className="flex items-center gap-2 text-xs font-bold text-stone-700"><input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} /> فعّال</label>
            )}
            {error && <p role="alert" className="sm:col-span-2 text-xs font-bold text-rose-700">{error}</p>}
            <div className="sm:col-span-2 flex justify-end gap-2">
              <button type="button" onClick={() => { setDraft(null); setError(""); }} className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-stone-200 text-xs font-bold"><X className="w-3.5 h-3.5" /> إلغاء</button>
              <button type="submit" disabled={saving} className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 text-xs font-black"><Save className="w-3.5 h-3.5" /> حفظ</button>
            </div>
          </form>
        )}
      </Panel>

      <Panel title="السلف">
        {!advances.length ? <p className="text-sm text-stone-400">لا توجد سلف. تُسجَّل السلف من صفحة الرواتب.</p> : (
          <ul className="divide-y divide-stone-100">
            {advances.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <p className="font-bold">{formatCurrency(a.amount)} <span className="text-xs text-stone-500">· قسط {formatCurrency(a.monthly_amount)} من {a.start_month}</span></p>
                  <p className="text-[11px] text-stone-500">{a.reason}</p>
                </div>
                <div className="text-end text-xs">
                  <p>المتبقي <b>{formatCurrency(a.remaining)}</b></p>
                  <p className="text-stone-500">{ADVANCE_STATUS_LABELS[a.status]}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
