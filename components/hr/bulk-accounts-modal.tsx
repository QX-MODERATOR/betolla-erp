"use client";

import { useState } from "react";
import { X, Users, Save } from "lucide-react";
import { saveBusiness } from "@/lib/business-client";
import { useToast } from "@/components/common/toast";
import type { LinkableAccount } from "@/components/hr/employee-form-modal";
import type { HrEmployee } from "@/lib/hr";

// Creates employee files for login accounts that aren't linked yet, so every user gets HR self-service.
export function BulkAccountsModal({ accounts, employees, onClose, onSaved }: {
  accounts: LinkableAccount[]; employees: HrEmployee[]; onClose: () => void; onSaved: () => void;
}) {
  const { showToast } = useToast();
  const linked = new Set(employees.map((e) => e.account_id).filter(Boolean));
  const unlinked = accounts.filter((a) => !linked.has(a.id));
  const [selected, setSelected] = useState<Set<string>>(() => new Set(unlinked.map((a) => a.id)));
  const [hireDate, setHireDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggle = (id: string) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || !selected.size) return;
    setSaving(true);
    setError("");
    try {
      const result = await saveBusiness<{ created: number; skipped: number }>("hr-bulk-accounts", "/api/hr/employees",
        { kind: "bulk_accounts", hire_date: hireDate, account_ids: unlinked.filter((a) => selected.has(a.id)).map((a) => a.id) });
      showToast(`تم إنشاء ${result.created} ملف وظيفي${result.skipped ? ` (تم تخطي ${result.skipped} مرتبط مسبقًا)` : ""}.`, "success");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-start sm:items-center justify-center p-3 overflow-y-auto" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="bg-[#faf7f2] w-full max-w-lg rounded-3xl shadow-2xl border border-stone-200 my-4">
        <div className="flex items-center justify-between p-4 border-b border-stone-200">
          <h3 className="font-black text-base text-stone-900 flex items-center gap-2"><Users className="w-5 h-5 text-amber-500" /> إنشاء ملفات لحسابات النظام</h3>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="p-2 rounded-xl hover:bg-stone-200/60"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-stone-600 leading-relaxed">
            ينشئ ملفًا وظيفيًا مرتبطًا لكل حساب دخول محدد، بالقسم والمسمى المناسبين لدوره، ليتمكن كل موظف من تسجيل الحضور وطلب الإجازات من حسابه.
            يمكنك تعديل تفاصيل كل ملف لاحقًا.
          </p>
          {!unlinked.length ? (
            <p className="text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3">جميع حسابات النظام مرتبطة بملفات وظيفية ✓</p>
          ) : (
            <>
              <div>
                <label className="block text-[11px] font-bold text-stone-500 mb-1">تاريخ التعيين الافتراضي *</label>
                <input type="date" required value={hireDate} onChange={(e) => setHireDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-white text-sm" />
              </div>
              <div className="bg-white rounded-2xl border border-stone-200 max-h-72 overflow-y-auto divide-y divide-stone-100">
                {unlinked.map((a) => (
                  <label key={a.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-amber-50/40">
                    <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-stone-900 truncate">{a.name}</p>
                      <p className="text-[11px] text-stone-500 font-mono" dir="ltr">@{a.username} · {a.role}</p>
                    </div>
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-stone-400">ألغِ تحديد الحسابات التي لا تمثل موظفين (مثل شركات التوصيل الخارجية).</p>
            </>
          )}
          {error && <p role="alert" className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-sm font-bold text-stone-600">إغلاق</button>
            {unlinked.length > 0 && (
              <button type="submit" disabled={saving || !selected.size} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 text-sm font-black">
                <Save className="w-4 h-4" /> {saving ? "جاري الإنشاء..." : `إنشاء ${selected.size} ملف`}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
