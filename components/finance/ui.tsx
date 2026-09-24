"use client";

// The pieces every finance page is built from: the period bar, headline tiles, sections and
// labelled rows. Rows rather than wide tables, so a page reads the same on a phone.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Download, RefreshCw } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { loadBusiness } from "@/lib/business-client";
import { ammanToday, shiftDate, periodStart } from "@/lib/dates";

export const money = (n: number) => formatCurrency(n);
export const signed = (n: number) => (n > 0 ? "+" : "") + formatCurrency(n);

type Preset = "today" | "week" | "month" | "last_month" | "year" | "custom";
const PRESETS: { id: Preset; label: string }[] = [
  { id: "today", label: "اليوم" }, { id: "week", label: "هذا الأسبوع" }, { id: "month", label: "هذا الشهر" },
  { id: "last_month", label: "الشهر الماضي" }, { id: "year", label: "هذه السنة" }, { id: "custom", label: "فترة مخصصة" },
];
function presetRange(p: Preset, today: string): [string, string] {
  if (p === "today") return [today, today];
  if (p === "week") return [periodStart("week", today)!, today];
  if (p === "year") return [periodStart("year", today)!, today];
  if (p === "last_month") {
    const end = shiftDate(today.slice(0, 8) + "01", -1);
    return [end.slice(0, 8) + "01", end];
  }
  return [periodStart("month", today)!, today];
}

// Loads a finance endpoint and reloads when the URL changes (a new period, say).
export function useFinance<T>(url: string | null, fallbackError = "تعذر تحميل البيانات.") {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try { setData(await loadBusiness<T>(url)); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : fallbackError); }
    finally { setLoading(false); }
  }, [url, fallbackError]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  return { data, loading, error, reload: load };
}

// The period state for a page: [from, to] and the bar that changes them.
export function usePeriod(initial: Preset = "month") {
  const today = ammanToday();
  const [preset, setPreset] = useState<Preset>(initial);
  const [range, setRange] = useState<[string, string]>(() => presetRange(initial, today));
  const choose = (p: Preset) => { setPreset(p); if (p !== "custom") setRange(presetRange(p, today)); };
  return { from: range[0], to: range[1], preset, choose,
    setFrom: (f: string) => { setPreset("custom"); setRange(([, t]) => [f, t]); },
    setTo: (t: string) => { setPreset("custom"); setRange(([f]) => [f, t]); } };
}

export function PeriodBar({ period, loading, onReload, exportHref, exportLabel = "تصدير (Excel)", error, children }: {
  period?: ReturnType<typeof usePeriod>; loading: boolean; onReload: () => void; exportHref?: string; exportLabel?: string;
  error?: string; children?: ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-2xs p-3 space-y-2">
      {period && (
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" onClick={() => period.choose(p.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${period.preset === p.id ? "bg-stone-900 text-white border-stone-900" : "bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100"}`}>
              {p.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {period && (
          <>
            <label className="flex items-center gap-1">من
              <input type="date" value={period.from} max={period.to} onChange={(e) => { if (e.target.value) period.setFrom(e.target.value); }}
                className="px-2 py-1 border border-stone-200 rounded-lg bg-stone-50" />
            </label>
            <label className="flex items-center gap-1">إلى
              <input type="date" value={period.to} min={period.from} onChange={(e) => { if (e.target.value) period.setTo(e.target.value); }}
                className="px-2 py-1 border border-stone-200 rounded-lg bg-stone-50" />
            </label>
          </>
        )}
        <button type="button" onClick={onReload} disabled={loading}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-stone-200 bg-white font-bold text-stone-700 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />{loading ? "جاري التحميل..." : "تحديث"}
        </button>
        {exportHref && (
          <a href={exportHref} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold">
            <Download className="w-3.5 h-3.5" />{exportLabel}
          </a>
        )}
        {children}
      </div>
      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700">{error}</p>}
    </div>
  );
}

export function PageHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-stone-900">{title}</h2>
      {sub && <p className="text-xs sm:text-sm text-stone-500 mt-1">{sub}</p>}
    </div>
  );
}

export function Loading({ loading, error, what }: { loading: boolean; error: string; what: string }) {
  return <p role="status" className="text-sm text-stone-500 text-center py-12">{loading ? `جاري تحميل ${what}...` : error}</p>;
}

export function Kpi({ label, value, hint, tone = "stone" }: { label: string; value: string; hint?: string; tone?: "stone" | "emerald" | "amber" | "rose" }) {
  const color = { stone: "text-stone-900", emerald: "text-emerald-600", amber: "text-amber-600", rose: "text-rose-600" }[tone];
  return (
    <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs min-w-0">
      <p className="text-xs font-bold text-stone-500">{label}</p>
      <p className={`text-xl sm:text-2xl font-black mt-1 font-mono break-words ${color}`}>{value}</p>
      {hint && <p className="text-[11px] text-stone-400 mt-0.5">{hint}</p>}
    </div>
  );
}

export function Section({ title, icon, children, link, unavailable }: { title: string; icon?: ReactNode; children: ReactNode;
  link?: { href: string; label: string }; unavailable?: boolean }) {
  return (
    <section className="bg-white rounded-2xl border border-stone-200 shadow-2xs p-4 space-y-3 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-stone-900 flex items-center gap-2 text-sm">{icon}{title}</h3>
        {link && <Link href={link.href} className="text-[11px] font-bold text-amber-700 hover:underline shrink-0">{link.label} ←</Link>}
      </div>
      {unavailable ? <p className="text-xs text-stone-400">هذا القسم غير متاح حالياً (تعذر تحميل بياناته).</p> : children}
    </section>
  );
}

// One labelled line with one or more figures; wraps instead of scrolling on a phone.
export function Row({ label, sub, values, strong }: { label: ReactNode; sub?: ReactNode; values: { v: string; tone?: string; hint?: string }[]; strong?: boolean }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 border-b border-stone-100 last:border-0 text-xs ${strong ? "font-bold" : ""}`}>
      <div className="min-w-0">
        <p className="text-stone-800 break-words">{label}</p>
        {sub && <p className="text-[10px] text-stone-400 break-words">{sub}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono">
        {values.map((x, i) => (
          <span key={i} className={x.tone ?? "text-stone-900"}>{x.hint && <span className="text-[10px] text-stone-400 font-sans ml-1">{x.hint}</span>}{x.v}</span>
        ))}
      </div>
    </div>
  );
}

export const Empty = ({ text = "لا شيء في هذه الفترة." }: { text?: string }) => <p className="text-xs text-stone-400 py-1">{text}</p>;

// A search box and chips, for the long lists.
export function Filters({ search, onSearch, placeholder, chips, active, onChip }: { search: string; onSearch: (v: string) => void;
  placeholder: string; chips?: { id: string; label: string; count?: number }[]; active?: string; onChip?: (id: string) => void }) {
  return (
    <div className="space-y-2">
      <input type="search" value={search} onChange={(e) => onSearch(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500" />
      {chips && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button key={c.id} type="button" onClick={() => onChip?.(c.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${active === c.id ? "bg-stone-900 text-white border-stone-900" : "bg-white text-stone-600 border-stone-200"}`}>
              {c.label}{c.count !== undefined && <span className="mr-1 opacity-70">{c.count}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Show the first N rows of a long list, with a button for the rest.
export function useShowMore(step = 50) {
  const [limit, setLimit] = useState(step);
  const more = (total: number) => total > limit
    ? <button type="button" onClick={() => setLimit((n) => n + step)} className="w-full py-2 text-xs font-bold text-amber-700 hover:underline">عرض المزيد ({total - limit})</button>
    : null;
  return { limit, more };
}
