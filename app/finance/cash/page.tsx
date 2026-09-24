"use client";

// النقدية: the company's cash is collected by drivers, so this is where it is — goods out with a
// driver now and what they will bring in, and each shift's expected cash against what was counted.
// From /api/finance/overview (the drivers section of lib/finance-overview.ts).
import { Truck, AlertTriangle, ClipboardList } from "lucide-react";
import { METHOD_LABELS, type FinanceOverview } from "@/lib/finance-overview";
import { Kpi, Section, Row, Empty, PeriodBar, Loading, PageHeader, money, signed, useFinance, usePeriod } from "@/components/finance/ui";

export default function CashPage() {
  const period = usePeriod();
  const { from, to } = period;
  const { data, loading, error, reload } = useFinance<{ overview: FinanceOverview }>(`/api/finance/overview?from=${from}&to=${to}`, "تعذر تحميل النقدية.");
  const d = data?.overview;
  const cashMethods = (d?.collections.by_method ?? []).filter((m) => m.key === "cash" || m.key === "cash_on_delivery");
  const cashIn = cashMethods.reduce((n, m) => n + Math.round(m.value * 1000), 0) / 1000;
  const cashCount = cashMethods.reduce((n, m) => n + m.count, 0);

  return (
    <div className="space-y-4">
      <PageHeader title="النقدية" sub="النقد مع السائقين الآن، وكشف كل وردية: المتوقع مقابل المعدود" />
      <PeriodBar period={period} loading={loading} onReload={() => void reload()} error={error} />
      {!d ? <Loading loading={loading} error={error} what="النقدية" /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="مع السائقين الآن" value={money(d.drivers.in_transit_total)} hint="طلبات خرجت ولم تُسلَّم" tone="amber" />
            <Kpi label="نقد مقبوض في الفترة" value={money(cashIn)} hint={`${cashCount} دفعة نقدية`} tone="emerald" />
            <Kpi label="نقد الورديات: الفرق" value={signed(d.drivers.counted - d.drivers.expected)} hint={`متوقع ${money(d.drivers.expected)}، معدود ${money(d.drivers.counted)}`}
              tone={d.drivers.counted < d.drivers.expected ? "rose" : "emerald"} />
            <Kpi label="ورديات لم تُغلق" value={`${d.drivers.open_shifts.length}`} tone={d.drivers.open_shifts.length ? "amber" : "stone"} />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Section title="مع السائقين الآن" icon={<Truck className="w-4 h-4 text-sky-500" />}>
              {d.drivers.in_transit.length ? d.drivers.in_transit.map((x) => <Row key={x.key} label={x.key} values={[{ v: `${x.count}`, hint: "طلب" }, { v: money(x.value), hint: "سيحصّل" }]} />)
                : <Empty text="لا طلبات مع السائقين الآن." />}
              <Row label="الإجمالي" values={[{ v: money(d.drivers.in_transit_total) }]} strong />
            </Section>

            <Section title="ورديات فيها فرق نقد" icon={<AlertTriangle className="w-4 h-4 text-rose-500" />} unavailable={!d.available.closures}>
              {d.drivers.short_shifts.length ? d.drivers.short_shifts.map((x) => (
                <Row key={x.driver + x.date} label={`${x.driver} — ${x.date}`}
                  values={[{ v: money(x.expected), hint: "متوقع" }, { v: money(x.counted), hint: "معدود" }, { v: signed(x.difference), tone: x.difference < 0 ? "text-rose-600" : "text-amber-700" }]} />
              )) : <Empty text="كل الورديات المعدودة مطابقة." />}
              {d.drivers.open_shifts.length > 0 && <Row label="لم تُغلق بعد" sub={d.drivers.open_shifts.map((x) => `${x.driver} ${x.date}`).join("، ")} values={[{ v: `${d.drivers.open_shifts.length}`, tone: "text-amber-700" }]} />}
            </Section>
          </div>

          <Section title="ورديات الفترة حسب السائق" icon={<ClipboardList className="w-4 h-4 text-stone-500" />} link={{ href: "/drivers/reconcile", label: "تسوية العهدة" }} unavailable={!d.available.closures}>
            {d.drivers.shifts.length ? d.drivers.shifts.map((x) => (
              <Row key={x.driver} label={x.driver} sub={`${x.shifts} وردية (${x.closed} مغلقة) — ${x.delivered} تسليم، ${x.returned} مرتجع`}
                values={[{ v: money(x.expected), hint: "متوقع" }, { v: money(x.counted), hint: "معدود" },
                  { v: signed(x.difference), tone: x.difference < 0 ? "text-rose-600" : x.difference > 0 ? "text-amber-700" : "text-emerald-700" }]} />
            )) : <Empty text="لا ورديات مسجلة في هذه الفترة." />}
          </Section>

          <Section title="المقبوض حسب الطريقة" icon={<Truck className="w-4 h-4 text-emerald-500" />} link={{ href: "/finance/payments", label: "كل الدفعات" }}>
            {d.collections.by_method.length ? d.collections.by_method.map((m) => <Row key={m.key} label={METHOD_LABELS[m.key] ?? m.key} values={[{ v: `${m.count}`, hint: "دفعة" }, { v: money(m.value) }]} />)
              : <Empty text="لا مقبوضات في هذه الفترة." />}
          </Section>
          <p className="text-[11px] text-stone-400">لا يسجل النظام حسابات بنكية أو صندوقاً نثرياً؛ النقد هنا هو ما يجمعه السائقون ويُعدّ عند إغلاق الوردية.</p>
        </>
      )}
    </div>
  );
}
