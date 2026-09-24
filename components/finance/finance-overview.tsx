"use client";

// لوحة المالية: the headline money figures for a period, each section a summary that links to the
// page holding its detail. Figures come from /api/finance/overview (lib/finance-overview.ts decides
// the arithmetic); this component only lays them out.
import { TrendingUp, Wallet, AlertTriangle, Truck, Users, Tag, Megaphone, Package, Receipt, Database } from "lucide-react";
import { dataSourceLabel } from "@/lib/order-meta";
import { STATUS_LABELS, METHOD_LABELS, AGING_LABELS, type FinanceOverview } from "@/lib/finance-overview";
import { Kpi, Section, Row, Empty, PeriodBar, Loading, money, signed, useFinance, usePeriod } from "@/components/finance/ui";

export default function FinanceOverviewPanel() {
  const period = usePeriod();
  const { from, to } = period;
  const { data, loading, error, reload } = useFinance<{ overview: FinanceOverview }>(`/api/finance/overview?from=${from}&to=${to}`, "تعذر تحميل لوحة المالية.");
  const d = data?.overview;

  return (
    <div className="space-y-4">
      <PeriodBar period={period} loading={loading} onReload={() => void reload()} error={error}
        exportHref={`/api/finance/overview?from=${from}&to=${to}&format=csv`} exportLabel="تصدير الطلبات (Excel)" />

      {!d ? <Loading loading={loading} error={error} what="لوحة المالية" /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="صافي المبيعات" value={money(d.sales.net)} hint={`${d.sales.live_orders} طلب، بعد الخصومات`} />
            <Kpi label="المقبوضات" value={money(d.collections.net_received)} hint={`${d.collections.payments} دفعة في الفترة`} tone="emerald" />
            <Kpi label="الذمم المستحقة الآن" value={money(d.receivables.outstanding)} hint={`منها متأخرة ${money(d.receivables.overdue)}`} tone="amber" />
            <Kpi label="نقد مع السائقين الآن" value={money(d.drivers.in_transit_total)} hint="طلبات خرجت ولم تُسلَّم" tone="amber" />
            <Kpi label="الخصومات" value={money(d.sales.discounts + d.promo.saved)} hint={`يدوية ${money(d.sales.discounts)} + أكواد ${money(d.promo.saved)}`} tone="rose" />
            <Kpi label="الملغى والمرتجع" value={money(d.sales.cancelled.value + d.sales.returned.value)} hint={`${d.sales.cancelled.count} ملغى، ${d.sales.returned.count} مرتجع`} tone="rose" />
            <Kpi label="المصاريف المدفوعة" value={money(d.expenses.marketing + d.expenses.payroll_paid)} hint="تسويق + رواتب مدفوعة" />
            <Kpi label="صافي التدفق النقدي" value={signed(d.cashflow.net)} hint="المقبوضات − المصاريف" tone={d.cashflow.net >= 0 ? "emerald" : "rose"} />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Section title="المبيعات" icon={<TrendingUp className="w-4 h-4 text-amber-500" />} link={{ href: "/finance/reports", label: "الأرباح والخسائر" }}>
              <Row label="قيمة الأصناف قبل الخصم" values={[{ v: money(d.sales.gross) }]} />
              <Row label="خصومات على الإجمالي (مبالغ معدّلة)" values={[{ v: "−" + money(d.sales.discounts), tone: "text-rose-600" }]} />
              <Row label="صافي المبيعات" sub={`متوسط الطلب ${money(d.sales.average)}`} values={[{ v: money(d.sales.net) }]} strong />
              {d.sales.by_status.length ? d.sales.by_status.map((s) => (
                <Row key={s.key} label={STATUS_LABELS[s.key] ?? s.key} values={[{ v: `${s.count}`, hint: "طلب" }, { v: money(s.value) }]} />
              )) : <Empty />}
            </Section>

            <Section title="المقبوضات" icon={<Wallet className="w-4 h-4 text-emerald-500" />} link={{ href: "/finance/payments", label: "كل الدفعات" }}>
              {d.collections.by_method.length ? d.collections.by_method.map((m) => (
                <Row key={m.key} label={METHOD_LABELS[m.key] ?? m.key} values={[{ v: `${m.count}`, hint: "دفعة" }, { v: money(m.value) }]} />
              )) : <Empty text="لا مقبوضات في هذه الفترة." />}
              {d.collections.reversed > 0 && <Row label="دفعات معكوسة" values={[{ v: "−" + money(d.collections.reversed), tone: "text-rose-600" }]} />}
              <Row label="صافي المقبوض" values={[{ v: money(d.collections.net_received), tone: "text-emerald-700" }]} strong />
            </Section>

            <Section title="الذمم المستحقة (حتى اليوم)" icon={<AlertTriangle className="w-4 h-4 text-amber-500" />} link={{ href: "/finance/receivables", label: "الذمم حسب العميل" }}>
              {AGING_LABELS.map((a) => <Row key={a.key} label={a.label} values={[{ v: money(d.receivables.aging[a.key] ?? 0), tone: a.key === "current" ? undefined : "text-rose-600" }]} />)}
              <Row label="الإجمالي" sub={`${d.receivables.invoices} فاتورة`} values={[{ v: money(d.receivables.outstanding) }]} strong />
            </Section>

            <Section title="النقد مع السائقين" icon={<Truck className="w-4 h-4 text-sky-500" />} link={{ href: "/finance/cash", label: "النقدية" }} unavailable={!d.available.closures}>
              <Row label="مع السائقين الآن" sub={`${d.drivers.in_transit.reduce((n, x) => n + x.count, 0)} طلب خرج ولم يُسلَّم`} values={[{ v: money(d.drivers.in_transit_total) }]} />
              <Row label="نقد الورديات: متوقع / معدود" values={[{ v: money(d.drivers.expected), hint: "متوقع" }, { v: money(d.drivers.counted), hint: "معدود" },
                { v: signed(d.drivers.counted - d.drivers.expected), tone: d.drivers.counted < d.drivers.expected ? "text-rose-600" : "text-emerald-700" }]} />
              {d.drivers.short_shifts.length > 0 && <Row label="ورديات فيها فرق نقد" values={[{ v: `${d.drivers.short_shifts.length}`, tone: "text-rose-600" }]} />}
              {d.drivers.open_shifts.length > 0 && <Row label="ورديات لم تُغلق بعد" values={[{ v: `${d.drivers.open_shifts.length}`, tone: "text-amber-700" }]} />}
            </Section>

            <Section title="المصاريف" icon={<Megaphone className="w-4 h-4 text-orange-500" />} link={{ href: "/finance/expenses", label: "تفاصيل المصاريف" }}>
              <Row label="التسويق" values={[{ v: d.available.spend ? money(d.expenses.marketing) : "غير متاح" }]} />
              <Row label="الرواتب (كلفة الشركة لأشهر الفترة)" values={[{ v: d.available.payroll ? money(d.expenses.payroll_cost) : "غير متاح" }]} />
              <Row label="منها رواتب مدفوعة (صافي)" values={[{ v: money(d.expenses.payroll_paid), tone: "text-emerald-700" }]} />
              {d.available.advances && <Row label="سلف موظفين قائمة" sub={`${d.expenses.advances_active} سلفة`} values={[{ v: money(d.expenses.advances_amount) }]} />}
            </Section>

            <Section title="حسب المندوب" icon={<Users className="w-4 h-4 text-violet-500" />}>
              {d.reps.length ? d.reps.map((r) => (
                <Row key={r.rep} label={r.rep} sub={`${r.orders} طلب${r.cancelled ? ` — ${r.cancelled} ملغى/مرتجع` : ""}${r.discounts ? ` — خصم ${money(r.discounts)}` : ""}`}
                  values={[{ v: money(r.net), hint: "صافي" }, { v: money(r.collected), hint: "محصّل", tone: "text-emerald-700" }, { v: money(r.outstanding), hint: "متبقٍ", tone: "text-amber-700" }]} />
              )) : <Empty />}
            </Section>

            <Section title="مصدر البيانات ونوع العميل" icon={<Database className="w-4 h-4 text-sky-500" />}>
              <Row label="حصة Data Center من صافي المبيعات" sub="عملاء من بيانات الشركة" values={[{ v: `${d.sources.data_center_share}%`, tone: "text-sky-700" }]} strong />
              {d.sources.by_source.length ? d.sources.by_source.map((x) => (
                <Row key={x.key} label={x.key === "unknown" ? "غير محدد (طلبات قبل الحقل أو واتساب)" : dataSourceLabel(x.key) || x.key}
                  sub={`${x.orders} طلب${x.cancelled ? ` — ${x.cancelled} ملغى/مرتجع` : ""}`}
                  values={[{ v: money(x.net), hint: "صافي" }, { v: money(x.collected), hint: "محصّل", tone: "text-emerald-700" }]} />
              )) : <Empty />}
              <p className="text-[11px] font-bold text-stone-500 pt-1">B2B / B2C {`— B2B ${d.sources.b2b_share}% من الصافي`}</p>
              {d.sources.by_segment.length ? d.sources.by_segment.map((x) => (
                <Row key={x.key} label={x.key === "unknown" ? "غير محدد" : x.key} sub={`${x.orders} طلب`}
                  values={[{ v: money(x.net), hint: "صافي" }, { v: money(x.collected), hint: "محصّل", tone: "text-emerald-700" }]} />
              )) : <Empty />}
            </Section>

            <Section title="أكواد الخصم" icon={<Tag className="w-4 h-4 text-rose-500" />} unavailable={!d.available.redemptions}>
              {d.promo.by_code.length ? d.promo.by_code.map((c) => <Row key={c.key} label={c.key} values={[{ v: `${c.count}`, hint: "استخدام" }, { v: money(c.value), hint: "وفّر للعملاء" }]} />) : <Empty text="لم تُستخدم أكواد في هذه الفترة." />}
              <Row label="إجمالي ما وفّرته الأكواد" values={[{ v: money(d.promo.saved), tone: "text-rose-600" }]} strong />
            </Section>

            <Section title="المخزون (حتى اليوم)" icon={<Package className="w-4 h-4 text-teal-500" />} link={{ href: "/inventory", label: "المخزون" }} unavailable={!d.available.catalog}>
              <Row label="عدد القطع" values={[{ v: `${d.inventory.units}` }]} />
              <Row label="القيمة بسعر البيع" values={[{ v: money(d.inventory.retail_value) }]} />
              <Row label="القيمة بسعر التكلفة" sub={d.inventory.missing_cost ? `${d.inventory.missing_cost} صنف بلا سعر تكلفة — القيمة ناقصة` : undefined} values={[{ v: money(d.inventory.cost_value) }]} />
              {d.inventory.negative.length > 0 && <Row label="أصناف برصيد سالب (بيعت أكثر من المتوفر)" values={[{ v: `${d.inventory.negative.length}`, tone: "text-rose-600" }]} />}
            </Section>
          </div>

          <p className="text-[11px] text-stone-400 flex items-center gap-1">
            <Receipt className="w-3.5 h-3.5" />
            المبيعات بتاريخ الطلب، المقبوضات بتاريخ استلام الدفعة، الورديات بتاريخها. الذمم والنقد مع السائقين والمخزون كما هي الآن.
          </p>
        </>
      )}
    </div>
  );
}
