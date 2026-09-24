"use client";

// المقبوضات: every payment received in the period — method, reference, who recorded it — and every
// reversal. Filtering by CliQ or bank transfer gives the list to tick off against the bank app.
import { useState } from "react";
import { Wallet, ListOrdered } from "lucide-react";
import { METHOD_LABELS } from "@/lib/finance-overview";
import type { paymentLedger } from "@/lib/finance-pages";
import { formatDate } from "@/lib/utils";
import { Kpi, Section, Row, Empty, PeriodBar, Loading, Filters, PageHeader, money, useFinance, usePeriod, useShowMore } from "@/components/finance/ui";

const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Amman", hour: "2-digit", minute: "2-digit" });
const timeOf = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : clock.format(d); };

type Data = { payments: ReturnType<typeof paymentLedger>; recorded_by_available: boolean };

export default function PaymentsPage() {
  const period = usePeriod();
  const { from, to } = period;
  const { data, loading, error, reload } = useFinance<Data>(`/api/finance/records?view=payments&from=${from}&to=${to}`, "تعذر تحميل المقبوضات.");
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("all");
  const list = useShowMore(60);
  const p = data?.payments;
  const q = search.trim().toLowerCase();

  const rows = (p?.rows ?? []).filter((r) => (method === "all" || (method === "reversals" ? r.is_reversal : r.method === method && !r.is_reversal))
    && (!q || [r.customer, r.phone, r.order_id, r.invoice, r.reference, r.rep, r.recorded_by].some((f) => f?.toLowerCase().includes(q))));
  const shownTotal = rows.reduce((n, r) => n + Math.round(r.amount * 1000), 0) / 1000;

  return (
    <div className="space-y-4">
      <PageHeader title="المقبوضات" sub="كل دفعة استُلمت في الفترة: طريقتها ومرجعها ومن سجّلها، والدفعات المعكوسة" />
      <PeriodBar period={period} loading={loading} onReload={() => void reload()} error={error}
        exportHref={`/api/finance/records?view=payments&from=${from}&to=${to}&format=csv`} exportLabel="تصدير الدفعات (Excel)" />
      {!p ? <Loading loading={loading} error={error} what="المقبوضات" /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="صافي المقبوض" value={money(p.net)} hint={`${p.count} دفعة`} tone="emerald" />
            <Kpi label="المستلم" value={money(p.received)} />
            <Kpi label="دفعات معكوسة" value={money(p.reversed)} tone={p.reversed > 0 ? "rose" : "stone"} />
            <Kpi label="تحويلات بلا مرجع" value={`${p.missing_reference}`} hint="كليك/بنك/زين كاش بلا رقم عملية" tone={p.missing_reference ? "rose" : "stone"} />
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <Section title="حسب طريقة الدفع" icon={<Wallet className="w-4 h-4 text-emerald-500" />}>
              {p.by_method.length ? p.by_method.map((m) => (
                <Row key={m.key} label={METHOD_LABELS[m.key] ?? m.key} values={[{ v: `${m.count}`, hint: "دفعة" }, { v: money(m.value) }]} />
              )) : <Empty text="لا مقبوضات في هذه الفترة." />}
              {p.reversed > 0 && <Row label="معكوسة" values={[{ v: "−" + money(p.reversed), tone: "text-rose-600" }]} />}
              <Row label="الصافي" values={[{ v: money(p.net), tone: "text-emerald-700" }]} strong />
            </Section>

            <div className="lg:col-span-2">
              <Section title="سجل الدفعات" icon={<ListOrdered className="w-4 h-4 text-stone-500" />}>
                <Filters search={search} onSearch={setSearch} placeholder="بحث بالعميل أو الهاتف أو رقم الطلب أو المرجع أو من سجّلها..."
                  active={method} onChip={setMethod}
                  chips={[{ id: "all", label: "الكل", count: p.rows.length },
                    ...p.by_method.map((m) => ({ id: m.key, label: METHOD_LABELS[m.key] ?? m.key, count: m.count })),
                    ...(p.reversed > 0 ? [{ id: "reversals", label: "المعكوسة", count: p.rows.filter((r) => r.is_reversal).length }] : [])]} />
                {rows.length > 0 && <Row label="مجموع المعروض" values={[{ v: `${rows.length}`, hint: "دفعة" }, { v: money(shownTotal) }]} strong />}
                {rows.length ? rows.slice(0, list.limit).map((r) => (
                  <Row key={r.id}
                    label={<>{r.customer} <span className="text-stone-400">— طلب {r.order_id}</span></>}
                    sub={[`${formatDate(r.day)} ${timeOf(r.received_at)}`, METHOD_LABELS[r.method] ?? r.method,
                      r.reference && `مرجع ${r.reference}`, `سجّلها ${r.recorded_by}`, r.is_reversal && "دفعة عكسية", r.reversed && "عُكست لاحقاً"].filter(Boolean).join(" • ")}
                    values={[{ v: money(r.amount), tone: r.is_reversal ? "text-rose-600" : r.reversed ? "text-stone-400 line-through" : "text-emerald-700" }]} />
                )) : <Empty text="لا دفعات مطابقة." />}
                {list.more(rows.length)}
                {!data?.recorded_by_available && <p className="text-[11px] text-amber-700">تعذر تحميل من سجّل كل دفعة؛ يظهر «—».</p>}
              </Section>
            </div>
          </div>
          <p className="text-[11px] text-stone-400">الدفعة مؤرخة بيوم استلامها، مهما كان تاريخ طلبها. نقد السائقين عند التسليم يظهر باسم السائق.</p>
        </>
      )}
    </div>
  );
}
