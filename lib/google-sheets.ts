// Server-only: writes the daily report into a Google Sheet, one tab per day.
//
// Auth is the App Hosting runtime service account, through the metadata server, the way
// lib/push.ts does it: no key file. Sheets needs its own scope, so the token is asked for with
// scopes=spreadsheets (the metadata server on Cloud Run issues scoped tokens). The sheet must be
// shared, as Editor, with that service account, and the Sheets API enabled on the project.
//
// A rerun for the same day replaces that day's tab, so the job and the manual rebuild can run as
// often as needed without duplicates.
import type {ReportGrid} from '@/lib/daily-report';

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

// The house style, formal and quiet: a charcoal banner, an amber band per section, warm header
// rows, zebra-striped data, money as #,##0.000, and the order status coloured by what happened.
const hex = (h: string) => ({red: parseInt(h.slice(1, 3), 16) / 255, green: parseInt(h.slice(3, 5), 16) / 255, blue: parseInt(h.slice(5, 7), 16) / 255});
const C = {
  banner: hex('#292524'), bannerText: hex('#ffffff'), subtitle: hex('#f5f5f4'), subtitleText: hex('#57534e'),
  band: hex('#b45309'), bandText: hex('#ffffff'), header: hex('#fef3c7'), headerText: hex('#78350f'),
  stripe: hex('#fafaf9'), white: hex('#ffffff'), line: hex('#e7e5e4'), frame: hex('#d6d3d1'),
  totals: hex('#f5f5f4'), totalsLine: hex('#78716c'), muted: hex('#a8a29e'), note: hex('#b91c1c'), text: hex('#1c1917'),
};
const STATUS_COLORS: Record<string, [string, string]> = {
  'تم التسليم': ['#dcfce7', '#166534'], 'ملغي': ['#fee2e2', '#991b1b'], 'مرتجع': ['#fee2e2', '#991b1b'],
  'لم يستلم': ['#ffedd5', '#9a3412'], 'خرج للتوصيل': ['#dbeafe', '#1e40af'], 'قيد التجهيز': ['#fef9c3', '#854d0e'],
  'جديد': ['#f5f5f4', '#44403c'],
};
const MONEY = {type: 'NUMBER', pattern: '#,##0.000'};

// Every formatting request for the laid-out tab (exported for the tests).
export function styleRequests(tabId: number, grid: ReportGrid): unknown[] {
  const range = (r0: number, r1: number, c0 = 0, c1 = grid.width) =>
    ({sheetId: tabId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1});
  const paint = (rng: object, format: object, fields: string) => ({repeatCell: {range: rng, cell: {userEnteredFormat: format}, fields}});
  const text = (color: object, extra: object = {}) => ({foregroundColor: color, fontFamily: 'Arial', ...extra});
  const height = (r: number, px: number) => ({updateDimensionProperties: {range: {sheetId: tabId, dimension: 'ROWS', startIndex: r, endIndex: r + 1},
    properties: {pixelSize: px}, fields: 'pixelSize'}});
  const solid = (color: object, style = 'SOLID') => ({style, color});
  const out: unknown[] = [
    // The whole tab: one font, vertically centred, no gridlines, the banner frozen.
    paint(range(0, grid.rows.length), {textFormat: text(C.text, {fontSize: 10}), verticalAlignment: 'MIDDLE'},
      'userEnteredFormat(textFormat,verticalAlignment)'),
    {updateSheetProperties: {properties: {sheetId: tabId, gridProperties: {hideGridlines: true, frozenRowCount: 2}},
      fields: 'gridProperties(hideGridlines,frozenRowCount)'}},
    // Banner and subtitle across the full width.
    {mergeCells: {range: range(0, 1), mergeType: 'MERGE_ALL'}},
    {mergeCells: {range: range(1, 2), mergeType: 'MERGE_ALL'}},
    paint(range(0, 1), {backgroundColor: C.banner, horizontalAlignment: 'CENTER', textFormat: text(C.bannerText, {bold: true, fontSize: 16})},
      'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)'),
    paint(range(1, 2), {backgroundColor: C.subtitle, horizontalAlignment: 'CENTER', textFormat: text(C.subtitleText, {fontSize: 10})},
      'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)'),
    height(0, 46), height(1, 26),
  ];
  for (const b of grid.blocks) {
    const end = (b.totals ?? b.last) + 1;
    out.push(
      // The section's title band.
      {mergeCells: {range: range(b.title, b.title + 1, 0, b.width), mergeType: 'MERGE_ALL'}},
      paint(range(b.title, b.title + 1, 0, b.width), {backgroundColor: C.band, horizontalAlignment: 'RIGHT',
        padding: {right: 10}, textFormat: text(C.bandText, {bold: true, fontSize: 12})},
        'userEnteredFormat(backgroundColor,horizontalAlignment,padding,textFormat)'),
      height(b.title, 32),
      // Header row.
      paint(range(b.header, b.header + 1, 0, b.width), {backgroundColor: C.header, horizontalAlignment: 'CENTER', wrapStrategy: 'WRAP',
        textFormat: text(C.headerText, {bold: true, fontSize: 10})}, 'userEnteredFormat(backgroundColor,horizontalAlignment,wrapStrategy,textFormat)'),
      height(b.header, 38),
      // A frame round the table and hairlines inside it.
      {updateBorders: {range: range(b.header, end, 0, b.width), top: solid(C.frame), bottom: solid(C.frame), left: solid(C.frame), right: solid(C.frame),
        innerHorizontal: solid(C.line), innerVertical: solid(C.line)}},
    );
    if (b.note !== undefined) out.push(
      {mergeCells: {range: range(b.note, b.note + 1, 0, b.width), mergeType: 'MERGE_ALL'}},
      paint(range(b.note, b.note + 1, 0, b.width), {textFormat: text(C.note, {italic: true})}, 'userEnteredFormat.textFormat'));
    if (b.empty) {
      out.push({mergeCells: {range: range(b.first, b.first + 1, 0, b.width), mergeType: 'MERGE_ALL'}},
        paint(range(b.first, b.first + 1, 0, b.width), {horizontalAlignment: 'CENTER', textFormat: text(C.muted, {italic: true})},
          'userEnteredFormat(horizontalAlignment,textFormat)'));
      continue;
    }
    out.push(
      {addBanding: {bandedRange: {range: range(b.first, b.last + 1, 0, b.width),
        rowProperties: {firstBandColor: C.white, secondBandColor: C.stripe}}}},
      paint(range(b.first, end, 0, b.width), {horizontalAlignment: 'CENTER'}, 'userEnteredFormat.horizontalAlignment'),
      ...b.wrap.map((c) => paint(range(b.first, b.last + 1, c, c + 1), {wrapStrategy: 'WRAP', horizontalAlignment: 'RIGHT'},
        'userEnteredFormat(wrapStrategy,horizontalAlignment)')),
      ...b.money.map((c) => paint(range(b.first, end, c, c + 1), {numberFormat: MONEY}, 'userEnteredFormat.numberFormat')),
    );
    // The order's status, coloured by what happened to it.
    if (b.status !== undefined) for (const [value, [bg, fg]] of Object.entries(STATUS_COLORS)) out.push({addConditionalFormatRule: {index: 0,
      rule: {ranges: [range(b.first, b.last + 1, b.status, b.status + 1)],
        booleanRule: {condition: {type: 'TEXT_EQ', values: [{userEnteredValue: value}]},
          format: {backgroundColor: hex(bg), textFormat: {foregroundColor: hex(fg), bold: true}}}}}});
    if (b.totals !== undefined) out.push(
      paint(range(b.totals, b.totals + 1, 0, b.width), {backgroundColor: C.totals, textFormat: text(C.text, {bold: true})},
        'userEnteredFormat(backgroundColor,textFormat)'),
      {updateBorders: {range: range(b.totals, b.totals + 1, 0, b.width), top: solid(C.totalsLine, 'SOLID_MEDIUM')}},
      height(b.totals, 28));
  }
  // Column widths from the content (banner and band rows aside); wrapped columns stay narrower.
  const skip = new Set([0, 1, ...grid.blocks.flatMap((b) => [b.title, ...(b.note !== undefined ? [b.note] : [])])]);
  const wrapped = new Set(grid.blocks.flatMap((b) => b.wrap));
  for (let c = 0; c < grid.width; c++) {
    let longest = 0;
    grid.rows.forEach((row, i) => { if (!skip.has(i) && row[c] !== undefined) longest = Math.max(longest, String(row[c]).length); });
    const px = Math.round(Math.min(wrapped.has(c) ? 260 : 320, Math.max(84, longest * 7.5 + 28)));
    out.push({updateDimensionProperties: {range: {sheetId: tabId, dimension: 'COLUMNS', startIndex: c, endIndex: c + 1},
      properties: {pixelSize: px}, fields: 'pixelSize'}});
  }
  return out;
}

// Rebuild the tab `title` in spreadsheet `sheetId` with `content`. Returns the tab's link.
export async function writeDailyTab(sheetId: string, title: string, content: ReportGrid, fetcher: typeof fetch = fetch): Promise<string> {
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
    gridProperties: {rowCount: Math.max(content.rows.length + 10, 100), columnCount: Math.max(content.width, 20)}}}}]) as
    {replies: {addSheet: {properties: {sheetId: number}}}[]};
  const tabId = added.replies[0].addSheet.properties.sheetId;
  await batch([...(old ? [{deleteSheet: {sheetId: old.properties.sheetId}}] : []),
    {updateSheetProperties: {properties: {sheetId: tabId, title}, fields: 'title'}}]);

  // 2. The values, in one write.
  await api(`/values/${encodeURIComponent(`'${title}'!A1`)}?valueInputOption=RAW`, {method: 'PUT',
    body: JSON.stringify({range: `'${title}'!A1`, majorDimension: 'ROWS', values: content.rows})});

  // 3. The house style (styleRequests above).
  await batch(styleRequests(tabId, content));
  return `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=${tabId}`;
}
