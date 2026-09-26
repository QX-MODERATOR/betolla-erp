// Turns a pasted list or a spreadsheet (almost always Arabic) into {name, phone} contacts for
// "إرسال أرقام للمندوب" on /sales. Pure: the modal and /api/customers/assign both use it, so the
// phone the admin previews is exactly the phone the server stores.

export type ContactStatus = "ok" | "foreign" | "invalid" | "duplicate";
export interface ParsedContact { name: string; phone: string; raw: string; status: ContactStatus; row: number }
export interface SheetGuess { headerRow: number; nameCol: number; phoneCol: number; headers: string[] }

export const MAX_BATCH = 2000;

// Arabic-Indic (٠-٩) and Persian (۰-۹) digits, which Arabic keyboards and phones type.
const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));

// Jordanian numbers in every shape they arrive in: 0791234567, 791234567 (Excel dropped the zero),
// +962 79 123 4567, 00962791234567, ٠٧٩١٢٣٤٥٦٧. Anything else with 7–15 digits is kept as-is
// (a Gulf or European number is still a customer) and flagged "foreign" so the admin sees it.
export function normalizePhone(raw: unknown): { phone: string; status: "ok" | "foreign" | "invalid" } {
  const text = toLatinDigits(String(raw ?? "")).trim();
  const plus = text.startsWith("+");
  let digits = text.replace(/\D/g, "");
  if (!digits) return { phone: "", status: "invalid" };
  if (digits.startsWith("00962")) digits = "0" + digits.slice(5);
  else if (digits.startsWith("962") && digits.length === 12) digits = "0" + digits.slice(3);
  else if (/^7[789]\d{7}$/.test(digits)) digits = "0" + digits;
  if (/^07[789]\d{7}$/.test(digits)) return { phone: digits, status: "ok" };
  if (digits.length >= 7 && digits.length <= 15) return { phone: (plus ? "+" : "") + digits, status: "foreign" };
  return { phone: digits, status: "invalid" };
}

const cell = (v: unknown) => (v === null || v === undefined ? "" : String(v)).replace(/\s+/g, " ").trim();
const looksLikePhone = (v: unknown) => normalizePhone(v).status !== "invalid" && toLatinDigits(cell(v)).replace(/[\d\s+\-()]/g, "").length <= 2;
const hasLetters = (v: string) => /[A-Za-z؀-ۿ]/.test(v);

// Header words. "الرقم" alone is the row number in our own sheets (MD&ZAID), so a phone header has
// to say which number it is; "اسم الصنف" and "المندوب" are names too, but not the customer's.
const PHONE_HEADER = /(هاتف|تلفون|تليفون|موبايل|جوال|واتس|رقم ?(ال)?(هاتف|جوال|موبايل|تواصل|الزبون|العميل|التلفون)|phone|mobile|tel\b|whats)/i;
const NAME_HEADER = /(الاسم|اسم|name|الزبون|الزبونة|العميل|العميلة|customer)/i;
const NOT_CUSTOMER_NAME = /(صنف|منتج|مندوب|موظف|نوع|تصنيف|مصدر|حالة|product|item|rep|agent|sales|type|source|class|status)/i;
// Best first: "اسم الزبون", then any "اسم"/name, then a bare "الزبون"/"العميل".
const nameRank = (v: string) => (/(اسم|name)/i.test(v) ? 2 : 0) + (/(زبون|عميل|customer)/i.test(v) ? 1 : 0);

// Finds the header row and the name/phone columns. Headers win when they exist; otherwise (a bare
// list with no titles) the phone column is the one most full of phone numbers and the name column
// the one most full of words.
export function guessColumns(rows: unknown[][]): SheetGuess {
  const width = Math.max(0, ...rows.slice(0, 200).map((r) => r.length));
  let headerRow = -1, nameCol = -1, phoneCol = -1;
  for (let r = 0; r < Math.min(rows.length, 15) && headerRow < 0; r++) {
    const row = rows[r].map(cell);
    const p = row.findIndex((v) => v && v.length <= 40 && PHONE_HEADER.test(v) && !looksLikePhone(v));
    const nameCandidates = row.map((v, i) => ({ v, i })).filter(({ v }) => v && v.length <= 40 && NAME_HEADER.test(v) && !NOT_CUSTOMER_NAME.test(v) && !looksLikePhone(v));
    const n = nameCandidates.sort((a, b) => nameRank(b.v) - nameRank(a.v))[0]?.i ?? -1;
    if (p >= 0 || (n >= 0 && row.filter(Boolean).length >= 2)) { headerRow = r; phoneCol = p; nameCol = n; }
  }
  const body = rows.slice(headerRow + 1, headerRow + 301);
  const score = (col: number, test: (v: string) => boolean) => body.filter((r) => test(cell(r[col]))).length;
  // A header that points at a column with no phone numbers under it is ignored.
  if (phoneCol < 0 || score(phoneCol, looksLikePhone) < Math.max(1, body.length * 0.3)) {
    let best = -1, bestScore = 0;
    for (let c = 0; c < width; c++) { const s = score(c, looksLikePhone); if (s > bestScore) { best = c; bestScore = s; } }
    phoneCol = best;
  }
  if (nameCol < 0 || nameCol === phoneCol) {
    let best = -1, bestScore = 0;
    for (let c = 0; c < width; c++) {
      if (c === phoneCol) continue;
      const s = score(c, (v) => hasLetters(v) && !looksLikePhone(v) && v.length <= 60);
      if (s > bestScore) { best = c; bestScore = s; }
    }
    nameCol = best;
  }
  const headers = Array.from({ length: width }, (_, c) => (headerRow >= 0 ? cell(rows[headerRow][c]) : "") || `عمود ${c + 1}`);
  return { headerRow, nameCol, phoneCol, headers };
}

// One contact per row that has a phone. The first time a number appears wins; later copies are
// kept in the list (so the admin sees them) but marked duplicate and never sent.
export function extractContacts(rows: unknown[][], guess: Pick<SheetGuess, "headerRow" | "nameCol" | "phoneCol">): ParsedContact[] {
  const out: ParsedContact[] = [], seen = new Set<string>();
  if (guess.phoneCol < 0) return out;
  rows.forEach((r, i) => {
    if (i <= guess.headerRow) return;
    const rawPhone = cell(r[guess.phoneCol]);
    if (!rawPhone) return;
    const name = guess.nameCol >= 0 ? cell(r[guess.nameCol]).slice(0, 200) : "";
    const { phone, status } = normalizePhone(rawPhone);
    if (status === "invalid" && !name && !/\d{4}/.test(toLatinDigits(rawPhone))) return; // stray text, not a contact
    const dup = status !== "invalid" && seen.has(phone);
    if (status !== "invalid") seen.add(phone);
    out.push({ name, phone: phone || rawPhone, raw: rawPhone, status: dup ? "duplicate" : status, row: i + 1 });
  });
  return out;
}

// Pasted text. Copied Excel cells arrive tab-separated and go through the sheet logic; a WhatsApp
// or notes list ("سارة 0791234567", "0791234567 - ام محمد") is read line by line: the number is
// the phone, whatever is left is the name.
const PHONE_IN_TEXT = /(?:\+|00)?[\d٠-٩۰-۹][\d٠-٩۰-۹ \-()]{2,}[\d٠-٩۰-۹]/;
export function parsePasted(text: string): { contacts: ParsedContact[]; guess: SheetGuess | null; rows: unknown[][] } {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.some((l) => l.includes("\t"))) {
    const rows = lines.map((l) => l.split("\t"));
    const guess = guessColumns(rows);
    return { contacts: extractContacts(rows, guess), guess, rows };
  }
  const rows: unknown[][] = lines.map((line) => {
    const m = line.match(PHONE_IN_TEXT);
    if (!m) return [line.trim(), ""];
    const name = (line.slice(0, m.index) + " " + line.slice((m.index ?? 0) + m[0].length))
      .replace(/[-–—:|،,؛;]+/g, " ").replace(/\s+/g, " ").trim();
    return [name, m[0]];
  });
  const guess = { headerRow: -1, nameCol: 0, phoneCol: 1 };
  return { contacts: extractContacts(rows, guess), guess: null, rows };
}

export const sendable = (c: ParsedContact) => c.status === "ok" || c.status === "foreign";
