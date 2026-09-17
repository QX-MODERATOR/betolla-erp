"use client";

import { useEffect, useState } from "react";
import { X, Save, Send, Star, TrendingUp } from "lucide-react";
import { loadBusiness, saveBusiness } from "@/lib/business-client";
import { useToast } from "@/components/common/toast";
import { cn, formatCurrency } from "@/lib/utils";
import {
  REVIEW_CRITERIA, REVIEW_STATUS_LABELS, SCORE_LABELS, overallScore, reviewPeriods,
  type HrEmployee, type HrKpis, type HrReview, type ReviewStatus,
} from "@/lib/hr";

const inputCls = "w-full px-3 py-2 rounded-xl border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/60";
const labelCls = "block text-[11px] font-bold text-stone-500 mb-1";

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  const s = REVIEW_STATUS_LABELS[status];
  return <span className={cn("inline-block text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap", s.color)}>{s.label}</span>;
}

export function ScoreStars({ value, size = "w-4 h-4" }: { value: number | null; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={value === null ? "بدون تقييم" : `${value} من 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn(size, value !== null && i <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-stone-300")} />
      ))}
    </span>
  );
}

// Objective indicators panel (sales + attendance). Hides sales rows for non-sales staff with no data.
export function KpiGrid({ kpis }: { kpis: Partial<HrKpis> }) {
  const hasSales = (kpis.orders_total || 0) > 0 || (kpis.calls || 0) > 0;
  const attendanceRate = kpis.working_days ? Math.round(((kpis.attendance_days || 0) / Math.max(1, kpis.working_days - (kpis.leave_days || 0))) * 100) : null;
  const items: [string, string][] = [
    ...(hasSales ? [
      ["الطلبات", `${kpis.orders_total ?? 0}`],
      ["مسلّمة", `${kpis.orders_delivered ?? 0}`],
      ["ملغاة/مرتجعة", `${kpis.orders_cancelled ?? 0}`],
      ["مبيعات مسلّمة", formatCurrency(kpis.sales_delivered ?? 0)],
      ["المكالمات", `${kpis.calls ?? 0}`],
      ["مكالمات انتهت بطلب", `${kpis.calls_with_order ?? 0}`],
    ] as [string, string][] : []),
    ["أيام الحضور", `${kpis.attendance_days ?? 0} / ${kpis.working_days ?? 0}`],
    ["نسبة الحضور", attendanceRate === null ? "—" : `${Math.min(100, attendanceRate)}%`],
    ["أيام التأخير", `${kpis.late_days ?? 0}`],
    ["أيام الإجازة", `${kpis.leave_days ?? 0}`],
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl bg-stone-50 border border-stone-100 px-2.5 py-2">
          <p className="text-[10px] text-stone-500">{label}</p>
          <p className="text-sm font-black text-stone-900">{value}</p>
        </div>
      ))}
    </div>
  );
}

// Create/edit a review. endpoint: /api/hr/reviews (HR) or /api/hr/me/reviews (manager).
export function ReviewEditorModal({ endpoint, employees, review, today, onClose, onSaved }: {
  endpoint: "/api/hr/reviews" | "/api/hr/me/reviews";
  employees: HrEmployee[]; review?: HrReview | null; today: string;
  onClose: () => void; onSaved: () => void;
}) {
  const { showToast } = useToast();
  const periods = reviewPeriods(today);
  const [employeeId, setEmployeeId] = useState(review?.employee_id || employees[0]?.id || "");
  const [period, setPeriod] = useState(review
    ? { label: review.period_label, start: review.period_start, end: review.period_end }
    : periods[1]);
  const [scores, setScores] = useState<Record<string, number>>(review?.scores || {});
  const [strengths, setStrengths] = useState(review?.strengths || "");
  const [improvements, setImprovements] = useState(review?.improvements || "");
  const [goals, setGoals] = useState(review?.goals || "");
  const [kpis, setKpis] = useState<Partial<HrKpis> | null>(review?.kpis || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!employeeId || !period.start || !period.end || period.end < period.start) return;
    let cancelled = false;
    loadBusiness<{ kpis: HrKpis }>(`${endpoint}?kpis=${employeeId}&from=${period.start}&to=${period.end}`)
      .then((d) => { if (!cancelled) setKpis(d.kpis); })
      .catch(() => { if (!cancelled) setKpis(null); });
    return () => { cancelled = true; };
  }, [endpoint, employeeId, period.start, period.end]);

  const overall = overallScore(scores);
  const complete = REVIEW_CRITERIA.every((c) => scores[c.key]);

  const save = async (submit: boolean) => {
    if (saving) return;
    setSaving(true);
    setError("");
    const body = {
      ...(review ? { id: review.id } : { employee_id: employeeId }),
      period_label: period.label, period_start: period.start, period_end: period.end,
      scores, strengths, improvements, goals, submit,
    };
    try {
      await saveBusiness(`hr-review-${review?.id || employeeId}-${submit ? "submit" : "draft"}`, endpoint, body);
      showToast(submit ? "تم إرسال التقييم للموظف." : "تم حفظ المسودة.", "success");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const employee = employees.find((e) => e.id === employeeId);

  return (
    <div data-dialog="" className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-start sm:items-center justify-center p-3 overflow-y-auto" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-[#faf7f2] w-full max-w-3xl rounded-3xl shadow-2xl border border-stone-200 my-4 flex flex-col max-h-[calc(100vh-2rem)]">
        <div className="flex items-center justify-between p-4 border-b border-stone-200">
          <h3 className="font-black text-base text-stone-900 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-amber-500" />{review ? "تعديل تقييم الأداء" : "تقييم أداء جديد"}</h3>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="p-2 rounded-xl hover:bg-stone-200/60"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className={labelCls}>الموظف</label>
              {review ? <p className="font-bold text-sm py-2">{review.employee_name}</p> : (
                <select className={inputCls} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name_ar}{e.job_title ? ` — ${e.job_title}` : ""}</option>)}
                </select>
              )}
            </div>
            <div><label className={labelCls}>فترة التقييم</label>
              <select className={inputCls} value={period.label}
                onChange={(e) => { const p = periods.find((x) => x.label === e.target.value); if (p) setPeriod(p); }}>
                {!periods.some((p) => p.label === period.label) && <option value={period.label}>{period.label}</option>}
                {periods.map((p) => <option key={p.label} value={p.label}>{p.label} ({p.start} ← {p.end})</option>)}
              </select>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-stone-200 p-3 space-y-2">
            <p className="text-xs font-black text-stone-700">مؤشرات الأداء الموضوعية {employee ? `— ${employee.full_name_ar}` : ""}</p>
            {kpis ? <KpiGrid kpis={kpis} /> : <p className="text-xs text-stone-400">جاري حساب المؤشرات...</p>}
            <p className="text-[10px] text-stone-400">تُحفظ نسخة من هذه المؤشرات مع التقييم لحظة الحفظ.</p>
          </div>

          <div className="bg-white rounded-2xl border border-stone-200 divide-y divide-stone-100">
            {REVIEW_CRITERIA.map((c) => (
              <div key={c.key} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2.5">
                <div>
                  <p className="text-sm font-bold text-stone-900">{c.label}</p>
                  <p className="text-[11px] text-stone-500">{c.hint}</p>
                </div>
                <div className="flex items-center gap-1" role="radiogroup" aria-label={c.label}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={scores[c.key] === n} title={SCORE_LABELS[n]} aria-label={SCORE_LABELS[n]}
                      onClick={() => setScores((s) => ({ ...s, [c.key]: n }))}
                      className={cn("w-9 h-9 rounded-lg text-sm font-black border transition",
                        scores[c.key] === n ? "bg-amber-500 border-amber-600 text-stone-950" : "bg-white border-stone-200 text-stone-500 hover:bg-amber-50")}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-2.5 bg-stone-50">
              <span className="text-sm font-black">التقييم العام</span>
              <span className="flex items-center gap-2"><ScoreStars value={overall} /><b>{overall ?? "—"}</b>{overall !== null && <span className="text-xs text-stone-500">{SCORE_LABELS[Math.round(overall)]}</span>}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className={labelCls}>نقاط القوة</label><textarea rows={3} className={inputCls} value={strengths} onChange={(e) => setStrengths(e.target.value)} /></div>
            <div><label className={labelCls}>مجالات التحسين</label><textarea rows={3} className={inputCls} value={improvements} onChange={(e) => setImprovements(e.target.value)} /></div>
            <div><label className={labelCls}>أهداف الفترة القادمة</label><textarea rows={3} className={inputCls} value={goals} onChange={(e) => setGoals(e.target.value)} /></div>
          </div>
        </div>
        <div className="p-4 border-t border-stone-200 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
          {error ? <p role="alert" className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>
            : <p className="text-[11px] text-stone-500">بعد الإرسال لا يمكن تعديل التقييم، ويُطلب من الموظف الاطلاع عليه.</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => save(false)} disabled={saving || !employeeId}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-sm font-bold disabled:opacity-50">
              <Save className="w-4 h-4" /> حفظ كمسودة
            </button>
            <button type="button" onClick={() => save(true)} disabled={saving || !complete || !employeeId}
              title={complete ? undefined : "قيّم جميع المعايير أولًا"} aria-label={complete ? undefined : "قيّم جميع المعايير أولًا"}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 text-sm font-black">
              <Send className="w-4 h-4" /> إرسال للموظف
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Read-only review, with an optional acknowledgement form for the reviewed employee.
export function ReviewViewModal({ review, onClose, onAcknowledge }: {
  review: HrReview; onClose: () => void; onAcknowledge?: (comment: string) => Promise<void>;
}) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div data-dialog="" className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-start sm:items-center justify-center p-3 overflow-y-auto" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-stone-200 my-4 p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-black text-lg text-stone-900">تقييم أداء {review.period_label}</h3>
            <p className="text-xs text-stone-500">{review.employee_name} · {review.job_title || review.department_name} · <span dir="ltr">{review.period_start} ← {review.period_end}</span></p>
            <div className="mt-1"><ReviewStatusBadge status={review.status} /></div>
          </div>
          <button onClick={onClose} aria-label="إغلاق" className="p-1.5 rounded-xl bg-stone-100 hover:bg-stone-200"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-[#160f02] text-white px-4 py-3">
          <span className="font-bold">التقييم العام</span>
          <span className="flex items-center gap-2"><ScoreStars value={review.overall} /><b className="text-xl text-[#e5d0a1]">{review.overall ?? "—"}</b></span>
        </div>
        <div className="divide-y divide-stone-100 border border-stone-100 rounded-2xl">
          {REVIEW_CRITERIA.map((c) => (
            <div key={c.key} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>{c.label}</span>
              <span className="flex items-center gap-2"><ScoreStars value={review.scores[c.key] ?? null} size="w-3.5 h-3.5" /><span className="text-xs text-stone-500 w-16 text-end">{SCORE_LABELS[review.scores[c.key]] || "—"}</span></span>
            </div>
          ))}
        </div>
        {Object.keys(review.kpis || {}).length > 0 && <KpiGrid kpis={review.kpis} />}
        {[["نقاط القوة", review.strengths], ["مجالات التحسين", review.improvements], ["أهداف الفترة القادمة", review.goals]].map(([label, value]) => value ? (
          <div key={label}><p className="text-xs font-black text-stone-600">{label}</p><p className="text-sm text-stone-800 whitespace-pre-wrap">{value}</p></div>
        ) : null)}
        {review.employee_comment && <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm"><b>تعليق الموظف:</b> {review.employee_comment}</div>}
        {onAcknowledge && review.status === "submitted" && (
          <div className="rounded-2xl border border-amber-300 p-3 space-y-2">
            <p className="text-sm font-bold">اطّلعت على التقييم</p>
            <textarea rows={2} className={inputCls} placeholder="تعليقك (اختياري)" value={comment} onChange={(e) => setComment(e.target.value)} />
            <div className="flex justify-end">
              <button disabled={busy} onClick={async () => { setBusy(true); try { await onAcknowledge(comment); } finally { setBusy(false); } }}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black disabled:opacity-50">
                تأكيد الاطلاع
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
