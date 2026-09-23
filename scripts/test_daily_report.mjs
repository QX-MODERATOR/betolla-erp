import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';

// The daily report (lib/daily-report.ts) and its Google Sheet writer (lib/google-sheets.ts).
//
// One tab per day with every order and lead of the day and each rep's activity. The builder is
// pure; the writer is driven here through a fake Google API, so neither needs a server or an account.
const root = new URL('../', import.meta.url);
registerHooks({resolve(s, c, next) { if (s.startsWith('@/')) return next(new URL(s.slice(2) + '.ts', root).href, c); return next(s, c); }});
const {dailyReport, reportGrid, reportStatus} = await import('../lib/daily-report.ts');
const {writeDailyTab, styleRequests, SheetsError} = await import('../lib/google-sheets.ts');

const DAY = '2026-09-24';
const at = (d, hm) => `${d}T${hm}:00+03:00`;
const pay = (amount, when, extra = {}) => ({id: 'p' + Math.random(), amount, payment_method: 'cash', reference_number: '', notes: '',
  is_reversal: false, reversed_payment_id: null, received_at: when, ...extra});
const order = (o) => ({db_id: o.id, customer_phone: '079' + o.id, customer_name: 'زبونة ' + o.id, city: 'عمان', address: '', source: 'sales',
  installment_notes: null, items_summary: '1 × شامبو', items: [], invoice_number: 'INV-' + o.id, invoice_total: o.total_amount,
  invoice_subtotal: o.total_amount, invoice_discount: 0, issued_date: o.order_date, due_date: o.order_date, paid_amount: 0,
  collectible: !['draft', 'cancelled', 'returned'].includes(o.status), payments: [], payment_method: 'cash_on_delivery',
  rep_name: 'رحمة', driver: null, created_at: at(o.order_date, '10:00'), ...o});

const orders = [
  // An old order of customer C1, so today's C1 order is a repeat.
  order({id: 'OLD', customer_id: 'C1', order_date: '2026-09-01', status: 'delivered', total_amount: 13, delivered_at: at('2026-09-02', '12:00')}),
  // Today: C1 again, Phone Sales, confirmed, nothing paid.
  order({id: 'A', customer_id: 'C1', order_date: DAY, status: 'confirmed', total_amount: 26, channel: 'phone_sales'}),
  // Today: a new customer from Argan Ads, out with the driver but postponed -> "لم يستلم".
  order({id: 'B', customer_id: 'C2', order_date: DAY, status: 'shipped', total_amount: 18, rep_name: 'حنان',
    channel: 'argan_ads', campaign_name: 'Argan سبتمبر', delivery_state: 'postponed', issue: {type: 'delivery_delay', note: null, by: 'x', at: DAY}}),
  // Today: cancelled from the office, with a reason.
  order({id: 'C', customer_id: 'C3', order_date: DAY, status: 'cancelled', total_amount: 40, channel: 'organic',
    cancel: {reason: 'price', note: 'وجدت أرخص', by: 'mgr', at: at(DAY, '13:00')}, cancelled_at: at(DAY, '13:00')}),
  // Yesterday's order delivered today and paid today: shows up for the delivery and the money.
  order({id: 'D', customer_id: 'C4', order_date: '2026-09-23', status: 'delivered', total_amount: 30, paid_amount: 30,
    delivered_at: at(DAY, '15:00'), payments: [pay(30, at(DAY, '15:00'))]}),
  // An older order returned today with the driver's reason.
  order({id: 'E', customer_id: 'C5', order_date: '2026-09-20', status: 'returned', total_amount: 25,
    return_reason: 'رفض الاستلام', delivery_completed_at: at(DAY, '16:00')}),
  // Late last night (Amman) — belongs to yesterday, not today.
  order({id: 'F', customer_id: 'C6', order_date: '2026-09-23', status: 'confirmed', total_amount: 99, created_at: at('2026-09-23', '23:59')}),
];
const leads = [
  {id: 'L1', name: 'ليلى', phone: '0791', rep_name_raw: 'رحمة', lead_source: 'social_media', created_at: at(DAY, '09:00')},
  {id: 'L2', name: 'سما', phone: '0792', rep_name_raw: 'رحمة', lead_source: 'sales', created_at: at('2026-09-10', '09:00'), assigned_today: true},
  {id: 'L3', name: 'هند', phone: '0793', rep_name_raw: 'حنان', lead_source: 'whatsapp', created_at: at(DAY, '11:00')},
];
const calls = [
  {customer_id: 'L1', rep_name: 'رحمة', outcome: 'no_answer', notes: null, called_at: at(DAY, '10:00')},
  {customer_id: 'L1', rep_name: 'رحمة', outcome: 'answered', notes: null, called_at: at(DAY, '12:00')},
  {customer_id: 'L2', rep_name: 'رحمة', outcome: 'busy', notes: null, called_at: at(DAY, '10:30')},
  {customer_id: 'L3', rep_name: 'حنان', outcome: 'not_interested', notes: 'السعر مرتفع', called_at: at(DAY, '11:30')},
  {customer_id: 'L3', rep_name: 'حنان', outcome: 'answered', notes: null, called_at: at('2026-09-23', '23:30')}, // yesterday
];
const r = dailyReport({orders, leads, calls, campaigns: {L1: 'Plasma Meta'}}, DAY);
const section = (title) => r.sections.find((s) => s.title === title);
const col = (s, name) => s.header.indexOf(name);

// --- Orders of the day: taken, delivered, returned or cancelled today — nothing from yesterday night.
const O = section('الطلبات');
const byId = Object.fromEntries(O.rows.map((row) => [row[0], row]));
assert.deepEqual(Object.keys(byId).sort(), ['A', 'B', 'C', 'D', 'E']);
assert.equal(byId.A[col(O, 'New / Repeat')], 'Repeat Customer');
assert.equal(byId.B[col(O, 'New / Repeat')], 'New Customer');
assert.equal(byId.A[col(O, 'مصدر العميل')], 'Phone Sales');
assert.equal(byId.B[col(O, 'الحملة الإعلانية')], 'Argan سبتمبر');
assert.equal(byId.B[col(O, 'حالة الطلب')], 'لم يستلم', 'out with the driver but postponed');
assert.equal(byId.B[col(O, 'مشكلة تشغيلية')], 'تأخير توصيل');
assert.equal(byId.C[col(O, 'سبب الإلغاء / الإرجاع')], 'السعر — وجدت أرخص');
assert.equal(byId.E[col(O, 'سبب الإلغاء / الإرجاع')], 'إرجاع: رفض الاستلام');
assert.equal(byId.D[col(O, 'حدث اليوم')], 'تسليم');
assert.equal(byId.D[col(O, 'المحصّل فعلياً')], 30);
assert.equal(byId.A[col(O, 'ذمم / غير محصل')], 26);
assert.equal(byId.A[col(O, 'مصدر العميل')] && byId.D[col(O, 'مصدر العميل')], 'غير محدد', 'orders before the field say so');
assert.equal(reportStatus(orders[1]), 'جديد');

// --- Leads: new today and handed over today, with what happened on the phone today.
const L = section('الـ Leads');
const lead = Object.fromEntries(L.rows.map((row) => [row[0], row]));
assert.equal(L.rows.length, 3);
assert.equal(lead['0791'][col(L, 'الحملة')], 'Plasma Meta');
assert.equal(lead['0791'][col(L, 'آخر نتيجة اتصال')], 'رد');
assert.equal(lead['0792'][col(L, 'النوع')], 'تحويل اليوم');
assert.equal(lead['0793'][col(L, 'سبب عدم الشراء')], 'السعر مرتفع');

// --- Per rep.
const R = section('حسب موظفة المبيعات');
const rep = Object.fromEntries(R.rows.map((row) => [row[0], row]));
const v = (name, h) => rep[name][col(R, h)];
assert.equal(v('رحمة', 'Leads دخلت'), 2);
assert.equal(v('رحمة', 'عملاء تم التواصل معهم'), 2);
assert.equal(v('رحمة', 'منهم ردّوا'), 1);
assert.equal(v('رحمة', 'لم يردوا'), 1, 'L2 only got busy; L1 answered on the second try');
assert.equal(v('رحمة', 'عدد المكالمات'), 3);
assert.equal(v('رحمة', 'مكالمات مجابة'), 1);
assert.equal(v('رحمة', 'طلبات أغلقتها'), 1, 'A; the cancelled C does not count as closed');
assert.equal(v('رحمة', 'Phone Sales'), 1);
assert.equal(v('رحمة', 'قيمة Phone Sales'), 26);
assert.equal(v('رحمة', 'ملغاة/مرفوضة'), 2, 'C cancelled today, E returned today');
assert.equal(v('حنان', 'عدد المكالمات'), 1, "yesterday's call is not today's");

// --- Totals.
const T = Object.fromEntries(section('ملخص اليوم').rows.map((row) => [row[0], row]));
assert.deepEqual(T['طلبات جديدة اليوم'].slice(1), [2, 44]);
assert.deepEqual(T['تم تسليمها اليوم'].slice(1), [1, 30]);
assert.deepEqual(T['مرتجعات اليوم'].slice(1), [1, 25]);
assert.deepEqual(T['ملغاة اليوم'].slice(1), [1, 40]);
assert.deepEqual(T['المبلغ المحصّل اليوم (صافي)'].slice(1), [1, 30]);
assert.deepEqual(T['مشكلة تشغيلية: تأخير توصيل'].slice(1), [1, '']);

// --- A source that failed says so.
const partial = dailyReport({orders, leads: null, calls: null, campaigns: null}, DAY);
assert.ok(partial.sections.find((s) => s.title === 'الـ Leads').note);

// --- The layout: banner, then each section as title band, header, rows, and totals where they add up.
const grid = reportGrid(r, '24/09/2026, 08:00');
assert.equal(grid.rows[0][0], 'التقرير اليومي — بيتولا كوزمتكس');
assert.ok(String(grid.rows[1][0]).includes(DAY));
assert.equal(grid.blocks.length, 4);
for (const b of grid.blocks) {
  assert.equal(grid.rows[b.title][0], r.sections[grid.blocks.indexOf(b)].title);
  assert.ok(b.header > b.title && b.first === b.header + 1 && b.last >= b.first);
}
const ordersBlock = grid.blocks[2], repsBlock = grid.blocks[1];
const totalsRow = grid.rows[ordersBlock.totals];
assert.equal(totalsRow[0], 'الإجمالي');
assert.equal(totalsRow[O.header.indexOf('قيمة الطلب')], 26 + 18 + 40 + 30 + 25, 'order values add up');
assert.equal(totalsRow[O.header.indexOf('المحصّل فعلياً')], 30);
assert.equal(totalsRow[O.header.indexOf('حالة الطلب')], '', 'text columns are not totalled');
assert.equal(grid.rows[repsBlock.totals][R.header.indexOf('عدد المكالمات')], 4, 'rep counts add up');
assert.equal(grid.blocks[0].totals, undefined, 'the summary has no totals line');
assert.deepEqual(ordersBlock.money.map((c) => O.header[c]), ['قيمة الطلب', 'المحصّل فعلياً', 'ذمم / غير محصل']);
assert.equal(O.header[ordersBlock.status], 'حالة الطلب');
assert.equal(typeof byId.A[col(O, 'قيمة الطلب')], 'number', 'money goes to the sheet as numbers');

// --- The house style: banner, bands, header tint, zebra rows, money format, coloured status, totals.
const style = styleRequests(9, grid);
const kinds = (k) => style.filter((q) => q[k]);
assert.ok(kinds('updateSheetProperties').some((q) => q.updateSheetProperties.properties.gridProperties.hideGridlines === true
  && q.updateSheetProperties.properties.gridProperties.frozenRowCount === 2), 'no gridlines; the banner stays in view');
const merges = kinds('mergeCells').map((q) => q.mergeCells.range.startRowIndex);
for (const row of [0, 1, ...grid.blocks.map((b) => b.title)]) assert.ok(merges.includes(row), 'merged row ' + row);
const bg = (row) => style.find((q) => q.repeatCell && q.repeatCell.range.startRowIndex === row && q.repeatCell.cell.userEnteredFormat.backgroundColor)
  ?.repeatCell.cell.userEnteredFormat;
assert.equal(bg(0).textFormat.fontSize, 16, 'a large banner title');
assert.ok(bg(ordersBlock.title).textFormat.bold && bg(ordersBlock.header).wrapStrategy === 'WRAP');
assert.equal(kinds('addBanding').length, 4, 'every table with rows is striped');
const moneyCells = style.filter((q) => q.repeatCell?.cell.userEnteredFormat.numberFormat);
assert.ok(moneyCells.every((q) => q.repeatCell.cell.userEnteredFormat.numberFormat.pattern === '#,##0.000'));
assert.ok(moneyCells.some((q) => q.repeatCell.range.startColumnIndex === ordersBlock.money[0] && q.repeatCell.range.endRowIndex === ordersBlock.totals + 1),
  'the totals line is money-formatted too');
const statusRules = kinds('addConditionalFormatRule').map((q) => q.addConditionalFormatRule.rule.booleanRule.condition.values[0].userEnteredValue);
for (const v of ['تم التسليم', 'ملغي', 'مرتجع', 'لم يستلم', 'خرج للتوصيل']) assert.ok(statusRules.includes(v), 'status colour for ' + v);
assert.ok(kinds('updateBorders').some((q) => q.updateBorders.range.startRowIndex === ordersBlock.totals && q.updateBorders.top.style === 'SOLID_MEDIUM'));
const widths = kinds('updateDimensionProperties').filter((q) => q.updateDimensionProperties.range.dimension === 'COLUMNS');
assert.equal(widths.length, grid.width);
assert.ok(widths.every((q) => q.updateDimensionProperties.properties.pixelSize >= 84 && q.updateDimensionProperties.properties.pixelSize <= 320));
// An empty section says so in one merged, muted line instead of an empty table.
const emptyGrid = reportGrid(dailyReport({orders: [], leads: [], calls: [], campaigns: {}}, DAY), 'x');
assert.ok(emptyGrid.blocks.every((b) => b.empty || b.title === emptyGrid.blocks[0].title));
assert.equal(styleRequests(1, emptyGrid).filter((q) => q.addBanding).length, 1, 'only the summary is striped when the day is empty');

// --- The Sheets writer against a fake Google API: first write, then a rerun replacing the tab.
function fakeGoogle(existingTitles) {
  const calls = [];
  const sheets = existingTitles.map((title, i) => ({properties: {sheetId: 100 + i, title}}));
  const fetcher = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({url: String(url), method: init.method || 'GET', body, auth: init.headers?.Authorization});
    const json = (x) => new Response(JSON.stringify(x), {status: 200});
    if (String(url).includes('metadata')) {
      assert.ok(String(url).includes('scopes=' + encodeURIComponent('https://www.googleapis.com/auth/spreadsheets')), 'asks for the Sheets scope');
      assert.equal(init.headers['Metadata-Flavor'], 'Google');
      return json({access_token: 'tok', expires_in: 3600});
    }
    if (String(url).includes('?fields=')) return json({sheets});
    if (String(url).endsWith(':batchUpdate')) {
      const add = body.requests.find((q) => q.addSheet);
      return json({replies: add ? [{addSheet: {properties: {sheetId: 777}}}] : []});
    }
    return json({});
  };
  return {fetcher, calls};
}
let g = fakeGoogle(['Sheet1']);
const url = await writeDailyTab('SHEET', DAY, grid, g.fetcher);
assert.equal(url, 'https://docs.google.com/spreadsheets/d/SHEET/edit#gid=777');
const batches = g.calls.filter((c) => c.url.endsWith(':batchUpdate')).map((c) => c.body.requests);
assert.equal(batches[0][0].addSheet.properties.rightToLeft, true, 'Arabic tab reads right to left');
assert.ok(batches[0][0].addSheet.properties.gridProperties.columnCount >= grid.width);
assert.deepEqual(batches[1].map((q) => Object.keys(q)[0]), ['updateSheetProperties'], 'no old tab to delete the first time');
assert.equal(batches[1][0].updateSheetProperties.properties.title, DAY);
const put = g.calls.find((c) => c.method === 'PUT');
assert.deepEqual(put.body.values, grid.rows);
assert.ok(batches[2].some((q) => q.addBanding) && batches[2].some((q) => q.mergeCells), 'the style is applied after the values');
assert.ok(g.calls.filter((c) => !c.url.includes('metadata')).every((c) => c.auth === 'Bearer tok'));
g = fakeGoogle(['Sheet1', DAY]);
await writeDailyTab('SHEET', DAY, grid, g.fetcher);
const rerun = g.calls.filter((c) => c.url.endsWith(':batchUpdate')).map((c) => c.body.requests)[1];
assert.deepEqual(rerun.map((q) => Object.keys(q)[0]), ['deleteSheet', 'updateSheetProperties'], 'a rerun replaces the day, never duplicates it');
assert.equal(rerun[0].deleteSheet.sheetId, 101);
// Not shared with the service account -> a message that says what to do.
await assert.rejects(writeDailyTab('SHEET', DAY, grid, async (u) => String(u).includes('metadata')
  ? new Response(JSON.stringify({access_token: 't'}), {status: 200}) : new Response('no', {status: 403})),
  (e) => e instanceof SheetsError && /شارك الملف/.test(e.message));

// --- Only admin and the general manager.
const {isRouteAllowedForRole} = await import('../lib/auth.ts');
for (const role of ['sales_manager', 'sales_rep', 'marketing', 'finance', 'hr_operations', 'driver_manager', 'driver'])
  assert.equal(isRouteAllowedForRole(role, '/api/reports/daily'), false, role);
const route = await readFile(new URL('app/api/reports/daily/route.ts', root), 'utf8');
assert.ok(route.includes("if(user.role!=='admin'&&user.role!=='general_manager')"), 'the route checks the role itself');
const cron = await readFile(new URL('app/api/cron/daily/route.ts', root), 'utf8');
assert.ok(cron.includes('business_task_claim') && cron.includes('shiftDate(ammanToday(), -1)'), 'the 08:00 job writes yesterday, once');

console.log('PASS test_daily_report (a day\'s tab lists orders taken, delivered, returned or cancelled that day in Amman time with channel, campaign, status incl. لم يستلم, collected, owed, new/repeat, reasons and problems; leads new or handed over that day with their calls; per rep leads, contacted, no answer, calls, answered, closed, cancelled with reasons, Phone Sales; day totals; money as numbers with totals lines; a formal style (banner, section bands, header tint, stripes, money format, coloured status, frozen title, fitted columns); the writer asks for the Sheets scope, writes RTL and replaces a rerun day; only admin and the GM, and the 08:00 job writes yesterday once)');
