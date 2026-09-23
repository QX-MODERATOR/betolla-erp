// Server-only: writes the daily report into a Google Sheet, one tab per day.
//
// Auth is the App Hosting runtime service account, through the metadata server, the way
// lib/push.ts does it: no key file. Sheets needs its own scope, so the token is asked for with
// scopes=spreadsheets (the metadata server on Cloud Run issues scoped tokens). The sheet must be
// shared, as Editor, with that service account, and the Sheets API enabled on the project.
//
// A rerun for the same day replaces that day's tab, so the job and the manual rebuild can run as
// often as needed without duplicates.
import type {Cell} from '@/lib/daily-report';

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const METADATA_TOKEN_URL = process.env.SHEETS_METADATA_TOKEN_URL
  || 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
const SHEETS_API = process.env.SHEETS_API_URL || 'https://sheets.googleapis.com/v4/spreadsheets';

export class SheetsError extends Error {
  status: number;
  constructor(message: string, status = 502) { super(message); this.status = status; }
}

async function token(fetcher: typeof fetch): Promise<string> {
  let res: Response;
  try {
    res = await fetcher(`${METADATA_TOKEN_URL}?scopes=${encodeURIComponent(SCOPE)}`,
      {headers: {'Metadata-Flavor': 'Google'}, signal: AbortSignal.timeout(3000)});
  } catch {
    throw new SheetsError('خدمة Google غير متاحة هنا (يعمل الربط على الخادم المنشور فقط).', 503);
  }
  if (!res.ok) throw new SheetsError('تعذر الحصول على تصريح Google Sheets.', 503);
  return (await res.json() as {access_token: string}).access_token;
}

export interface TabContent { rows: Cell[][]; titleRows: number[]; headerRows: number[] }

// Rebuild the tab `title` in spreadsheet `sheetId` with `content`. Returns the tab's link.
export async function writeDailyTab(sheetId: string, title: string, content: TabContent, fetcher: typeof fetch = fetch): Promise<string> {
  const bearer = await token(fetcher);
  const api = async (path: string, init?: RequestInit) => {
    const res = await fetcher(`${SHEETS_API}/${encodeURIComponent(sheetId)}${path}`, {...init,
      headers: {Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json'}});
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      if (res.status === 403) throw new SheetsError('لا صلاحية على ملف Google Sheet. شارك الملف (محرر) مع حساب خدمة التطبيق وفعّل Google Sheets API.', 502);
      if (res.status === 404) throw new SheetsError('ملف Google Sheet غير موجود. تحقق من REPORT_SHEET_ID.', 502);
      throw new SheetsError(`Google Sheets رفض الطلب (${res.status}). ${detail.slice(0, 200)}`, 502);
    }
    return res.json();
  };
  const batch = (requests: unknown[]) => api(':batchUpdate', {method: 'POST', body: JSON.stringify({requests})});

  // 1. Add the new tab under a temporary name, drop any old tab of that day, then take the name.
  //    (Deleting first would fail if the day's tab were the only one in the file.)
  const meta = await api('?fields=sheets.properties(sheetId,title)') as {sheets: {properties: {sheetId: number; title: string}}[]};
  const old = meta.sheets.find((s) => s.properties.title === title);
  const added = await batch([{addSheet: {properties: {title: `${title} (جديد)`, rightToLeft: true, index: 0,
    gridProperties: {rowCount: Math.max(content.rows.length + 10, 100), columnCount: 26}}}}]) as
    {replies: {addSheet: {properties: {sheetId: number}}}[]};
  const tabId = added.replies[0].addSheet.properties.sheetId;
  await batch([...(old ? [{deleteSheet: {sheetId: old.properties.sheetId}}] : []),
    {updateSheetProperties: {properties: {sheetId: tabId, title}, fields: 'title'}}]);

  // 2. The values, in one write.
  await api(`/values/${encodeURIComponent(`'${title}'!A1`)}?valueInputOption=RAW`, {method: 'PUT',
    body: JSON.stringify({range: `'${title}'!A1`, majorDimension: 'ROWS', values: content.rows})});

  // 3. Titles bold and larger, headers bold on a tint, columns sized to fit.
  const rowRange = (r: number) => ({sheetId: tabId, startRowIndex: r, endRowIndex: r + 1});
  await batch([
    ...content.titleRows.map((r) => ({repeatCell: {range: rowRange(r), fields: 'userEnteredFormat.textFormat',
      cell: {userEnteredFormat: {textFormat: {bold: true, fontSize: 12}}}}})),
    ...content.headerRows.map((r) => ({repeatCell: {range: rowRange(r), fields: 'userEnteredFormat(textFormat,backgroundColor)',
      cell: {userEnteredFormat: {textFormat: {bold: true}, backgroundColor: {red: 0.99, green: 0.93, blue: 0.8}}}}})),
    {autoResizeDimensions: {dimensions: {sheetId: tabId, dimension: 'COLUMNS', startIndex: 0, endIndex: 20}}},
  ]);
  return `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=${tabId}`;
}
