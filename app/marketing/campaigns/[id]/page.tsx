"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, Pencil, Wallet, Users, Plus, Search, Link2, X, Ban, Info } from "lucide-react";
import { loadBusiness, saveBusiness } from "@/lib/business-client";
import { secureFetch } from "@/lib/client-api";
import { useToast } from "@/components/common/toast";
import { StatCard, Panel, InfoRow, LoadError } from "@/components/hr/hr-ui";
import { CampaignModal, CampaignStatusBadge, Meter, inputCls, jod, count, pct, ratio } from "@/components/marketing/mkt-ui";
import { ammanToday } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { CustomerSearchHit } from "@/lib/customer-search";
import {
  CHANNEL_LABELS, OBJECTIVE_LABELS, budgetTone, roasTone,
  type MarketingAccess, type MktCampaign, type MktCampaignLead, type MktSpend, type MktTeamMember,
} from "@/lib/marketing";

type Detail = {
  access: MarketingAccess; campaign: MktCampaign; spend: MktSpend[]; leads: MktCampaignLead[];
  team: MktTeamMember[]; promo_codes: { code: string; label_ar: string; is_active: boolean }[];
};

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { showToast } = useToast();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);

  const reload = useCallback(async () => {
    try {
      setData(await loadBusiness<Detail>(`/api/marketing/campaigns?id=${encodeURIComponent(id)}`));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل الحملة.");
    }
  }, [id]);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);

  // ---- Spend (manager / coordinator)
  const [spendForm, setSpendForm] = useState({ spend_date: ammanToday(), amount: "", description: "" });
  const [savingSpend, setSavingSpend] = useState(false);
  const recordSpend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingSpend || !data) return;
    setSavingSpend(true);
    try {
      await saveBusiness(`mkt-spend-${data.campaign.id}`, "/api/marketing/campaigns", { kind: "spend", campaign_id: data.campaign.id, ...spendForm });
      showToast("تم تسجيل المصروف.", "success");
      setSpendForm({ spend_date: spendForm.spend_date, amount: "", description: "" });
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setSavingSpend(false);
    }
  };
  const [voiding, setVoiding] = useState<{ id: string; reason: string } | null>(null);
  const voidSpend = async () => {
    if (!voiding) return;
    try {
      await saveBusiness(`mkt-void-${voiding.id}`, "/api/marketing/campaigns", { kind: "void", id: voiding.id, reason: voiding.reason });
      showToast("تم إلغاء المصروف.", "success");
      setVoiding(null);
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error");
    }
  };

  // ---- Leads: find by phone or name, then tie to this campaign
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CustomerSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const searchSeq = useRef(0);
  useEffect(() => {
    const q = query.trim();
    const seq = ++searchSeq.current;
    // Below three characters the results panel is not rendered, so stale hits are never shown.
    if (q.length < 3) return;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await secureFetch(`/api/customers/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const body = await res.json();
        if (seq === searchSeq.current) setHits(res.ok ? body.customers || [] : []);
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const attribute = async (customerId: string, mode: "set" | "clear") => {
    if (!data) return;
    try {
      const res = await saveBusiness<{ changed: number }>(`mkt-attr-${data.campaign.id}-${customerId}-${mode}`, "/api/marketing/campaigns",
        { kind: "attribute", campaign_id: data.campaign.id, customer_ids: [customerId], ...(mode === "clear" ? { mode } : {}) });
      showToast(mode === "clear" ? "تمت إزالة الليد من الحملة." : res.changed ? "تم ربط الليد بالحملة." : "الليد مرتبط بهذه الحملة مسبقًا.", "success");
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error");
    }
  };

  if (error && !data) return <div className="space-y-4"><BackLink /><LoadError message={error} onRetry={() => void reload()} /></div>;
  if (!data) return <div className="space-y-4"><BackLink /><div className="bg-white rounded-2xl border border-stone-200 p-10 text-center text-sm text-stone-400">جاري التحميل...</div></div>;

  const c = data.campaign;
  const manage = data.access === "manage";
  const linked = new Set(data.leads.map((l) => l.customer_id));
  const liveSpend = data.spend.filter((s) => !s.voided_at);

  return (
    <div className="space-y-6">
      <BackLink />
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5 flex-wrap">{c.name} <CampaignStatusBadge status={c.status} /></h2>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            <span dir="ltr" className="font-mono font-bold">{c.code}</span> · {CHANNEL_LABELS[c.channel]} · {OBJECTIVE_LABELS[c.objective]} ·{" "}
            <span dir="ltr">{c.start_date}{c.end_date ? ` → ${c.end_date}` : " →"}</span>
          </p>
        </div>
        {manage && (
          <button onClick={() => setEditing(true)} className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 font-bold text-sm rounded-xl shrink-0">
            <Pencil className="w-4 h-4" /> تعديل الحملة
          </button>
        )}
      </div>

      {error && <LoadError message={error} onRetry={() => void reload()} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs">
          <p className="text-xs font-bold text-stone-500">المصروف</p>
          <p className={cn("text-2xl font-black mt-1", budgetTone(c))}>{jod(c.spend)}</p>
          {Number(c.budget) > 0 ? <><Meter value={c.budget_used} className="mt-2" /><p className="text-[11px] text-stone-400 mt-1">{pct(c.budget_used)} من {jod(c.budget)}</p></>
            : <p className="text-[11px] text-stone-400 mt-0.5">بدون ميزانية محددة</p>}
        </div>
        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs">
          <p className="text-xs font-bold text-stone-500">الليدات</p>
          <p className="text-2xl font-black mt-1 text-sky-700">{count(c.leads)}{c.target_leads ? <span className="text-sm text-stone-400"> / {c.target_leads}</span> : null}</p>
          {c.target_leads ? <Meter value={Math.round((100 * c.leads) / c.target_leads)} className="mt-2" /> : null}
          <p className="text-[11px] text-stone-400 mt-1">{c.new_leads} جديدة · تكلفة الليد {jod(c.cost_per_lead)}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs">
          <p className="text-xs font-bold text-stone-500">المبيعات</p>
          <p className="text-2xl font-black mt-1 text-emerald-700">{jod(c.revenue)}</p>
          {c.target_revenue ? <Meter value={Math.round((100 * Number(c.revenue)) / Number(c.target_revenue))} className="mt-2" /> : null}
          <p className="text-[11px] text-stone-400 mt-1">{count(c.orders)} طلبية · المسلّم {jod(c.delivered_revenue)}</p>
        </div>
        <StatCard label="العائد على الإعلان (ROAS)" value={ratio(c.roas)} tone={roasTone(c.roas)}
          hint={`${c.converted} عميل اشترى (${pct(c.conversion_rate)}) · تكلفة العميل ${jod(c.cost_per_customer)}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Panel title={`الليدات المنسوبة للحملة (${data.leads.length})`} icon={<Users className="w-4 h-4 text-amber-500" />}>
            <div className="relative mb-3">
              <Search className="w-4 h-4 text-stone-400 absolute top-1/2 -translate-y-1/2 start-3" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث برقم الهاتف أو الاسم لربط ليد بهذه الحملة..."
                className="w-full ps-9 pe-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/60" />
            </div>
            {query.trim().length >= 3 && (
              <ul className="mb-4 rounded-xl border border-amber-200 bg-amber-50/40 divide-y divide-amber-100">
                {searching && !hits.length ? <li className="p-3 text-xs text-stone-500">جاري البحث...</li>
                  : !hits.length ? <li className="p-3 text-xs text-stone-500">لا توجد نتائج{manage ? "" : " ضمن ليداتك"}.</li>
                  : hits.map((h) => (
                    <li key={h.id} className="flex items-center justify-between gap-2 p-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate">{h.name || "بدون اسم"}</p>
                        <p className="text-[11px] text-stone-500"><span dir="ltr">{h.phone}</span>{h.city ? ` · ${h.city}` : ""}{h.rep_name_raw ? ` · ${h.rep_name_raw}` : ""}</p>
                      </div>
                      {linked.has(h.id) ? <span className="text-[11px] font-bold text-emerald-700 shrink-0">مرتبط</span> : (
                        <button onClick={() => void attribute(h.id, "set")} disabled={c.status === "cancelled"}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 text-xs font-bold shrink-0">
                          <Link2 className="w-3.5 h-3.5" /> ربط
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
            )}
            {!data.leads.length ? <p className="text-sm text-stone-400">لم يُربط أي ليد بهذه الحملة بعد. ابحث عن الليد أعلاه، أو أرسل رمز الحملة <span dir="ltr" className="font-mono">{c.code}</span> مع نموذج الإعلان.</p> : (
              <div className="overflow-x-auto -mx-4">
                <table className="w-full text-sm">
                  <thead className="text-[11px] text-stone-500 bg-stone-50">
                    <tr>{["الليد", "المندوب", "طلبيات", "المبيعات", "رُبط بواسطة", ""].map((h, i) => <th key={i} className="text-start px-4 py-2 font-bold">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {data.leads.map((l) => (
                      <tr key={l.customer_id} className="hover:bg-amber-50/30">
                        <td className="px-4 py-2"><p className="font-bold">{l.name || "—"}</p><p className="text-[11px] text-stone-500" dir="ltr">{l.phone}</p></td>
                        <td className="px-4 py-2 text-xs">{l.rep_name || "—"}</td>
                        <td className="px-4 py-2 font-black">{l.orders}</td>
                        <td className="px-4 py-2 text-xs font-bold">{jod(l.revenue)}</td>
                        <td className="px-4 py-2 text-[11px] text-stone-500">{l.attributed_by_name}<br /><span dir="ltr">{l.attributed_at.slice(0, 10)}</span></td>
                        <td className="px-4 py-2">
                          <button onClick={() => void attribute(l.customer_id, "clear")} aria-label="إزالة من الحملة" title="إزالة من الحملة"
                            className="p-1.5 rounded-lg border border-stone-200 hover:bg-rose-50 hover:border-rose-200"><X className="w-3.5 h-3.5" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="سجل المصروف" icon={<Wallet className="w-4 h-4 text-amber-500" />}>
            {manage && (
              <form onSubmit={recordSpend} className="grid grid-cols-2 gap-2 mb-3 pb-3 border-b border-stone-100">
                <input type="date" required className={inputCls} value={spendForm.spend_date} max={ammanToday()} onChange={(e) => setSpendForm({ ...spendForm, spend_date: e.target.value })} />
                <input required dir="ltr" inputMode="decimal" placeholder="المبلغ د.أ" className={inputCls} value={spendForm.amount} onChange={(e) => setSpendForm({ ...spendForm, amount: e.target.value })} />
                <input placeholder="الوصف (مثال: إعلانات ميتا الأسبوع 2)" className={cn(inputCls, "col-span-2")} value={spendForm.description} onChange={(e) => setSpendForm({ ...spendForm, description: e.target.value })} />
                <button type="submit" disabled={savingSpend} className="col-span-2 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 text-sm font-bold">
                  <Plus className="w-4 h-4" /> تسجيل مصروف
                </button>
              </form>
            )}
            {!data.spend.length ? <p className="text-sm text-stone-400">لا يوجد مصروف مسجّل.</p> : (
              <ul className="space-y-2">
                {data.spend.map((s) => (
                  <li key={s.id} className={cn("rounded-xl border p-2.5", s.voided_at ? "border-stone-100 bg-stone-50 opacity-70" : "border-stone-100")}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("font-black text-sm", s.voided_at && "line-through")}>{jod(s.amount)}</span>
                      <span className="text-[11px] text-stone-500" dir="ltr">{s.spend_date}</span>
                    </div>
                    {s.description && <p className="text-xs text-stone-600 mt-0.5">{s.description}</p>}
                    <p className="text-[10px] text-stone-400 mt-0.5">{s.created_by_name}</p>
                    {s.voided_at ? <p className="text-[11px] text-rose-700 font-bold mt-1">ملغى: {s.void_reason}</p>
                      : manage && (voiding?.id === s.id ? (
                        <div className="flex gap-1.5 mt-2">
                          <input autoFocus className={cn(inputCls, "py-1.5 text-xs")} placeholder="سبب الإلغاء" value={voiding.reason} onChange={(e) => setVoiding({ id: s.id, reason: e.target.value })} />
                          <button onClick={() => void voidSpend()} disabled={voiding.reason.trim().length < 3} className="px-2.5 rounded-lg bg-rose-600 text-white text-xs font-bold disabled:opacity-50">إلغاء</button>
                          <button onClick={() => setVoiding(null)} className="px-2 rounded-lg border border-stone-200 text-xs">تراجع</button>
                        </div>
                      ) : (
                        <button onClick={() => setVoiding({ id: s.id, reason: "" })} className="mt-1 inline-flex items-center gap-1 text-[11px] text-stone-500 hover:text-rose-700"><Ban className="w-3 h-3" /> إلغاء القيد</button>
                      ))}
                  </li>
                ))}
              </ul>
            )}
            {liveSpend.length > 0 && <p className="text-[11px] text-stone-500 mt-3">المجموع الفعّال: <span className="font-black text-stone-900">{jod(c.spend)}</span> · هذا الشهر {jod(c.spend_this_month)}</p>}
          </Panel>

          <Panel title="تفاصيل الحملة" icon={<Info className="w-4 h-4 text-amber-500" />}>
            <dl>
              <InfoRow label="المسؤول" value={c.owner_name} />
              <InfoRow label="كود الخصم" value={c.promo_code ? `${c.promo_code} — ${c.promo_redemptions} استخدام (خصم ${jod(c.promo_saved)})` : ""} />
              <InfoRow label="الجمهور" value={c.audience} />
              <InfoRow label="ملاحظات" value={c.notes} />
              <InfoRow label="رمز الربط مع الإعلان" value={<span className="font-mono text-xs">campaign={c.code}</span>} ltr />
            </dl>
          </Panel>
        </div>
      </div>

      {editing && (
        <CampaignModal campaign={c} team={data.team} promoCodes={data.promo_codes}
          onClose={() => setEditing(false)} onSaved={() => { setEditing(false); void reload(); }} />
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/marketing/campaigns" className="inline-flex items-center gap-1.5 text-sm font-bold text-stone-500 hover:text-amber-700">
      <ArrowRight className="w-4 h-4" /> كل الحملات
    </Link>
  );
}
