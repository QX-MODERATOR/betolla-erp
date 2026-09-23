// المركز المالي: every number finance needs for a period, from what the system already records.
//
// Pure: /api/finance/overview gathers the inputs (orders, shift closures, marketing spend, payroll
// runs, advances, promo redemptions, the catalogue) and this turns them into figures, so the
// arithmetic is tested without a server. Money is summed in fils (×1000) to avoid float drift.
//
// Dating rules — each figure is dated by the event it describes:
//   sales and discounts    by order_date (when the order was taken);
//   money received         by the payment's received_at (Amman day), whatever the order's date;
//   driver cash            by shift_date; marketing by spend_date; payroll by its month.
// Receivables, cash still out with drivers and stock are "as of now", not per period.
import {ammanDate, ammanToday, shiftDate} from '@/lib/dates';
import {toInvoice, type BusinessOrder, type BusinessProduct} from '@/lib/business';

export interface ShiftClosureRow {
  driver_name: string; shift_date: string; is_closed: boolean; cash_collected: number | null;
  counted_cash: number | null; delivered_count: number | null; returned_count: number | null; closed_by?: string | null;
}
export interface SpendRow { spend_date: string; amount: number; voided_at: string | null; campaign: string; channel?: string }
export interface PayrollRunRow {
  month: string; status: string; paid_at: string | null;
  totals: { count: number; gross: number; net: number; employer_cost: number; ssc_employer: number };
}
export interface AdvanceRow { amount: number; monthly_amount: number; status: string; start_month: string }
export interface RedemptionRow { code: string; saved: number | null; redeemed_at: string }

export interface FinanceInputs {
  orders: BusinessOrder[];
  closures: ShiftClosureRow[] | null;
  spend: SpendRow[] | null;
  payroll: PayrollRunRow[] | null;
  advances: AdvanceRow[] | null;
  redemptions: RedemptionRow[] | null;
  catalog: BusinessProduct[] | null;
}

const fils = (n: unknown) => Math.round((Number(n) || 0) * 1000);
const jd = (f: number) => f / 1000;
const inRange = (d: string | null | undefined, from: string, to: string) => !!d && d >= from && d <= to;
const OPEN = ['draft', 'confirmed', 'processing', 'shipped'];
export const STATUS_LABELS: Record<string, string> = {
  draft: 'حجز / مسودة', confirmed: 'مؤكد', processing: 'قيد التجهيز', shipped: 'مع السائق',
  delivered: 'مُسلَّم', returned: 'مرتجع', cancelled: 'ملغى',
};
export const METHOD_LABELS: Record<string, string> = {
  cash: 'نقداً', cash_on_delivery: 'دفع عند الاستلام', cliq: 'كليك', zain_cash: 'زين كاش',
  bank_transfer: 'تحويل بنكي', installment: 'أقساط / حجز',
};

// Group, sum in fils, and return rows largest first.
function tally<K extends string>(rows: { key: K; value: number; count?: number }[]) {
  const map = new Map<K, { key: K; count: number; value: number }>();
  for (const r of rows) {
    const cur = map.get(r.key) ?? { key: r.key, count: 0, value: 0 };
    cur.count += r.count ?? 1; cur.value += r.value; map.set(r.key, cur);
  }
  return [...map.values()].map((r) => ({ ...r, value: jd(r.value) })).sort((a, b) => b.value - a.value);
}

export function financeOverview(input: FinanceInputs, from: string, to: string, today = ammanToday()) {
  const orders = input.orders;
  const period = orders.filter((o) => inRange(o.order_date, from, to));
  const live = period.filter((o) => o.status !== 'cancelled' && o.status !== 'returned');
  const invoiceOf = (o: BusinessOrder) => toInvoice({ ...o, invoice_number: o.invoice_number ?? o.id });

  // --- Sales: what was sold in the period, before and after discounts.
  const gross = live.reduce((n, o) => n + fils(o.invoice_subtotal || o.total_amount), 0);
  const discounts = live.reduce((n, o) => n + fils(o.invoice_discount), 0);
  const net = live.reduce((n, o) => n + fils(o.total_amount), 0);
  const byStatus = tally(period.map((o) => ({ key: o.status, value: fils(o.total_amount) })));
  const cancelled = byStatus.find((s) => s.key === 'cancelled');
  const returned = byStatus.find((s) => s.key === 'returned');
  const delivered = byStatus.find((s) => s.key === 'delivered');

  // --- Money in: every payment row received in the period, reversals netted and shown apart.
  const payments = orders.flatMap((o) => (o.payments || []).map((p) => ({ ...p, order: o })))
    .filter((p) => inRange(ammanDate(p.received_at), from, to));
  const received = payments.filter((p) => !p.is_reversal);
  const reversals = payments.filter((p) => p.is_reversal);
  const receivedByMethod = tally(received.map((p) => ({ key: p.payment_method || 'unknown', value: fils(p.amount) })));
  const receivedTotal = received.reduce((n, p) => n + fils(p.amount), 0);
  const reversedTotal = reversals.reduce((n, p) => n - fils(p.amount), 0); // stored negative
  const receivedByDay = tally(payments.map((p) => ({ key: ammanDate(p.received_at), value: fils(p.amount) })))
    .sort((a, b) => a.key.localeCompare(b.key));

  // --- Owed to us now (all periods): the same reading /finance uses, through toInvoice.
  // Only orders with an invoice, exactly as /api/finance reads them, so both pages agree.
  const invoices = orders.filter((o) => o.invoice_number).map(invoiceOf);
  const owing = invoices.filter((i) => i.outstanding_amount > 0);
  const age = (due: string) => {
    if (!due || due >= today) return 'current';
    const days = Math.round((Date.parse(today) - Date.parse(due)) / 86400000);
    return days <= 7 ? 'd1_7' : days <= 30 ? 'd8_30' : days <= 60 ? 'd31_60' : 'd60_plus';
  };
  const aging = { current: 0, d1_7: 0, d8_30: 0, d31_60: 0, d60_plus: 0 } as Record<string, number>;
  for (const i of owing) aging[age(i.due_date)] += fils(i.outstanding_amount);
  const debtors = tally(owing.map((i) => ({ key: `${i.customer_name} — ${i.customer_phone}` as string, value: fils(i.outstanding_amount) })))
    .slice(0, 15);
  const credits = invoices.reduce((n, i) => n + fils(i.credit_amount), 0);

  // --- Cash still outside: goods with a driver now, and what those orders will bring in.
  const withDrivers = orders.filter((o) => o.status === 'shipped');
  const inTransit = tally(withDrivers.map((o) => ({ key: (o.driver || 'بدون سائق') as string,
    value: fils(Math.max(0, (o.invoice_total || o.total_amount) - o.paid_amount)) })));

  // --- Drivers' shifts in the period: what the system expected vs what was counted.
  const shifts = (input.closures ?? []).filter((c) => inRange(c.shift_date, from, to));
  const driverMap = new Map<string, { driver: string; shifts: number; closed: number; expected: number; counted: number; delivered: number; returned: number }>();
  for (const c of shifts) {
    const d = driverMap.get(c.driver_name) ?? { driver: c.driver_name, shifts: 0, closed: 0, expected: 0, counted: 0, delivered: 0, returned: 0 };
    d.shifts++; if (c.is_closed) d.closed++;
    d.expected += fils(c.cash_collected);
    d.counted += fils(c.counted_cash ?? c.cash_collected);
    d.delivered += Number(c.delivered_count) || 0; d.returned += Number(c.returned_count) || 0;
    driverMap.set(c.driver_name, d);
  }
  const drivers = [...driverMap.values()].map((d) => ({ ...d, expected: jd(d.expected), counted: jd(d.counted),
    difference: jd(d.counted - d.expected) })).sort((a, b) => b.expected - a.expected);
  const shortShifts = shifts.filter((c) => c.counted_cash !== null && c.counted_cash !== undefined
    && fils(c.counted_cash) !== fils(c.cash_collected))
    .map((c) => ({ driver: c.driver_name, date: c.shift_date, expected: Number(c.cash_collected) || 0,
      counted: Number(c.counted_cash) || 0, difference: jd(fils(c.counted_cash) - fils(c.cash_collected)) }));
  const openShifts = shifts.filter((c) => !c.is_closed).map((c) => ({ driver: c.driver_name, date: c.shift_date }));

  // --- Per rep and per payment method, for the period's orders.
  const reps = [...new Set(period.map((o) => o.rep_name || '—'))].map((rep) => {
    const mine = period.filter((o) => (o.rep_name || '—') === rep);
    const mineLive = mine.filter((o) => o.status !== 'cancelled' && o.status !== 'returned');
    return { rep, orders: mine.length, net: jd(mineLive.reduce((n, o) => n + fils(o.total_amount), 0)),
      discounts: jd(mineLive.reduce((n, o) => n + fils(o.invoice_discount), 0)),
      collected: jd(mine.reduce((n, o) => n + fils(o.paid_amount), 0)),
      outstanding: jd(mine.filter((o) => o.invoice_number).reduce((n, o) => n + fils(invoiceOf(o).outstanding_amount), 0)),
      cancelled: mine.filter((o) => o.status === 'cancelled' || o.status === 'returned').length };
  }).sort((a, b) => b.net - a.net);
  const orderMethods = tally(live.map((o) => ({ key: o.payment_method || 'unknown', value: fils(o.total_amount) })));

  // --- Promo codes: what they gave away in the period.
  const redemptions = (input.redemptions ?? []).filter((r) => inRange(ammanDate(r.redeemed_at), from, to));
  const promo = tally(redemptions.map((r) => ({ key: r.code, value: fils(r.saved) })));

  // --- Money out: marketing, payroll (months overlapping the period), advances still running.
  const spend = (input.spend ?? []).filter((s) => !s.voided_at && inRange(s.spend_date, from, to));
  const marketing = tally(spend.map((s) => ({ key: s.campaign, value: fils(s.amount) })));
  const marketingTotal = spend.reduce((n, s) => n + fils(s.amount), 0);
  const months = new Set<string>();
  for (let d = from.slice(0, 7) + '-01'; d <= to; d = shiftDate(d.slice(0, 8) + '28', 4).slice(0, 8) + '01') months.add(d.slice(0, 7));
  const payroll = (input.payroll ?? []).filter((r) => months.has(r.month))
    .map((r) => ({ month: r.month, status: r.status, count: r.totals.count, gross: Number(r.totals.gross) || 0,
      net: Number(r.totals.net) || 0, employer_cost: Number(r.totals.employer_cost) || 0, paid_at: r.paid_at }))
    .sort((a, b) => a.month.localeCompare(b.month));
  const payrollCost = payroll.reduce((n, r) => n + fils(r.employer_cost), 0);
  const payrollPaid = payroll.filter((r) => r.status === 'paid').reduce((n, r) => n + fils(r.net), 0);
  const activeAdvances = (input.advances ?? []).filter((a) => a.status === 'active');

  // --- Stock as it stands (packages are counted through their bottles, so they are left out).
  const stocked = (input.catalog ?? []).filter((p) => !p.is_bundle);
  const inventory = {
    units: stocked.reduce((n, p) => n + Math.max(0, p.stock), 0),
    cost_value: jd(stocked.reduce((n, p) => n + Math.max(0, p.stock) * fils(p.cost_price), 0)),
    retail_value: jd(stocked.reduce((n, p) => n + Math.max(0, p.stock) * fils(p.sale_price ?? p.price), 0)),
    missing_cost: stocked.filter((p) => p.stock > 0 && !(Number(p.cost_price) > 0)).length,
    negative: stocked.filter((p) => p.stock < 0).map((p) => ({ name: p.name_ar, stock: p.stock,
      value: jd(-p.stock * fils(p.sale_price ?? p.price)) })),
  };

  return {
    range: { from, to, today },
    available: { closures: input.closures !== null, spend: input.spend !== null, payroll: input.payroll !== null,
      advances: input.advances !== null, redemptions: input.redemptions !== null, catalog: input.catalog !== null },
    sales: { orders: period.length, live_orders: live.length, gross: jd(gross), discounts: jd(discounts), net: jd(net),
      average: live.length ? jd(Math.round(net / live.length)) : 0,
      delivered: delivered?.value ?? 0, open: jd(period.filter((o) => OPEN.includes(o.status)).reduce((n, o) => n + fils(o.total_amount), 0)),
      cancelled: { count: cancelled?.count ?? 0, value: cancelled?.value ?? 0 },
      returned: { count: returned?.count ?? 0, value: returned?.value ?? 0 }, by_status: byStatus },
    collections: { received: jd(receivedTotal), reversed: jd(reversedTotal), net_received: jd(receivedTotal - reversedTotal),
      payments: received.length, by_method: receivedByMethod, by_day: receivedByDay },
    receivables: { outstanding: jd(owing.reduce((n, i) => n + fils(i.outstanding_amount), 0)), invoices: owing.length,
      overdue: jd(owing.filter((i) => age(i.due_date) !== 'current').reduce((n, i) => n + fils(i.outstanding_amount), 0)),
      aging: Object.fromEntries(Object.entries(aging).map(([k, v]) => [k, jd(v)])), debtors, credits: jd(credits) },
    drivers: { in_transit: inTransit, in_transit_total: inTransit.reduce((n, r) => n + r.value, 0),
      shifts: drivers, short_shifts: shortShifts, open_shifts: openShifts,
      expected: jd(drivers.reduce((n, d) => n + fils(d.expected), 0)), counted: jd(drivers.reduce((n, d) => n + fils(d.counted), 0)) },
    reps, order_methods: orderMethods,
    promo: { saved: jd(redemptions.reduce((n, r) => n + fils(r.saved), 0)), uses: redemptions.length, by_code: promo },
    expenses: { marketing: jd(marketingTotal), marketing_by_campaign: marketing, payroll, payroll_cost: jd(payrollCost),
      payroll_paid: jd(payrollPaid), advances_active: activeAdvances.length,
      advances_amount: jd(activeAdvances.reduce((n, a) => n + fils(a.amount), 0)) },
    cashflow: { in: jd(receivedTotal - reversedTotal), marketing: jd(marketingTotal), payroll: jd(payrollPaid),
      net: jd(receivedTotal - reversedTotal - marketingTotal - payrollPaid) },
    inventory,
  };
}
export type FinanceOverview = ReturnType<typeof financeOverview>;

// One row per order in the period, every money column, for Excel.
export function financeOrdersCsv(orders: BusinessOrder[], from: string, to: string): string {
  const head = ['رقم الطلب', 'التاريخ', 'المندوب', 'العميل', 'الهاتف', 'المدينة', 'الحالة', 'طريقة الدفع', 'السائق',
    'قبل الخصم', 'الخصم', 'الإجمالي', 'المدفوع', 'المتبقي', 'رقم الفاتورة', 'تاريخ الاستحقاق'];
  const cell = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = orders.filter((o) => inRange(o.order_date, from, to))
    .sort((a, b) => a.order_date.localeCompare(b.order_date) || a.id.localeCompare(b.id))
    .map((o) => { const i = toInvoice({ ...o, invoice_number: o.invoice_number ?? o.id });
      return [o.id, o.order_date, o.rep_name, o.customer_name, o.customer_phone, o.city, STATUS_LABELS[o.status] ?? o.status,
        METHOD_LABELS[o.payment_method] ?? o.payment_method, o.driver ?? '', i.subtotal.toFixed(3), (o.invoice_discount || 0).toFixed(3),
        o.total_amount.toFixed(3), o.paid_amount.toFixed(3), i.outstanding_amount.toFixed(3), o.invoice_number ?? '', o.due_date ?? '']; });
  return '﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
