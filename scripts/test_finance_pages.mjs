import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';

// The finance manager's pages (lib/finance-pages.ts, /api/finance/records): receivables by customer,
// the payments ledger, expenses, campaign budgets, profit and loss / cash flow, and the audit trail.
//
// Every figure must trace to a row the system stores. The traps these guard: a receivable that
// disagrees with the invoices desk; a payment whose recorder is lost; voided marketing spend counted
// as spend; a package costed at zero when its bottles have a cost; a sales-rep edit to an address
// showing up as a money change.
const root = new URL('../', import.meta.url);
registerHooks({resolve(s, c, next) { if (s.startsWith('@/')) return next(new URL(s.slice(2) + '.ts', root).href, c); return next(s, c); }});
const F = await import('../lib/finance-pages.ts');
const {toInvoice, financeSummary} = await import('../lib/business.ts');

const pay = (id, amount, method, at, extra = {}) => ({id, amount, payment_method: method, reference_number: '', notes: '',
  is_reversal: false, reversed_payment_id: null, received_at: at, ...extra});
const order = (o) => ({db_id: 'db-' + o.id, customer_phone: '0790000000', city: 'عمان', address: '', source: 'sales', installment_notes: null,
  items_summary: '', items: [], invoice_number: 'INV-' + o.id, invoice_total: o.total_amount, invoice_subtotal: o.total_amount,
  invoice_discount: 0, issued_date: o.order_date, due_date: o.order_date, paid_amount: 0, collectible: true, payments: [],
  payment_method: 'cash_on_delivery', rep_name: 'رحمة', customer_name: 'زبونة', driver: null, ...o});

const orders = [
  order({id: 'A', order_date: '2026-09-05', status: 'delivered', total_amount: 20, paid_amount: 20, customer_phone: '0791111111', customer_name: 'سلمى',
    payments: [pay('pA', 20, 'cash', '2026-09-05T15:00:00+03:00', {notes: 'تحصيل نقدي عند التسليم - السائق علي'})]}),
  // Same customer (by phone), a later order under a new name: still one customer, named as latest.
  order({id: 'B', order_date: '2026-09-10', status: 'delivered', total_amount: 50, customer_phone: '0791111111', customer_name: 'صالون سلمى',
    due_date: '2026-09-01', paid_amount: 10, campaign_id: 'c1', payments: [pay('pB', 10, 'cliq', '2026-09-11T10:00:00+03:00', {reference_number: 'cl-1'})]}),
  order({id: 'C', order_date: '2026-09-12', status: 'cancelled', total_amount: 40, collectible: false, customer_phone: '0792222222', customer_name: 'هدى',
    campaign_id: 'c1', cancel: {reason: 'price', note: 'اتصلت', by: 'mgr-rasha-01', at: '2026-09-12T09:00:00Z'},
    paid_amount: 5, payments: [pay('pC', 5, 'bank_transfer', '2026-09-12T10:00:00+03:00')]}),
  order({id: 'D', order_date: '2026-08-20', status: 'delivered', total_amount: 100, paid_amount: 30, customer_phone: '0793333333', customer_name: 'ريم',
    payments: [pay('pD1', 30, 'cliq', '2026-09-02T10:00:00+03:00', {reference_number: 'cl-2'}), pay('pD2', 10, 'cliq', '2026-09-03T10:00:00+03:00', {reference_number: 'cl-3'}),
      pay('pD3', -10, 'cliq', '2026-09-04T10:00:00+03:00', {is_reversal: true, reversed_payment_id: 'pD2'})]}),
  order({id: 'E', order_date: '2026-09-15', status: 'draft', total_amount: 15, invoice_number: null}),
];
const names = {'fin-zaid-01': 'أحمد', 'mgr-rasha-01': 'رشا', 'mkt-01': 'ليث'};

// --- monthsOf: every month the period touches.
assert.deepEqual(F.monthsOf('2026-08-15', '2026-10-02'), ['2026-08', '2026-09', '2026-10']);
assert.deepEqual(F.monthsOf('2026-12-01', '2027-01-31'), ['2026-12', '2027-01']);

// --- Receivables: one customer per phone, and the same total the invoices desk shows.
const r = F.receivables(orders, '2026-09-23');
const desk = financeSummary(orders.filter((o) => o.invoice_number).map(toInvoice));
assert.equal(r.outstanding, desk.total_receivables_jd, 'receivables and the invoices desk agree');
assert.equal(r.outstanding, 40 + 70);
assert.equal(r.overdue, 40 + 70, 'B due 09-01 and D due 08-20 are both late');
assert.equal(r.aging.d8_30, 40);
assert.equal(r.aging.d31_60, 70);
const salma = r.customers.find((c) => c.phone === '0791111111');
assert.deepEqual([salma.customer, salma.invoices, salma.open, salma.invoiced, salma.paid, salma.outstanding, salma.days_late],
  ['صالون سلمى', 2, 1, 70, 30, 40, 22], 'two orders, one customer, named as on her latest order');
assert.equal(r.customers[0].phone, '0793333333', 'largest balance first');
const huda = r.customers.find((c) => c.phone === '0792222222');
assert.deepEqual([huda.outstanding, huda.credit, huda.invoiced], [0, 5, 0], 'a cancelled order owes nothing; its payment is her credit');
assert.equal(r.credits, 5);
assert.equal(r.customers_owing, 2);
assert.deepEqual(r.open.map((i) => [i.order_id, i.days_late]), [['D', 34], ['B', 22]], 'latest first');

// --- Payments ledger: dated by receipt, who recorded each one, reversals netted.
const requests = [
  {operation: 'payment', actor_id: 'fin-zaid-01', result_id: 'pB', created_at: '2026-09-11T07:00:00Z'},
  {operation: 'payment', actor_id: 'mgr-rasha-01', result_id: 'pD1', created_at: '2026-09-02T07:00:00Z'},
  {operation: 'payment_reverse', actor_id: 'fin-zaid-01', result_id: 'pD3', created_at: '2026-09-04T07:00:00Z', payload: {payment_id: 'pD2', notes: 'خطأ'}},
];
const p = F.paymentLedger(orders, requests, names, '2026-09-01', '2026-09-30');
assert.equal(p.rows.length, 6);
assert.equal(p.received, 20 + 10 + 5 + 30 + 10);
assert.equal(p.reversed, 10);
assert.equal(p.net, 65);
assert.equal(p.rows.find((x) => x.id === 'pA').recorded_by, 'السائق علي', "the driver's delivery payment names the driver");
assert.equal(p.rows.find((x) => x.id === 'pB').recorded_by, 'أحمد');
assert.equal(p.rows.find((x) => x.id === 'pD3').recorded_by, 'أحمد', 'the reversal names who reversed it');
assert.equal(p.rows.find((x) => x.id === 'pD2').recorded_by, '—', 'no request, no guess');
assert.equal(p.rows.find((x) => x.id === 'pD2').reversed, true, 'a reversed payment is marked');
assert.equal(p.missing_reference, 1, 'pC, a bank transfer, carries no reference');
assert.deepEqual(p.by_method.map((m) => [m.key, m.count, m.value]), [['cliq', 3, 50], ['cash', 1, 20], ['bank_transfer', 1, 5]]);
assert.equal(p.rows[0].id, 'pC', 'newest first');
assert.equal(F.paymentLedger(orders, requests, names, '2026-08-01', '2026-08-31').rows.length, 0, 'an August order paid in September is September money');
const pcsv = F.paymentsCsv(p.rows).replace(/^﻿/, '').trim().split('\r\n');
assert.equal(pcsv.length, 7);
assert.ok(pcsv.some((l) => l.includes(',B,INV-B,صالون سلمى,') && l.includes(',كليك,cl-1,10.000,,أحمد,')), 'CSV row carries method, reference and recorder');

// --- Expenses: voided spend listed but not counted; payroll by month; active advances only.
const campaigns = [
  {id: 'c1', code: 'META9', name: 'Meta سبتمبر', channel: 'facebook', status: 'active', start_date: '2026-09-01', end_date: null, budget: 100, target_revenue: null},
  {id: 'c2', code: 'TT', name: 'تيك توك', channel: 'tiktok', status: 'completed', start_date: '2026-08-01', end_date: '2026-08-31', budget: 50, target_revenue: null},
  {id: 'c3', code: 'INF', name: 'مؤثرة', channel: 'influencer', status: 'active', start_date: '2026-09-05', end_date: null, budget: 0, target_revenue: null},
  {id: 'c4', code: 'OLD', name: 'ملغاة', channel: 'other', status: 'cancelled', start_date: '2026-07-01', end_date: null, budget: 30, target_revenue: null},
];
const sp = (id, campaign_id, spend_date, amount, extra = {}) => ({id, campaign_id, spend_date, amount, description: null, created_by: 'mkt-01',
  created_at: spend_date + 'T10:00:00Z', voided_at: null, voided_by: null, void_reason: null, ...extra});
const spend = [sp('s1', 'c1', '2026-09-03', 70), sp('s2', 'c1', '2026-09-04', 500, {voided_at: '2026-09-05T00:00:00Z', voided_by: 'mkt-01', void_reason: 'مكرر'}),
  sp('s3', 'c1', '2026-09-20', 45), sp('s4', 'c2', '2026-08-10', 40), sp('s5', 'c3', '2026-09-06', 25)];
const payroll = [
  {id: 'r9', month: '2026-09', status: 'approved', approved_by: 'fin-zaid-01', approved_at: '2026-09-28T10:00:00Z', paid_by: null, paid_at: null,
    totals: {count: 5, gross: 2000, net: 1800, employer_cost: 2300, ssc_employer: 300}},
  {id: 'r8', month: '2026-08', status: 'paid', approved_by: 'fin-zaid-01', approved_at: null, paid_by: 'fin-zaid-01', paid_at: '2026-08-30T10:00:00Z', payment_ref: 'TR-8',
    totals: {count: 5, gross: 1900, net: 1700, employer_cost: 2200, ssc_employer: 300}},
];
const advances = [{id: 'a1', employee: 'حنان', amount: 200, monthly_amount: 50, start_month: '2026-09', reason: 'ظرف', status: 'active', created_at: '2026-09-01T00:00:00Z'},
  {id: 'a2', employee: 'خالد', amount: 90, monthly_amount: 30, start_month: '2026-06', reason: 'x', status: 'settled', created_at: '2026-06-01T00:00:00Z'}];
const e = F.expenses({campaigns, spend, payroll, advances}, names, '2026-09-01', '2026-09-30');
assert.equal(e.marketing, 70 + 45 + 25, 'voided spend is not spend; August spend is not September');
assert.equal(e.voided, 500);
assert.equal(e.entries.length, 4, 'the voided entry is still listed');
assert.deepEqual(e.entries.find((x) => x.id === 's2') && [e.entries.find((x) => x.id === 's2').voided_by, e.entries.find((x) => x.id === 's2').void_reason], ['ليث', 'مكرر']);
assert.deepEqual(e.payroll.map((x) => [x.month, x.approved_by]), [['2026-09', 'أحمد']]);
assert.equal(e.payroll_cost, 2300);
assert.equal(e.payroll_unpaid, 1800, 'approved, not yet paid');
assert.equal(e.total, 140 + 2300);
assert.deepEqual(e.advances.map((a) => a.employee), ['حنان'], 'settled advances are not owed');
assert.equal(e.advances_monthly, 50);
assert.deepEqual(e.by_channel.map((c) => [c.key, c.value]), [['facebook', 115], ['influencer', 25]]);
assert.equal(F.expenses({campaigns, spend: null, payroll: null, advances: null}, names, '2026-09-01', '2026-09-30').available.spend, false);

// --- Budgets: the whole campaign, not a month; over-budget and spend without a budget flagged.
const b = F.budgets(campaigns, spend, orders);
assert.deepEqual(b.rows.map((x) => x.id), ['c3', 'c1', 'c2'], 'active first, newest start first; a cancelled campaign with nothing spent is left out');
const meta = b.rows.find((x) => x.id === 'c1');
assert.deepEqual([meta.spent, meta.remaining, meta.used, meta.over, meta.entries, meta.last_spend], [115, -15, 115, true, 2, '2026-09-20']);
const inf = b.rows.find((x) => x.id === 'c3');
assert.deepEqual([inf.used, inf.no_budget, inf.over], [null, true, false], 'spend with no budget is flagged, not a divide by zero');
assert.deepEqual([b.budget, b.spent, b.remaining, b.over, b.no_budget], [150, 180, -30, 1, 1]);
assert.deepEqual([meta.orders, meta.sales, meta.roas], [1, 50, Math.round(50 / 115 * 100) / 100], "the campaign's sales are its live tagged orders; the cancelled one sold nothing");
assert.deepEqual([b.orders, b.sales], [1, 50]);
assert.equal(F.budgets(campaigns, spend).rows.find((x) => x.id === 'c1').sales, 0, 'no orders passed, no sales');

// --- Profit and loss: cost of goods from catalogue costs, a package through its bottles.
const catalog = [
  {id: 'x', sku: 'X', name_ar: 'شامبو', cost_price: 5, price: 13, sale_price: null, stock: 10, is_bundle: false},
  {id: 'y', sku: 'Y', name_ar: 'عدسة', cost_price: 0, price: 25, sale_price: null, stock: 3, is_bundle: false},
  {id: 'z', sku: 'Z', name_ar: 'سيروم', cost_price: 2.5, price: 9, sale_price: null, stock: 4, is_bundle: false},
  {id: 'p', sku: 'P', name_ar: 'بكج', cost_price: 0, price: 25, sale_price: null, stock: 4, is_bundle: true, components: [{sku: 'X', name_ar: 'شامبو', quantity: 2}, {sku: 'Z', name_ar: 'سيروم', quantity: 1}]},
  {id: 'q', sku: 'Q', name_ar: 'بكج ناقص', cost_price: 0, price: 25, sale_price: null, stock: 4, is_bundle: true, components: [{sku: 'X', name_ar: 'شامبو', quantity: 1}, {sku: 'Y', name_ar: 'عدسة', quantity: 1}]},
];
const costs = F.unitCosts(catalog);
assert.equal(costs.get('p'), 12500, 'a package costs its bottles: 2×5 + 2.5');
assert.equal(costs.get('q'), null, 'a package with an uncosted bottle is unknown, not cheap');
assert.equal(costs.get('y'), null);
const lines = [
  {product_id: 'x', quantity: 2, order_date: '2026-09-05', status: 'delivered'},   // A: 10
  {product_id: 'p', quantity: 1, order_date: '2026-09-10', status: 'delivered'},   // B: 12.5
  {product_id: 'y', quantity: 1, order_date: '2026-09-10', status: 'delivered'},   // B: no cost
  {product_id: 'x', quantity: 5, order_date: '2026-09-12', status: 'cancelled'},   // C: not sold
  {product_id: 'z', quantity: 2, order_date: '2026-08-20', status: 'delivered'},   // D: 5, August
  {product_id: null, quantity: 1, order_date: '2026-09-15', status: 'draft'},      // E: unmatched line
];
const pl = F.profitAndLoss({orders, lines, catalog, spend, payroll}, '2026-08-01', '2026-09-30');
assert.deepEqual(pl.months.map((m) => m.key), ['2026-08', '2026-09']);
const [aug, sep] = pl.months;
assert.deepEqual([sep.sales, sep.cogs, sep.gross_profit, sep.missing_cost, sep.lines], [85, 22.5, 62.5, 2, 4]);
assert.deepEqual([sep.marketing, sep.payroll, sep.net_profit], [140, 2300, 62.5 - 140 - 2300]);
assert.deepEqual([aug.sales, aug.cogs, aug.marketing, aug.payroll, aug.cash_payroll], [100, 5, 40, 2200, 1700]);
assert.equal(sep.cash_in, 20 + 10 + 5 + 30 + 10);
assert.equal(sep.cash_reversed, 10);
assert.equal(sep.cash_payroll, 0, 'an approved run is a cost, not yet cash out');
assert.equal(sep.cash_net, 75 - 10 - 140);
assert.equal(pl.total.sales, 185);
assert.equal(pl.total.net_profit, aug.net_profit + sep.net_profit);
assert.equal(pl.products_without_cost, 1);
assert.equal(F.profitAndLoss({orders, lines: null, catalog: null, spend: null, payroll: null}, '2026-09-01', '2026-09-30').available.lines, false);
const plcsv = F.profitAndLossCsv(pl).replace(/^﻿/, '').trim().split('\r\n');
assert.equal(plcsv[0], 'البند,2026-08,2026-09,الإجمالي');
assert.ok(plcsv.includes('تكلفة البضاعة المباعة,5.000,22.500,27.500'));

// --- Audit trail: money events only, each resolved to what it touched and who did it.
const auditRequests = [...requests,
  {operation: 'status', actor_id: 'mgr-rasha-01', result_id: 'db-C', created_at: '2026-09-12T09:00:00Z', payload: {status: 'cancelled'}},
  {operation: 'status', actor_id: 'mgr-rasha-01', result_id: 'db-B', created_at: '2026-09-10T09:00:00Z', payload: {status: 'processing'}},
  {operation: 'mkt_spend_void', actor_id: 'mkt-01', result_id: 's2', created_at: '2026-09-05T00:00:00Z', payload: {id: 's2', reason: 'مكرر'}},
  {operation: 'hr_payroll_transition', actor_id: 'fin-zaid-01', result_id: 'r9', created_at: '2026-09-28T10:00:00Z', payload: {id: 'r9', action: 'approve'}},
  {operation: 'hr_advance', actor_id: 'hr-01', result_id: 'a1', created_at: '2026-09-01T00:00:00Z', payload: {action: 'create', amount: 200}},
];
const orderChanges = [
  {order_id: 'db-B', actor_id: 'mgr-rasha-01', changed_at: '2026-09-10T12:00:00Z', changes: {total_amount: {from: 60, to: 50}, items_summary: {from: 'x', to: 'y'}, address: {from: 'a', to: 'b'}}},
  {order_id: 'db-A', actor_id: 'rep-01', changed_at: '2026-09-05T12:00:00Z', changes: {address: {from: 'a', to: 'b'}}},
  {order_id: 'db-D', actor_id: 'admin-betolla-01', changed_at: '2026-09-06T12:00:00Z', changes: {items_summary: {from: '1 × شامبو ارغان', to: '1 × شامبو ارجان'}}},
];
const audit = F.auditTrail({requests: auditRequests, orderChanges, orders, spend, campaigns, payroll, advances}, names);
assert.deepEqual(audit.map((x) => x.kind), ['hr_payroll_transition', 'status', 'payment', 'order_edit', 'mkt_spend_void', 'payment_reverse', 'payment', 'hr_advance'],
  'newest first; a move to processing, an address-only edit and a same-total product rename are not money events');
assert.ok(audit.find((x) => x.kind === 'status').detail === 'إلى: ملغى — السبب: السعر — اتصلت', 'a cancellation says why (051)');
const edit = audit.find((x) => x.kind === 'order_edit');
assert.deepEqual([edit.actor, edit.subject, edit.detail], ['رشا', 'B — صالون سلمى', 'الإجمالي: 60 ← 50 • وتغيّرت الأصناف'], 'the total, and that the items changed with it');
const rev = audit.find((x) => x.kind === 'payment_reverse');
assert.deepEqual([rev.actor, rev.amount, rev.subject], ['أحمد', -10, 'D — ريم']);
assert.deepEqual(audit.find((x) => x.kind === 'mkt_spend_void') && [audit.find((x) => x.kind === 'mkt_spend_void').subject, audit.find((x) => x.kind === 'mkt_spend_void').amount], ['Meta سبتمبر', 500]);
assert.deepEqual([audit[0].subject, audit[0].detail, audit[0].amount], ['مسيّر 2026-09', 'اعتماد', 1800]);
assert.equal(audit.find((x) => x.kind === 'hr_advance').actor, 'hr-01', 'an unknown account shows its id rather than nothing');
assert.ok(audit.every((x) => !x.deleted), 'every fixture event resolves');
const orphan = F.auditTrail({requests: [{operation: 'payment', actor_id: 'gm-betolla-01', result_id: 'gone', created_at: '2026-09-16T09:00:00Z', payload: {invoice_id: 'INV-9', amount: 12}},
  {operation: 'status', actor_id: 'gm-betolla-01', result_id: 'gone-order', created_at: '2026-09-16T08:00:00Z', payload: {status: 'cancelled'}}],
  orderChanges: [], orders, spend, campaigns, payroll, advances}, names);
assert.deepEqual(orphan.map((x) => [x.deleted, x.subject, x.amount]), [[true, 'سجل محذوف (فاتورة INV-9)', 12], [true, 'سجل محذوف (طلب)', null]],
  'an event whose payment or order was deleted is labelled, not shown as a raw id');

// --- Access: finance and management open every page; nobody else does.
const {isRouteAllowedForRole} = await import('../lib/auth.ts');
const PAGES = ['/finance', '/finance/receivables', '/finance/invoices', '/finance/payments', '/finance/expenses', '/finance/cash',
  '/finance/budgets', '/finance/reports', '/finance/audit', '/api/finance/records'];
for (const path of PAGES) {
  for (const role of ['finance', 'admin', 'general_manager']) assert.equal(isRouteAllowedForRole(role, path), true, `${role} opens ${path}`);
  for (const role of ['sales_manager', 'sales_rep', 'marketing_manager', 'marketing', 'hr_operations', 'driver_manager', 'driver'])
    assert.equal(isRouteAllowedForRole(role, path), false, `${role} does not open ${path}`);
}
const sidebar = await readFile(new URL('components/layout/sidebar.tsx', root), 'utf8');
const nav = await readFile(new URL('components/finance/finance-nav.tsx', root), 'utf8');
for (const path of PAGES.slice(0, 9)) {
  assert.ok(sidebar.includes(`href: "${path}"`), 'the sidebar lists ' + path);
  assert.ok(nav.includes(`href: "${path}"`), 'the page strip lists ' + path);
}
const route = await readFile(new URL('app/api/finance/records/route.ts', root), 'utf8');
assert.ok(!/\.(insert|update|upsert|delete)\(/.test(route) && !/export async function (POST|PATCH|PUT|DELETE)/.test(route), 'the records API only reads');

console.log('PASS test_finance_pages (receivables per customer by phone agree with the invoices desk and are aged; the payments ledger names who recorded each payment or the driver, nets reversals and flags transfers without a reference; expenses list voided marketing spend without counting it, payroll by month with unpaid runs, active advances; budgets flag overspend and spend with no budget; P&L costs goods from the catalogue with packages through their bottles and reports lines without a cost; cash flow counts only paid payroll; the audit trail keeps money events only; all nine pages open to finance and management only and the API only reads)');
