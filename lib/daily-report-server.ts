// Server-only: gathers one day's data and publishes the daily report tab (lib/daily-report.ts builds
// the rows, lib/google-sheets.ts writes them). Used by /api/reports/daily and the 08:00 cron.
import {businessRpc, businessDb} from '@/lib/business-server';
import {ammanDate, shiftDate} from '@/lib/dates';
import {dailyReport, reportGrid, type CallRow, type LeadRow, type DailyReport} from '@/lib/daily-report';
import {writeDailyTab, SheetsError} from '@/lib/google-sheets';
import type {BusinessOrder} from '@/lib/business';

type Db = ReturnType<typeof businessDb>;
// A table read: its rows, or null if it failed (the report then says that section is unavailable).
async function rows<T>(query: PromiseLike<{data: unknown; error: unknown}>): Promise<T[] | null> {
  try { const {data, error} = await query; return error ? null : ((data ?? []) as T[]); } catch { return null; }
}

export async function gatherDailyReport(day: string): Promise<DailyReport> {
  const db: Db = businessDb();
  // A day's margin either side of the Amman day; the builder keeps exactly that day.
  const from = shiftDate(day, -1), to = shiftDate(day, 2);
  const orders = await businessRpc<BusinessOrder[]>('business_list', {p_scope: null});
  const [created, changes, calls] = await Promise.all([
    rows<LeadRow>(db.from('customers').select('id,name,phone,rep_name_raw,lead_source,created_at')
      .gte('created_at', from).lt('created_at', to)),
    rows<{customer_id: string; changes: Record<string, {from: unknown; to: unknown}>; changed_at: string}>(
      db.from('customer_changes').select('customer_id,changes,changed_at').gte('changed_at', from).lt('changed_at', to)),
    rows<CallRow>(db.from('call_logs').select('customer_id,rep_name,outcome,notes,called_at')
      .gte('called_at', from).lt('called_at', to)),
  ]);

  // Leads: created that day, plus those handed to a rep that day (customer_changes on rep_name_raw).
  let leads: LeadRow[] | null = created && created.filter((c) => ammanDate(c.created_at) === day);
  if (leads && changes) {
    const seen = new Set(leads.map((l) => l.id));
    const moved = changes.filter((c) => ammanDate(c.changed_at) === day && c.changes?.rep_name_raw && !seen.has(c.customer_id))
      .map((c) => c.customer_id);
    if (moved.length) {
      const extra = await rows<LeadRow>(db.from('customers').select('id,name,phone,rep_name_raw,lead_source,created_at')
        .in('id', [...new Set(moved)]));
      if (extra) leads = [...leads, ...extra.map((l) => ({...l, assigned_today: true}))];
    }
  }
  // The campaign each lead came from (mkt_attributions keeps the latest one per customer).
  let campaigns: Record<string, string> | null = {};
  if (leads?.length) {
    const tagged = await rows<{customer_id: string; mkt_campaigns: {name: string} | {name: string}[] | null}>(
      db.from('mkt_attributions').select('customer_id,mkt_campaigns(name)').in('customer_id', leads.map((l) => l.id)));
    campaigns = tagged && Object.fromEntries(tagged.map((t) => {
      const c = Array.isArray(t.mkt_campaigns) ? t.mkt_campaigns[0] : t.mkt_campaigns;
      return [t.customer_id, c?.name ?? ''];
    }));
  }
  return dailyReport({orders, leads, calls, campaigns}, day);
}

export interface PublishResult { day: string; url: string; counts: DailyReport['counts'] }

// Build the day's report and write its tab. Throws SheetsError when the sheet is not set up.
export async function publishDailyReport(day: string): Promise<PublishResult> {
  const sheetId = process.env.REPORT_SHEET_ID?.trim();
  if (!sheetId) throw new SheetsError('لم يُحدَّد ملف Google Sheet للتقرير (REPORT_SHEET_ID).', 503);
  const report = await gatherDailyReport(day);
  const generated = new Intl.DateTimeFormat('en-GB', {timeZone: 'Asia/Amman', dateStyle: 'short', timeStyle: 'short'}).format(new Date());
  const url = await writeDailyTab(sheetId, day, reportGrid(report, generated));
  return {day, url, counts: report.counts};
}
