"use client";

import { useCallback, useEffect, useState } from "react";
import { Ticket, CheckCircle2, XCircle } from "lucide-react";
import { Panel, LoadError } from "@/components/hr/hr-ui";
import { loadBusiness } from "@/lib/business-client";
import { secureFetch } from "@/lib/client-api";
import { useToast } from "@/components/common/toast";
import { formatCurrency, cn } from "@/lib/utils";

// Promo codes (migration 038). What is editable here is deliberately narrow: how many different
// customers one rep may use a code with in a month, and whether the code is live at all. The
// prices and the sample allowances live in the migration, because changing what VIP3 costs is a
// pricing decision that should leave a trace in the repository, not a settings toggle.
interface PromoCodeRow {
  code: string;
  kind: "sample" | "price";
  label: string;
  is_active: boolean;
  per_rep_monthly_cap: number | null;
  rules: { max_per_customer?: number; skus?: string[]; prices?: Record<string, number> };
  redemptions_total: number;
  redemptions_this_month: number;
  customers_this_month: number;
  saved_this_month: number;
}

const KIND_LABELS = { sample: "عينات مجانية", price: "سعر خاص" } as const;

function rulesSummary(row: PromoCodeRow): string {
  if (row.kind === "sample") {
    return `حتى ${row.rules.max_per_customer} من كل صنف لكل عميلة (${row.rules.skus?.length ?? 0} أصناف)`;
  }
  const prices = Object.entries(row.rules.prices ?? {});
  return prices.map(([, price]) => formatCurrency(Number(price))).join(" / ") + ` على ${prices.length} صنف`;
}

export function PromoCodesPanel({ canEdit }: { canEdit: boolean }) {
  const { showToast } = useToast();
  const [codes, setCodes] = useState<PromoCodeRow[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const data = await loadBusiness<{ codes: PromoCodeRow[] }>("/api/promo");
      setCodes(data.codes);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل أكواد الخصم.");
    }
  }, []);
  // Deferred a tick so the first render never sets state synchronously inside the effect.
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const save = async (code: string, changes: Record<string, unknown>) => {
    if (busy) return;
    setBusy(code);
    try {
      const res = await secureFetch("/api/promo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, ...changes }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "تعذر حفظ الكود.");
      setCodes(data.codes);
      setDrafts((prev) => { const next = { ...prev }; delete next[code]; return next; });
      showToast(data.message || "تم الحفظ.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "تعذر حفظ الكود.", "error");
      await load();
    } finally {
      setBusy("");
    }
  };

  if (error) return <Panel title="أكواد الخصم" icon={<Ticket className="w-4 h-4 text-amber-500" />}>
    <LoadError message={error} onRetry={() => void load()} />
  </Panel>;

  return (
    <Panel title="أكواد الخصم والعينات" icon={<Ticket className="w-4 h-4 text-amber-500" />}>
      <div className="space-y-2.5">
        {codes.map((row) => {
          const draft = drafts[row.code];
          const capValue = draft ?? (row.per_rep_monthly_cap === null ? "" : String(row.per_rep_monthly_cap));
          const dirty = draft !== undefined && draft !== (row.per_rep_monthly_cap === null ? "" : String(row.per_rep_monthly_cap));
          return (
            <div key={row.code} className={cn("rounded-2xl border p-3 space-y-2 text-xs",
              row.is_active ? "bg-white border-stone-200" : "bg-stone-50 border-stone-200 opacity-75")}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span dir="ltr" className="font-mono font-black text-sm text-stone-900">{row.code}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 font-bold">
                    {KIND_LABELS[row.kind]}
                  </span>
                  <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full",
                    row.is_active ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>
                    {row.is_active ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    {row.is_active ? "مفعّل" : "موقوف"}
                  </span>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    disabled={busy === row.code}
                    onClick={() => void save(row.code, { is_active: !row.is_active })}
                    className="px-3 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 disabled:opacity-50 text-stone-700 text-[11px] font-bold cursor-pointer"
                  >
                    {row.is_active ? "إيقاف" : "تفعيل"}
                  </button>
                )}
              </div>

              <p className="text-stone-600">{row.label} — {rulesSummary(row)}</p>

              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-stone-500">عدد العميلات لكل مندوبة شهرياً:</label>
                <input
                  value={capValue}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [row.code]: e.target.value.replace(/[^0-9]/g, "") }))}
                  disabled={!canEdit}
                  placeholder="بلا حد"
                  dir="ltr"
                  className="w-20 p-1.5 text-center font-mono bg-white border border-stone-300 rounded-lg disabled:bg-stone-50 focus:border-amber-500 focus:outline-none"
                />
                {canEdit && dirty && (
                  <button
                    type="button"
                    disabled={busy === row.code}
                    onClick={() => void save(row.code, { per_rep_monthly_cap: capValue === "" ? null : Number(capValue) })}
                    className="px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white text-[11px] font-bold cursor-pointer"
                  >
                    حفظ
                  </button>
                )}
                <span className="text-stone-400">(اتركيه فارغاً لإلغاء الحد)</span>
              </div>

              <div className="flex items-center gap-3 flex-wrap text-[11px] text-stone-500 border-t border-stone-100 pt-1.5">
                <span>هذا الشهر: <b className="text-stone-800">{row.redemptions_this_month}</b> استخدام</span>
                <span>عميلات: <b className="text-stone-800">{row.customers_this_month}</b></span>
                {row.kind === "price" && <span>وفّرت للعملاء: <b className="text-stone-800">{formatCurrency(row.saved_this_month)}</b></span>}
                <span>الإجمالي التاريخي: <b className="text-stone-800">{row.redemptions_total}</b></span>
              </div>
            </div>
          );
        })}
        {!codes.length && <p className="text-xs text-stone-400 text-center py-4">لا توجد أكواد مسجلة.</p>}
        {!canEdit && (
          <p className="text-[11px] text-stone-500">
            العرض فقط — تعديل الحدود متاح لمسؤول النظام والمدير العام.
          </p>
        )}
      </div>
    </Panel>
  );
}
