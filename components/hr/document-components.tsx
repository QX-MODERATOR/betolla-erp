"use client";

import { useState } from "react";
import { X, Save, FileBadge } from "lucide-react";
import { saveBusiness } from "@/lib/business-client";
import { useToast } from "@/components/common/toast";
import { cn } from "@/lib/utils";
import { DOCUMENT_TYPE_LABELS, expiryTone, type DocumentType, type HrDocument, type HrEmployee } from "@/lib/hr";

const inputCls = "w-full px-3 py-2 rounded-xl border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/60";
const labelCls = "block text-[11px] font-bold text-stone-500 mb-1";

export function ExpiryBadge({ days }: { days: number | null }) {
  const t = expiryTone(days);
  return <span className={cn("inline-block text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap", t.color)}>{t.label}</span>;
}

// Create or edit a document record (metadata only; no file storage by design).
export function DocumentModal({ document, employees, fixedEmployeeId, onClose, onSaved }: {
  document?: HrDocument | null; employees?: HrEmployee[]; fixedEmployeeId?: string;
  onClose: () => void; onSaved: () => void;
}) {
  const { showToast } = useToast();
  const active = (employees || []).filter((e) => e.status !== "terminated");
  const [form, setForm] = useState({
    employee_id: document?.employee_id || fixedEmployeeId || active[0]?.id || "",
    doc_type: (document?.doc_type || "national_id") as DocumentType,
    title: document?.title || "", doc_number: document?.doc_number || "",
    issue_date: document?.issue_date || "", expiry_date: document?.expiry_date || "",
    notes: document?.notes || "", archived: document?.archived || false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    const { employee_id, archived, ...fields } = form;
    const body = document ? { id: document.id, ...fields, archived } : { employee_id, ...fields };
    try {
      await saveBusiness(`hr-document-${document?.id || employee_id}`, "/api/hr/documents", body);
      showToast(document ? "تم تحديث المستند." : "تمت إضافة المستند.", "success");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-dialog="" className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-start sm:items-center justify-center p-3 overflow-y-auto" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="bg-[#faf7f2] w-full max-w-lg rounded-3xl shadow-2xl border border-stone-200 my-4">
        <div className="flex items-center justify-between p-4 border-b border-stone-200">
          <h3 className="font-black text-base text-stone-900 flex items-center gap-2"><FileBadge className="w-5 h-5 text-amber-500" />{document ? "تعديل مستند" : "إضافة مستند"}</h3>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="p-2 rounded-xl hover:bg-stone-200/60"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {!document && !fixedEmployeeId && (
            <div className="sm:col-span-2"><label className={labelCls}>الموظف *</label>
              <select required className={inputCls} value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
                {active.map((emp) => <option key={emp.id} value={emp.id}>{emp.full_name_ar} ({emp.employee_no})</option>)}
              </select>
            </div>
          )}
          <div><label className={labelCls}>نوع المستند *</label>
            <select className={inputCls} value={form.doc_type} onChange={(e) => setForm({ ...form, doc_type: e.target.value as DocumentType })}>
              {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div><label className={labelCls}>الرقم</label><input dir="ltr" className={inputCls} value={form.doc_number} onChange={(e) => setForm({ ...form, doc_number: e.target.value })} /></div>
          <div className="sm:col-span-2"><label className={labelCls}>وصف مختصر</label><input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="مثال: عقد سنة 2026" /></div>
          <div><label className={labelCls}>تاريخ الإصدار</label><input type="date" className={inputCls} value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} /></div>
          <div><label className={labelCls}>تاريخ الانتهاء</label><input type="date" min={form.issue_date || undefined} className={inputCls} value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></div>
          <div className="sm:col-span-2"><label className={labelCls}>ملاحظات HR (لا تظهر للموظف)</label><textarea rows={2} className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          {document && (
            <label className="sm:col-span-2 flex items-center gap-2 text-sm font-bold text-stone-700">
              <input type="checkbox" checked={form.archived} onChange={(e) => setForm({ ...form, archived: e.target.checked })} /> أرشفة (مستند قديم/مستبدل — يتوقف التنبيه عليه)
            </label>
          )}
          <p className="sm:col-span-2 text-[11px] text-stone-500">يتم تنبيه الموارد البشرية والموظف قبل الانتهاء بـ 30 يومًا و7 أيام وعند الانتهاء. احتفظ بالنسخة الورقية/الإلكترونية في ملف الموظف.</p>
          {error && <p role="alert" className="sm:col-span-2 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}
        </div>
        <div className="p-4 border-t border-stone-200 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-sm font-bold text-stone-600">إلغاء</button>
          <button type="submit" disabled={saving || !form.employee_id} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 text-sm font-black">
            <Save className="w-4 h-4" /> حفظ
          </button>
        </div>
      </form>
    </div>
  );
}
