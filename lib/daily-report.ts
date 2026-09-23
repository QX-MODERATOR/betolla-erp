// The daily report (Google Sheet, one tab per day): every order and lead of the day and each rep's
// activity, as management asked on 2026-09-23. Pure — /api/reports/daily and the 08:00 cron gather
// the inputs, this turns them into the sheet's rows, and lib/google-sheets.ts writes them.
//
// What counts as "the day" (Amman time) for each thing:
//   an order    is listed if it was taken that day (order_date) or was delivered, returned or
//               cancelled that day — so the day's deliveries show even for older orders;
//   a lead      is a customer created that day, or handed to a rep that day (customer_changes);
//   a call      is a call_logs row whose called_at falls on that day;
//   money in    is a payment received that day, whatever the order's date.
// Money is summed in fils (×1000) to avoid float drift.
import {ammanDate} from '@/lib/dates';
import {toInvoice, type BusinessOrder} from '@/lib/business';
import {CANCEL_REASONS, ORDER_ISSUES, channelLabel, dataSourceLabel, type CancelReason, type OrderIssue} from '@/lib/order-meta';

export interface LeadRow {
  id: string; name: string; phone: string; rep_name_raw: string | null; lead_source: string | null;
  created_at: string; assigned_today?: boolean;
}
export interface CallRow { customer_id: string; rep_name: string | null; outcome: string; notes: string | null; called_at: string }
export interface DailyInputs {
  orders: BusinessOrder[];
  leads: LeadRow[] | null;
  calls: CallRow[] | null;
  campaigns: Record<string, string> | null; // customer_id -> campaign name (mkt_attributions)
}
export type Cell = string | number;
export interface Section { title: string; header: Cell[]; rows: Cell[][]; note?: string }

const fils = (n: unknown) => Math.round((Number(n) || 0) * 1000);
const jd = (f: number) => f / 1000;
const day3 = (f: number) => jd(f).toFixed(3);

const STATUS: Record<string, string> = {
  draft: 'جديد', confirmed: 'جديد', processing: 'قيد التجهيز', shipped: 'خرج للتوصيل',
  delivered: 'تم التسليم', cancelled: 'ملغي', returned: 'مرتجع',
};
// "لم يستلم": out with the driver but postponed — the customer did not take it on the day.
export function reportStatus(o: BusinessOrder): string {
  if (o.status === 'shipped' && o.delivery_state === 'postponed') return 'لم يستلم';
  return STATUS[o.status] ?? o.status;
}
const LEAD_SOURCES: Record<string, string> = {
  sales: 'بيانات الشركة', social_media: 'سوشال ميديا', doctor: 'طبيب', google_maps: 'Google Maps', whatsapp: 'WhatsApp',
  crm_legacy: 'CRM قديم', phone: 'هاتف', commercial: 'تجاري', unverified: 'غير مؤكد', unknown: 'غير محدد',
};
const OUTCOMES: Record<string, string> = {
  answered: 'رد', no_answer: 'لم يرد', busy: 'مشغول', wrong_number: 'رقم خاطئ', not_interested: 'غير مهتم',
  callback_requested: 'طلب معاودة الاتصال', order_placed: 'تم الطلب', whatsapp_sent: 'واتساب',
};
const ANSWERED = new Set(['answered', 'order_placed', 'callback_requested', 'not_interested']);
const NO_ANSWER = new Set(['no_answer', 'busy']);

export function reasonOf(o: BusinessOrder): string {
  if (o.cancel?.reason) {
    const label = CANCEL_REASONS[o.cancel.reason as CancelReason] ?? o.cancel.reason;
    return o.cancel.note ? `${label} — ${o.cancel.note}` : label;
  }
  if (o.driver_cancel_reason) return `إلغاء السائق: ${o.driver_cancel_reason}`;
  if (o.return_reason) return `إرجاع: ${o.return_reason}`;
  return '';
}
export function issueOf(o: BusinessOrder): string {
  if (!o.issue?.type) return '';
  const label = ORDER_ISSUES[o.issue.type as OrderIssue] ?? o.issue.type;
  return o.issue.note ? `${label} — ${o.issue.note}` : label;
}
const rep = (o: BusinessOrder) => o.rep_name || '—';
const onDay = (iso: string | null | undefined, day: string) => !!iso && ammanDate(iso) === day;

export function dailyReport(input: DailyInputs, day: string) {
  const orders = input.orders;
  // A customer is repeat if an earlier order of theirs (taken before this one) was not cancelled.
  const takenBefore = (o: BusinessOrder, p: BusinessOrder) =>
    p.order_date < o.order_date || (p.order_date === o.order_date && (p.created_at ?? '') < (o.created_at ?? ''));
  const isRepeat = (o: BusinessOrder) => !!o.customer_id && orders.some((p) => p !== o && p.customer_id === o.customer_id
    && p.status !== 'cancelled' && p.status !== 'draft' && takenBefore(o, p));

  const events = (o: BusinessOrder) => [
    o.order_date === day ? 'طلب جديد' : '',
    onDay(o.delivered_at, day) ? 'تسليم' : '',
    o.status === 'returned' && onDay(o.delivery_completed_at, day) ? 'إرجاع' : '',
    o.status === 'cancelled' && onDay(o.cancelled_at, day) ? 'إلغاء' : '',
  ].filter(Boolean);
  const dayOrders = orders.filter((o) => events(o).length)
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id));

  const orderRows: Cell[][] = dayOrders.map((o) => {
    const i = toInvoice({...o, invoice_number: o.invoice_number ?? o.id});
    return [o.id, o.customer_phone, o.customer_name, o.order_date, events(o).join(' + '), rep(o),
      channelLabel(o.channel, o.channel_other) || 'غير محدد', o.campaign_name ?? '', dataSourceLabel(o.data_source), o.customer_segment ?? '',
      o.items_summary, day3(fils(o.total_amount)), reportStatus(o), day3(fils(o.paid_amount)), day3(fils(i.outstanding_amount)),
      isRepeat(o) ? 'Repeat Customer' : 'New Customer', reasonOf(o), issueOf(o)];
  });

  // --- Leads of the day, with what happened to each on the phone that day.
  const calls = (input.calls ?? []).filter((c) => onDay(c.called_at, day))
    .sort((a, b) => a.called_at.localeCompare(b.called_at));
  const callsOf = (customerId: string) => calls.filter((c) => c.customer_id === customerId);
  const leads = input.leads ?? [];
  const leadRows: Cell[][] = leads.map((l) => {
    const mine = callsOf(l.id);
    const last = mine.at(-1);
    const notBuying = mine.filter((c) => c.outcome === 'not_interested').map((c) => c.notes || 'غير مهتم').join(' / ');
    return [l.phone, l.name, l.rep_name_raw || '—', l.assigned_today ? 'تحويل اليوم' : 'جديد اليوم',
      LEAD_SOURCES[l.lead_source ?? 'unknown'] ?? (l.lead_source || 'غير محدد'), input.campaigns?.[l.id] ?? '',
      mine.length ? 'نعم' : 'لا', last ? OUTCOMES[last.outcome] ?? last.outcome : '', notBuying];
  });

  // --- Per rep.
  const reps = new Set<string>();
  for (const l of leads) if (l.rep_name_raw) reps.add(l.rep_name_raw);
  for (const c of calls) if (c.rep_name) reps.add(c.rep_name);
  for (const o of dayOrders) reps.add(rep(o));
  const repRows: Cell[][] = [...reps].sort().map((name) => {
    const theirCalls = calls.filter((c) => c.rep_name === name);
    const byCustomer = new Map<string, CallRow[]>();
    for (const c of theirCalls) byCustomer.set(c.customer_id, [...(byCustomer.get(c.customer_id) ?? []), c]);
    const reached = [...byCustomer.values()].filter((cs) => cs.some((c) => ANSWERED.has(c.outcome))).length;
    const noAnswer = [...byCustomer.values()].filter((cs) => cs.every((c) => NO_ANSWER.has(c.outcome))).length;
    const taken = dayOrders.filter((o) => rep(o) === name && o.order_date === day);
    const closed = taken.filter((o) => o.status !== 'cancelled' && o.status !== 'draft');
    const cancelled = dayOrders.filter((o) => rep(o) === name && (o.status === 'cancelled' || o.status === 'returned')
      && events(o).some((e) => e === 'إلغاء' || e === 'إرجاع' || e === 'طلب جديد'));
    const phone = closed.filter((o) => o.channel === 'phone_sales');
    return [name, leads.filter((l) => l.rep_name_raw === name).length, byCustomer.size, reached, noAnswer,
      theirCalls.length, theirCalls.filter((c) => ANSWERED.has(c.outcome)).length,
      closed.length, day3(closed.reduce((n, o) => n + fils(o.total_amount), 0)),
      cancelled.length, cancelled.map(reasonOf).filter(Boolean).join(' / '),
      phone.length, day3(phone.reduce((n, o) => n + fils(o.total_amount), 0))];
  });

  // --- The day in totals.
  const newToday = dayOrders.filter((o) => o.order_date === day && o.status !== 'cancelled');
  const delivered = dayOrders.filter((o) => onDay(o.delivered_at, day));
  const returned = dayOrders.filter((o) => o.status === 'returned' && onDay(o.delivery_completed_at, day));
  const cancelledToday = dayOrders.filter((o) => o.status === 'cancelled' && onDay(o.cancelled_at, day));
  const payments = orders.flatMap((o) => o.payments || []).filter((p) => onDay(p.received_at, day));
  const received = payments.reduce((n, p) => n + fils(p.amount), 0);
  const issues = new Map<string, number>();
  for (const o of dayOrders) if (o.issue?.type) {
    const label = ORDER_ISSUES[o.issue.type as OrderIssue] ?? o.issue.type;
    issues.set(label, (issues.get(label) ?? 0) + 1);
  }
  const phoneAll = newToday.filter((o) => o.channel === 'phone_sales');
  const totalRows: Cell[][] = [
    ['طلبات جديدة اليوم', newToday.length, day3(newToday.reduce((n, o) => n + fils(o.total_amount), 0))],
    ['منها Phone Sales', phoneAll.length, day3(phoneAll.reduce((n, o) => n + fils(o.total_amount), 0))],
    ['تم تسليمها اليوم', delivered.length, day3(delivered.reduce((n, o) => n + fils(o.total_amount), 0))],
    ['مرتجعات اليوم', returned.length, day3(returned.reduce((n, o) => n + fils(o.total_amount), 0))],
    ['ملغاة اليوم', cancelledToday.length, day3(cancelledToday.reduce((n, o) => n + fils(o.total_amount), 0))],
    ['المبلغ المحصّل اليوم (صافي)', payments.length, day3(received)],
    ['ذمم طلبات اليوم (غير محصل)', newToday.length,
      day3(newToday.reduce((n, o) => n + fils(toInvoice({...o, invoice_number: o.invoice_number ?? o.id}).outstanding_amount), 0))],
    ['Leads دخلت اليوم', leads.length, ''],
    ['مكالمات اليوم', calls.length, ''],
    ...[...issues.entries()].map(([label, n]): Cell[] => [`مشكلة تشغيلية: ${label}`, n, '']),
  ];

  const sections: Section[] = [
    {title: 'ملخص اليوم', header: ['البند', 'العدد', 'القيمة (د.أ)'], rows: totalRows},
    {title: 'حسب موظفة المبيعات', header: ['الموظفة', 'Leads دخلت', 'عملاء تم التواصل معهم', 'منهم ردّوا', 'لم يردوا',
      'عدد المكالمات', 'مكالمات مجابة', 'طلبات أغلقتها', 'قيمتها', 'ملغاة/مرفوضة', 'أسباب الإلغاء', 'Phone Sales', 'قيمة Phone Sales'],
      rows: repRows, note: input.calls === null ? 'تعذر تحميل المكالمات — أرقام المكالمات غير متاحة.' : undefined},
    {title: 'الطلبات', header: ['رقم الطلب', 'رقم العميل', 'اسم العميل', 'تاريخ الطلب', 'حدث اليوم', 'موظفة المبيعات',
      'مصدر العميل', 'الحملة الإعلانية', 'مصدر البيانات', 'B2B/B2C', 'المنتج / الباكيج', 'قيمة الطلب', 'حالة الطلب',
      'المحصّل فعلياً', 'ذمم / غير محصل', 'New / Repeat', 'سبب الإلغاء / الإرجاع', 'مشكلة تشغيلية'], rows: orderRows},
    {title: 'الـ Leads', header: ['رقم العميل', 'الاسم', 'الموظفة', 'النوع', 'مصدر العميل', 'الحملة', 'تم التواصل اليوم',
      'آخر نتيجة اتصال', 'سبب عدم الشراء'], rows: leadRows,
      note: input.leads === null ? 'تعذر تحميل الـ Leads.' : undefined},
  ];
  return {day, sections, counts: {orders: orderRows.length, leads: leadRows.length, reps: repRows.length}};
}
export type DailyReport = ReturnType<typeof dailyReport>;

// The tab as a grid: each section is a title row, its header, its rows, then a blank line.
export function reportGrid(report: DailyReport, generatedAt: string): {rows: Cell[][]; titleRows: number[]; headerRows: number[]} {
  const rows: Cell[][] = [[`التقرير اليومي — ${report.day}`], [`تم التوليد: ${generatedAt} (توقيت عمّان)`], []];
  const titleRows = [0], headerRows: number[] = [];
  for (const s of report.sections) {
    titleRows.push(rows.length); rows.push([s.title]);
    if (s.note) rows.push([s.note]);
    headerRows.push(rows.length); rows.push(s.header);
    if (s.rows.length) rows.push(...s.rows); else rows.push(['لا يوجد']);
    rows.push([]);
  }
  return {rows, titleRows, headerRows};
}
