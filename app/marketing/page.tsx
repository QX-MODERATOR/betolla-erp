"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Megaphone, Target, ListChecks, Users, TrendingUp, Plus, AlertTriangle, Sparkles } from "lucide-react";
import { loadBusiness } from "@/lib/business-client";
import { StatCard, Panel, Avatar, LoadError } from "@/components/hr/hr-ui";
import { CampaignStatusBadge, TaskStatusBadge, PriorityLabel, Meter, jod, count, pct, ratio } from "@/components/marketing/mkt-ui";
import { ammanToday } from "@/lib/dates";
import { cn } from "@/lib/utils";
import {
  CHANNEL_LABELS, budgetTone, roasTone,
  type MarketingAccess, type MktCampaign, type MktTask, type MktTeamMember, type CampaignChannel,
} from "@/lib/marketing";

type Campaigns = { access: MarketingAccess; campaigns: MktCampaign[]; team: MktTeamMember[] };
type Tasks = { access: MarketingAccess; me: string; tasks: MktTask[] };

export default function MarketingDashboardPage() {
  const [data, setData] = useState<Campaigns | null>(null);
  const [tasks, setTasks] = useState<Tasks | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      const [c, t] = await Promise.all([
        loadBusiness<Campaigns>("/api/marketing/campaigns"),
        loadBusiness<Tasks>("/api/marketing/tasks"),
      ]);
      setData(c);
      setTasks(t);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل بيانات التسويق.");
    }
  }, []);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);

  const campaigns = data?.campaigns || [];
  const live = campaigns.filter((c) => c.status === "active" || c.status === "paused");
  const manage = data?.access === "manage";
  const today = ammanToday();

  // Month-to-date across every campaign (spend by spend date, leads by attribution date).
  const monthSpend = campaigns.reduce((s, c) => s + Number(c.spend_this_month), 0);
  const monthLeads = campaigns.reduce((s, c) => s + c.leads_this_month, 0);
  const liveBudget = live.reduce((s, c) => s + Number(c.budget), 0);
  const liveSpend = live.reduce((s, c) => s + Number(c.spend), 0);
  // All-time, for the ratios: revenue and spend of every campaign that is not cancelled.
  const counted = campaigns.filter((c) => c.status !== "cancelled");
  const totalSpend = counted.reduce((s, c) => s + Number(c.spend), 0);
  const totalRevenue = counted.reduce((s, c) => s + Number(c.revenue), 0);
  const totalLeads = counted.reduce((s, c) => s + c.leads, 0);
  const totalConverted = counted.reduce((s, c) => s + c.converted, 0);
  const roas = totalSpend > 0 ? Math.round((totalRevenue / totalSpend) * 100) / 100 : null;

  // Worth a look: live campaigns past 85% of budget, past their end date, or spending with no leads.
  const alerts = live.flatMap((c) => {
    const out: string[] = [];
    if (c.budget_used !== null && c.budget_used >= 85) out.push(`${c.name}: صُرف ${pct(c.budget_used)} من الميزانية`);
    if (c.end_date && c.end_date < today) out.push(`${c.name}: انتهى تاريخها (${c.end_date}) وما زالت ${c.status === "active" ? "فعّالة" : "متوقفة"}`);
    if (Number(c.spend) > 0 && c.leads === 0) out.push(`${c.name}: مصروف ${jod(c.spend)} بدون أي ليد مسجّل`);
    return out;
  });

  const openTasks = (tasks?.tasks || []).filter((t) => t.status !== "done" && t.status !== "cancelled");
  const review = openTasks.filter((t) => t.status === "review");
  const overdue = openTasks.filter((t) => t.due_date && t.due_date < today);
  const mine = openTasks.filter((t) => t.assignee_account_id === tasks?.me);

  // Leads and revenue by channel, all campaigns except cancelled.
  const byChannel = Object.entries(counted.reduce<Record<string, { leads: number; revenue: number; spend: number }>>((acc, c) => {
    const row = acc[c.channel] || (acc[c.channel] = { leads: 0, revenue: 0, spend: 0 });
    row.leads += c.leads; row.revenue += Number(c.revenue); row.spend += Number(c.spend);
    return acc;
  }, {})).sort((a, b) => b[1].revenue - a[1].revenue);
  const maxChannelRevenue = Math.max(1, ...byChannel.map(([, v]) => v.revenue));

  const loading = !data && !error;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5">
            <Megaphone className="w-6 h-6 text-amber-500" /> لوحة التسويق
          </h2>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">كم صرفنا، كم ليد جاء، وكم رجع مبيعات — من الحملة إلى الطلبية</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/marketing/tasks" className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 font-bold text-sm rounded-xl">
            <ListChecks className="w-4 h-4" /> المهام
          </Link>
          {manage && (
            <Link href="/marketing/campaigns?new=1" className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-sm rounded-xl">
              <Plus className="w-4 h-4" /> حملة جديدة
            </Link>
          )}
        </div>
      </div>

      {error && <LoadError message={error} onRetry={() => void reload()} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="الحملات الجارية" value={loading ? "…" : live.length} hint={`${campaigns.filter((c) => c.status === "planned").length} مخططة`} />
        <StatCard label="مصروف هذا الشهر" value={loading ? "…" : jod(monthSpend)}
          hint={liveBudget ? `الجارية: ${jod(liveSpend)} من ${jod(liveBudget)}` : undefined} />
        <StatCard label="ليدات هذا الشهر" value={loading ? "…" : count(monthLeads)} tone="text-sky-700"
          hint={totalLeads ? `تحويل ${pct(Math.round((1000 * totalConverted) / totalLeads) / 10)} من كل الحملات` : undefined} />
        <StatCard label="العائد على الإعلان (ROAS)" value={loading ? "…" : ratio(roas)} tone={roasTone(roas)}
          hint={totalSpend ? `${jod(totalRevenue)} مبيعات مقابل ${jod(totalSpend)}` : "لا يوجد مصروف مسجّل بعد"} />
      </div>

      {alerts.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 space-y-1">
          {alerts.map((a) => <p key={a} className="text-xs font-bold text-amber-800 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" />{a}</p>)}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Panel title="أداء الحملات" icon={<Target className="w-4 h-4 text-amber-500" />}
            action={<Link href="/marketing/campaigns" className="text-xs font-bold text-amber-700">كل الحملات</Link>}>
            {!campaigns.length ? (
              <p className="text-sm text-stone-400">
                {loading ? "جاري التحميل..." : "لا توجد حملات بعد."}{" "}
                {!loading && manage && <Link href="/marketing/campaigns?new=1" className="text-amber-700 font-bold">أنشئ أول حملة</Link>}
              </p>
            ) : (
              <div className="overflow-x-auto -mx-4">
                <table className="w-full text-sm">
                  <thead className="text-[11px] text-stone-500">
                    <tr>{["الحملة", "المصروف / الميزانية", "ليدات", "تحويل", "المبيعات", "ROAS"].map((h) => <th key={h} className="text-start px-4 py-2 font-bold">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {campaigns.filter((c) => c.status !== "cancelled").slice(0, 8).map((c) => (
                      <tr key={c.id} className="hover:bg-amber-50/30">
                        <td className="px-4 py-2.5">
                          <Link href={`/marketing/campaigns/${c.id}`} className="font-bold text-stone-900 hover:text-amber-700">{c.name}</Link>
                          <div className="flex items-center gap-1.5 mt-0.5"><CampaignStatusBadge status={c.status} /><span className="text-[11px] text-stone-500">{CHANNEL_LABELS[c.channel]}</span></div>
                        </td>
                        <td className="px-4 py-2.5 min-w-[140px]">
                          <p className={cn("text-xs font-bold", budgetTone(c))}>{jod(c.spend)}</p>
                          {Number(c.budget) > 0 && <><Meter value={c.budget_used} className="mt-1" /><p className="text-[10px] text-stone-400 mt-0.5">من {jod(c.budget)}</p></>}
                        </td>
                        <td className="px-4 py-2.5 font-black">{count(c.leads)}{c.target_leads ? <span className="text-[10px] text-stone-400 font-normal"> / {c.target_leads}</span> : null}</td>
                        <td className="px-4 py-2.5 text-xs">{pct(c.conversion_rate)}</td>
                        <td className="px-4 py-2.5 text-xs font-bold">{jod(c.revenue)}</td>
                        <td className={cn("px-4 py-2.5 font-black", roasTone(c.roas))}>{ratio(c.roas)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <Panel title={manage ? "بانتظار مراجعتك" : "مهامي المفتوحة"} icon={<ListChecks className="w-4 h-4 text-amber-500" />}
          action={<Link href="/marketing/tasks" className="text-xs font-bold text-amber-700">لوحة المهام</Link>}>
          {(() => {
            const list = manage ? review : mine;
            if (!tasks) return <p className="text-sm text-stone-400">جاري التحميل...</p>;
            if (!list.length) return <p className="text-sm text-stone-400">{manage ? "لا توجد مهام بانتظار المراجعة." : "لا توجد مهام مفتوحة لك."}</p>;
            return (
              <ul className="space-y-2">
                {list.slice(0, 7).map((t) => (
                  <li key={t.id}>
                    <Link href={`/marketing/tasks?task=${t.id}`} className="block rounded-xl border border-stone-100 hover:border-amber-300 p-2.5">
                      <p className="text-sm font-bold text-stone-900 truncate">{t.title}</p>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <span className="text-[11px] text-stone-500 truncate">{t.assignee_name}{t.campaign_name ? ` · ${t.campaign_name}` : ""}</span>
                        <span className="flex items-center gap-1.5 shrink-0"><PriorityLabel priority={t.priority} /><TaskStatusBadge status={t.status} /></span>
                      </div>
                      {t.due_date && <p className={cn("text-[10px] mt-0.5", t.due_date < today ? "text-rose-600 font-bold" : "text-stone-400")} dir="ltr">{t.due_date}</p>}
                    </Link>
                  </li>
                ))}
              </ul>
            );
          })()}
          {tasks && (
            <p className="text-[11px] text-stone-500 mt-3 pt-3 border-t border-stone-100">
              {openTasks.length} مهمة مفتوحة · {review.length} بانتظار المراجعة ·{" "}
              <span className={overdue.length ? "text-rose-600 font-bold" : ""}>{overdue.length} متأخرة</span>
            </p>
          )}
        </Panel>

        <div className="lg:col-span-2">
          <Panel title="المبيعات حسب القناة" icon={<TrendingUp className="w-4 h-4 text-amber-500" />}>
            {!byChannel.length ? <p className="text-sm text-stone-400">تظهر هنا القنوات بعد ربط أول ليد بحملة.</p> : (
              <ul className="space-y-2.5">
                {byChannel.map(([channel, v]) => (
                  <li key={channel}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-bold text-stone-800">{CHANNEL_LABELS[channel as CampaignChannel]}</span>
                      <span className="text-stone-500">{count(v.leads)} ليد · مصروف {jod(v.spend)} · <span className="font-black text-stone-900">{jod(v.revenue)}</span></span>
                    </div>
                    <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-l from-[#9e8959] to-[#c28a40]" style={{ width: `${(v.revenue / maxChannelRevenue) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel title="فريق التسويق" icon={<Users className="w-4 h-4 text-amber-500" />}>
          <ul className="space-y-2.5">
            {(data?.team || []).map((m) => {
              const open = openTasks.filter((t) => t.assignee_account_id === m.accountId).length;
              return (
                <li key={m.accountId} className="flex items-start gap-2.5">
                  <Avatar name={m.name} className="w-8 h-8 text-xs" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-stone-900 flex items-center justify-between gap-2">
                      <span className="truncate">{m.name}</span>
                      {manage && <span className="text-[10px] text-stone-400 font-normal shrink-0">{open} مهمة</span>}
                    </p>
                    <p className="text-[11px] text-amber-700 font-bold">{m.titleAr}</p>
                    <p className="text-[11px] text-stone-500 leading-snug">{m.focusAr}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-4 text-xs text-stone-600 leading-relaxed">
        <p className="font-black text-stone-900 flex items-center gap-1.5 mb-1"><Sparkles className="w-4 h-4 text-amber-500" /> كيف تُحسب الأرقام</p>
        الليد يُنسب لحملة واحدة (آخر حملة جاءت منها) — من صفحة الحملة، أو تلقائيًا إذا أرسل نموذج الإعلان رمز الحملة.
        مبيعات الحملة = طلبيات هذه الليدات منذ تاريخ بداية الحملة، بدون الملغاة والمرتجعة. المصروف يُسجَّل بتاريخه ولا يُحذف؛ الخطأ يُلغى بسبب مكتوب.
      </div>
    </div>
  );
}
