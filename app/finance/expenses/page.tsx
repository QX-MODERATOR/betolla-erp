"use client";

// المصاريف: the money the system records going out — marketing spend entries, payroll runs, and
// employee advances still being repaid. There is no general expenses table, so rent, stock purchases
// and the like are not here.
import { useState } from "react";
import { Megaphone, Wallet, HandCoins } from "lucide-react";
import type { expenses } from "@/lib/finance-pages";
import { formatDate } from "@/lib/utils";
import { Kpi, Section, Row, Empty, PeriodBar, Loading, Filters, PageHeader, money, useFinance, usePeriod, useShowMore } from "@/components/finance/ui";

type Data = { expenses: ReturnType<typeof expenses> };
const CHANNELS: Record<string, string> = { facebook: "فيسبوك", instagram: "إنستغرام", tiktok: "تيك توك", snapchat: "سناب شات", google: "جوجل",
  whatsapp: "واتساب", influencer: "مؤثرون", offline: "خارج الإنترنت", other: "أخرى" };
const RUN_STATUS: Record<string, string> = { draft: "مسودة", approved: "معتمدة — بانتظار الدفع", paid: "مدفوعة" };

export default function ExpensesPage() {
  const period = usePeriod();
  const { from, to } = period;
  const { data, loading, error, reload } = useFinance<Data>(`/api/finance/records?view=expenses&from=${from}&to=${to}`, "تعذر تحميل المصاريف.");
  const [search, setSearch] = useState("");
  const [show, setShow] = useState("live");
  const list = useShowMore(50);
  const e = data?.expenses;
  const q = search.trim();
  const entries = (e?.entries ?? []).filter((x) => (show === "all" || (show === "voided" ? x.voided : !x.voided))
    && (!q || [x.campaign, x.description, x.by].some((f) => f?.includes(q))));

  return (
    <div className="space-y-4">
      <PageHeader title="المصاريف" sub="مصاريف التسويق المسجلة، مسيرات الرواتب، وسلف الموظفين القائمة" />
      <PeriodBar period={period} loading={loading} onReload={() => void reload()} error={error} />
      {!e ? <Loading loading={loading} error={error} what="المصاريف" /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="إجمالي المصاريف" value={money(e.total)} hint="تسويق + كلفة الرواتب" />
            <Kpi label="التسويق" value={money(e.marketing)} hint={`${e.entries.filter((x) => !x.voided).length} قيد`} />
            <Kpi label="الرواتب (كلفة الشركة)" value={money(e.payroll_cost)} hint={`مدفوع ${money(e.payroll_paid)}`} />
            <Kpi label="رواتب لم تُدفع بعد" value={money(e.payroll_unpaid)} hint="صافي مسيرات مسودة/معتمدة" tone={e.payroll_unpaid > 0 ? "amber" : "stone"} />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Section title="الرواتب (أشهر الفترة)" icon={<Wallet className="w-4 h-4 text-emerald-500" />} link={{ href: "/hr/payroll", label: "المسيرات" }} unavailable={!e.available.payroll}>
              {e.payroll.length ? e.payroll.map((r) => (
                <Row key={r.month} label={`${r.month} — ${RUN_STATUS[r.status] ?? r.status}`}
                  sub={[`${r.count} موظف`, r.approved_by && `اعتمدها ${r.approved_by}`, r.paid_by && `دفعها ${r.paid_by}${r.paid_at ? " " + formatDate(r.paid_at) : ""}`,
                    r.payment_ref && `مرجع ${r.payment_ref}`].filter(Boolean).join(" • ")}
                  values={[{ v: money(r.gross), hint: "إجمالي" }, { v: money(r.net), hint: "صافي" },
                    { v: money(r.ssc_employer), hint: "ضمان الشركة" }, { v: money(r.employer_cost), hint: "الكلفة", tone: "text-stone-900 font-bold" }]} />
              )) : <Empty text="لا مسيرات رواتب لأشهر هذه الفترة." />}
            </Section>

            <Section title="سلف الموظفين القائمة" icon={<HandCoins className="w-4 h-4 text-amber-500" />} unavailable={!e.available.advances}>
              {e.advances.length ? e.advances.map((a) => (
                <Row key={a.id} label={a.employee} sub={`${a.reason} — تبدأ ${a.start_month}`}
                  values={[{ v: money(a.amount), hint: "السلفة" }, { v: money(a.monthly_amount), hint: "القسط الشهري", tone: "text-amber-700" }]} />
              )) : <Empty text="لا سلف قائمة." />}
              {e.advances.length > 0 && <Row label="الإجمالي" values={[{ v: money(e.advances_amount) }, { v: money(e.advances_monthly), hint: "شهرياً", tone: "text-amber-700" }]} strong />}
            </Section>
          </div>

          <Section title="مصاريف التسويق" icon={<Megaphone className="w-4 h-4 text-orange-500" />} link={{ href: "/finance/budgets", label: "مقابل الموازنة" }} unavailable={!e.available.spend}>
            {e.by_channel.length > 0 && (
              <div className="flex flex-wrap gap-2 text-[11px]">
                {e.by_channel.map((c) => <span key={c.key} className="px-2 py-1 rounded-lg bg-stone-50 border border-stone-200">{CHANNELS[c.key] ?? c.key}: <b className="font-mono">{money(c.value)}</b></span>)}
              </div>
            )}
            <Filters search={search} onSearch={setSearch} placeholder="بحث بالحملة أو الوصف أو من سجّلها..." active={show} onChip={setShow}
              chips={[{ id: "live", label: "المحتسبة", count: e.entries.filter((x) => !x.voided).length },
                { id: "voided", label: "الملغاة", count: e.entries.filter((x) => x.voided).length }, { id: "all", label: "الكل", count: e.entries.length }]} />
            {entries.length ? entries.slice(0, list.limit).map((x) => (
              <Row key={x.id} label={`${x.campaign}${x.channel ? ` (${CHANNELS[x.channel] ?? x.channel})` : ""}`}
                sub={[formatDate(x.date), x.description, `سجّله ${x.by}`, x.voided && `ألغاه ${x.voided_by}: ${x.void_reason}`].filter(Boolean).join(" • ")}
                values={[{ v: money(x.amount), tone: x.voided ? "text-stone-400 line-through" : undefined }]} />
            )) : <Empty text="لا مصاريف تسويق مطابقة." />}
            {list.more(entries.length)}
          </Section>
          <p className="text-[11px] text-stone-400">التسويق بتاريخ الصرف، والرواتب بشهر المسيّر. لا يوجد في النظام جدول لمصاريف أخرى (إيجار، مشتريات بضاعة...).</p>
        </>
      )}
    </div>
  );
}
