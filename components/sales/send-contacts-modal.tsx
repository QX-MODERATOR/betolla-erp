"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Send, Upload, ClipboardList, FileSpreadsheet, Trash2, Loader2, ArrowRight, CalendarDays, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { secureFetch } from "@/lib/client-api";
import { saveBusiness } from "@/lib/business-client";
import { useToast } from "@/components/common/toast";
import { ASSIGNABLE_REPS } from "@/lib/reps";
import {
  guessColumns, extractContacts, parsePasted, sendable, MAX_BATCH,
  type ParsedContact, type SheetGuess,
} from "@/lib/contact-import";

// "إرسال أرقام للمندوب": management pastes a list or picks an Excel file, checks the numbers, and
// sends them to one rep's calling queue for a chosen day (POST /api/customers/assign, migration 052).
// Phone-first: a bottom sheet on phones, a dialog on wider screens; every list is cards, not a table.

type ServerRow = { phone: string; status: "new" | "existing" | "other_rep" | "same_rep"; current_rep?: string | null; existing_name?: string | null };
type Source = { kind: "paste" } | { kind: "file"; fileName: string; sheets: { name: string; rows: unknown[][] }[]; sheet: number };
type SortKey = "row" | "name" | "phone" | "status";

const LOCAL_LABEL: Record<ParsedContact["status"], string> = { ok: "صالح", foreign: "رقم غير أردني", invalid: "رقم غير صالح", duplicate: "مكرر في القائمة" };
const STATUS_ORDER: Record<string, number> = { invalid: 0, duplicate: 1, other_rep: 2, foreign: 3, existing: 4, same_rep: 5, new: 6, ok: 7 };

export function SendContactsModal({ onClose, defaultRep, today, onSent }: {
  onClose: () => void;
  defaultRep: string;
  today: string;
  onSent: (rep: string) => void;
}) {
  // Mounted only while open, so every opening starts from a clean form.
  const { showToast } = useToast();
  const [step, setStep] = useState<"source" | "review">("source");
  const [rep, setRep] = useState(ASSIGNABLE_REPS.includes(defaultRep) ? defaultRep : "");
  const [callDate, setCallDate] = useState(today);
  const [tab, setTab] = useState<"paste" | "file">("paste");
  const [pasteText, setPasteText] = useState("");
  const [source, setSource] = useState<Source | null>(null);
  const [rows, setRows] = useState<unknown[][]>([]);
  const [guess, setGuess] = useState<SheetGuess | null>(null);
  const [contacts, setContacts] = useState<ParsedContact[]>([]);
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [checkState, setCheckState] = useState<{ key: string; map?: Map<string, ServerRow>; error?: string }>({ key: "" });
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [reading, setReading] = useState(false);
  const [sending, setSending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const live = useMemo(() => contacts.filter((c) => !removed.has(c.row)), [contacts, removed]);
  const toSend = useMemo(() => live.filter(sendable), [live]);

  // The server's view of the numbers (new / with another rep / already hers), asked again whenever
  // the list, the rep or the day changes. It writes nothing. The answer is kept with the question it
  // answered, so a stale answer is never shown against a changed list.
  const checkKey = `${rep}|${callDate}|${toSend.map((c) => c.phone).join(",")}`;
  const needCheck = step === "review" && !!rep && toSend.length > 0 && toSend.length <= MAX_BATCH;
  const answered = needCheck && checkState.key === checkKey;
  const check = answered ? checkState.map ?? null : null;
  const checkError = answered ? checkState.error ?? "" : "";
  const checking = needCheck && !answered;
  useEffect(() => {
    if (!needCheck) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await secureFetch("/api/customers/assign", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rep, call_date: callDate, dry_run: true, contacts: toSend.map(({ name, phone }) => ({ name, phone })) }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.success) throw new Error(data.error || "تعذر فحص الأرقام.");
        setCheckState({ key: checkKey, map: new Map((data.rows as ServerRow[]).map((r) => [r.phone, r])) });
      } catch (e) {
        if (!cancelled) setCheckState({ key: checkKey, error: e instanceof Error ? e.message : "تعذر فحص الأرقام." });
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
    // checkKey covers rep, callDate and the phones in toSend.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needCheck, checkKey]);

  const applyRows = (next: unknown[][], g: SheetGuess | null, fromPaste?: ParsedContact[]) => {
    setRows(next); setGuess(g); setRemoved(new Set());
    setContacts(fromPaste ?? (g ? extractContacts(next, g) : []));
  };

  const readPaste = () => {
    const parsed = parsePasted(pasteText);
    setSource({ kind: "paste" });
    applyRows(parsed.rows, parsed.guess, parsed.guess ? undefined : parsed.contacts);
    if (!parsed.contacts.length) { showToast("لم أجد أي رقم هاتف في النص.", "warning"); return; }
    setStep("review");
  };

  const readFile = async (file: File) => {
    setReading(true);
    try {
      const XLSX = await import("xlsx");
      const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
      // raw: numbers stay numbers, so 962791234567 is not turned into "9.62791E+11" on the way.
      const sheets = book.SheetNames.map((name) => ({
        name, rows: XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name], { header: 1, raw: true, defval: "" }),
      }));
      // Open on the sheet with the most numbers in it.
      const counts = sheets.map((s) => extractContacts(s.rows, guessColumns(s.rows)).length);
      const best = counts.indexOf(Math.max(...counts));
      if (counts[best] === 0) { showToast("لم أجد عمود أرقام هواتف في هذا الملف.", "warning"); return; }
      setSource({ kind: "file", fileName: file.name, sheets, sheet: best });
      applyRows(sheets[best].rows, guessColumns(sheets[best].rows));
      setStep("review");
    } catch {
      showToast("تعذر قراءة الملف. استخدم ملف Excel (.xlsx أو .xls) أو CSV.", "error");
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const pickSheet = (i: number) => {
    if (source?.kind !== "file") return;
    setSource({ ...source, sheet: i });
    applyRows(source.sheets[i].rows, guessColumns(source.sheets[i].rows));
  };
  const pickColumn = (which: "nameCol" | "phoneCol", col: number) => {
    if (!guess) return;
    const g = { ...guess, [which]: col };
    applyRows(rows, g);
  };

  const statusOf = (c: ParsedContact): { key: string; label: string; tone: string } => {
    if (!sendable(c)) return { key: c.status, label: LOCAL_LABEL[c.status], tone: c.status === "invalid" ? "bg-red-50 text-red-700 border-red-200" : "bg-stone-100 text-stone-500 border-stone-200" };
    const s = check?.get(c.phone);
    if (s?.status === "new") return { key: "new", label: "رقم جديد", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    if (s?.status === "existing") return { key: "existing", label: "عميل سابق بدون مندوب", tone: "bg-sky-50 text-sky-700 border-sky-200" };
    if (s?.status === "other_rep") return { key: "other_rep", label: `ينتقل من ${s.current_rep}`, tone: "bg-amber-50 text-amber-800 border-amber-200" };
    if (s?.status === "same_rep") return { key: "same_rep", label: "عند نفس المندوب", tone: "bg-stone-100 text-stone-600 border-stone-200" };
    return c.status === "foreign"
      ? { key: "foreign", label: LOCAL_LABEL.foreign, tone: "bg-violet-50 text-violet-700 border-violet-200" }
      : { key: "ok", label: "صالح", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  };

  const sorted = [...live].sort((a, b) => {
    if (sortKey === "name") return (a.name || "￿").localeCompare(b.name || "￿", "ar") || a.row - b.row;
    if (sortKey === "phone") return a.phone.localeCompare(b.phone) || a.row - b.row;
    if (sortKey === "status") return (STATUS_ORDER[statusOf(a).key] ?? 9) - (STATUS_ORDER[statusOf(b).key] ?? 9) || a.row - b.row;
    return a.row - b.row;
  });

  const counts = {
    new: toSend.filter((c) => check?.get(c.phone)?.status === "new").length,
    moved: toSend.filter((c) => check?.get(c.phone)?.status === "other_rep").length,
    problems: live.length - toSend.length,
  };

  const send = async () => {
    if (!rep || !toSend.length || sending) return;
    if (toSend.length > MAX_BATCH) { showToast(`الحد الأقصى ${MAX_BATCH} رقم في المرة الواحدة.`, "warning"); return; }
    setSending(true);
    try {
      const result = await saveBusiness<{ total: number; created: number; reassigned: number; unchanged: number }>(
        "contact-batch", "/api/customers/assign",
        { rep, call_date: callDate, contacts: toSend.map(({ name, phone }) => ({ name, phone })) });
      showToast(`تم إرسال ${result.total} رقم إلى ${rep} (جديد ${result.created}، منقول ${result.reassigned}).`, "success", 6000);
      onSent(rep);
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "تعذر إرسال الأرقام.", "error", 6000);
    } finally {
      setSending(false);
    }
  };

  const headerOptions = guess?.headers ?? [];

  return (
    <div data-dialog="" className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4 animate-backdropFadeIn">
      <div role="dialog" aria-modal="true" aria-label="إرسال أرقام للمندوب"
        className="bg-white w-full sm:max-w-3xl max-h-[94dvh] sm:max-h-[90dvh] rounded-t-3xl sm:rounded-3xl shadow-2xl border border-stone-200 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 border-b border-stone-100 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {step === "review" && (
              <button type="button" onClick={() => setStep("source")} aria-label="رجوع"
                className="w-8 h-8 rounded-xl bg-stone-100 hover:bg-stone-200 flex items-center justify-center shrink-0 cursor-pointer">
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            <div className="min-w-0">
              <h3 className="font-bold text-stone-900 text-sm sm:text-base truncate">إرسال أرقام للمندوب</h3>
              <p className="text-[11px] text-stone-500 truncate">
                {step === "source" ? "اختر المندوب ويوم الاتصال، ثم الصق الأرقام أو ارفع ملف Excel" : `${rep || "—"} · ${callDate}`}
              </p>
            </div>
          </div>
          <button type="button" data-dialog-close onClick={onClose} aria-label="إغلاق"
            className="w-8 h-8 rounded-xl bg-stone-100 hover:bg-stone-200 flex items-center justify-center shrink-0 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 space-y-4">
          {/* Rep + date: shown on both steps so a change of mind costs one tap */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-stone-700">المندوب</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {ASSIGNABLE_REPS.map((r) => (
                <button key={r} type="button" onClick={() => setRep(r)}
                  className={cn("min-w-0 px-2 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer",
                    rep === r ? "bg-amber-500 border-amber-500 text-stone-950 shadow-xs" : "bg-stone-50 border-stone-200 text-stone-700 hover:border-amber-400")}>
                  {rep === r && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                  <span className="truncate">{r}</span>
                </button>
              ))}
            </div>
            <label className="flex flex-wrap items-center gap-2 text-xs font-bold text-stone-700 pt-1">
              <CalendarDays className="w-4 h-4 text-amber-600" />
              <span>يوم الاتصال</span>
              <input type="date" value={callDate} min={today} onChange={(e) => setCallDate(e.target.value || today)}
                className="px-3 py-1.5 rounded-xl border border-stone-200 bg-white text-xs font-mono focus:outline-none focus:border-amber-500" />
            </label>
          </div>

          {step === "source" ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 p-1 bg-stone-100 rounded-2xl">
                {([["paste", "لصق الأرقام", ClipboardList], ["file", "ملف Excel", FileSpreadsheet]] as const).map(([key, label, Icon]) => (
                  <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
                    className={cn("py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer",
                      tab === key ? "bg-white text-stone-900 shadow-xs" : "text-stone-500 hover:text-stone-800")}>
                    <Icon className="w-4 h-4" /><span>{label}</span>
                  </button>
                ))}
              </div>

              {tab === "paste" ? (
                <div className="space-y-2">
                  <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={9} dir="rtl"
                    placeholder={"كل سطر: اسم ورقم، بأي ترتيب\nسارة احمد 0791234567\n0781112223 - ام محمد\nأو انسخ عمودَي الاسم والرقم من Excel والصقهما هنا"}
                    className="w-full rounded-2xl border border-stone-200 bg-stone-50 p-3 text-sm leading-relaxed focus:outline-none focus:border-amber-500 focus:bg-white resize-y" />
                  <button type="button" onClick={readPaste} disabled={!pasteText.trim()}
                    className="w-full py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 disabled:opacity-40 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer">
                    <ClipboardList className="w-4 h-4 text-amber-400" /><span>قراءة الأرقام</span>
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => fileInput.current?.click()} disabled={reading}
                  className="w-full py-10 px-4 rounded-2xl border-2 border-dashed border-stone-300 hover:border-amber-500 bg-stone-50 hover:bg-amber-50/40 flex flex-col items-center justify-center gap-2 text-center transition cursor-pointer">
                  {reading ? <Loader2 className="w-7 h-7 text-amber-600 animate-spin" /> : <Upload className="w-7 h-7 text-amber-600" />}
                  <span className="text-sm font-bold text-stone-800">{reading ? "جاري قراءة الملف..." : "اختر ملف Excel أو CSV"}</span>
                  <span className="text-[11px] text-stone-500 max-w-xs">يُكتشف عمود الاسم وعمود رقم الهاتف تلقائيًا، ويمكنك تغييرهما بعد القراءة</span>
                </button>
              )}
              <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); }} />
            </div>
          ) : (
            <div className="space-y-3">
              {/* Where the numbers came from, and which columns were read */}
              {source?.kind === "file" && (
                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3 space-y-2">
                  <p className="text-xs font-bold text-stone-800 flex items-center gap-1.5 min-w-0">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" /><span className="truncate" dir="auto">{source.fileName}</span>
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {source.sheets.length > 1 && (
                      <label className="text-[11px] text-stone-600 space-y-1 min-w-0">
                        <span className="block font-bold">الورقة</span>
                        <select value={source.sheet} onChange={(e) => pickSheet(Number(e.target.value))}
                          className="w-full px-2 py-1.5 rounded-lg border border-stone-200 bg-white text-xs">
                          {source.sheets.map((s, i) => <option key={s.name + i} value={i}>{s.name}</option>)}
                        </select>
                      </label>
                    )}
                    {guess && ([["nameCol", "عمود الاسم"], ["phoneCol", "عمود رقم الهاتف"]] as const).map(([key, label]) => (
                      <label key={key} className="text-[11px] text-stone-600 space-y-1 min-w-0">
                        <span className="block font-bold">{label}</span>
                        <select value={guess[key]} onChange={(e) => pickColumn(key, Number(e.target.value))}
                          className="w-full px-2 py-1.5 rounded-lg border border-stone-200 bg-white text-xs">
                          {key === "nameCol" && <option value={-1}>بدون اسم</option>}
                          {headerOptions.map((h, i) => <option key={i} value={i}>{h}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {source?.kind === "paste" && guess && (
                <div className="grid grid-cols-2 gap-2">
                  {([["nameCol", "عمود الاسم"], ["phoneCol", "عمود رقم الهاتف"]] as const).map(([key, label]) => (
                    <label key={key} className="text-[11px] text-stone-600 space-y-1 min-w-0">
                      <span className="block font-bold">{label}</span>
                      <select value={guess[key]} onChange={(e) => pickColumn(key, Number(e.target.value))}
                        className="w-full px-2 py-1.5 rounded-lg border border-stone-200 bg-white text-xs">
                        {key === "nameCol" && <option value={-1}>بدون اسم</option>}
                        {headerOptions.map((h, i) => <option key={i} value={i}>{h}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              )}

              {/* Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: "سيتم إرسالها", value: toSend.length, tone: "text-stone-900" },
                  { label: "أرقام جديدة", value: check ? counts.new : "…", tone: "text-emerald-700" },
                  { label: "تنتقل من مندوب آخر", value: check ? counts.moved : "…", tone: "text-amber-700" },
                  { label: "مكرر / غير صالح", value: counts.problems, tone: "text-red-700" },
                ].map((s) => (
                  <div key={s.label} className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 min-w-0">
                    <p className="text-[10px] text-stone-500 truncate">{s.label}</p>
                    <p className={cn("text-lg font-black font-mono", s.tone)}>{s.value}</p>
                  </div>
                ))}
              </div>
              {checking && <p className="text-[11px] text-stone-500 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />جاري مطابقة الأرقام مع العملاء المسجلين...</p>}
              {checkError && <p className="text-[11px] text-red-700">{checkError}</p>}
              {toSend.length > MAX_BATCH && <p className="text-[11px] text-red-700">الحد الأقصى {MAX_BATCH} رقم في المرة الواحدة؛ احذف بعض الأرقام أو قسّم الملف.</p>}

              {/* Sort */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold text-stone-600">ترتيب:</span>
                {([["status", "الحالة"], ["name", "الاسم"], ["phone", "الرقم"], ["row", "ترتيب الملف"]] as const).map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setSortKey(key)}
                    className={cn("px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer",
                      sortKey === key ? "bg-stone-900 text-white border-stone-900" : "bg-white text-stone-600 border-stone-200 hover:border-stone-400")}>
                    {label}
                  </button>
                ))}
              </div>

              {/* The list — cards on every width; two columns on wide screens */}
              <ul className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                {sorted.map((c) => {
                  const st = statusOf(c);
                  const existingName = check?.get(c.phone)?.existing_name;
                  return (
                    <li key={c.row} className={cn("rounded-2xl border p-3 flex items-start gap-3 min-w-0",
                      sendable(c) ? "border-stone-200 bg-white" : "border-dashed border-stone-200 bg-stone-50/60 opacity-80")}>
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-sm font-bold text-stone-900 break-words">{c.name || <span className="text-stone-400 font-medium">بدون اسم</span>}</p>
                        {existingName && existingName !== c.name && (
                          <p className="text-[10px] text-stone-500 break-words">مسجل باسم: {existingName}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-amber-900 bg-amber-50 px-1.5 py-0.5 rounded-md" dir="ltr">{c.phone}</span>
                          <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-md border", st.tone)}>{st.label}</span>
                        </div>
                      </div>
                      <button type="button" onClick={() => setRemoved((prev) => new Set(prev).add(c.row))} aria-label={`حذف ${c.name || c.phone}`}
                        className="w-8 h-8 rounded-xl text-stone-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center shrink-0 cursor-pointer">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              {!live.length && <p className="py-8 text-center text-xs text-stone-500">لا توجد أرقام في القائمة.</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        {step === "review" && (
          <div className="shrink-0 border-t border-stone-100 px-4 sm:px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 bg-white">
            <p className="text-[11px] text-stone-500 text-center sm:text-start">
              {rep ? `ستظهر الأرقام في قائمة اتصالات ${rep} بتاريخ ${callDate}` : "اختر المندوب أولًا"}
            </p>
            <button type="button" onClick={send} disabled={!rep || !toSend.length || toSend.length > MAX_BATCH || sending}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-stone-950 text-sm font-black flex items-center justify-center gap-2 cursor-pointer shadow-xs">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span>إرسال {toSend.length} رقم{rep ? ` إلى ${rep}` : ""}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
