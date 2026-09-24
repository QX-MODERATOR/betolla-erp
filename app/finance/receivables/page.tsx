"use client";

// الذمم المدينة: what every customer owes now, and every open invoice with how late it is.
// As of today, not a period — a debt is owed until it is paid, whenever it was made.
import { useState } from "react";
import { HandCoins, Users, FileWarning } from "lucide-react";
import { AGING_LABELS } from "@/lib/finance-overview";
import type { receivables } from "@/lib/finance-pages";
import { Kpi, Section, Row, Empty, PeriodBar, Loading, Filters, PageHeader, money, useFinance, useShowMore } from "@/components/finance/ui";

type Data = { receivables: ReturnType<typeof receivables>; today: string };

export default function ReceivablesPage() {
  const { data, loading, error, reload } = useFinance<Data>("/api/finance/records?view=receivables", "تعذر تحميل الذمم.");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("owing");
  const customers = useShowMore(40), invoices = useShowMore(40);
  const r = data?.receivables;
  const q = search.trim();
  const match = (...fields: string[]) => !q || fields.some((f) => f?.includes(q));

  const people = (r?.customers ?? []).filter((c) => (tab === "all" || (tab === "owing" ? c.outstanding > 0 : tab === "overdue" ? c.overdue > 0 : c.credit > 0))
    && match(c.customer, c.phone, c.rep, c.city));
  const open = (r?.open ?? []).filter((i) => match(i.customer, i.phone, i.rep, i.invoice, i.order_id));

  return (
    <div className="space-y-4">
      <PageHeader title="الذمم المدينة" sub="ما يدين به كل عميل الآن، وكل فاتورة مفتوحة وكم تأخرت" />
      <PeriodBar loading={loading} onReload={() => void reload()} error={error} />
      {!r ? <Loading loading={loading} error={error} what="الذمم" /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="إجمالي الذمم" value={money(r.outstanding)} hint={`${r.invoices} فاتورة مفتوحة`} tone="amber" />
            <Kpi label="منها متأخرة" value={money(r.overdue)} hint="تجاوزت تاريخ الاستحقاق" tone="rose" />
            <Kpi label="عملاء عليهم ذمم" value={`${r.customers_owing}`} hint={`من ${r.customers.length} عميل مفوتر`} />
            <Kpi label="أرصدة للعملاء" value={money(r.credits)} hint="مدفوعات على طلبات ملغاة/مرتجعة" tone={r.credits > 0 ? "amber" : "stone"} />
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <Section title="أعمار الذمم" icon={<HandCoins className="w-4 h-4 text-amber-500" />} link={{ href: "/finance/invoices", label: "تحصيل دفعة" }}>
              {AGING_LABELS.map((a) => <Row key={a.key} label={a.label} values={[{ v: money(r.aging[a.key] ?? 0), tone: a.key === "current" ? undefined : "text-rose-600" }]} />)}
              <Row label="الإجمالي" values={[{ v: money(r.outstanding) }]} strong />
            </Section>

            <div className="lg:col-span-2">
              <Section title="حسب العميل" icon={<Users className="w-4 h-4 text-violet-500" />}>
                <Filters search={search} onSearch={setSearch} placeholder="بحث بالاسم أو الهاتف أو المندوب أو المدينة..." active={tab} onChip={setTab}
                  chips={[{ id: "owing", label: "عليهم ذمم", count: r.customers_owing }, { id: "overdue", label: "متأخرون", count: r.customers.filter((c) => c.overdue > 0).length },
                    { id: "credit", label: "لهم رصيد", count: r.customers.filter((c) => c.credit > 0).length }, { id: "all", label: "الكل", count: r.customers.length }]} />
                {people.length ? people.slice(0, customers.limit).map((c) => (
                  <Row key={c.phone + c.customer} label={<>{c.customer} <span className="font-mono text-stone-400" dir="ltr">{c.phone}</span></>}
                    sub={`${c.city || "—"} — ${c.rep} — ${c.invoices} فاتورة${c.open ? `، ${c.open} مفتوحة` : ""}${c.days_late ? ` — أقدم تأخير ${c.days_late} يوماً` : ""}`}
                    values={[{ v: money(c.invoiced), hint: "مفوتر" }, { v: money(c.paid), hint: "مدفوع", tone: "text-emerald-700" },
                      { v: money(c.outstanding), hint: "متبقٍ", tone: c.overdue > 0 ? "text-rose-600" : c.outstanding > 0 ? "text-amber-700" : "text-stone-400" },
                      ...(c.credit > 0 ? [{ v: money(c.credit), hint: "رصيد له", tone: "text-amber-700" }] : [])]} />
                )) : <Empty text="لا عملاء مطابقون." />}
                {customers.more(people.length)}
              </Section>
            </div>
          </div>

          <Section title="الفواتير المفتوحة (الأكثر تأخراً أولاً)" icon={<FileWarning className="w-4 h-4 text-rose-500" />}>
            {open.length ? open.slice(0, invoices.limit).map((i) => (
              <Row key={i.invoice} label={<><span className="font-mono text-amber-700">{i.invoice}</span> — {i.customer}</>}
                sub={`طلب ${i.order_id} — ${i.rep} — ${i.status} — ${i.method} — صدرت ${i.issued} — تستحق ${i.due || "—"}`}
                values={[{ v: money(i.total), hint: "الإجمالي" }, { v: money(i.paid), hint: "مدفوع", tone: "text-emerald-700" },
                  { v: money(i.outstanding), hint: "متبقٍ", tone: "text-rose-600" },
                  { v: i.days_late ? `${i.days_late} يوم` : "غير متأخرة", tone: i.days_late > 30 ? "text-rose-600" : i.days_late ? "text-amber-700" : "text-stone-500" }]} />
            )) : <Empty text="لا فواتير مفتوحة." />}
            {invoices.more(open.length)}
          </Section>
          <p className="text-[11px] text-stone-400">العميل يُعرَّف برقم هاتفه. المبالغ كما هي اليوم ({data?.today}) عبر نفس حساب شاشة الفواتير.</p>
        </>
      )}
    </div>
  );
}
