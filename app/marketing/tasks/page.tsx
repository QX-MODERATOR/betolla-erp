"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ListChecks, Plus, X, Pencil, Send, MessageSquare, CalendarClock, Target } from "lucide-react";
import { loadBusiness, saveBusiness } from "@/lib/business-client";
import { useToast } from "@/components/common/toast";
import { LoadError, Avatar } from "@/components/hr/hr-ui";
import { TaskModal, TaskStatusBadge, PriorityLabel, inputCls } from "@/components/marketing/mkt-ui";
import { ammanToday } from "@/lib/dates";
import { cn } from "@/lib/utils";
import {
  TASK_STATUS_LABELS, taskMoves,
  type MarketingAccess, type MktCampaign, type MktTask, type MktTeamMember, type TaskStatus,
} from "@/lib/marketing";

type Data = { access: MarketingAccess; me: string; tasks: MktTask[]; team: MktTeamMember[] };
const COLUMNS: TaskStatus[] = ["todo", "in_progress", "review", "done"];

// Wording of a move button, from the point of view of the person pressing it.
function moveLabel(to: TaskStatus, from: TaskStatus, manage: boolean): string {
  if (to === "review") return "إرسال للمراجعة";
  if (to === "done") return "اعتماد وإغلاق";
  if (to === "cancelled") return "إلغاء المهمة";
  if (to === "in_progress") return from === "review" && manage ? "إعادة للتنفيذ" : from === "done" || from === "cancelled" ? "إعادة فتح" : "بدء التنفيذ";
  return "إرجاع لجديدة";
}

function TasksPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { showToast } = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [campaigns, setCampaigns] = useState<MktCampaign[]>([]);
  const [error, setError] = useState("");
  const [assignee, setAssignee] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [showCancelled, setShowCancelled] = useState(false);
  const [editing, setEditing] = useState<MktTask | null | "new">(null);
  const [open, setOpen] = useState<MktTask | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [t, c] = await Promise.all([
        loadBusiness<Data>("/api/marketing/tasks"),
        loadBusiness<{ campaigns: MktCampaign[] }>("/api/marketing/campaigns"),
      ]);
      setData(t);
      setCampaigns(c.campaigns);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل المهام.");
    }
  }, []);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);

  const openTask = useCallback(async (id: string) => {
    try {
      setOpen((await loadBusiness<{ task: MktTask }>(`/api/marketing/tasks?id=${encodeURIComponent(id)}`)).task);
      setNote("");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "تعذر فتح المهمة.", "error");
    }
  }, [showToast]);
  // A notification links to /marketing/tasks?task=<id>.
  const linked = params.get("task");
  useEffect(() => { if (linked) void Promise.resolve().then(() => openTask(linked)); }, [linked, openTask]);
  const close = () => { setOpen(null); if (linked) router.replace("/marketing/tasks"); };

  const act = async (body: Record<string, unknown>, done: string) => {
    if (!open || busy) return;
    setBusy(true);
    try {
      const res = await saveBusiness<{ task: MktTask }>(`mkt-task-update-${open.id}`, "/api/marketing/tasks", { kind: "update", id: open.id, ...body });
      setOpen(res.task);
      setNote("");
      showToast(done, "success");
      void reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const manage = data?.access === "manage";
  const today = ammanToday();
  const tasks = (data?.tasks || []).filter((t) =>
    (assignee === "all" || t.assignee_account_id === assignee) &&
    (campaignFilter === "all" || (campaignFilter === "none" ? !t.campaign_id : t.campaign_id === campaignFilter)));
  const cancelled = tasks.filter((t) => t.status === "cancelled");

  const card = (t: MktTask) => (
    <button key={t.id} onClick={() => void openTask(t.id)}
      className="w-full text-start bg-white rounded-xl border border-stone-200 hover:border-amber-400 p-3 transition">
      <p className="text-sm font-bold text-stone-900 leading-snug">{t.title}</p>
      {t.campaign_name && <p className="text-[11px] text-amber-700 font-bold mt-1 flex items-center gap-1"><Target className="w-3 h-3" />{t.campaign_name}</p>}
      <div className="flex items-center justify-between gap-2 mt-2">
        <span className="flex items-center gap-1.5 min-w-0">
          <Avatar name={t.assignee_name || "?"} className="w-5 h-5 text-[9px] rounded-md" />
          <span className="text-[11px] text-stone-600 truncate">{t.assignee_name}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {t.comments > 0 && <span className="text-[10px] text-stone-400 flex items-center gap-0.5"><MessageSquare className="w-3 h-3" />{t.comments}</span>}
          <PriorityLabel priority={t.priority} />
        </span>
      </div>
      {t.due_date && (
        <p className={cn("text-[10px] mt-1 flex items-center gap-1", t.due_date < today && t.status !== "done" ? "text-rose-600 font-bold" : "text-stone-400")}>
          <CalendarClock className="w-3 h-3" /><span dir="ltr">{t.due_date}</span>
        </p>
      )}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5"><ListChecks className="w-6 h-6 text-amber-500" /> {manage ? "مهام فريق التسويق" : "مهامي التسويقية"}</h2>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            {manage ? "وزّع المهام، تابع التنفيذ، واعتمد ما يصل للمراجعة" : "نفّذي مهامك وأرسليها للمراجعة — تصل لمدير التسويق مباشرة مع إشعار"}
          </p>
        </div>
        <button onClick={() => setEditing("new")} disabled={!data} className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 font-bold text-sm rounded-xl">
          <Plus className="w-4 h-4" /> مهمة جديدة
        </button>
      </div>

      {error && <LoadError message={error} onRetry={() => void reload()} />}

      <div className="bg-white rounded-2xl border border-stone-200 p-3 flex flex-col md:flex-row gap-2">
        {manage && (
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white">
            <option value="all">كل الفريق</option>
            {(data?.team || []).map((m) => <option key={m.accountId} value={m.accountId}>{m.name} — {m.titleAr}</option>)}
          </select>
        )}
        <select value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white">
          <option value="all">كل الحملات</option>
          <option value="none">بدون حملة</option>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-stone-600 px-2">
          <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> إظهار الملغاة ({cancelled.length})
        </label>
      </div>

      {!data ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center text-sm text-stone-400">{error ? "" : "جاري التحميل..."}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {[...COLUMNS, ...(showCancelled ? (["cancelled"] as TaskStatus[]) : [])].map((status) => {
            const list = tasks.filter((t) => t.status === status);
            return (
              <section key={status} className="rounded-2xl bg-stone-100/70 border border-stone-200 p-2.5">
                <h3 className="flex items-center justify-between px-1 pb-2">
                  <TaskStatusBadge status={status} />
                  <span className="text-xs font-black text-stone-500">{list.length}</span>
                </h3>
                <div className="space-y-2">
                  {list.length ? list.map(card) : <p className="text-[11px] text-stone-400 text-center py-4">لا شيء هنا</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {open && data && (
        <div data-dialog="" className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={close}>
          <aside onClick={(e) => e.stopPropagation()} className="bg-[#faf7f2] w-full max-w-lg h-full overflow-y-auto shadow-2xl border-s border-stone-200 flex flex-col">
            <div className="flex items-start justify-between gap-2 p-4 border-b border-stone-200">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap"><TaskStatusBadge status={open.status} /><PriorityLabel priority={open.priority} /></div>
                <h3 className="font-black text-lg text-stone-900 mt-1.5 leading-snug">{open.title}</h3>
                <p className="text-xs text-stone-500 mt-1">
                  {open.assignee_name} · أنشأها {open.created_by_name}
                  {open.due_date && <> · التسليم <span dir="ltr" className={open.due_date < today && open.status !== "done" ? "text-rose-600 font-bold" : ""}>{open.due_date}</span></>}
                </p>
                {open.campaign_name && <p className="text-xs text-amber-700 font-bold mt-1">الحملة: {open.campaign_name}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                {(manage || open.assignee_account_id === data.me || open.created_by === data.me) && open.status !== "done" && open.status !== "cancelled" && (
                  <button onClick={() => setEditing(open)} aria-label="تعديل" className="p-2 rounded-xl hover:bg-stone-200/60"><Pencil className="w-4 h-4" /></button>
                )}
                <button onClick={close} aria-label="إغلاق" className="p-2 rounded-xl hover:bg-stone-200/60"><X className="w-5 h-5" /></button>
              </div>
            </div>

            {open.description && <p className="p-4 text-sm text-stone-700 whitespace-pre-wrap border-b border-stone-200">{open.description}</p>}

            <div className="p-4 border-b border-stone-200 space-y-2">
              <div className="flex flex-wrap gap-2">
                {taskMoves(open.status, data.access).map((to) => (
                  <button key={to} disabled={busy}
                    onClick={() => void act({ status: to, expected_status: open.status, ...(note.trim() ? { note: note.trim() } : {}) }, `تم: ${TASK_STATUS_LABELS[to].label}`)}
                    className={cn("px-3 py-1.5 rounded-xl text-xs font-bold border disabled:opacity-50",
                      to === "done" ? "bg-emerald-600 border-emerald-600 text-white" : to === "cancelled" ? "bg-white border-rose-200 text-rose-700"
                        : to === "review" ? "bg-violet-600 border-violet-600 text-white" : "bg-white border-stone-200 text-stone-700")}>
                    {moveLabel(to, open.status, manage)}
                  </button>
                ))}
              </div>
              {manage && open.status === "review" && <p className="text-[11px] text-stone-500">للإعادة للتنفيذ اكتب السبب في خانة التعليق أولًا.</p>}
              {!manage && open.status === "review" && <p className="text-[11px] text-violet-700">بانتظار اعتماد مدير التسويق.</p>}
            </div>

            <div className="p-4 flex-1">
              <p className="text-xs font-black text-stone-900 mb-2">سجل المهمة</p>
              <ol className="space-y-2.5">
                {(open.thread || []).map((u) => (
                  <li key={u.id} className="flex gap-2">
                    <Avatar name={u.actor_name || "?"} className="w-7 h-7 text-[10px]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs"><span className="font-bold">{u.actor_name}</span>{" "}
                        <span className="text-stone-500">
                          {u.kind === "created" ? "أنشأ المهمة" : u.kind === "edited" ? "عدّل المهمة" : u.kind === "status"
                            ? <>نقلها من {TASK_STATUS_LABELS[u.status_from!]?.label} إلى <b>{TASK_STATUS_LABELS[u.status_to!]?.label}</b></> : "علّق"}
                        </span>
                      </p>
                      {u.note && u.kind !== "edited" && <p className="text-sm text-stone-800 bg-white border border-stone-100 rounded-xl px-2.5 py-1.5 mt-1 whitespace-pre-wrap">{u.note}</p>}
                      <p className="text-[10px] text-stone-400 mt-0.5" dir="ltr">{new Date(u.created_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <form className="p-4 border-t border-stone-200 flex gap-2 sticky bottom-0 bg-[#faf7f2]"
              onSubmit={(e) => { e.preventDefault(); if (note.trim()) void act({ note: note.trim() }, "تم إرسال التعليق."); }}>
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="اكتب تعليقًا أو تحديثًا للفريق..." className={cn(inputCls, "resize-none")} />
              <button type="submit" disabled={busy || !note.trim()} aria-label="إرسال" className="px-3 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950"><Send className="w-4 h-4" /></button>
            </form>
          </aside>
        </div>
      )}

      {editing && data && (
        <TaskModal task={editing === "new" ? null : editing} access={data.access} me={data.me} team={data.team} campaigns={campaigns}
          onClose={() => setEditing(null)}
          onSaved={(t) => { setEditing(null); void reload(); if (open?.id === t.id) setOpen(t); }} />
      )}
    </div>
  );
}

export default function MarketingTasksPage() {
  return <Suspense fallback={null}><TasksPageInner /></Suspense>;
}
