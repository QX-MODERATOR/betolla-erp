"use client";

// Pieces shared by the marketing pages: badges, the campaign form, the task form, and the numbers
// formatting used on every screen.
import { useState } from "react";
import { X, Save, Target, ListChecks } from "lucide-react";
import { saveBusiness } from "@/lib/business-client";
import { useToast } from "@/components/common/toast";
import { cn } from "@/lib/utils";
import { ammanToday } from "@/lib/dates";
import {
  CAMPAIGN_STATUS_LABELS, CHANNEL_LABELS, OBJECTIVE_LABELS, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS,
  type CampaignChannel, type CampaignObjective, type CampaignStatus, type MarketingAccess,
  type MktCampaign, type MktTask, type MktTeamMember, type TaskPriority, type TaskStatus,
} from "@/lib/marketing";

export const inputCls = "w-full px-3 py-2 rounded-xl border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/60";
export const labelCls = "block text-[11px] font-bold text-stone-500 mb-1";

export const jod = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${Number(n).toFixed(3)} د.أ`);
export const count = (n: number | null | undefined) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("en-US"));
export const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n}%`);
export const ratio = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${Number(n).toFixed(2)}x`);

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const s = CAMPAIGN_STATUS_LABELS[status];
  return <span className={cn("inline-block text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap", s.color)}>{s.label}</span>;
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const s = TASK_STATUS_LABELS[status];
  return <span className={cn("inline-block text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap", s.color)}>{s.label}</span>;
}

export function PriorityLabel({ priority }: { priority: TaskPriority }) {
  const p = TASK_PRIORITY_LABELS[priority];
  return <span className={cn("text-[11px] font-bold", p.color)}>{p.label}</span>;
}

/** A thin progress bar: how much of a target or budget is used. Red past 100%. */
export function Meter({ value, className }: { value: number | null; className?: string }) {
  const v = value ?? 0;
  return (
    <div className={cn("h-1.5 rounded-full bg-stone-100 overflow-hidden", className)}>
      <div className={cn("h-full rounded-full", v > 100 ? "bg-rose-500" : v >= 85 ? "bg-amber-500" : "bg-gradient-to-l from-[#9e8959] to-[#c28a40]")}
        style={{ width: `${Math.min(100, Math.max(0, v))}%` }} />
    </div>
  );
}

function Dialog({ title, icon, onClose, children, onSubmit, saving, error }: {
  title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode;
  onSubmit: (e: React.FormEvent) => void; saving: boolean; error: string;
}) {
  return (
    <div data-dialog="" className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-start sm:items-center justify-center p-3 overflow-y-auto" onClick={onClose}>
      <form onSubmit={onSubmit} onClick={(e) => e.stopPropagation()} className="bg-[#faf7f2] w-full max-w-2xl rounded-3xl shadow-2xl border border-stone-200 my-4">
        <div className="flex items-center justify-between p-4 border-b border-stone-200">
          <h3 className="font-black text-base text-stone-900 flex items-center gap-2">{icon}{title}</h3>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="p-2 rounded-xl hover:bg-stone-200/60"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
        {error && <p role="alert" className="mx-4 mb-3 p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">{error}</p>}
        <div className="flex justify-end gap-2 p-4 border-t border-stone-200">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-stone-200 bg-white text-sm font-bold">إلغاء</button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 text-sm font-bold">
            <Save className="w-4 h-4" />{saving ? "جاري الحفظ..." : "حفظ"}
          </button>
        </div>
      </form>
    </div>
  );
}

// Create or edit a campaign (manager / coordinator). On edit only the fields that changed are sent.
export function CampaignModal({ campaign, team, promoCodes, onClose, onSaved }: {
  campaign: MktCampaign | null; team: MktTeamMember[]; promoCodes: { code: string; label_ar: string; is_active: boolean }[];
  onClose: () => void; onSaved: (c: MktCampaign) => void;
}) {
  const { showToast } = useToast();
  const initial = {
    code: campaign?.code || "", name: campaign?.name || "",
    channel: (campaign?.channel || "facebook") as CampaignChannel, objective: (campaign?.objective || "leads") as CampaignObjective,
    status: (campaign?.status || "planned") as CampaignStatus,
    start_date: campaign?.start_date || ammanToday(), end_date: campaign?.end_date || "",
    budget: campaign ? String(campaign.budget ?? "") : "", target_leads: campaign?.target_leads != null ? String(campaign.target_leads) : "",
    target_revenue: campaign?.target_revenue != null ? String(campaign.target_revenue) : "",
    owner_account_id: campaign?.owner_account_id || "", promo_code: campaign?.promo_code || "",
    audience: campaign?.audience || "", notes: campaign?.notes || "",
  };
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const fields = campaign
      ? Object.fromEntries(Object.entries(form).filter(([k, v]) => v !== initial[k as keyof typeof initial]))
      : form;
    if (campaign && !Object.keys(fields).length) { onClose(); return; }
    setSaving(true);
    setError("");
    try {
      const res = await saveBusiness<{ campaign: MktCampaign }>(`mkt-campaign-${campaign?.id || "new"}`, "/api/marketing/campaigns",
        { kind: "campaign", ...(campaign ? { id: campaign.id } : {}), fields });
      showToast(campaign ? "تم تحديث الحملة." : "تم إنشاء الحملة.", "success");
      onSaved(res.campaign);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog title={campaign ? `تعديل حملة ${campaign.code}` : "حملة جديدة"} icon={<Target className="w-5 h-5 text-amber-500" />}
      onClose={onClose} onSubmit={submit} saving={saving} error={error}>
      <div><label className={labelCls}>رمز الحملة * <span className="font-normal">(يُرسل مع الليد من الإعلان)</span></label>
        <input required dir="ltr" className={inputCls} value={form.code} maxLength={24} placeholder="META-SEP"
          onChange={(e) => set("code", e.target.value.replace(/[^A-Za-z0-9_-]/g, ""))} /></div>
      <div><label className={labelCls}>اسم الحملة *</label>
        <input required className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="حملة شامبو البلازما — أيلول" /></div>
      <div><label className={labelCls}>القناة *</label>
        <select className={inputCls} value={form.channel} onChange={(e) => set("channel", e.target.value as CampaignChannel)}>
          {Object.entries(CHANNEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select></div>
      <div><label className={labelCls}>الهدف</label>
        <select className={inputCls} value={form.objective} onChange={(e) => set("objective", e.target.value as CampaignObjective)}>
          {Object.entries(OBJECTIVE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select></div>
      <div><label className={labelCls}>تاريخ البداية *</label>
        <input required type="date" className={inputCls} value={form.start_date} onChange={(e) => set("start_date", e.target.value)} /></div>
      <div><label className={labelCls}>تاريخ النهاية</label>
        <input type="date" min={form.start_date || undefined} className={inputCls} value={form.end_date} onChange={(e) => set("end_date", e.target.value)} /></div>
      <div><label className={labelCls}>الميزانية (د.أ)</label>
        <input dir="ltr" inputMode="decimal" className={inputCls} value={form.budget} onChange={(e) => set("budget", e.target.value)} placeholder="0.000" /></div>
      <div><label className={labelCls}>الحالة</label>
        <select className={inputCls} value={form.status} onChange={(e) => set("status", e.target.value as CampaignStatus)}>
          {Object.entries(CAMPAIGN_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select></div>
      <div><label className={labelCls}>هدف الليدات</label>
        <input dir="ltr" inputMode="numeric" className={inputCls} value={form.target_leads} onChange={(e) => set("target_leads", e.target.value.replace(/\D/g, ""))} /></div>
      <div><label className={labelCls}>هدف المبيعات (د.أ)</label>
        <input dir="ltr" inputMode="decimal" className={inputCls} value={form.target_revenue} onChange={(e) => set("target_revenue", e.target.value)} /></div>
      <div><label className={labelCls}>مسؤول الحملة</label>
        <select className={inputCls} value={form.owner_account_id} onChange={(e) => set("owner_account_id", e.target.value)}>
          <option value="">—</option>
          {team.map((m) => <option key={m.accountId} value={m.accountId}>{m.name} — {m.titleAr}</option>)}
        </select></div>
      <div><label className={labelCls}>كود الخصم المرتبط</label>
        <select className={inputCls} value={form.promo_code} onChange={(e) => set("promo_code", e.target.value)}>
          <option value="">بدون</option>
          {promoCodes.filter((p) => p.is_active || p.code === form.promo_code).map((p) => <option key={p.code} value={p.code}>{p.code} — {p.label_ar}</option>)}
        </select></div>
      <div className="sm:col-span-2"><label className={labelCls}>الجمهور المستهدف</label>
        <input className={inputCls} value={form.audience} onChange={(e) => set("audience", e.target.value)} placeholder="سيدات 25-45، عمّان والزرقاء، مهتمات بالعناية بالشعر" /></div>
      <div className="sm:col-span-2"><label className={labelCls}>ملاحظات</label>
        <textarea rows={2} className={inputCls} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
    </Dialog>
  );
}

// Create or edit a task. A manager assigns anyone on the team; a member raises tasks for herself.
export function TaskModal({ task, access, me, team, campaigns, onClose, onSaved }: {
  task: MktTask | null; access: MarketingAccess; me: string; team: MktTeamMember[]; campaigns: MktCampaign[];
  onClose: () => void; onSaved: (t: MktTask) => void;
}) {
  const { showToast } = useToast();
  const manage = access === "manage";
  const initial = {
    title: task?.title || "", description: task?.description || "", campaign_id: task?.campaign_id || "",
    assignee_account_id: task?.assignee_account_id || (manage ? "" : me), due_date: task?.due_date || "",
    priority: (task?.priority || "normal") as TaskPriority,
  };
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const changed = Object.fromEntries(Object.entries(form).filter(([k, v]) => !task || v !== initial[k as keyof typeof initial]));
    // A member never sends an assignee: the server makes the task hers.
    if (!manage) delete changed.assignee_account_id;
    if (task && !Object.keys(changed).length) { onClose(); return; }
    setSaving(true);
    setError("");
    try {
      const res = await saveBusiness<{ task: MktTask }>(`mkt-task-${task?.id || "new"}`, "/api/marketing/tasks",
        { kind: "save", ...(task ? { id: task.id } : {}), fields: changed });
      showToast(task ? "تم تحديث المهمة." : "تمت إضافة المهمة.", "success");
      onSaved(res.task);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog title={task ? "تعديل مهمة" : "مهمة جديدة"} icon={<ListChecks className="w-5 h-5 text-amber-500" />}
      onClose={onClose} onSubmit={submit} saving={saving} error={error}>
      <div className="sm:col-span-2"><label className={labelCls}>العنوان *</label>
        <input required className={inputCls} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="تصميم 3 بوستات لحملة البلازما" /></div>
      <div className="sm:col-span-2"><label className={labelCls}>التفاصيل</label>
        <textarea rows={3} className={inputCls} value={form.description} onChange={(e) => set("description", e.target.value)} /></div>
      {manage ? (
        <div><label className={labelCls}>المسؤول *</label>
          <select required className={inputCls} value={form.assignee_account_id} onChange={(e) => set("assignee_account_id", e.target.value)}>
            <option value="" disabled>اختر من الفريق</option>
            {team.map((m) => <option key={m.accountId} value={m.accountId}>{m.name} — {m.titleAr}</option>)}
          </select></div>
      ) : (
        <div><label className={labelCls}>المسؤول</label><p className="px-3 py-2 text-sm text-stone-600">أنتِ (تظهر المهمة لمدير التسويق للمتابعة)</p></div>
      )}
      <div><label className={labelCls}>الحملة</label>
        <select className={inputCls} value={form.campaign_id} onChange={(e) => set("campaign_id", e.target.value)}>
          <option value="">بدون حملة</option>
          {campaigns.filter((c) => c.status !== "cancelled" || c.id === form.campaign_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></div>
      <div><label className={labelCls}>تاريخ التسليم</label>
        <input type="date" className={inputCls} value={form.due_date} onChange={(e) => set("due_date", e.target.value)} /></div>
      <div><label className={labelCls}>الأولوية</label>
        <select className={inputCls} value={form.priority} onChange={(e) => set("priority", e.target.value as TaskPriority)}>
          {Object.entries(TASK_PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select></div>
    </Dialog>
  );
}
