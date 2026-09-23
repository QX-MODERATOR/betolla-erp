"use client";

// Admin / general manager: rebuild a day's tab in the daily report Google Sheet now. The 08:00 job
// writes yesterday's tab on its own; this is for a mid-day look at today or a missed day.
import { useState } from "react";
import { FileSpreadsheet, ExternalLink } from "lucide-react";
import { Panel } from "@/components/hr/hr-ui";
import { ammanToday } from "@/lib/dates";

export function DailyReportPanel() {
  const [day, setDay] = useState(ammanToday());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ url: string; counts: { orders: number; leads: number; reps: number } } | null>(null);
  const [error, setError] = useState("");

  const build = async () => {
    setBusy(true); setError(""); setResult(null);
    try {
      const res = await fetch(`/api/reports/daily?date=${day}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "تعذر تحديث التقرير.");
      setResult({ url: data.url, counts: data.counts });
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تحديث التقرير."); }
    finally { setBusy(false); }
  };

  return (
    <Panel title="التقرير اليومي (Google Sheet)" icon={<FileSpreadsheet className="w-4 h-4 text-emerald-600" />}>
      <p className="text-xs text-stone-500 mb-3">
        يُكتب تقرير كل يوم تلقائياً الساعة 8 صباحاً في تبويب باسم التاريخ. يمكنك تحديث أي يوم الآن (يُستبدل تبويب ذلك اليوم).
      </p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input type="date" value={day} max={ammanToday()} onChange={(e) => e.target.value && setDay(e.target.value)}
          aria-label="يوم التقرير" className="px-3 py-2 rounded-xl border border-stone-200 bg-white" />
        <button type="button" onClick={() => void build()} disabled={busy}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs disabled:opacity-50">
          {busy ? "جاري الكتابة في Google Sheet..." : "تحديث تقرير هذا اليوم في Google Sheet"}
        </button>
      </div>
      {error && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p>}
      {result && (
        <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          تم: {result.counts.orders} طلب، {result.counts.leads} Lead، {result.counts.reps} موظفة.{" "}
          <a href={result.url} target="_blank" rel="noreferrer" className="font-bold underline inline-flex items-center gap-1">
            فتح التبويب <ExternalLink className="w-3 h-3" />
          </a>
        </p>
      )}
    </Panel>
  );
}
