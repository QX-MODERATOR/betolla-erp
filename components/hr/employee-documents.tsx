"use client";

import { useCallback, useEffect, useState } from "react";
import { FileBadge, Plus, Pencil } from "lucide-react";
import { loadBusiness } from "@/lib/business-client";
import { Panel } from "@/components/hr/hr-ui";
import { DocumentModal, ExpiryBadge } from "@/components/hr/document-components";
import { DOCUMENT_TYPE_LABELS, type HrDocument } from "@/lib/hr";

// Documents tab on an employee's HR profile.
export function EmployeeDocuments({ employeeId }: { employeeId: string }) {
  const [docs, setDocs] = useState<HrDocument[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<HrDocument | null | "new">(null);

  const load = useCallback(async () => {
    try {
      setDocs((await loadBusiness<{ documents: HrDocument[] }>(`/api/hr/documents?employee=${employeeId}`)).documents);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [employeeId]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  return (
    <Panel title="المستندات والوثائق" icon={<FileBadge className="w-4 h-4 text-amber-500" />}
      action={<button onClick={() => setEditing("new")} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-stone-900 text-amber-400 text-xs font-bold"><Plus className="w-3.5 h-3.5" /> مستند</button>}>
      {error && <p className="text-xs text-rose-700 mb-2">{error}</p>}
      {!docs ? <p className="text-sm text-stone-400">جاري التحميل...</p> : !docs.length ? <p className="text-sm text-stone-400">لا توجد مستندات مسجلة.</p> : (
        <ul className="divide-y divide-stone-100">
          {docs.map((d) => (
            <li key={d.id} className={`flex items-center justify-between gap-2 py-2 ${d.archived ? "opacity-50" : ""}`}>
              <div className="min-w-0">
                <p className="text-sm font-bold">{DOCUMENT_TYPE_LABELS[d.doc_type]}{d.title ? ` — ${d.title}` : ""}</p>
                <p className="text-[11px] text-stone-500" dir="ltr">{[d.doc_number, d.issue_date && `from ${d.issue_date}`, d.expiry_date && `to ${d.expiry_date}`].filter(Boolean).join("  ·  ")}</p>
                {d.notes && <p className="text-[11px] text-stone-500">{d.notes}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {d.archived ? <span className="text-[11px] text-stone-400">مؤرشف</span> : <ExpiryBadge days={d.days_left} />}
                <button onClick={() => setEditing(d)} className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-50" aria-label="تعديل"><Pencil className="w-3.5 h-3.5" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <DocumentModal document={editing === "new" ? null : editing} fixedEmployeeId={employeeId}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />
      )}
    </Panel>
  );
}
