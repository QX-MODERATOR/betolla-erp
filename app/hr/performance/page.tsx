"use client";

import { useCallback, useEffect, useState } from "react";
import { TrendingUp, Plus, Search, Eye, Pencil } from "lucide-react";
import { loadBusiness } from "@/lib/business-client";
import { LoadError, StatCard } from "@/components/hr/hr-ui";
import { ReviewEditorModal, ReviewStatusBadge, ReviewViewModal, ScoreStars } from "@/components/hr/review-components";
import { REVIEW_STATUS_LABELS, type HrEmployee, type HrReview, type ReviewStatus } from "@/lib/hr";

interface Data { reviews: HrReview[]; employees: HrEmployee[]; today: string }

export default function PerformancePage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("all");
  const [status, setStatus] = useState<"all" | ReviewStatus>("all");
  const [editing, setEditing] = useState<HrReview | null | "new">(null);
  const [viewing, setViewing] = useState<HrReview | null>(null);

  const reload = useCallback(async () => {
    try {
      setData(await loadBusiness<Data>("/api/hr/reviews"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل التقييمات.");
    }
  }, []);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);

  const reviews = data?.reviews || [];
  const periods = [...new Set(reviews.map((r) => r.period_label))].sort().reverse();
  const filtered = reviews.filter((r) =>
    (period === "all" || r.period_label === period) && (status === "all" || r.status === status) &&
    (!search.trim() || r.employee_name.includes(search.trim()) || r.employee_no.toLowerCase().includes(search.trim().toLowerCase())));
  const scored = filtered.filter((r) => r.status !== "draft" && r.overall !== null);
  const avg = scored.length ? Math.round((scored.reduce((s, r) => s + (r.overall || 0), 0) / scored.length) * 100) / 100 : null;

  // Current employees with no review at all in the selected period (or ever, when "all").
  const active = (data?.employees || []).filter((e) => e.status !== "terminated");
  const reviewedIds = new Set(reviews.filter((r) => period === "all" || r.period_label === period).map((r) => r.employee_id));
  const notReviewed = active.filter((e) => !reviewedIds.has(e.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5"><TrendingUp className="w-6 h-6 text-amber-500" /> تقييم الأداء</h2>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">تقييمات دورية بالمعايير ومؤشرات المبيعات والحضور الفعلية</p>
        </div>
        <button onClick={() => setEditing("new")} disabled={!data} className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 font-bold text-sm rounded-xl">
          <Plus className="w-4 h-4" /> تقييم جديد
        </button>
      </div>

      {error && <LoadError message={error} onRetry={() => void reload()} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="متوسط التقييم" value={avg === null ? "—" : `${avg} / 5`} tone="text-amber-700" />
        <StatCard label="مسودات" value={filtered.filter((r) => r.status === "draft").length} />
        <StatCard label="بانتظار اطلاع الموظف" value={filtered.filter((r) => r.status === "submitted").length} tone="text-blue-700" />
        <StatCard label={period === "all" ? "موظفون بلا أي تقييم" : `بلا تقييم في ${period}`} value={notReviewed.length}
          tone={notReviewed.length ? "text-rose-600" : "text-emerald-700"} hint={notReviewed.slice(0, 3).map((e) => e.full_name_ar).join("، ") || undefined} />
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 p-3 flex flex-col md:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-stone-400 absolute top-1/2 -translate-y-1/2 start-3" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث باسم الموظف..."
            className="w-full ps-9 pe-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/60" />
        </div>
        <select value={period} onChange={(e) => setPeriod(e.target.value)} className="px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white">
          <option value="all">كل الفترات</option>
          {periods.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white">
          <option value="all">كل الحالات</option>
          {Object.entries(REVIEW_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {!data ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center text-sm text-stone-400">جاري التحميل...</div>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-[11px] text-stone-500">
              <tr>{["الموظف", "الفترة", "التقييم", "المبيعات المسلّمة", "الحالة", "المقيّم", ""].map((h, i) => <th key={i} className="text-start px-4 py-2">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {!filtered.length ? <tr><td colSpan={7} className="p-8 text-center text-stone-400">لا توجد تقييمات مطابقة.</td></tr> : filtered.map((r) => (
                <tr key={r.id} className="hover:bg-amber-50/30">
                  <td className="px-4 py-2"><p className="font-bold">{r.employee_name}</p><p className="text-[11px] text-stone-500">{r.job_title || r.department_name}</p></td>
                  <td className="px-4 py-2 font-mono text-xs" dir="ltr">{r.period_label}</td>
                  <td className="px-4 py-2 whitespace-nowrap"><ScoreStars value={r.overall} size="w-3.5 h-3.5" /> <b className="text-xs">{r.overall ?? "—"}</b></td>
                  <td className="px-4 py-2 text-xs">{r.kpis?.orders_total ? `${r.kpis.orders_delivered}/${r.kpis.orders_total} طلب` : "—"}</td>
                  <td className="px-4 py-2"><ReviewStatusBadge status={r.status} /></td>
                  <td className="px-4 py-2 text-[11px] text-stone-500 font-mono">{r.reviewer_id}</td>
                  <td className="px-4 py-2">
                    {r.status === "draft"
                      ? <button onClick={() => setEditing(r)} className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-50" aria-label="تعديل"><Pencil className="w-3.5 h-3.5" /></button>
                      : <button onClick={() => setViewing(r)} className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-50" aria-label="عرض"><Eye className="w-3.5 h-3.5" /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && data && (
        <ReviewEditorModal endpoint="/api/hr/reviews" employees={active} review={editing === "new" ? null : editing} today={data.today}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} />
      )}
      {viewing && <ReviewViewModal review={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
