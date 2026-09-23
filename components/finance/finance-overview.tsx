"use client";

// المركز المالي: every money figure the system records, for a chosen period, on one screen.
// Figures come from /api/finance/overview (lib/finance-overview.ts decides the arithmetic); this
// component only lays them out. Rows rather than wide tables, so it reads the same on a phone.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Download, RefreshCw, TrendingUp, Wallet, AlertTriangle, Truck, Users, Tag, Megaphone, Package, Receipt, Database } from "lucide-react";
import { dataSourceLabel } from "@/lib/order-meta";
import { formatCurrency } from "@/lib/utils";
import { loadBusiness } from "@/lib/business-client";
import { ammanToday, shiftDate, periodStart } from "@/lib/dates";
import { STATUS_LABELS, METHOD_LABELS, type FinanceOverview } from "@/lib/finance-overview";

type Preset = "today" | "week" | "month" | "last_month" | "year" | "custom";
const PRESETS: { id: Preset; label: string }[] = [
  { id: "today", label: "اليوم" }, { id: "week", label: "هذا الأسبوع" }, { id: "month", label: "هذا الشهر" },
  { id: "last_month", label: "الشهر الماضي" }, { id: "year", label: "هذه السنة" }, { id: "custom", label: "فترة مخصصة" },
];
function presetRange(p: Preset, today: string): [string, string] {
  if (p === "today") return [today, today];
  if (p === "week") return [periodStart("week", today)!, today];
  if (p === "year") return [periodStart("year", today)!, today];
  if (p === "last_month") {
    const end = shiftDate(today.slice(0, 8) + "01", -1);
    return [end.slice(0, 8) + "01", end];
  }
  return [periodStart("month", today)!, today];
}
const AGING: { key: string; label: string }[] = [
  { key: "current", label: "غير مستحقة بعد" }, { key: "d1_7", label: "متأخرة 1–7 أيام" }, { key: "d8_30", label: "8–30 يوماً" },
  { key: "d31_60", label: "31–60 يوماً" }, { key: "d60_plus", label: "أكثر من 60 يوماً" },
];
const money = (n: number) => formatCurrency(n);
const signed = (n: number) => (n > 0 ? "+" : "") + formatCurrency(n);

function Kpi({ label, value, hint, tone = "stone" }: { label: string; value: string; hint?: string; tone?: "stone" | "emerald" | "amber" | "rose" }) {
  const color = { stone: "text-stone-900", emerald: "text-emerald-600", amber: "text-amber-600", rose: "text-rose-600" }[tone];
  return (
    <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs min-w-0">
      <p className="text-xs font-bold text-stone-500">{label}</p>
      <p className={`text-xl sm:text-2xl font-black mt-1 font-mono break-words ${color}`}>{value}</p>
      {hint && <p className="text-[11px] text-stone-400 mt-0.5">{hint}</p>}
    </div>
  );
}
function Section({ title, icon, children, link, action, unavailable }: { title: string; icon: ReactNode; children: ReactNode; link?: { href: string; label: string }; action?: { label: string; onClick?: () => void }; unavailable?: boolean }) {
  return (
    <section className="bg-white rounded-2xl border border-stone-200 shadow-2xs p-4 space-y-3 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-stone-900 flex items-center gap-2 text-sm">{icon}{title}</h3>
        {link && <Link href={link.href} className="text-[11px] font-bold text-amber-700 hover:underline shrink-0">{link.label} ←</Link>}
        {action?.onClick && <button type="button" onClick={action.onClick} className="text-[11px] font-bold text-amber-700 hover:underline shrink-0">{action.label} ←</button>}
      </div>
      {unavailable ? <p className="text-xs text-stone-400">هذا القسم غير متاح حالياً (تعذر تحميل بياناته).</p> : children}
    </section>
  );
}
// One labelled line with one or more figures; wraps instead of scrolling on a phone.
function Row({ label, sub, values, strong }: { label: ReactNode; sub?: ReactNode; values: { v: string; tone?: string; hint?: string }[]; strong?: boolean }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 border-b border-stone-100 last:border-0 text-xs ${strong ? "font-bold" : ""}`}>
      <div className="min-w-0">
        <p className="text-stone-800 break-words">{label}</p>
        {sub && <p className="text-[10px] text-stone-400">{sub}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono">
        {values.map((x, i) => (
          <span key={i} className={x.tone ?? "text-stone-900"}>{x.hint && <span className="text-[10px] text-stone-400 font-sans ml-1">{x.hint}</span>}{x.v}</span>
        ))}
      </div>
    </div>
  );
}
const Empty = ({ text = "لا شيء في هذه الفترة." }: { text?: string }) => <p className="text-xs text-stone-400 py-1">{text}</p>;

export default function FinanceOverviewPanel({ onShowInvoices }: { onShowInvoices?: () => void }) {
  const today = ammanToday();
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState(() => presetRange("month", today)[0]);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<FinanceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (f: string, t: string) => {
    setLoading(true);
    try {
      const res = await loadBusiness<{ overview: FinanceOverview }>(`/api/finance/overview?from=${f}&to=${t}`);
      setData(res.overview); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تحميل المركز المالي."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void Promise.resolve().then(() => load(from, to)); }, [load, from, to]);

  const choose = (p: Preset) => {
    setPreset(p);
    if (p !== "custom") { const [f, t] = presetRange(p, today); setFrom(f); setTo(t); }
  };
  const d = data;

  return (
    <div className="space-y-4">
      {/* Period */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-2xs p-3 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" onClick={() => choose(p.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${preset === p.id ? "bg-stone-900 text-white border-stone-900" : "bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100"}`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1">من
            <input type="date" value={from} max={to} onChange={(e) => { setPreset("custom"); if (e.target.value) setFrom(e.target.value); }}
              className="px-2 py-1 border border-stone-200 rounded-lg bg-stone-50" />
          </label>
          <label className="flex items-center gap-1">إلى
            <input type="date" value={to} min={from} onChange={(e) => { setPreset("custom"); if (e.target.value) setTo(e.target.value); }}
              className="px-2 py-1 border border-stone-200 rounded-lg bg-stone-50" />
          </label>
          <button type="button" onClick={() => void load(from, to)} disabled={loading}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-stone-200 bg-white font-bold text-stone-700 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />{loading ? "جاري التحميل..." : "تحديث"}
          </button>
          <a href={`/api/finance/overview?from=${from}&to=${to}&format=csv`}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold">
            <Download className="w-3.5 h-3.5" />تصدير الطلبات (Excel)
          </a>
        </div>
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700">{error}</p>}
      </div>

      {!d ? (
        <p role="status" className="text-sm text-stone-500 text-center py-12">{loading ? "جاري تحميل المركز المالي..." : error}</p>
      ) : (
        <>
          {/* Headline numbers */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="صافي المبيعات" value={money(d.sales.net)} hint={`${d.sales.live_orders} طلب، بعد الخصومات`} />
            <Kpi label="المقبوضات" value={money(d.collections.net_received)} hint={`${d.collections.payments} دفعة في الفترة`} tone="emerald" />
            <Kpi label="الذمم المستحقة الآن" value={money(d.receivables.outstanding)} hint={`منها متأخرة ${money(d.receivables.overdue)}`} tone="amber" />
            <Kpi label="نقد مع السائقين الآن" value={money(d.drivers.in_transit_total)} hint="طلبات خرجت ولم تُسلَّم" tone="amber" />
            <Kpi label="الخصومات" value={money(d.sales.discounts + d.promo.saved)} hint={`يدوية ${money(d.sales.discounts)} + أكواد ${money(d.promo.saved)}`} tone="rose" />
            <Kpi label="الملغى والمرتجع" value={money(d.sales.cancelled.value + d.sales.returned.value)} hint={`${d.sales.cancelled.count} ملغى، ${d.sales.returned.count} مرتجع`} tone="rose" />
            <Kpi label="المصاريف المسجلة" value={money(d.expenses.marketing + d.expenses.payroll_paid)} hint="تسويق + رواتب مدفوعة" />
            <Kpi label="صافي التدفق النقدي" value={signed(d.cashflow.net)} hint="المقبوضات − المصاريف" tone={d.cashflow.net >= 0 ? "emerald" : "rose"} />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Section title="المبيعات" icon={<TrendingUp className="w-4 h-4 text-amber-500" />} link={{ href: "/orders", label: "الطلبات" }}>
              <Row label="قيمة الأصناف قبل الخصم" values={[{ v: money(d.sales.gross) }]} />
              <Row label="خصومات على الإجمالي (مبالغ معدّلة)" values={[{ v: "−" + money(d.sales.discounts), tone: "text-rose-600" }]} />
              <Row label="صافي المبيعات" sub={`متوسط الطلب ${money(d.sales.average)}`} values={[{ v: money(d.sales.net) }]} strong />
              <Row label="مُسلَّم" values={[{ v: money(d.sales.delivered), tone: "text-emerald-700" }]} />
              <Row label="قيد التنفيذ (لم يُسلَّم بعد)" values={[{ v: money(d.sales.open), tone: "text-amber-700" }]} />
              <p className="text-[11px] font-bold text-stone-500 pt-1">حسب حالة الطلب</p>
              {d.sales.by_status.length ? d.sales.by_status.map((s) => (
                <Row key={s.key} label={STATUS_LABELS[s.key] ?? s.key} values={[{ v: `${s.count}`, hint: "طلب" }, { v: money(s.value) }]} />
              )) : <Empty />}
            </Section>

            <Section title="المقبوضات" icon={<Wallet className="w-4 h-4 text-emerald-500" />} action={{ label: "سندات القبض", onClick: onShowInvoices }}>
              {d.collections.by_method.length ? d.collections.by_method.map((m) => (
                <Row key={m.key} label={METHOD_LABELS[m.key] ?? m.key} values={[{ v: `${m.count}`, hint: "دفعة" }, { v: money(m.value) }]} />
              )) : <Empty text="لا مقبوضات في هذه الفترة." />}
              {d.collections.reversed > 0 && <Row label="دفعات معكوسة" values={[{ v: "−" + money(d.collections.reversed), tone: "text-rose-600" }]} />}
              <Row label="صافي المقبوض" values={[{ v: money(d.collections.net_received), tone: "text-emerald-700" }]} strong />
              {d.collections.by_day.length > 1 && (
                <details className="text-xs">
                  <summary className="cursor-pointer font-bold text-stone-600 py-1">المقبوض يوماً بيوم</summary>
                  {d.collections.by_day.map((x) => <Row key={x.key} label={x.key} values={[{ v: money(x.value) }]} />)}
                </details>
              )}
            </Section>

            <Section title="الذمم المستحقة (حتى اليوم)" icon={<AlertTriangle className="w-4 h-4 text-amber-500" />} action={{ label: "الفواتير", onClick: onShowInvoices }}>
              {AGING.map((a) => <Row key={a.key} label={a.label} values={[{ v: money(d.receivables.aging[a.key] ?? 0), tone: a.key === "current" ? undefined : "text-rose-600" }]} />)}
              <Row label="الإجمالي" sub={`${d.receivables.invoices} فاتورة`} values={[{ v: money(d.receivables.outstanding) }]} strong />
              {d.receivables.credits > 0 && <Row label="أرصدة للعملاء (مدفوعات على طلبات ملغاة/مرتجعة)" values={[{ v: money(d.receivables.credits), tone: "text-amber-700" }]} />}
              <p className="text-[11px] font-bold text-stone-500 pt-1">أكبر الذمم</p>
              {d.receivables.debtors.length ? d.receivables.debtors.map((x) => <Row key={x.key} label={x.key} sub={`${x.count} فاتورة`} values={[{ v: money(x.value) }]} />) : <Empty text="لا ذمم مستحقة." />}
            </Section>

            <Section title="السائقون والنقد" icon={<Truck className="w-4 h-4 text-sky-500" />} link={{ href: "/drivers/reconcile", label: "تسوية العهدة" }} unavailable={!d.available.closures}>
              <p className="text-[11px] font-bold text-stone-500">مع السائقين الآن (خرجت ولم تُسلَّم)</p>
              {d.drivers.in_transit.length ? d.drivers.in_transit.map((x) => <Row key={x.key} label={x.key} values={[{ v: `${x.count}`, hint: "طلب" }, { v: money(x.value) }]} />) : <Empty text="لا طلبات مع السائقين الآن." />}
              <p className="text-[11px] font-bold text-stone-500 pt-1">ورديات الفترة: المتوقع مقابل المعدود</p>
              {d.drivers.shifts.length ? d.drivers.shifts.map((x) => (
                <Row key={x.driver} label={x.driver} sub={`${x.shifts} وردية (${x.closed} مغلقة) — ${x.delivered} تسليم، ${x.returned} مرتجع`}
                  values={[{ v: money(x.expected), hint: "متوقع" }, { v: money(x.counted), hint: "معدود" },
                    { v: signed(x.difference), tone: x.difference < 0 ? "text-rose-600" : x.difference > 0 ? "text-amber-700" : "text-emerald-700" }]} />
              )) : <Empty text="لا ورديات مسجلة في هذه الفترة." />}
              {d.drivers.short_shifts.length > 0 && (
                <>
                  <p className="text-[11px] font-bold text-rose-600 pt-1">ورديات فيها فرق نقد</p>
                  {d.drivers.short_shifts.map((x) => <Row key={x.driver + x.date} label={`${x.driver} — ${x.date}`}
                    values={[{ v: money(x.expected), hint: "متوقع" }, { v: money(x.counted), hint: "معدود" }, { v: signed(x.difference), tone: x.difference < 0 ? "text-rose-600" : "text-amber-700" }]} />)}
                </>
              )}
              {d.drivers.open_shifts.length > 0 && <Row label="ورديات لم تُغلق بعد" sub={d.drivers.open_shifts.map((x) => `${x.driver} ${x.date}`).join("، ")} values={[{ v: `${d.drivers.open_shifts.length}`, tone: "text-amber-700" }]} />}
            </Section>

            <Section title="حسب المندوب" icon={<Users className="w-4 h-4 text-violet-500" />}>
              {d.reps.length ? d.reps.map((r) => (
                <Row key={r.rep} label={r.rep} sub={`${r.orders} طلب${r.cancelled ? ` — ${r.cancelled} ملغى/مرتجع` : ""}${r.discounts ? ` — خصم ${money(r.discounts)}` : ""}`}
                  values={[{ v: money(r.net), hint: "صافي" }, { v: money(r.collected), hint: "محصّل", tone: "text-emerald-700" }, { v: money(r.outstanding), hint: "متبقٍ", tone: "text-amber-700" }]} />
              )) : <Empty />}
              <p className="text-[11px] font-bold text-stone-500 pt-1">طريقة الدفع المتفق عليها في الطلبات</p>
              {d.order_methods.length ? d.order_methods.map((m) => <Row key={m.key} label={METHOD_LABELS[m.key] ?? m.key} values={[{ v: `${m.count}`, hint: "طلب" }, { v: money(m.value) }]} />) : <Empty />}
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

            <Section title="المصاريف" icon={<Megaphone className="w-4 h-4 text-orange-500" />} link={{ href: "/hr/payroll", label: "الرواتب" }}>
              <p className="text-[11px] font-bold text-stone-500">التسويق (الإعلانات المسجلة)</p>
              {!d.available.spend ? <Empty text="غير متاح." /> : d.expenses.marketing_by_campaign.length
                ? d.expenses.marketing_by_campaign.map((c) => <Row key={c.key} label={c.key} values={[{ v: `${c.count}`, hint: "قيد" }, { v: money(c.value) }]} />)
                : <Empty text="لا مصاريف تسويق مسجلة في هذه الفترة." />}
              <Row label="إجمالي التسويق" values={[{ v: money(d.expenses.marketing) }]} strong />
              <p className="text-[11px] font-bold text-stone-500 pt-1">الرواتب (أشهر الفترة)</p>
              {!d.available.payroll ? <Empty text="غير متاح." /> : d.expenses.payroll.length ? d.expenses.payroll.map((r) => (
                <Row key={r.month} label={r.month} sub={`${r.count} موظف — ${r.status === "paid" ? "مدفوعة" : r.status === "approved" ? "معتمدة" : "مسودة"}`}
                  values={[{ v: money(r.net), hint: "صافي" }, { v: money(r.employer_cost), hint: "كلفة الشركة" }]} />
              )) : <Empty text="لا مسيرات رواتب لأشهر هذه الفترة." />}
              {d.available.advances && <Row label="سلف موظفين قائمة" sub={`${d.expenses.advances_active} سلفة`} values={[{ v: money(d.expenses.advances_amount) }]} />}
            </Section>

            <Section title="المخزون (حتى اليوم)" icon={<Package className="w-4 h-4 text-teal-500" />} link={{ href: "/inventory", label: "المخزون" }} unavailable={!d.available.catalog}>
              <Row label="عدد القطع" values={[{ v: `${d.inventory.units}` }]} />
              <Row label="القيمة بسعر البيع" values={[{ v: money(d.inventory.retail_value) }]} />
              <Row label="القيمة بسعر التكلفة" sub={d.inventory.missing_cost ? `${d.inventory.missing_cost} صنف بلا سعر تكلفة — القيمة ناقصة` : undefined} values={[{ v: money(d.inventory.cost_value) }]} />
              {d.inventory.negative.length > 0 && (
                <>
                  <p className="text-[11px] font-bold text-rose-600 pt-1">أصناف بيعت أكثر من المتوفر (رصيد سالب)</p>
                  {d.inventory.negative.map((p) => <Row key={p.name} label={p.name} values={[{ v: `${p.stock}`, tone: "text-rose-600" }, { v: money(p.value), hint: "بسعر البيع" }]} />)}
                </>
              )}
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
