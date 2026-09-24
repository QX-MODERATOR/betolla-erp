"use client";

// الموازنات: each marketing campaign's budget against everything spent on it. Campaigns are the
// only thing in the system with a budget; a budget covers the whole campaign, so there is no period.
import { PiggyBank } from "lucide-react";
import type { budgets } from "@/lib/finance-pages";
import { formatDate } from "@/lib/utils";
import { Kpi, Section, Empty, PeriodBar, Loading, PageHeader, money, useFinance } from "@/components/finance/ui";

type Data = { budgets: ReturnType<typeof budgets> };
const STATUS: Record<string, string> = { planned: "مخططة", active: "نشطة", paused: "متوقفة", completed: "منتهية", cancelled: "ملغاة" };

export default function BudgetsPage() {
  const { data, loading, error, reload } = useFinance<Data>("/api/finance/records?view=budgets", "تعذر تحميل الموازنات.");
  const b = data?.budgets;

  return (
    <div className="space-y-4">
      <PageHeader title="الموازنات" sub="موازنة كل حملة تسويقية مقابل ما صُرف عليها فعلاً" />
      <PeriodBar loading={loading} onReload={() => void reload()} error={error} />
      {!b ? <Loading loading={loading} error={error} what="الموازنات" /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="إجمالي الموازنات" value={money(b.budget)} hint={`${b.rows.length} حملة`} />
            <Kpi label="المصروف" value={money(b.spent)} hint={b.used === null ? undefined : `${b.used}% من الموازنة`} />
            <Kpi label="المتبقي" value={money(b.remaining)} tone={b.remaining < 0 ? "rose" : "emerald"} />
            <Kpi label="حملات تجاوزت موازنتها" value={`${b.over}`} hint={b.no_budget ? `و${b.no_budget} صُرف عليها بلا موازنة` : undefined} tone={b.over || b.no_budget ? "rose" : "stone"} />
          </div>

          <Section title="الحملات" icon={<PiggyBank className="w-4 h-4 text-pink-500" />} link={{ href: "/finance/expenses", label: "قيود الصرف" }}>
            {b.rows.length ? b.rows.map((r) => {
              const pct = r.used ?? (r.spent > 0 ? 100 : 0);
              return (
                <div key={r.id} className="py-2.5 border-b border-stone-100 last:border-0 text-xs space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <div className="min-w-0">
                      <p className="text-stone-800 font-bold break-words">{r.name} <span className="font-mono text-stone-400 font-normal">{r.code}</span></p>
                      <p className="text-[10px] text-stone-400">{STATUS[r.status] ?? r.status} — {r.channel} — {formatDate(r.start_date)}{r.end_date ? ` ← ${formatDate(r.end_date)}` : ""}
                        {r.entries ? ` — ${r.entries} قيد، آخرها ${formatDate(r.last_spend)}` : " — لا صرف بعد"}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 font-mono">
                      <span><span className="text-[10px] text-stone-400 font-sans ml-1">الموازنة</span>{money(r.budget)}</span>
                      <span><span className="text-[10px] text-stone-400 font-sans ml-1">المصروف</span>{money(r.spent)}</span>
                      <span className={r.remaining < 0 ? "text-rose-600" : "text-emerald-700"}><span className="text-[10px] text-stone-400 font-sans ml-1">المتبقي</span>{money(r.remaining)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-stone-100 overflow-hidden">
                      <div className={`h-full rounded-full ${r.over || r.no_budget ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                    <span className={`text-[10px] font-bold ${r.over || r.no_budget ? "text-rose-600" : "text-stone-500"}`}>
                      {r.no_budget ? "بلا موازنة" : r.used === null ? "—" : `${r.used}%`}
                    </span>
                  </div>
                </div>
              );
            }) : <Empty text="لا حملات مسجلة." />}
          </Section>
          <p className="text-[11px] text-stone-400">الموازنة يحددها فريق التسويق عند إنشاء الحملة. القيود الملغاة لا تُحتسب.</p>
        </>
      )}
    </div>
  );
}
