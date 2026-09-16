"use client";

import { useCallback, useEffect, useState } from "react";
import { TrendingUp, Info, Eye, Pencil, Plus, Users } from "lucide-react";
import { loadBusiness, saveBusiness } from "@/lib/business-client";
import { useToast } from "@/components/common/toast";
import { LoadError, Panel } from "@/components/hr/hr-ui";
import { ReviewEditorModal, ReviewStatusBadge, ReviewViewModal, ScoreStars } from "@/components/hr/review-components";
import type { HrEmployee, HrReview } from "@/lib/hr";

interface Data { mine: HrReview[]; team: HrReview[]; reports: HrEmployee[]; today: string }

function ReviewRow({ r, showName, action }: { r: HrReview; showName?: boolean; action: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="font-black text-stone-900">{showName ? `${r.employee_name} · ` : ""}<span dir="ltr">{r.period_label}</span></p>
        <div className="flex items-center gap-2 mt-0.5"><ScoreStars value={r.overall} size="w-3.5 h-3.5" /><ReviewStatusBadge status={r.status} /></div>
      </div>
      {action}
    </li>
  );
}

export default function MyReviewsPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [notLinked, setNotLinked] = useState(false);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState<{ review: HrReview; own: boolean } | null>(null);
  const [editing, setEditing] = useState<HrReview | null | "new">(null);

  const reload = useCallback(async () => {
    try {
      setData(await loadBusiness<Data>("/api/hr/me/reviews"));
      setError("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "تعذر تحميل التقييمات.";
      if (msg.includes("غير مرتبط")) setNotLinked(true); else setError(msg);
    }
  }, []);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);

  const acknowledge = async (review: HrReview, comment: string) => {
    try {
      await saveBusiness(`hr-review-ack-${review.id}`, "/api/hr/me/reviews", { id: review.id, comment }, "PATCH");
      showToast("شكرًا، تم تسجيل اطلاعك على التقييم.", "success");
      setViewing(null);
      await reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const view = (review: HrReview, own: boolean) => (
    <button onClick={() => setViewing({ review, own })} className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-stone-200 text-xs font-bold hover:bg-stone-50 shrink-0">
      <Eye className="w-3.5 h-3.5" /> {own && review.status === "submitted" ? "اطّلع وأكّد" : "عرض"}
    </button>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5"><TrendingUp className="w-6 h-6 text-amber-500" /> تقييماتي</h2>
        <p className="text-xs sm:text-sm text-stone-500 mt-1">تقييمات أدائك{data?.reports.length ? " وتقييمات فريقك المباشر" : ""}</p>
      </div>

      {error && <LoadError message={error} onRetry={() => void reload()} />}
      {notLinked ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center">
          <Info className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <p className="font-bold text-stone-800">لم يتم ربط حسابك بملف وظيفي بعد</p>
        </div>
      ) : !data ? (
        !error && <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center text-sm text-stone-400">جاري التحميل...</div>
      ) : (
        <>
          {data.mine.some((r) => r.status === "submitted") && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-sm font-bold text-amber-900">لديك تقييم جديد بانتظار اطلاعك.</div>
          )}
          <Panel title="تقييمات أدائي">
            {!data.mine.length ? <p className="text-sm text-stone-400">لا توجد تقييمات منشورة بعد.</p> : (
              <ul className="-m-4 divide-y divide-stone-100">{data.mine.map((r) => <ReviewRow key={r.id} r={r} action={view(r, true)} />)}</ul>
            )}
          </Panel>

          {data.reports.length > 0 && (
            <Panel title={`تقييمات فريقي (${data.reports.length} موظف)`} icon={<Users className="w-4 h-4 text-amber-500" />}
              action={<button onClick={() => setEditing("new")} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-stone-900 text-amber-400 text-xs font-bold"><Plus className="w-3.5 h-3.5" /> تقييم عضو</button>}>
              {!data.team.length ? <p className="text-sm text-stone-400">لم تُقيّم أحدًا من فريقك بعد: {data.reports.map((e) => e.full_name_ar).join("، ")}</p> : (
                <ul className="-m-4 divide-y divide-stone-100">
                  {data.team.map((r) => (
                    <ReviewRow key={r.id} r={r} showName action={r.status === "draft"
                      ? <button onClick={() => setEditing(r)} className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-stone-200 text-xs font-bold hover:bg-stone-50 shrink-0"><Pencil className="w-3.5 h-3.5" /> إكمال</button>
                      : view(r, false)} />
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </>
      )}

      {viewing && (
        <ReviewViewModal review={viewing.review} onClose={() => setViewing(null)}
          onAcknowledge={viewing.own ? (comment) => acknowledge(viewing.review, comment) : undefined} />
      )}
      {editing && data && (
        <ReviewEditorModal endpoint="/api/hr/me/reviews" employees={data.reports} review={editing === "new" ? null : editing} today={data.today}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} />
      )}
    </div>
  );
}
