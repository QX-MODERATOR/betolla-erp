"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileBadge, Plus, Search, Pencil, Download } from "lucide-react";
import { loadBusiness } from "@/lib/business-client";
import { LoadError, StatCard } from "@/components/hr/hr-ui";
import { DocumentModal, ExpiryBadge } from "@/components/hr/document-components";
import { DOCUMENT_TYPE_LABELS, expiryTone, type DocumentType, type HrDocument, type HrEmployee } from "@/lib/hr";

interface Data { documents: HrDocument[]; employees: HrEmployee[]; today: string }
type Filter = "all" | "expired" | "30" | "90" | "valid" | "none" | "archived";

export default function DocumentsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"all" | DocumentType>("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<HrDocument | null | "new">(null);

  const reload = useCallback(async () => {
    try {
      setData(await loadBusiness<Data>("/api/hr/documents"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل المستندات.");
    }
  }, []);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);

  const docs = data?.documents || [];
  const live = docs.filter((d) => !d.archived && d.employee_status !== "terminated");
  const matchesFilter = (d: HrDocument) => {
    const n = d.days_left;
    switch (filter) {
      case "archived": return d.archived;
      case "expired": return !d.archived && n !== null && n < 0;
      case "30": return !d.archived && n !== null && n >= 0 && n <= 30;
      case "90": return !d.archived && n !== null && n >= 0 && n <= 90;
      case "valid": return !d.archived && n !== null && n > 90;
      case "none": return !d.archived && n === null;
      default: return !d.archived;
    }
  };
  const filtered = docs.filter((d) => matchesFilter(d) && (type === "all" || d.doc_type === type) &&
    (!search.trim() || d.employee_name.includes(search.trim()) || d.doc_number.toLowerCase().includes(search.trim().toLowerCase())));

  // Current staff who have no national ID / passport and no contract on record.
  const missing = (data?.employees || []).filter((e) => e.status !== "terminated").filter((e) => {
    const mine = live.filter((d) => d.employee_id === e.id);
    return !mine.some((d) => d.doc_type === "national_id" || d.doc_type === "passport") || !mine.some((d) => d.doc_type === "contract");
  });

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.json_to_sheet(filtered.map((d) => ({
      "الموظف": d.employee_name, "الرقم الوظيفي": d.employee_no, "النوع": DOCUMENT_TYPE_LABELS[d.doc_type], "الوصف": d.title,
      "الرقم": d.doc_number, "الإصدار": d.issue_date || "", "الانتهاء": d.expiry_date || "", "الحالة": expiryTone(d.days_left).label,
    })));
    sheet["!views"] = [{ RTL: true }];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Documents");
    XLSX.writeFile(book, `betolla-documents-${data?.today || ""}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5"><FileBadge className="w-6 h-6 text-amber-500" /> المستندات والوثائق</h2>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">سجل وثائق الموظفين وتواريخ انتهائها مع تنبيهات تلقائية</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportExcel} disabled={!filtered.length} className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 font-bold text-sm rounded-xl disabled:opacity-50">
            <Download className="w-4 h-4" /> Excel
          </button>
          <button onClick={() => setEditing("new")} disabled={!data} className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 font-bold text-sm rounded-xl">
            <Plus className="w-4 h-4" /> مستند جديد
          </button>
        </div>
      </div>

      {error && <LoadError message={error} onRetry={() => void reload()} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button onClick={() => setFilter("expired")} className="text-start"><StatCard label="منتهية" value={live.filter((d) => d.days_left !== null && d.days_left < 0).length} tone="text-rose-600" /></button>
        <button onClick={() => setFilter("30")} className="text-start"><StatCard label="تنتهي خلال 30 يومًا" value={live.filter((d) => d.days_left !== null && d.days_left >= 0 && d.days_left <= 30).length} tone="text-amber-600" /></button>
        <button onClick={() => setFilter("all")} className="text-start"><StatCard label="مستندات فعّالة" value={live.length} /></button>
        <StatCard label="ملفات ناقصة (هوية/عقد)" value={missing.length} tone={missing.length ? "text-rose-600" : "text-emerald-700"}
          hint={missing.slice(0, 3).map((e) => e.full_name_ar).join("، ") || undefined} />
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 p-3 flex flex-col md:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-stone-400 absolute top-1/2 -translate-y-1/2 start-3" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالموظف أو رقم المستند..."
            className="w-full ps-9 pe-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/60" />
        </div>
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white">
          <option value="all">كل الأنواع</option>
          {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white">
          <option value="all">كل المستندات الفعّالة</option>
          <option value="expired">منتهية</option>
          <option value="30">تنتهي خلال 30 يومًا</option>
          <option value="90">تنتهي خلال 90 يومًا</option>
          <option value="valid">سارية (أكثر من 90 يومًا)</option>
          <option value="none">بدون تاريخ انتهاء</option>
          <option value="archived">المؤرشفة</option>
        </select>
      </div>

      {!data ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center text-sm text-stone-400">جاري التحميل...</div>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-[11px] text-stone-500">
              <tr>{["الموظف", "المستند", "الرقم", "الانتهاء", "الحالة", ""].map((h, i) => <th key={i} className="text-start px-4 py-2">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {!filtered.length ? <tr><td colSpan={6} className="p-8 text-center text-stone-400">لا توجد مستندات مطابقة.</td></tr> : filtered.map((d) => (
                <tr key={d.id} className={d.archived ? "opacity-60" : "hover:bg-amber-50/30"}>
                  <td className="px-4 py-2"><Link href={`/hr/employees/${d.employee_id}`} className="font-bold hover:text-amber-700">{d.employee_name}</Link></td>
                  <td className="px-4 py-2">{DOCUMENT_TYPE_LABELS[d.doc_type]}{d.title && <p className="text-[11px] text-stone-500">{d.title}</p>}</td>
                  <td className="px-4 py-2 font-mono text-xs" dir="ltr">{d.doc_number || "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs" dir="ltr">{d.expiry_date || "—"}</td>
                  <td className="px-4 py-2">{d.archived ? <span className="text-[11px] text-stone-400">مؤرشف</span> : <ExpiryBadge days={d.days_left} />}</td>
                  <td className="px-4 py-2"><button onClick={() => setEditing(d)} className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-50" aria-label="تعديل"><Pencil className="w-3.5 h-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && data && (
        <DocumentModal document={editing === "new" ? null : editing} employees={data.employees}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} />
      )}
    </div>
  );
}
