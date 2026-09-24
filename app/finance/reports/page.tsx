"use client";

// التقارير المالية: a profit and loss and a cash flow statement, month by month, from what the
// system records. Sales less the cost of the goods sold, less marketing and payroll; and money in
// less money out. No balance sheet or trial balance — there is no ledger to draw them from.
import { FileChartColumn, ArrowLeftRight, AlertTriangle } from "lucide-react";
import type { profitAndLoss } from "@/lib/finance-pages";
import { Kpi, Section, PeriodBar, Loading, PageHeader, money, signed, useFinance, usePeriod } from "@/components/finance/ui";

type Report = ReturnType<typeof profitAndLoss>;
type Col = Report["total"];

// A statement as a table: one row per line item, one column per month plus the total.
function Statement({ cols, lines }: { cols: Col[]; lines: { label: string; pick: (c: Col) => number; strong?: boolean; sign?: boolean; minus?: boolean }[] }) {
  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="w-full text-xs text-right">
        <thead>
          <tr className="text-stone-500 border-b border-stone-200">
            <th className="py-2 pl-3 font-bold">البند</th>
            {cols.map((c) => <th key={c.key} className="py-2 px-2 font-bold font-mono whitespace-nowrap">{c.key === "total" ? "الإجمالي" : c.key}</th>)}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.label} className={`border-b border-stone-100 last:border-0 ${l.strong ? "font-bold bg-stone-50" : ""}`}>
              <td className="py-2 pl-3 text-stone-800 whitespace-nowrap">{l.label}</td>
              {cols.map((c) => {
                const v = l.pick(c);
                return <td key={c.key} className={`py-2 px-2 font-mono whitespace-nowrap ${l.sign ? (v < 0 ? "text-rose-600" : "text-emerald-700") : l.minus && v ? "text-rose-600" : "text-stone-900"}`}>
                  {l.sign ? signed(v) : l.minus && v ? "−" + money(v) : money(v)}
                </td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ReportsPage() {
  const period = usePeriod("year");
  const { from, to } = period;
  const { data, loading, error, reload } = useFinance<{ report: Report }>(`/api/finance/records?view=reports&from=${from}&to=${to}`, "تعذر تحميل التقارير.");
  const r = data?.report;
  const cols = r ? (r.months.length > 1 ? [...r.months, r.total] : [r.total]) : [];
  const t = r?.total;
  const missing = t?.missing_cost ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader title="التقارير المالية" sub="الأرباح والخسائر والتدفق النقدي، شهراً بشهر" />
      <PeriodBar period={period} loading={loading} onReload={() => void reload()} error={error}
        exportHref={`/api/finance/records?view=reports&from=${from}&to=${to}&format=csv`} exportLabel="تصدير التقرير (Excel)" />
      {!r || !t ? <Loading loading={loading} error={error} what="التقارير" /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="صافي المبيعات" value={money(t.sales)} />
            <Kpi label="مجمل الربح" value={money(t.gross_profit)} hint={t.gross_margin === null ? undefined : `هامش ${t.gross_margin}%`} tone={missing ? "amber" : "stone"} />
            <Kpi label="صافي الربح" value={signed(t.net_profit)} hint="بعد التسويق والرواتب" tone={t.net_profit >= 0 ? "emerald" : "rose"} />
            <Kpi label="صافي التدفق النقدي" value={signed(t.cash_net)} hint="المقبوض − المدفوع" tone={t.cash_net >= 0 ? "emerald" : "rose"} />
          </div>

          {(missing > 0 || r.products_without_cost > 0 || !r.available.lines) && (
            <div role="alert" className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">تكلفة البضاعة ناقصة، فمجمل الربح أعلى من الحقيقي.</p>
                <p>{!r.available.lines ? "تعذر تحميل أصناف الطلبات. " : ""}{missing} من {t.lines} سطر مبيع بلا سعر تكلفة
                  {r.products_without_cost ? `، و${r.products_without_cost} منتجاً في الكتالوج بلا سعر تكلفة` : ""}. أدخل أسعار التكلفة من صفحة المخزون ليصبح الربح دقيقاً.</p>
              </div>
            </div>
          )}

          <Section title="الأرباح والخسائر" icon={<FileChartColumn className="w-4 h-4 text-amber-500" />}>
            <Statement cols={cols} lines={[
              { label: "صافي المبيعات", pick: (c) => c.sales },
              { label: "تكلفة البضاعة المباعة", pick: (c) => c.cogs, minus: true },
              { label: "مجمل الربح", pick: (c) => c.gross_profit, strong: true, sign: true },
              { label: "التسويق", pick: (c) => c.marketing, minus: true },
              { label: "الرواتب (كلفة الشركة)", pick: (c) => c.payroll, minus: true },
              { label: "صافي الربح", pick: (c) => c.net_profit, strong: true, sign: true },
            ]} />
            <p className="text-[11px] text-stone-400">المبيعات بتاريخ الطلب بعد الخصومات، دون الملغى والمرتجع. التكلفة = الكمية × سعر تكلفة المنتج (البكج بتكلفة مكوناته). الرواتب بشهر المسيّر أياً كانت حالته.</p>
          </Section>

          <Section title="التدفق النقدي" icon={<ArrowLeftRight className="w-4 h-4 text-emerald-500" />}>
            <Statement cols={cols} lines={[
              { label: "المقبوضات", pick: (c) => c.cash_in },
              { label: "دفعات معكوسة", pick: (c) => c.cash_reversed, minus: true },
              { label: "مدفوع للتسويق", pick: (c) => c.cash_marketing, minus: true },
              { label: "رواتب مدفوعة (صافي)", pick: (c) => c.cash_payroll, minus: true },
              { label: "صافي التدفق النقدي", pick: (c) => c.cash_net, strong: true, sign: true },
            ]} />
            <p className="text-[11px] text-stone-400">المقبوضات بتاريخ استلام الدفعة، والرواتب فقط للمسيرات المدفوعة. لا يسجل النظام مشتريات البضاعة أو مصاريف أخرى.</p>
          </Section>
        </>
      )}
    </div>
  );
}
