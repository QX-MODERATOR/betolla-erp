"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { UserSearch, Plus, X, Save, Phone, Mail, CalendarClock, Star, UserCheck, Pencil } from "lucide-react";
import { loadBusiness, saveBusiness } from "@/lib/business-client";
import { useToast } from "@/components/common/toast";
import { LoadError, StatCard } from "@/components/hr/hr-ui";
import { cn, formatCurrency } from "@/lib/utils";
import { ammanToday } from "@/lib/dates";
import {
  CANDIDATE_SOURCE_LABELS, CANDIDATE_STAGE_LABELS, EMPLOYMENT_TYPE_LABELS, OPENING_STATUS_LABELS, PIPELINE_STAGES,
  type CandidateStage, type EmploymentType, type HrCandidate, type HrDepartment, type HrOpening, type OpeningStatus,
} from "@/lib/hr";

interface Data { openings: HrOpening[]; candidates: HrCandidate[]; departments: HrDepartment[] }

const inputCls = "w-full px-3 py-2 rounded-xl border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/60";
const labelCls = "block text-[11px] font-bold text-stone-500 mb-1";

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div data-dialog="" className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-start sm:items-center justify-center p-3 overflow-y-auto" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className={cn("bg-[#faf7f2] w-full rounded-3xl shadow-2xl border border-stone-200 my-4", wide ? "max-w-2xl" : "max-w-lg")}>
        <div className="flex items-center justify-between p-4 border-b border-stone-200">
          <h3 className="font-black text-base text-stone-900">{title}</h3>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="p-2 rounded-xl hover:bg-stone-200/60"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function useSubmit() {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const run = async <T,>(slot: string, body: Record<string, unknown>, done: string): Promise<T | null> => {
    if (saving) return null;
    setSaving(true);
    setError("");
    try {
      const result = await saveBusiness<T>(slot, "/api/hr/recruitment", body);
      showToast(done, "success");
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setSaving(false);
    }
  };
  return { saving, error, run };
}

const ErrorLine = ({ error }: { error: string }) =>
  error ? <p role="alert" className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p> : null;

function OpeningModal({ opening, departments, onClose, onSaved }: {
  opening: HrOpening | null; departments: HrDepartment[]; onClose: () => void; onSaved: (id: string) => void;
}) {
  const [form, setForm] = useState({
    title: opening?.title || "", department_id: opening?.department_id || "",
    employment_type: (opening?.employment_type || "full_time") as EmploymentType, positions: String(opening?.positions ?? 1),
    location: opening?.location || "عمان", salary_min: opening?.salary_min != null ? String(opening.salary_min) : "",
    salary_max: opening?.salary_max != null ? String(opening.salary_max) : "", description: opening?.description || "",
    requirements: opening?.requirements || "", status: (opening?.status || "open") as OpeningStatus,
  });
  const { saving, error, run } = useSubmit();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await run<{ id: string }>(`hr-opening-${opening?.id || "new"}`,
      { kind: "opening", ...(opening ? { id: opening.id } : {}), ...form, positions: Number(form.positions) }, "تم حفظ الوظيفة.");
    if (result) onSaved(result.id);
  };
  return (
    <Modal title={opening ? "تعديل الوظيفة" : "وظيفة شاغرة جديدة"} onClose={onClose} wide>
      <form onSubmit={submit} className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2"><label className={labelCls}>المسمى الوظيفي *</label><input required className={inputCls} value={form.title} onChange={set("title")} /></div>
        <div><label className={labelCls}>القسم</label>
          <select className={inputCls} value={form.department_id} onChange={set("department_id")}>
            <option value="">—</option>
            {departments.filter((d) => d.is_active).map((d) => <option key={d.id} value={d.id}>{d.name_ar}</option>)}
          </select>
        </div>
        <div><label className={labelCls}>نوع التوظيف</label>
          <select className={inputCls} value={form.employment_type} onChange={set("employment_type")}>
            {Object.entries(EMPLOYMENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div><label className={labelCls}>عدد الشواغر</label><input type="number" min={1} max={100} required className={inputCls} value={form.positions} onChange={set("positions")} /></div>
        <div><label className={labelCls}>الموقع</label><input className={inputCls} value={form.location} onChange={set("location")} /></div>
        <div><label className={labelCls}>الراتب من (د.أ)</label><input dir="ltr" inputMode="decimal" className={inputCls} value={form.salary_min} onChange={set("salary_min")} /></div>
        <div><label className={labelCls}>الراتب إلى (د.أ)</label><input dir="ltr" inputMode="decimal" className={inputCls} value={form.salary_max} onChange={set("salary_max")} /></div>
        <div className="sm:col-span-2"><label className={labelCls}>الوصف الوظيفي</label><textarea rows={3} className={inputCls} value={form.description} onChange={set("description")} /></div>
        <div className="sm:col-span-2"><label className={labelCls}>المتطلبات</label><textarea rows={3} className={inputCls} value={form.requirements} onChange={set("requirements")} /></div>
        {opening && (
          <div><label className={labelCls}>الحالة</label>
            <select className={inputCls} value={form.status} onChange={set("status")}>
              {Object.entries(OPENING_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        )}
        <div className="sm:col-span-2"><ErrorLine error={error} /></div>
        <div className="sm:col-span-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-sm font-bold text-stone-600">إلغاء</button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 text-sm font-black"><Save className="w-4 h-4" /> حفظ</button>
        </div>
      </form>
    </Modal>
  );
}

function NewCandidateModal({ opening, onClose, onSaved }: { opening: HrOpening; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ full_name: "", phone: "", email: "", source: "other", expected_salary: "", notes: "" });
  const { saving, error, run } = useSubmit();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await run(`hr-candidate-new-${opening.id}`, { kind: "candidate", action: "create", opening_id: opening.id, ...form }, "تمت إضافة المرشح.")) onSaved();
  };
  return (
    <Modal title={`مرشح جديد — ${opening.title}`} onClose={onClose}>
      <form onSubmit={submit} className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2"><label className={labelCls}>الاسم *</label><input required className={inputCls} value={form.full_name} onChange={set("full_name")} /></div>
        <div><label className={labelCls}>الهاتف *</label><input required dir="ltr" className={inputCls} value={form.phone} onChange={set("phone")} /></div>
        <div><label className={labelCls}>البريد</label><input dir="ltr" type="email" className={inputCls} value={form.email} onChange={set("email")} /></div>
        <div><label className={labelCls}>المصدر</label>
          <select className={inputCls} value={form.source} onChange={set("source")}>
            {Object.entries(CANDIDATE_SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div><label className={labelCls}>الراتب المتوقع</label><input dir="ltr" inputMode="decimal" className={inputCls} value={form.expected_salary} onChange={set("expected_salary")} /></div>
        <div className="sm:col-span-2"><label className={labelCls}>ملاحظات</label><textarea rows={2} className={inputCls} value={form.notes} onChange={set("notes")} /></div>
        <div className="sm:col-span-2"><ErrorLine error={error} /></div>
        <div className="sm:col-span-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-sm font-bold text-stone-600">إلغاء</button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 text-sm font-black"><Save className="w-4 h-4" /> إضافة</button>
        </div>
      </form>
    </Modal>
  );
}

const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

function CandidateModal({ candidate, opening, departments, onClose, onChanged }: {
  candidate: HrCandidate; opening?: HrOpening; departments: HrDepartment[]; onClose: () => void; onChanged: () => void;
}) {
  const locked = candidate.stage === "hired";
  const [form, setForm] = useState({
    full_name: candidate.full_name, phone: candidate.phone, email: candidate.email, source: candidate.source,
    expected_salary: candidate.expected_salary != null ? String(candidate.expected_salary) : "", notes: candidate.notes,
    rating: candidate.rating ? String(candidate.rating) : "", interview_at: toLocalInput(candidate.interview_at),
  });
  const [moveTo, setMoveTo] = useState<CandidateStage | "">("");
  const [moveNote, setMoveNote] = useState("");
  const [hiring, setHiring] = useState(false);
  const [hire, setHire] = useState({
    hire_date: ammanToday(), probation_end_date: "",
    basic_salary: candidate.expected_salary != null ? String(candidate.expected_salary) : "",
    job_title: opening?.title || "", department_id: opening?.department_id || "", employment_type: opening?.employment_type || "full_time",
  });
  const [hiredId, setHiredId] = useState<string | null>(candidate.employee_id);
  const { saving, error, run } = useSubmit();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  const saveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = { kind: "candidate", action: "update", id: candidate.id, ...form,
      interview_at: form.interview_at ? new Date(form.interview_at).toISOString() : "" };
    if (await run(`hr-candidate-${candidate.id}`, body, "تم حفظ بيانات المرشح.")) onChanged();
  };
  const move = async () => {
    if (!moveTo) return;
    const body = { kind: "candidate", action: "move", id: candidate.id, stage: moveTo,
      ...(moveTo === "rejected" ? { rejection_reason: moveNote } : { note: moveNote }) };
    if (await run(`hr-candidate-move-${candidate.id}`, body, `تم نقل المرشح إلى «${CANDIDATE_STAGE_LABELS[moveTo].label}».`)) {
      setMoveTo(""); setMoveNote(""); onChanged();
    }
  };
  const doHire = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await run<{ employee: { id: string }; opening_closed: boolean }>(`hr-candidate-hire-${candidate.id}`,
      { kind: "hire", candidate_id: candidate.id, ...hire }, "تم التعيين وإنشاء ملف الموظف.");
    if (result) { setHiredId(result.employee.id); setHiring(false); onChanged(); }
  };

  return (
    <Modal title={candidate.full_name} onClose={onClose} wide>
      <div className="p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={cn("px-2 py-0.5 rounded-full font-bold", CANDIDATE_STAGE_LABELS[candidate.stage].color)}>{CANDIDATE_STAGE_LABELS[candidate.stage].label}</span>
          <span className="text-stone-500">{candidate.opening_title}</span>
          <a href={`tel:${candidate.phone}`} className="inline-flex items-center gap-1 text-amber-700"><Phone className="w-3 h-3" /><span dir="ltr">{candidate.phone}</span></a>
          {candidate.email && <a href={`mailto:${candidate.email}`} className="inline-flex items-center gap-1 text-amber-700"><Mail className="w-3 h-3" />{candidate.email}</a>}
        </div>
        {candidate.rejection_reason && <p className="text-xs text-rose-700 bg-rose-50 rounded-xl p-2">سبب الرفض: {candidate.rejection_reason}</p>}
        {hiredId && (
          <Link href={`/hr/employees/${hiredId}`} className="flex items-center gap-2 text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            <UserCheck className="w-4 h-4" /> تم التعيين — فتح ملف الموظف
          </Link>
        )}

        {!locked && (
          <div className="rounded-2xl border border-stone-200 bg-white p-3 space-y-2">
            <p className="text-xs font-black text-stone-700">نقل إلى مرحلة</p>
            <div className="flex flex-wrap gap-1.5">
              {(["applied", "screening", "interview", "offer", "rejected", "withdrawn"] as CandidateStage[]).filter((s) => s !== candidate.stage).map((s) => (
                <button key={s} type="button" onClick={() => setMoveTo(s)}
                  className={cn("px-3 py-1.5 rounded-lg text-xs font-bold border", moveTo === s ? "bg-stone-900 text-amber-400 border-stone-900" : "bg-white border-stone-200 text-stone-600")}>
                  {CANDIDATE_STAGE_LABELS[s].label}
                </button>
              ))}
              {!["rejected", "withdrawn"].includes(candidate.stage) && (
                <button type="button" onClick={() => setHiring(true)} className="px-3 py-1.5 rounded-lg text-xs font-black bg-emerald-600 text-white inline-flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5" /> تعيين
                </button>
              )}
            </div>
            {moveTo && (
              <div className="flex flex-col sm:flex-row gap-2">
                <input className={inputCls} value={moveNote} onChange={(e) => setMoveNote(e.target.value)}
                  placeholder={moveTo === "rejected" ? "سبب الرفض (مطلوب)" : "ملاحظة (اختياري)"} />
                <button type="button" onClick={move} disabled={saving || (moveTo === "rejected" && !moveNote.trim())}
                  className="px-4 py-2 rounded-xl bg-amber-500 text-stone-950 text-sm font-black disabled:opacity-50 shrink-0">تأكيد النقل</button>
              </div>
            )}
          </div>
        )}

        {hiring && (
          <form onSubmit={doHire} className="rounded-2xl border border-emerald-300 bg-emerald-50/40 p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <p className="sm:col-span-2 text-xs font-black text-emerald-800">بيانات التعيين (يُنشأ ملف موظف تلقائيًا)</p>
            <div><label className={labelCls}>تاريخ التعيين *</label><input type="date" required className={inputCls} value={hire.hire_date} onChange={(e) => setHire({ ...hire, hire_date: e.target.value })} /></div>
            <div><label className={labelCls}>نهاية فترة التجربة</label><input type="date" min={hire.hire_date} className={inputCls} value={hire.probation_end_date} onChange={(e) => setHire({ ...hire, probation_end_date: e.target.value })} /></div>
            <div><label className={labelCls}>الراتب الأساسي</label><input dir="ltr" inputMode="decimal" className={inputCls} value={hire.basic_salary} onChange={(e) => setHire({ ...hire, basic_salary: e.target.value })} /></div>
            <div><label className={labelCls}>المسمى الوظيفي</label><input className={inputCls} value={hire.job_title} onChange={(e) => setHire({ ...hire, job_title: e.target.value })} /></div>
            <div><label className={labelCls}>القسم</label>
              <select className={inputCls} value={hire.department_id} onChange={(e) => setHire({ ...hire, department_id: e.target.value })}>
                <option value="">—</option>
                {departments.filter((d) => d.is_active).map((d) => <option key={d.id} value={d.id}>{d.name_ar}</option>)}
              </select>
            </div>
            <div><label className={labelCls}>نوع التوظيف</label>
              <select className={inputCls} value={hire.employment_type} onChange={(e) => setHire({ ...hire, employment_type: e.target.value as EmploymentType })}>
                {Object.entries(EMPLOYMENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <button type="button" onClick={() => setHiring(false)} className="px-3 py-2 rounded-xl border border-stone-200 bg-white text-xs font-bold">إلغاء</button>
              <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-black disabled:opacity-50">تأكيد التعيين</button>
            </div>
          </form>
        )}

        <form onSubmit={saveDetails} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <fieldset disabled={locked} className="contents">
            <div><label className={labelCls}>الاسم</label><input required className={inputCls} value={form.full_name} onChange={set("full_name")} /></div>
            <div><label className={labelCls}>الهاتف</label><input required dir="ltr" className={inputCls} value={form.phone} onChange={set("phone")} /></div>
            <div><label className={labelCls}>البريد</label><input dir="ltr" type="email" className={inputCls} value={form.email} onChange={set("email")} /></div>
            <div><label className={labelCls}>المصدر</label>
              <select className={inputCls} value={form.source} onChange={set("source")}>
                {Object.entries(CANDIDATE_SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div><label className={labelCls}>موعد المقابلة</label><input type="datetime-local" className={inputCls} value={form.interview_at} onChange={set("interview_at")} /></div>
            <div><label className={labelCls}>التقييم</label>
              <select className={inputCls} value={form.rating} onChange={set("rating")}>
                <option value="">—</option>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}
              </select>
            </div>
            <div><label className={labelCls}>الراتب المتوقع</label><input dir="ltr" inputMode="decimal" className={inputCls} value={form.expected_salary} onChange={set("expected_salary")} /></div>
            <div className="sm:col-span-2"><label className={labelCls}>ملاحظات</label><textarea rows={2} className={inputCls} value={form.notes} onChange={set("notes")} /></div>
            {!locked && (
              <div className="sm:col-span-2 flex justify-end">
                <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-stone-200 bg-white text-sm font-bold disabled:opacity-50"><Save className="w-4 h-4" /> حفظ البيانات</button>
              </div>
            )}
          </fieldset>
        </form>
        <ErrorLine error={error} />

        <div>
          <p className="text-xs font-black text-stone-700 mb-1">السجل</p>
          <ol className="space-y-1 text-xs text-stone-600">
            {candidate.events.map((e, i) => (
              <li key={i} className="flex justify-between gap-2 border-b border-stone-100 py-1">
                <span>
                  {e.event === "created" ? "تم التقديم" : e.event === "interview_scheduled" ? `حُدد موعد مقابلة ${new Date(e.note).toLocaleString("en-GB")}`
                    : `${e.from_stage ? CANDIDATE_STAGE_LABELS[e.from_stage as CandidateStage]?.label : ""} ← ${CANDIDATE_STAGE_LABELS[e.to_stage as CandidateStage]?.label}`}
                  {e.event === "stage" && e.note ? ` — ${e.note}` : ""}
                </span>
                <span dir="ltr" className="text-stone-400 shrink-0">{e.created_at.slice(0, 10)} · {e.actor_id}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Modal>
  );
}

export default function RecruitmentPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | "all">("all");
  const [showClosed, setShowClosed] = useState(false);
  const [editingOpening, setEditingOpening] = useState<HrOpening | null | "new">(null);
  const [addingTo, setAddingTo] = useState<HrOpening | null>(null);
  const [openCandidate, setOpenCandidate] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setData(await loadBusiness<Data>("/api/hr/recruitment"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل بيانات التوظيف.");
    }
  }, []);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);

  const openings = (data?.openings || []).filter((o) => showClosed || o.status !== "closed");
  const current = data?.openings.find((o) => o.id === selected) || null;
  const candidates = useMemo(() => (data?.candidates || []).filter((c) => selected === "all"
    ? data!.openings.find((o) => o.id === c.opening_id)?.status !== "closed"
    : c.opening_id === selected), [data, selected]);
  const inactive = candidates.filter((c) => c.stage === "rejected" || c.stage === "withdrawn");
  const upcoming = (data?.candidates || []).filter((c) => c.interview_at && c.interview_at >= new Date().toISOString() && !["hired", "rejected", "withdrawn"].includes(c.stage))
    .sort((a, b) => a.interview_at!.localeCompare(b.interview_at!));
  const candidate = data?.candidates.find((c) => c.id === openCandidate) || null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5"><UserSearch className="w-6 h-6 text-amber-500" /> التوظيف</h2>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">الوظائف الشاغرة، مسار المرشحين، والمقابلات</p>
        </div>
        <button onClick={() => setEditingOpening("new")} disabled={!data} className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 font-bold text-sm rounded-xl">
          <Plus className="w-4 h-4" /> وظيفة شاغرة
        </button>
      </div>

      {error && <LoadError message={error} onRetry={() => void reload()} />}

      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="وظائف مفتوحة" value={data.openings.filter((o) => o.status === "open").length}
            hint={`${data.openings.filter((o) => o.status === "open").reduce((s, o) => s + o.positions - (o.stage_counts.hired || 0), 0)} شاغر متبقٍ`} />
          <StatCard label="مرشحون نشطون" value={data.candidates.filter((c) => !["hired", "rejected", "withdrawn"].includes(c.stage)).length} tone="text-sky-700" />
          <StatCard label="مقابلات قادمة" value={upcoming.length} tone="text-violet-700"
            hint={upcoming[0] ? `${upcoming[0].full_name} — ${new Date(upcoming[0].interview_at!).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}` : undefined} />
          <StatCard label="تعيينات من التوظيف" value={data.candidates.filter((c) => c.stage === "hired").length} tone="text-emerald-700" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="space-y-2">
          <button onClick={() => setSelected("all")}
            className={cn("w-full text-start px-3 py-2.5 rounded-2xl border text-sm font-black", selected === "all" ? "bg-stone-900 text-amber-400 border-stone-900" : "bg-white border-stone-200")}>
            كل الوظائف المفتوحة
          </button>
          {openings.map((o) => {
            const active = PIPELINE_STAGES.filter((s) => s !== "hired").reduce((n, s) => n + (o.stage_counts[s] || 0), 0);
            return (
              <div key={o.id} className={cn("rounded-2xl border bg-white p-3 cursor-pointer", selected === o.id ? "border-amber-400 ring-2 ring-amber-200" : "border-stone-200")}
                onClick={() => setSelected(o.id)}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-black text-sm text-stone-900">{o.title}</p>
                  <button onClick={(e) => { e.stopPropagation(); setEditingOpening(o); }} aria-label={`تعديل ${o.title}`} className="p-1 rounded-lg hover:bg-stone-100"><Pencil className="w-3.5 h-3.5 text-stone-500" /></button>
                </div>
                <p className="text-[11px] text-stone-500">{[o.department_name, EMPLOYMENT_TYPE_LABELS[o.employment_type], o.location].filter(Boolean).join(" · ")}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", OPENING_STATUS_LABELS[o.status].color)}>{OPENING_STATUS_LABELS[o.status].label}</span>
                  <span className="text-[11px] text-stone-500">{active} نشط · {o.stage_counts.hired || 0}/{o.positions} معيّن</span>
                </div>
                {(o.salary_min || o.salary_max) && <p className="text-[10px] text-stone-400 mt-1">{o.salary_min ? formatCurrency(o.salary_min) : "—"} – {o.salary_max ? formatCurrency(o.salary_max) : "—"}</p>}
              </div>
            );
          })}
          <label className="flex items-center gap-2 text-xs text-stone-500 px-1">
            <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> عرض الوظائف المغلقة
          </label>
        </div>

        <div className="lg:col-span-3 space-y-3">
          {current && current.status !== "closed" && (
            <div className="flex justify-end">
              <button onClick={() => setAddingTo(current)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-stone-900 text-amber-400 text-xs font-bold">
                <Plus className="w-3.5 h-3.5" /> إضافة مرشح لـ {current.title}
              </button>
            </div>
          )}
          {!data ? (
            <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center text-sm text-stone-400">جاري التحميل...</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2">
              {PIPELINE_STAGES.map((stage) => {
                const list = candidates.filter((c) => c.stage === stage);
                return (
                  <div key={stage} className="rounded-2xl bg-stone-100/70 p-2 min-h-32">
                    <p className="flex items-center justify-between text-xs font-black text-stone-700 px-1 mb-2">
                      <span>{CANDIDATE_STAGE_LABELS[stage].label}</span>
                      <span className={cn("px-1.5 rounded-full", CANDIDATE_STAGE_LABELS[stage].color)}>{list.length}</span>
                    </p>
                    <div className="space-y-2">
                      {list.map((c) => (
                        <button key={c.id} onClick={() => setOpenCandidate(c.id)} className="w-full text-start bg-white rounded-xl border border-stone-200 p-2 hover:border-amber-400">
                          <p className="text-sm font-bold text-stone-900 truncate">{c.full_name}</p>
                          {selected === "all" && <p className="text-[10px] text-stone-400 truncate">{c.opening_title}</p>}
                          <div className="flex items-center justify-between mt-1 text-[10px] text-stone-500">
                            <span>{CANDIDATE_SOURCE_LABELS[c.source] || c.source}</span>
                            {c.rating ? <span className="inline-flex items-center gap-0.5 text-amber-600"><Star className="w-3 h-3 fill-amber-400" />{c.rating}</span> : null}
                          </div>
                          {c.interview_at && stage !== "hired" && (
                            <p className="text-[10px] text-violet-700 mt-0.5 inline-flex items-center gap-1"><CalendarClock className="w-3 h-3" />{new Date(c.interview_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</p>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {inactive.length > 0 && (
            <details className="bg-white rounded-2xl border border-stone-200 p-3">
              <summary className="text-xs font-bold text-stone-600 cursor-pointer">مرفوضون / منسحبون ({inactive.length})</summary>
              <ul className="mt-2 divide-y divide-stone-100">
                {inactive.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => setOpenCandidate(c.id)} className="w-full text-start py-1.5 text-sm flex justify-between gap-2">
                      <span>{c.full_name} <span className="text-[10px] text-stone-400">{c.opening_title}</span></span>
                      <span className={cn("text-[10px] px-2 rounded-full", CANDIDATE_STAGE_LABELS[c.stage].color)}>{CANDIDATE_STAGE_LABELS[c.stage].label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>

      {editingOpening && data && (
        <OpeningModal opening={editingOpening === "new" ? null : editingOpening} departments={data.departments}
          onClose={() => setEditingOpening(null)} onSaved={(id) => { setEditingOpening(null); setSelected(id); void reload(); }} />
      )}
      {addingTo && <NewCandidateModal opening={addingTo} onClose={() => setAddingTo(null)} onSaved={() => { setAddingTo(null); void reload(); }} />}
      {candidate && data && (
        <CandidateModal key={candidate.updated_at} candidate={candidate} opening={data.openings.find((o) => o.id === candidate.opening_id)}
          departments={data.departments} onClose={() => setOpenCandidate(null)} onChanged={() => void reload()} />
      )}
    </div>
  );
}
