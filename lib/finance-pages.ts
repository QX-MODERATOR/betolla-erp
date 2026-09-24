// The finance manager's pages beyond the dashboard: receivables, payments, expenses, budgets,
// reports and the audit trail. Each is a pure function of rows the system already stores —
// /api/finance/records gathers them, this turns them into figures — so the arithmetic is tested
// without a server. Money is summed in fils (×1000), as in lib/finance-overview.ts.
//
// Nothing here invents a ledger: there is no chart of accounts, supplier or bank table, so every
// figure is traceable to an order, a payment, a marketing spend entry or a payroll run.
import {ammanDate, shiftDate} from '@/lib/dates';
import {toInvoice, type BusinessOrder, type BusinessProduct} from '@/lib/business';
import {agingBucket, daysLate, METHOD_LABELS, STATUS_LABELS} from '@/lib/finance-overview';
import {reasonOf} from '@/lib/daily-report';

const fils = (n: unknown) => Math.round((Number(n) || 0) * 1000);
const jd = (f: number) => f / 1000;
const inRange = (d: string | null | undefined, from: string, to: string) => !!d && d >= from && d <= to;
const isLive = (o: BusinessOrder) => o.status !== 'cancelled' && o.status !== 'returned';
const nameOf = (names: Record<string, string>, id: string | null | undefined) => (id ? names[id] ?? id : '—');

// Every calendar month (YYYY-MM) that overlaps the period, in order.
export function monthsOf(from: string, to: string) {
  const out: string[] = [];
  for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = shiftDate(m + '-28', 4).slice(0, 7)) out.push(m);
  return out;
}

// --- Receivables ---------------------------------------------------------------------------------
// What each customer owes now, and every open invoice with how late it is. Read through toInvoice,
// like the invoices desk, so the two can never disagree.
export function receivables(orders: BusinessOrder[], today: string) {
  const invoices = orders.filter((o) => o.invoice_number).map((o) => ({ order: o, inv: toInvoice(o) }));
  const owing = invoices.filter(({ inv }) => inv.outstanding_amount > 0);
  const aging: Record<string, number> = { current: 0, d1_7: 0, d8_30: 0, d31_60: 0, d60_plus: 0 };
  for (const { inv } of owing) aging[agingBucket(inv.due_date, today)] += fils(inv.outstanding_amount);

  // A customer is a phone number; the name is whatever her latest order called her.
  const byCustomer = new Map<string, { customer: string; phone: string; city: string; rep: string; invoices: number; open: number;
    invoiced: number; paid: number; outstanding: number; overdue: number; credit: number; oldest_due: string; days_late: number; last_order: string }>();
  for (const { order: o, inv } of invoices) {
    const key = o.customer_phone || o.customer_name;
    const c = byCustomer.get(key) ?? { customer: o.customer_name, phone: o.customer_phone, city: o.city, rep: o.rep_name, invoices: 0, open: 0,
      invoiced: 0, paid: 0, outstanding: 0, overdue: 0, credit: 0, oldest_due: '', days_late: 0, last_order: '' };
    if (o.order_date >= c.last_order) { c.last_order = o.order_date; c.customer = o.customer_name; c.city = o.city; c.rep = o.rep_name; }
    c.invoices++;
    if (inv.collectible) c.invoiced += fils(inv.total_amount);
    c.paid += fils(inv.paid_amount);
    c.credit += fils(inv.credit_amount);
    if (inv.outstanding_amount > 0) {
      c.open++; c.outstanding += fils(inv.outstanding_amount);
      const late = daysLate(inv.due_date, today);
      if (late > 0) c.overdue += fils(inv.outstanding_amount);
      if (!c.oldest_due || inv.due_date < c.oldest_due) c.oldest_due = inv.due_date;
      c.days_late = Math.max(c.days_late, late);
    }
    byCustomer.set(key, c);
  }
  const customers = [...byCustomer.values()]
    .map((c) => ({ ...c, invoiced: jd(c.invoiced), paid: jd(c.paid), outstanding: jd(c.outstanding), overdue: jd(c.overdue), credit: jd(c.credit) }))
    .sort((a, b) => b.outstanding - a.outstanding || b.invoiced - a.invoiced);

  const open = owing.map(({ order: o, inv }) => ({ invoice: inv.id, order_id: o.id, customer: o.customer_name, phone: o.customer_phone,
    rep: o.rep_name, status: STATUS_LABELS[o.status] ?? o.status, method: METHOD_LABELS[o.payment_method] ?? o.payment_method,
    issued: inv.issued_date, due: inv.due_date, total: inv.total_amount, paid: inv.paid_amount, outstanding: inv.outstanding_amount,
    days_late: daysLate(inv.due_date, today) }))
    .sort((a, b) => b.days_late - a.days_late || b.outstanding - a.outstanding);

  const total = owing.reduce((n, { inv }) => n + fils(inv.outstanding_amount), 0);
  const overdue = aging.d1_7 + aging.d8_30 + aging.d31_60 + aging.d60_plus;
  return {
    outstanding: jd(total), overdue: jd(overdue), invoices: owing.length,
    customers_owing: customers.filter((c) => c.outstanding > 0).length,
    credits: jd(customers.reduce((n, c) => n + fils(c.credit), 0)),
    aging: Object.fromEntries(Object.entries(aging).map(([k, v]) => [k, jd(v)])),
    customers, open,
  };
}

// --- Payments received ---------------------------------------------------------------------------
// Who recorded a payment comes from business_requests (the request log keyed by the payment id).
// The driver's delivery path writes no request; its note names the driver instead.
export interface RequestRow { operation: string; actor_id: string; result_id: string; created_at: string; payload?: Record<string, unknown> | null }
const DRIVER_NOTE = /^تحصيل نقدي عند التسليم - السائق\s*(.*)$/;

export function paymentLedger(orders: BusinessOrder[], requests: RequestRow[], names: Record<string, string>, from: string, to: string) {
  const actor = new Map(requests.filter((r) => r.operation === 'payment' || r.operation === 'payment_reverse').map((r) => [r.result_id, r.actor_id]));
  const rows = orders.flatMap((o) => (o.payments || []).map((p) => ({ p, o })))
    .filter(({ p }) => inRange(ammanDate(p.received_at), from, to))
    .map(({ p, o }) => {
      const driver = DRIVER_NOTE.exec(p.notes || '')?.[1];
      const by = actor.has(p.id) ? nameOf(names, actor.get(p.id)) : driver ? `السائق ${driver}` : '—';
      return { id: p.id, received_at: p.received_at, day: ammanDate(p.received_at), order_id: o.id, invoice: o.invoice_number ?? '',
        customer: o.customer_name, phone: o.customer_phone, rep: o.rep_name, method: p.payment_method || 'unknown',
        reference: p.reference_number || '', amount: Number(p.amount) || 0, is_reversal: !!p.is_reversal,
        reversed: !p.is_reversal && (o.payments || []).some((r) => r.reversed_payment_id === p.id),
        recorded_by: by, notes: p.notes || '' };
    })
    .sort((a, b) => b.received_at.localeCompare(a.received_at));
  const received = rows.filter((r) => !r.is_reversal);
  const byMethod = new Map<string, { key: string; count: number; value: number }>();
  for (const r of received) {
    const m = byMethod.get(r.method) ?? { key: r.method, count: 0, value: 0 };
    m.count++; m.value += fils(r.amount); byMethod.set(r.method, m);
  }
  const receivedTotal = received.reduce((n, r) => n + fils(r.amount), 0);
  const reversedTotal = rows.filter((r) => r.is_reversal).reduce((n, r) => n - fils(r.amount), 0);
  return {
    rows, count: received.length, received: jd(receivedTotal), reversed: jd(reversedTotal), net: jd(receivedTotal - reversedTotal),
    by_method: [...byMethod.values()].map((m) => ({ ...m, value: jd(m.value) })).sort((a, b) => b.value - a.value),
    // Transfers must carry a reference (business_collect enforces it); older rows may not.
    missing_reference: received.filter((r) => ['cliq', 'zain_cash', 'bank_transfer'].includes(r.method) && !r.reference).length,
  };
}

export function paymentsCsv(rows: ReturnType<typeof paymentLedger>['rows']) {
  const head = ['التاريخ', 'الوقت', 'رقم الطلب', 'رقم الفاتورة', 'العميل', 'الهاتف', 'المندوب', 'الطريقة', 'المرجع', 'المبلغ', 'عكسية', 'سجّلها', 'ملاحظات'];
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Amman', hour: '2-digit', minute: '2-digit' });
  const body = rows.map((r) => [r.day, clock.format(new Date(r.received_at)), r.order_id, r.invoice, r.customer, r.phone, r.rep,
    METHOD_LABELS[r.method] ?? r.method, r.reference, r.amount.toFixed(3), r.is_reversal ? 'نعم' : '', r.recorded_by, r.notes]);
  return csv([head, ...body]);
}

// --- Expenses and budgets ------------------------------------------------------------------------
export interface CampaignRow { id: string; code: string; name: string; channel: string; status: string; start_date: string;
  end_date: string | null; budget: number; target_revenue: number | null }
export interface SpendEntry { id: string; campaign_id: string; spend_date: string; amount: number; description: string | null;
  created_by: string; created_at: string; voided_at: string | null; voided_by: string | null; void_reason: string | null }
export interface PayrollRun { id: string; month: string; status: string; created_by?: string; approved_by: string | null; approved_at: string | null;
  paid_by: string | null; paid_at: string | null; payment_ref?: string;
  totals: { count: number; gross: number; net: number; employer_cost: number; ssc_employer: number; deductions?: number } }
export interface AdvanceEntry { id: string; employee: string; amount: number; monthly_amount: number; start_month: string; reason: string;
  status: string; created_at: string }

export function expenses(input: { campaigns: CampaignRow[] | null; spend: SpendEntry[] | null; payroll: PayrollRun[] | null;
  advances: AdvanceEntry[] | null }, names: Record<string, string>, from: string, to: string) {
  const campaign = new Map((input.campaigns ?? []).map((c) => [c.id, c]));
  const inPeriod = (input.spend ?? []).filter((s) => inRange(s.spend_date, from, to));
  const entries = inPeriod.map((s) => ({ id: s.id, date: s.spend_date, campaign: campaign.get(s.campaign_id)?.name ?? '—',
    channel: campaign.get(s.campaign_id)?.channel ?? '', amount: Number(s.amount) || 0, description: s.description ?? '',
    by: nameOf(names, s.created_by), voided: !!s.voided_at, void_reason: s.void_reason ?? '', voided_by: s.voided_by ? nameOf(names, s.voided_by) : '' }))
    .sort((a, b) => b.date.localeCompare(a.date));
  const live = entries.filter((e) => !e.voided);
  const byChannel = new Map<string, number>();
  for (const e of live) byChannel.set(e.channel || 'other', (byChannel.get(e.channel || 'other') ?? 0) + fils(e.amount));

  const months = new Set(monthsOf(from, to));
  const payroll = (input.payroll ?? []).filter((r) => months.has(r.month)).sort((a, b) => a.month.localeCompare(b.month))
    .map((r) => ({ month: r.month, status: r.status, count: r.totals.count, gross: Number(r.totals.gross) || 0, net: Number(r.totals.net) || 0,
      employer_cost: Number(r.totals.employer_cost) || 0, ssc_employer: Number(r.totals.ssc_employer) || 0,
      approved_by: r.approved_by ? nameOf(names, r.approved_by) : '', approved_at: r.approved_at,
      paid_by: r.paid_by ? nameOf(names, r.paid_by) : '', paid_at: r.paid_at, payment_ref: r.payment_ref ?? '' }));
  const advances = (input.advances ?? []).filter((a) => a.status === 'active').sort((a, b) => b.amount - a.amount);

  const marketing = live.reduce((n, e) => n + fils(e.amount), 0);
  const payrollCost = payroll.reduce((n, r) => n + fils(r.employer_cost), 0);
  return {
    available: { spend: input.spend !== null, payroll: input.payroll !== null, advances: input.advances !== null },
    total: jd(marketing + payrollCost), marketing: jd(marketing), payroll_cost: jd(payrollCost),
    payroll_paid: jd(payroll.filter((r) => r.status === 'paid').reduce((n, r) => n + fils(r.net), 0)),
    payroll_unpaid: jd(payroll.filter((r) => r.status !== 'paid').reduce((n, r) => n + fils(r.net), 0)),
    voided: jd(entries.filter((e) => e.voided).reduce((n, e) => n + fils(e.amount), 0)),
    entries, by_channel: [...byChannel.entries()].map(([key, v]) => ({ key, value: jd(v) })).sort((a, b) => b.value - a.value),
    payroll, advances, advances_amount: jd(advances.reduce((n, a) => n + fils(a.amount), 0)),
    advances_monthly: jd(advances.reduce((n, a) => n + fils(a.monthly_amount), 0)),
  };
}

// Each campaign's budget against every live spend entry it has ever had (a budget is for the whole
// campaign, not a calendar month). Cancelled campaigns with nothing spent are left out.
export function budgets(campaigns: CampaignRow[], spend: SpendEntry[], orders: BusinessOrder[] = []) {
  // Orders a rep tagged with the campaign (migration 051); cancelled and returned ones sold nothing.
  const sales = new Map<string, { value: number; count: number }>();
  for (const o of orders) {
    if (!o.campaign_id || !isLive(o)) continue;
    const cur = sales.get(o.campaign_id) ?? { value: 0, count: 0 };
    cur.value += fils(o.total_amount); cur.count++; sales.set(o.campaign_id, cur);
  }
  const spent = new Map<string, { value: number; count: number; last: string }>();
  for (const s of spend) {
    if (s.voided_at) continue;
    const cur = spent.get(s.campaign_id) ?? { value: 0, count: 0, last: '' };
    cur.value += fils(s.amount); cur.count++; if (s.spend_date > cur.last) cur.last = s.spend_date;
    spent.set(s.campaign_id, cur);
  }
  const order = ['active', 'planned', 'paused', 'completed', 'cancelled'];
  const rows = campaigns.map((c) => {
    const s = spent.get(c.id) ?? { value: 0, count: 0, last: '' };
    const budget = fils(c.budget);
    const sold = sales.get(c.id) ?? { value: 0, count: 0 };
    return { orders: sold.count, sales: jd(sold.value), roas: s.value ? Math.round(sold.value / s.value * 100) / 100 : null, id: c.id, code: c.code, name: c.name, channel: c.channel, status: c.status, start_date: c.start_date, end_date: c.end_date,
      budget: jd(budget), spent: jd(s.value), remaining: jd(budget - s.value), entries: s.count, last_spend: s.last,
      used: budget ? Math.round(s.value / budget * 100) : null, over: budget > 0 && s.value > budget, no_budget: budget === 0 && s.value > 0,
      target_revenue: c.target_revenue };
  }).filter((r) => r.status !== 'cancelled' || r.spent > 0 || r.orders > 0)
    .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || b.start_date.localeCompare(a.start_date));
  const budgetTotal = rows.reduce((n, r) => n + fils(r.budget), 0);
  const spentTotal = rows.reduce((n, r) => n + fils(r.spent), 0);
  const salesTotal = rows.reduce((n, r) => n + fils(r.sales), 0);
  return { rows, budget: jd(budgetTotal), spent: jd(spentTotal), remaining: jd(budgetTotal - spentTotal),
    sales: jd(salesTotal), orders: rows.reduce((n, r) => n + r.orders, 0),
    used: budgetTotal ? Math.round(spentTotal / budgetTotal * 100) : null,
    over: rows.filter((r) => r.over).length, no_budget: rows.filter((r) => r.no_budget).length };
}

// --- Reports: profit and loss, cash flow ---------------------------------------------------------
// One sold line with the date and status of its order (order_items joined to orders).
export interface CostLine { product_id: string | null; quantity: number; order_date: string; status: string }

// Unit cost per product id. A package holds no cost of its own: it costs what its bottles cost.
export function unitCosts(catalog: BusinessProduct[]) {
  const bySku = new Map(catalog.map((p) => [p.sku, p]));
  const cost = new Map<string, number | null>();
  for (const p of catalog) {
    if (p.is_bundle && p.components?.length) {
      let sum = 0, known = true;
      for (const c of p.components) { const own = Number(bySku.get(c.sku)?.cost_price) || 0; if (!own) known = false; sum += fils(own) * c.quantity; }
      cost.set(p.id, known ? sum : null);
    } else cost.set(p.id, Number(p.cost_price) > 0 ? fils(p.cost_price) : null);
  }
  return cost;
}

export function profitAndLoss(input: { orders: BusinessOrder[]; lines: CostLine[] | null; catalog: BusinessProduct[] | null;
  spend: SpendEntry[] | null; payroll: PayrollRun[] | null }, from: string, to: string) {
  const months = monthsOf(from, to);
  const cost = unitCosts(input.catalog ?? []);
  const blank = () => ({ sales: 0, discounts: 0, cogs: 0, lines: 0, missing_cost: 0, marketing: 0, payroll: 0,
    cash_in: 0, cash_reversed: 0, cash_marketing: 0, cash_payroll: 0 });
  const by = new Map(months.map((m) => [m, blank()]));
  const at = (d: string) => by.get(d.slice(0, 7));

  for (const o of input.orders) {
    if (inRange(o.order_date, from, to) && isLive(o)) {
      const m = at(o.order_date)!; m.sales += fils(o.total_amount); m.discounts += fils(o.invoice_discount);
    }
    for (const p of o.payments || []) {
      const day = ammanDate(p.received_at);
      if (!inRange(day, from, to)) continue;
      if (p.is_reversal) at(day)!.cash_reversed -= fils(p.amount); else at(day)!.cash_in += fils(p.amount);
    }
  }
  for (const l of input.lines ?? []) {
    if (!inRange(l.order_date, from, to) || l.status === 'cancelled' || l.status === 'returned') continue;
    const m = at(l.order_date)!; const unit = l.product_id ? cost.get(l.product_id) : null;
    m.lines++;
    if (unit == null) m.missing_cost++; else m.cogs += unit * (Number(l.quantity) || 0);
  }
  for (const s of input.spend ?? []) {
    if (s.voided_at || !inRange(s.spend_date, from, to)) continue;
    const m = at(s.spend_date)!; m.marketing += fils(s.amount); m.cash_marketing += fils(s.amount);
  }
  for (const r of input.payroll ?? []) {
    const m = by.get(r.month); if (!m) continue;
    m.payroll += fils(r.totals.employer_cost);
    if (r.status === 'paid') m.cash_payroll += fils(r.totals.net);
  }

  const shape = (key: string, m: ReturnType<typeof blank>) => {
    const gross = m.sales - m.cogs, net = gross - m.marketing - m.payroll, cashNet = m.cash_in - m.cash_reversed - m.cash_marketing - m.cash_payroll;
    return { key, sales: jd(m.sales), discounts: jd(m.discounts), cogs: jd(m.cogs), gross_profit: jd(gross),
      gross_margin: m.sales ? Math.round(gross / m.sales * 100) : null, marketing: jd(m.marketing), payroll: jd(m.payroll),
      net_profit: jd(net), lines: m.lines, missing_cost: m.missing_cost,
      cash_in: jd(m.cash_in), cash_reversed: jd(m.cash_reversed), cash_marketing: jd(m.cash_marketing), cash_payroll: jd(m.cash_payroll), cash_net: jd(cashNet) };
  };
  const total = blank();
  for (const m of by.values()) for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += m[k];
  return {
    available: { lines: input.lines !== null, catalog: input.catalog !== null, spend: input.spend !== null, payroll: input.payroll !== null },
    months: months.map((k) => shape(k, by.get(k)!)), total: shape('total', total),
    products_without_cost: (input.catalog ?? []).filter((p) => !p.is_bundle && !(Number(p.cost_price) > 0)).length,
  };
}

export function profitAndLossCsv(pl: ReturnType<typeof profitAndLoss>) {
  const cols = [...pl.months, pl.total];
  const line = (label: string, pick: (m: (typeof cols)[number]) => number | null) =>
    [label, ...cols.map((m) => { const v = pick(m); return v === null ? '' : v.toFixed(3); })];
  return csv([
    ['البند', ...pl.months.map((m) => m.key), 'الإجمالي'],
    line('صافي المبيعات', (m) => m.sales), line('تكلفة البضاعة المباعة', (m) => m.cogs), line('مجمل الربح', (m) => m.gross_profit),
    line('التسويق', (m) => m.marketing), line('الرواتب (كلفة الشركة)', (m) => m.payroll), line('صافي الربح', (m) => m.net_profit),
    [], line('المقبوضات', (m) => m.cash_in), line('دفعات معكوسة', (m) => m.cash_reversed), line('مدفوع للتسويق', (m) => m.cash_marketing),
    line('رواتب مدفوعة', (m) => m.cash_payroll), line('صافي التدفق النقدي', (m) => m.cash_net),
  ]);
}

// --- Audit trail ---------------------------------------------------------------------------------
// Who did what to money, newest first: payments and reversals, order cancellations/returns and
// edits, marketing spend and its voiding, payroll approvals and payments, employee advances.
export interface OrderChangeRow { order_id: string; actor_id: string; changes: Record<string, { from: unknown; to: unknown }>; changed_at: string }
// An edit (the diff migrations 036/042/048 log) is a money event only when it moved the total; a
// product swap or rename at the same total changes stock, not money.
export const AUDIT_KINDS: Record<string, string> = { payment: 'سند قبض', payment_reverse: 'عكس دفعة', status: 'حالة طلب', order_edit: 'تعديل طلب',
  mkt_spend: 'مصروف تسويق', mkt_spend_void: 'إلغاء مصروف', hr_payroll_transition: 'الرواتب', hr_advance: 'سلفة موظف' };

export function auditTrail(input: { requests: RequestRow[]; orderChanges: OrderChangeRow[] | null; orders: BusinessOrder[];
  spend: SpendEntry[] | null; campaigns: CampaignRow[] | null; payroll: PayrollRun[] | null; advances: AdvanceEntry[] | null },
  names: Record<string, string>) {
  const orderByDb = new Map(input.orders.map((o) => [o.db_id, o]));
  const payment = new Map(input.orders.flatMap((o) => (o.payments || []).map((p) => [p.id, { p, o }] as const)));
  const spend = new Map((input.spend ?? []).map((s) => [s.id, s]));
  const campaign = new Map((input.campaigns ?? []).map((c) => [c.id, c.name]));
  const run = new Map((input.payroll ?? []).map((r) => [r.id, r]));
  const advance = new Map((input.advances ?? []).map((a) => [a.id, a]));
  const str = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

  // `deleted`: the event's record is gone (test orders removed before go-live). Kept, but labelled.
  const rows: { at: string; kind: string; actor: string; subject: string; detail: string; amount: number | null; deleted: boolean }[] = [];
  const GONE = 'سجل محذوف';
  for (const r of input.requests) {
    const d = r.payload ?? {};
    const base = { at: r.created_at, kind: r.operation, actor: nameOf(names, r.actor_id) };
    if (r.operation === 'payment' || r.operation === 'payment_reverse') {
      const hit = payment.get(r.result_id);
      rows.push({ ...base, deleted: !hit, subject: hit ? `${hit.o.id} — ${hit.o.customer_name}` : `${GONE} (فاتورة ${str(d.invoice_id)})`,
        detail: [METHOD_LABELS[hit?.p.payment_method ?? String(d.payment_method ?? '')] ?? '', hit?.p.reference_number || '', str(d.notes) === '—' ? '' : str(d.notes)].filter(Boolean).join(' • '),
        amount: hit ? Number(hit.p.amount) : Number(d.amount) || null });
    } else if (r.operation === 'status') {
      const status = String(d.status ?? '');
      if (!['cancelled', 'returned', 'delivered'].includes(status)) continue;
      const o = orderByDb.get(r.result_id);
      const why = o && status !== 'delivered' ? reasonOf(o) : '';
      rows.push({ ...base, deleted: !o, subject: o ? `${o.id} — ${o.customer_name}` : `${GONE} (طلب)`,
        detail: `إلى: ${STATUS_LABELS[status] ?? status}${why ? ` — السبب: ${why}` : ''}`,
        amount: o ? o.total_amount : null });
    } else if (r.operation === 'mkt_spend' || r.operation === 'mkt_spend_void') {
      const s = spend.get(r.result_id);
      rows.push({ ...base, deleted: !s, subject: s ? campaign.get(s.campaign_id) ?? '—' : GONE,
        detail: r.operation === 'mkt_spend_void' ? `السبب: ${str(d.reason)}` : [s?.spend_date, s?.description].filter(Boolean).join(' • '),
        amount: s ? Number(s.amount) : Number(d.amount) || null });
    } else if (r.operation === 'hr_payroll_transition') {
      const run_ = run.get(r.result_id); const act = String(d.action ?? '');
      rows.push({ ...base, deleted: !run_, subject: run_ ? `مسيّر ${run_.month}` : 'مسيّر رواتب',
        detail: ({ approve: 'اعتماد', reopen: 'إعادة فتح', pay: 'دفع' } as Record<string, string>)[act] ?? act,
        amount: run_ ? Number(run_.totals.net) : null });
    } else if (r.operation === 'hr_advance') {
      const a = advance.get(r.result_id); const act = String(d.action ?? '');
      rows.push({ ...base, deleted: !a, subject: a?.employee ?? 'سلفة', detail: ({ create: 'منح سلفة', cancel: 'إلغاء سلفة' } as Record<string, string>)[act] ?? act,
        amount: a ? a.amount : Number(d.amount) || null });
    }
  }
  for (const c of input.orderChanges ?? []) {
    const total = c.changes?.total_amount;
    if (!total) continue;
    const o = orderByDb.get(c.order_id);
    rows.push({ at: c.changed_at, kind: 'order_edit', actor: nameOf(names, c.actor_id), deleted: !o, subject: o ? `${o.id} — ${o.customer_name}` : `${GONE} (طلب)`,
      detail: `الإجمالي: ${str(total.from)} ← ${str(total.to)}${c.changes.items_summary ? ' • وتغيّرت الأصناف' : ''}`,
      amount: o ? o.total_amount : null });
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

function csv(rows: unknown[][]) {
  const cell = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
