import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';

// المركز المالي (lib/finance-overview.ts, /api/finance/overview) and the finance manager's account.
//
// One screen that answers "how much did we sell, receive, give away and spend, who owes us, and how
// much cash is still out with drivers" for a period. Each figure is dated by its own event: an old
// order paid today is today's money, not last month's. Receivables go through toInvoice, so this
// screen and the invoices desk can never disagree about what a customer owes.
const root = new URL('../', import.meta.url);
registerHooks({resolve(s, c, next) { if (s.startsWith('@/')) return next(new URL(s.slice(2) + '.ts', root).href, c); return next(s, c); }});
const {financeOverview, financeOrdersCsv} = await import('../lib/finance-overview.ts');
const {toInvoice, financeSummary} = await import('../lib/business.ts');

const pay = (amount, method, at, extra = {}) => ({id: 'p' + Math.random(), amount, payment_method: method, reference_number: '', notes: '',
  is_reversal: false, reversed_payment_id: null, received_at: at, ...extra});
const order = (o) => ({db_id: o.id, customer_phone: '0790000000', city: 'عمان', address: '', source: 'sales', installment_notes: null,
  items_summary: '', items: [], invoice_number: 'INV-' + o.id, invoice_total: o.total_amount, invoice_subtotal: o.total_amount,
  invoice_discount: 0, issued_date: o.order_date, due_date: o.order_date, paid_amount: 0, collectible: true, payments: [],
  payment_method: 'cash_on_delivery', rep_name: 'رحمة', customer_name: 'زبونة', driver: null, ...o});

const orders = [
  // Sold in September, typed total 20 over 26 of lines (048), delivered, paid cash to the driver.
  order({id: 'A', order_date: '2026-09-05', status: 'delivered', total_amount: 20, invoice_subtotal: 26, invoice_discount: 6,
    paid_amount: 20, driver: 'علي', data_source: 'data_center', customer_segment: 'B2C',
    payments: [pay(20, 'cash', '2026-09-05T15:00:00+03:00')]}),
  // Sold in September, with a driver now, nothing paid.
  order({id: 'B', order_date: '2026-09-10', status: 'shipped', total_amount: 50, driver: 'خالد', rep_name: 'حنان', customer_name: 'صالون',
    data_source: 'social_media', customer_segment: 'B2B',
    due_date: '2026-09-01'}),
  // Cancelled in September: counts as cancelled, not as sales, owes nothing.
  order({id: 'C', order_date: '2026-09-12', status: 'cancelled', total_amount: 40, collectible: false}),
  // An August order paid in September: August sales, September money. Partly paid, one payment reversed.
  order({id: 'D', order_date: '2026-08-20', status: 'delivered', total_amount: 100, paid_amount: 30, payment_method: 'cliq', due_date: '2026-08-20',
    payments: [pay(30, 'cliq', '2026-09-02T10:00:00+03:00'), pay(10, 'cliq', '2026-09-03T10:00:00+03:00'),
      pay(-10, 'cliq', '2026-09-04T10:00:00+03:00', {is_reversal: true})]}),
  // A draft: still open, counted in sales for the period.
  order({id: 'E', order_date: '2026-09-15', status: 'draft', total_amount: 15, invoice_number: null}),
];
const input = {
  orders,
  closures: [
    {driver_name: 'علي', shift_date: '2026-09-05', is_closed: true, cash_collected: 20, counted_cash: 18, delivered_count: 1, returned_count: 0},
    {driver_name: 'خالد', shift_date: '2026-09-10', is_closed: false, cash_collected: 0, counted_cash: null, delivered_count: 0, returned_count: 0},
    {driver_name: 'علي', shift_date: '2026-08-30', is_closed: true, cash_collected: 99, counted_cash: 99, delivered_count: 3, returned_count: 0},
  ],
  spend: [{spend_date: '2026-09-03', amount: 70, voided_at: null, campaign: 'Meta سبتمبر'},
    {spend_date: '2026-09-04', amount: 500, voided_at: '2026-09-05T00:00:00Z', campaign: 'Meta سبتمبر'}],
  payroll: [{month: '2026-09', status: 'paid', paid_at: '2026-09-30T10:00:00Z', totals: {count: 5, gross: 2000, net: 1800, employer_cost: 2300, ssc_employer: 300}},
    {month: '2026-08', status: 'paid', paid_at: '2026-08-30T10:00:00Z', totals: {count: 5, gross: 1, net: 1, employer_cost: 1, ssc_employer: 0}}],
  advances: [{amount: 200, monthly_amount: 50, status: 'active', start_month: '2026-09'}],
  redemptions: [{code: 'VIP', saved: 4, redeemed_at: '2026-09-10T12:00:00Z'}, {code: 'VIP', saved: 99, redeemed_at: '2026-07-01T12:00:00Z'}],
  catalog: [
    {sku: 'X', name_ar: 'شامبو', stock: 10, cost_price: 5, price: 13, sale_price: null, is_bundle: false},
    {sku: 'Y', name_ar: 'عدسة', stock: -3, cost_price: 0, price: 25, sale_price: null, is_bundle: false},
    {sku: 'P', name_ar: 'بكج', stock: 4, cost_price: 0, price: 25, sale_price: null, is_bundle: true},
  ],
};
const f = financeOverview(input, '2026-09-01', '2026-09-30', '2026-09-23');

// --- Sales are dated by the order: A, B, E live (C cancelled, D is August).
assert.equal(f.sales.orders, 4);
assert.equal(f.sales.live_orders, 3);
assert.equal(f.sales.gross, 26 + 50 + 15);
assert.equal(f.sales.discounts, 6, 'a typed total below the lines is a discount');
assert.equal(f.sales.net, 20 + 50 + 15);
assert.deepEqual(f.sales.cancelled, {count: 1, value: 40});
assert.equal(f.sales.delivered, 20);
assert.equal(f.sales.open, 65);

// --- Money is dated by the payment: D's August order brought September money; the reversal nets out.
assert.equal(f.collections.received, 20 + 30 + 10);
assert.equal(f.collections.reversed, 10);
assert.equal(f.collections.net_received, 50);
assert.deepEqual(f.collections.by_method.map((m) => [m.key, m.value]), [['cliq', 40], ['cash', 20]]);

// --- Receivables as of today, the same reading as the invoices desk.
const desk = financeSummary(orders.filter((o) => o.invoice_number).map(toInvoice));
assert.equal(f.receivables.outstanding, desk.total_receivables_jd, 'the centre and /finance agree on what is owed');
assert.equal(f.receivables.outstanding, 50 + 70);
assert.equal(f.receivables.aging.d8_30, 50 + 0, 'B is 22 days late');
assert.equal(f.receivables.aging.d31_60, 70, 'D is 34 days late');
assert.equal(f.receivables.debtors[0].value, 70);

// --- Cash out with drivers now, and the shift counts of the period (August's shift left out).
assert.deepEqual(f.drivers.in_transit.map((d) => [d.key, d.value]), [['خالد', 50]]);
const ali = f.drivers.shifts.find((d) => d.driver === 'علي');
assert.deepEqual([ali.shifts, ali.expected, ali.counted, ali.difference], [1, 20, 18, -2]);
assert.deepEqual(f.drivers.short_shifts.map((s) => [s.driver, s.difference]), [['علي', -2]]);
assert.deepEqual(f.drivers.open_shifts, [{driver: 'خالد', date: '2026-09-10'}]);

// --- Reps, promo, expenses, stock.
assert.deepEqual(f.reps.map((r) => [r.rep, r.net]), [['حنان', 50], ['رحمة', 35]]);
assert.equal(f.promo.saved, 4, 'only the period\'s redemptions');
assert.equal(f.expenses.marketing, 70, 'voided spend is not spend');
assert.deepEqual(f.expenses.payroll.map((r) => r.month), ['2026-09']);
assert.equal(f.expenses.payroll_paid, 1800);
assert.equal(f.expenses.advances_amount, 200);
assert.equal(f.cashflow.net, 50 - 70 - 1800);
assert.equal(f.inventory.units, 10, 'packages are counted through their bottles; negative stock is not stock');
assert.equal(f.inventory.cost_value, 50);
assert.equal(f.inventory.retail_value, 130);
assert.deepEqual(f.inventory.negative.map((p) => [p.name, p.stock, p.value]), [['عدسة', -3, 75]]);

// --- مصدر البيانات and B2B/B2C: how much of the period's sales came from our own data.
assert.deepEqual(f.sources.by_source.map((x) => [x.key, x.orders, x.net]), [['social_media', 1, 50], ['data_center', 1, 20], ['unknown', 2, 15]],
  'orders before the fields existed (and the cancelled one) count as unknown; cancelled adds no sales');
assert.equal(f.sources.data_center_share, Math.round(20 / 85 * 100));
assert.deepEqual(f.sources.by_segment.map((x) => [x.key, x.net]), [['B2B', 50], ['B2C', 20], ['unknown', 15]]);
assert.equal(f.sources.b2b_share, Math.round(50 / 85 * 100));

// --- A source that failed to load says so instead of showing zero.
const partial = financeOverview({...input, closures: null, spend: null}, '2026-09-01', '2026-09-30', '2026-09-23');
assert.equal(partial.available.closures, false);
assert.equal(partial.available.spend, false);
assert.equal(partial.sales.net, f.sales.net);

// --- The export: one row per order of the period, with every money column.
const csv = financeOrdersCsv(orders, '2026-09-01', '2026-09-30');
const lines = csv.replace(/^﻿/, '').trim().split('\r\n');
assert.equal(lines.length, 1 + 4);
assert.ok(lines[1].startsWith('A,2026-09-05,رحمة') && lines[1].includes(',26.000,6.000,20.000,20.000,0.000,'));
assert.ok(lines[0].includes('مصدر البيانات,B2B/B2C') && lines[1].includes(',Data Center,B2C,'), 'the export carries both');

// --- Access and the account.
const {findAccount, isRouteAllowedForRole} = await import('../lib/auth.ts');
const ahmad = findAccount('ahmad.finance');
assert.equal(ahmad?.id, 'fin-zaid-01', 'ahmad.finance is the finance account');
assert.equal(ahmad.profile.role, 'finance');
assert.equal(ahmad.profile.name, 'أحمد (المدير المالي)');
assert.equal(findAccount('finance')?.id, 'fin-zaid-01');
assert.equal(findAccount('zaid'), null, 'the placeholder login is gone');
for (const path of ['/finance', '/api/finance/overview', '/orders', '/api/orders', '/drivers/reconcile', '/hr/payroll', '/inventory', '/analytics'])
  assert.equal(isRouteAllowedForRole('finance', path), true, 'finance opens ' + path);
for (const role of ['sales_manager', 'sales_rep', 'marketing', 'driver_manager'])
  assert.equal(isRouteAllowedForRole(role, '/api/finance/overview'), false, role + ' does not see the finance centre');
const page = await readFile(new URL('app/finance/page.tsx', root), 'utf8');
assert.ok(page.includes('<FinanceOverviewPanel'), '/finance opens on the dashboard');
const desk_ = await readFile(new URL('app/finance/invoices/page.tsx', root), 'utf8');
assert.ok(desk_.includes("loadBusiness<{invoices:BusinessInvoice[]}>('/api/finance')"), 'the invoices desk has its own page');

console.log('PASS test_finance_overview (sales dated by order, money by payment, reversals netted; a typed total shows as a discount; receivables equal the invoices desk and are aged; cash with drivers now and each shift\'s expected vs counted with shortfalls and open shifts; reps, data source and B2B/B2C shares, promo savings, marketing without voided spend, payroll of the period\'s months, advances; stock value without packages or negative stock; a failed source is flagged, not zero; CSV has every money column; ahmad.finance is the finance account and only management and finance see the centre)');
