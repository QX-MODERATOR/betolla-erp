"use client";

import { useState } from "react";
import { X, Building2, Plus, Save, Pencil } from "lucide-react";
import { saveBusiness } from "@/lib/business-client";
import { useToast } from "@/components/common/toast";
import type { HrDepartment, HrEmployee } from "@/lib/hr";

const inputCls = "w-full px-3 py-2 rounded-xl border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/60";

interface Draft { id?: string; code: string; name_ar: string; name_en: string; head_employee_id: string; is_active: boolean }
const EMPTY: Draft = { code: "", name_ar: "", name_en: "", head_employee_id: "", is_active: true };

export function DepartmentsModal({
  departments, employees, onClose, onChanged,
}: {
  departments: HrDepartment[];
  employees: HrEmployee[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const { showToast } = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const edit = (d: HrDepartment) =>
    setDraft({ id: d.id, code: d.code, name_ar: d.name_ar, name_en: d.name_en, head_employee_id: d.head_employee_id || "", is_active: d.is_active });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft || saving) return;
    setSaving(true);
    setError("");
    const body = draft.id
      ? { id: draft.id, name_ar: draft.name_ar, name_en: draft.name_en, head_employee_id: draft.head_employee_id, is_active: draft.is_active }
      : { code: draft.code, name_ar: draft.name_ar, name_en: draft.name_en, head_employee_id: draft.head_employee_id };
    try {
      await saveBusiness(`hr-department-${draft.id || "new"}`, "/api/hr/departments", body);
      showToast(draft.id ? "تم تحديث القسم." : "تمت إضافة القسم.", "success");
      setDraft(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const activeEmployees = employees.filter((e) => e.status !== "terminated");

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-start sm:items-center justify-center p-3 overflow-y-auto" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-[#faf7f2] w-full max-w-2xl rounded-3xl shadow-2xl border border-stone-200 my-4">
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-stone-200">
          <h3 className="font-black text-lg text-stone-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-amber-500" /> الأقسام والهيكل التنظيمي
          </h3>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="p-2 rounded-xl hover:bg-stone-200/60"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 sm:p-5 space-y-3">
          <div className="bg-white rounded-2xl border border-stone-200 divide-y divide-stone-100">
            {departments.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className={`font-bold text-sm ${d.is_active ? "text-stone-900" : "text-stone-400 line-through"}`}>{d.name_ar}</p>
                  <p className="text-[11px] text-stone-500 truncate">
                    <span dir="ltr" className="font-mono">{d.code}</span> · {d.headcount} موظف
                    {d.head_name ? ` · الرئيس: ${d.head_name}` : ""}
                  </p>
                </div>
                <button onClick={() => edit(d)} className="p-2 rounded-xl border border-stone-200 hover:bg-stone-50" aria-label={`تعديل ${d.name_ar}`}>
                  <Pencil className="w-4 h-4 text-stone-600" />
                </button>
              </div>
            ))}
          </div>

          {!draft ? (
            <button onClick={() => setDraft({ ...EMPTY })} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-stone-900 text-amber-400 text-sm font-bold">
              <Plus className="w-4 h-4" /> قسم جديد
            </button>
          ) : (
            <form onSubmit={save} className="bg-white rounded-2xl border border-amber-300 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-stone-500 mb-1">اسم القسم *</label>
                <input required className={inputCls} value={draft.name_ar} onChange={(e) => setDraft({ ...draft, name_ar: e.target.value })} />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-stone-500 mb-1">الاسم بالإنجليزية</label>
                <input dir="ltr" className={inputCls} value={draft.name_en} onChange={(e) => setDraft({ ...draft, name_en: e.target.value })} />
              </div>
              {!draft.id && (
                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1">رمز القسم (إنجليزي) *</label>
                  <input required dir="ltr" pattern="[a-z][a-z0-9_]{1,39}" className={inputCls} value={draft.code} placeholder="customer_care"
                    onChange={(e) => setDraft({ ...draft, code: e.target.value.toLowerCase() })} />
                </div>
              )}
              <div>
                <label className="block text-[11px] font-bold text-stone-500 mb-1">رئيس القسم</label>
                <select className={inputCls} value={draft.head_employee_id} onChange={(e) => setDraft({ ...draft, head_employee_id: e.target.value })}>
                  <option value="">— لا يوجد —</option>
                  {activeEmployees.map((emp) => <option key={emp.id} value={emp.id}>{emp.full_name_ar}</option>)}
                </select>
              </div>
              {draft.id && (
                <label className="flex items-center gap-2 text-sm font-bold text-stone-700 sm:col-span-2">
                  <input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} />
                  القسم فعّال
                </label>
              )}
              {error && <p role="alert" className="sm:col-span-2 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}
              <div className="sm:col-span-2 flex justify-end gap-2">
                <button type="button" onClick={() => { setDraft(null); setError(""); }} className="px-4 py-2 rounded-xl border border-stone-200 text-sm font-bold text-stone-600">إلغاء</button>
                <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 text-sm font-black">
                  <Save className="w-4 h-4" /> {saving ? "جاري الحفظ..." : "حفظ القسم"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
