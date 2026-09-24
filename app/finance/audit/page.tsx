"use client";

// سجل التدقيق: who did what to money, newest first — payments recorded and reversed, orders
// delivered, cancelled or returned, order totals edited, marketing spend added or voided, payroll
// approved and paid, advances granted. Read from the request log the database already keeps.
import { useState } from "react";
import { ScrollText } from "lucide-react";
import { AUDIT_KINDS, type auditTrail } from "@/lib/finance-pages";
import { Section, Row, Empty, PeriodBar, Loading, Filters, PageHeader, money, useFinance, usePeriod, useShowMore } from "@/components/finance/ui";

type Data = { audit: ReturnType<typeof auditTrail>; order_changes_available: boolean };
const stamp = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Amman", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
const TONE: Record<string, string> = { payment_reverse: "text-rose-600", mkt_spend_void: "text-rose-600", order_edit: "text-amber-700" };

export default function AuditPage() {
  const period = usePeriod();
  const { from, to } = period;
  const { data, loading, error, reload } = useFinance<Data>(`/api/finance/records?view=audit&from=${from}&to=${to}`, "تعذر تحميل سجل التدقيق.");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const list = useShowMore(80);
  const rows = data?.audit;
  const q = search.trim();
  const shown = (rows ?? []).filter((r) => (kind === "all" || r.kind === kind) && (!q || [r.actor, r.subject, r.detail].some((f) => f.includes(q))));
  const kinds = Object.keys(AUDIT_KINDS).map((id) => ({ id, label: AUDIT_KINDS[id], count: (rows ?? []).filter((r) => r.kind === id).length })).filter((k) => k.count);

  return (
    <div className="space-y-4">
      <PageHeader title="سجل التدقيق" sub="من سجّل أو عكس أو ألغى أو عدّل أو اعتمد أو دفع — ومتى" />
      <PeriodBar period={period} loading={loading} onReload={() => void reload()} error={error} />
      {!rows ? <Loading loading={loading} error={error} what="السجل" /> : (
        <Section title={`العمليات (${rows.length})`} icon={<ScrollText className="w-4 h-4 text-stone-500" />}>
          <Filters search={search} onSearch={setSearch} placeholder="بحث بالشخص أو الطلب أو العميل أو التفاصيل..." active={kind} onChip={setKind}
            chips={[{ id: "all", label: "الكل", count: rows.length }, ...kinds]} />
          {shown.length ? shown.slice(0, list.limit).map((r, i) => (
            <Row key={r.at + r.kind + i} label={<><b className={TONE[r.kind] ?? "text-stone-900"}>{AUDIT_KINDS[r.kind] ?? r.kind}</b> — {r.subject}</>}
              sub={[stamp.format(new Date(r.at)), `بواسطة ${r.actor}`, r.detail].filter(Boolean).join(" • ")}
              values={r.amount === null ? [] : [{ v: money(r.amount), tone: r.amount < 0 ? "text-rose-600" : undefined }]} />
          )) : <Empty text="لا عمليات مطابقة في هذه الفترة." />}
          {list.more(shown.length)}
          {!data?.order_changes_available && <p className="text-[11px] text-amber-700">تعذر تحميل تعديلات الطلبات؛ لا تظهر هنا.</p>}
        </Section>
      )}
      <p className="text-[11px] text-stone-400">نقد السائقين عند التسليم يُسجَّل تلقائياً ويظهر في المقبوضات باسم السائق، لا هنا.</p>
    </div>
  );
}
