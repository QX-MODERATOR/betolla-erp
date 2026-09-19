"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Target, Plus, Search, Download } from "lucide-react";
import { loadBusiness } from "@/lib/business-client";
import { LoadError, StatCard } from "@/components/hr/hr-ui";
import { CampaignModal, CampaignStatusBadge, Meter, jod, count, pct, ratio } from "@/components/marketing/mkt-ui";
import { cn } from "@/lib/utils";
import {
  CAMPAIGN_STATUS_LABELS, CHANNEL_LABELS, OBJECTIVE_LABELS, budgetTone, roasTone,
  type CampaignChannel, type CampaignStatus, type MarketingAccess, type MktCampaign, type MktTeamMember,
} from "@/lib/marketing";

type Data = { access: MarketingAccess; campaigns: MktCampaign[]; team: MktTeamMember[]; promo_codes: { code: string; label_ar: string; is_active: boolean }[] };

function CampaignsPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"live" | "all" | CampaignStatus>("live");
  const [channel, setChannel] = useState<"all" | CampaignChannel>("all");
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    try {
      setData(await loadBusiness<Data>("/api/marketing/campaigns"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل الحملات.");
    }
  }, []);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);
  // /marketing/campaigns?new=1 (from the dashboard) opens the form once the data is here.
  useEffect(() => {
    if (params.get("new") && data?.access === "manage")
      void Promise.resolve().then(() => { setCreating(true); router.replace("/marketing/campaigns"); });
  }, [params, data, router]);

  const campaigns = data?.campaigns || [];
  const q = search.trim().toLowerCase();
  const filtered = campaigns.filter((c) =>
    (status === "all" || (status === "live" ? !["completed", "cancelled"].includes(c.status) : c.status === status)) &&
    (channel === "all" || c.channel === channel) &&
    (!q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)));

  const sum = (f: (c: MktCampaign) => number) => filtered.reduce((s, c) => s + f(c), 0);
  const spend = sum((c) => Number(c.spend)), revenue = sum((c) => Number(c.revenue)), leads = sum((c) => c.leads);

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.json_to_sheet(filtered.map((c) => ({
      "الرمز": c.code, "الحملة": c.name, "القناة": CHANNEL_LABELS[c.channel], "الهدف": OBJECTIVE_LABELS[c.objective],
      "الحالة": CAMPAIGN_STATUS_LABELS[c.status].label, "البداية": c.start_date, "النهاية": c.end_date || "",
      "الميزانية": Number(c.budget), "المصروف": Number(c.spend), "ليدات": c.leads, "ليدات جديدة": c.new_leads,
      "عملاء اشتروا": c.converted, "طلبيات": c.orders, "المبيعات": Number(c.revenue), "المسلّم": Number(c.delivered_revenue),
      "تكلفة الليد": c.cost_per_lead ?? "", "تكلفة العميل": c.cost_per_customer ?? "", "ROAS": c.roas ?? "",
    })));
    sheet["!views"] = [{ RTL: true }];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Campaigns");
    XLSX.writeFile(book, `betolla-campaigns.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5"><Target className="w-6 h-6 text-amber-500" /> الحملات الإعلانية</h2>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">الميزانية والمصروف والليدات والمبيعات لكل حملة، محسوبة من الطلبيات الفعلية</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportExcel} disabled={!filtered.length} className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 font-bold text-sm rounded-xl disabled:opacity-50">
            <Download className="w-4 h-4" /> Excel
          </button>
          {data?.access === "manage" && (
            <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-sm rounded-xl">
              <Plus className="w-4 h-4" /> حملة جديدة
            </button>
          )}
        </div>
      </div>

      {error && <LoadError message={error} onRetry={() => void reload()} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="حملات في القائمة" value={data ? filtered.length : "…"} />
        <StatCard label="المصروف" value={data ? jod(spend) : "…"} />
        <StatCard label="الليدات" value={data ? count(leads) : "…"} tone="text-sky-700" hint={leads && spend ? `تكلفة الليد ${jod(spend / leads)}` : undefined} />
        <StatCard label="المبيعات" value={data ? jod(revenue) : "…"} tone="text-emerald-700" hint={spend ? `ROAS ${ratio(revenue / spend)}` : undefined} />
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 p-3 flex flex-col md:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-stone-400 absolute top-1/2 -translate-y-1/2 start-3" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث باسم الحملة أو رمزها..."
            className="w-full ps-9 pe-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/60" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white">
          <option value="live">الجارية والمخططة</option>
          <option value="all">كل الحملات</option>
          {Object.entries(CAMPAIGN_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)} className="px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white">
          <option value="all">كل القنوات</option>
          {Object.entries(CHANNEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {!data ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center text-sm text-stone-400">{error ? "" : "جاري التحميل..."}</div>
      ) : !filtered.length ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center text-sm text-stone-400">
          {campaigns.length ? "لا توجد حملات مطابقة." : "لا توجد حملات بعد."}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <Link key={c.id} href={`/marketing/campaigns/${c.id}`} className="bg-white rounded-2xl border border-stone-200 p-4 hover:border-amber-400 transition block">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-black text-stone-900 truncate">{c.name}</p>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    <span dir="ltr" className="font-mono">{c.code}</span> · {CHANNEL_LABELS[c.channel]} · {OBJECTIVE_LABELS[c.objective]}
                  </p>
                </div>
                <CampaignStatusBadge status={c.status} />
              </div>
              <p className="text-[11px] text-stone-400 mt-2" dir="ltr">{c.start_date}{c.end_date ? ` → ${c.end_date}` : " →"}</p>
              <div className="mt-3">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-stone-500">المصروف</span>
                  <span className={cn("font-bold", budgetTone(c))}>{jod(c.spend)}{Number(c.budget) > 0 && <span className="text-stone-400 font-normal"> / {jod(c.budget)}</span>}</span>
                </div>
                {Number(c.budget) > 0 && <Meter value={c.budget_used} />}
              </div>
              <dl className="grid grid-cols-4 gap-2 mt-3 text-center">
                <div className="rounded-xl bg-stone-50 p-1.5"><dt className="text-[10px] text-stone-500">ليدات</dt><dd className="font-black text-sm">{count(c.leads)}</dd></div>
                <div className="rounded-xl bg-stone-50 p-1.5"><dt className="text-[10px] text-stone-500">تحويل</dt><dd className="font-black text-sm">{pct(c.conversion_rate)}</dd></div>
                <div className="rounded-xl bg-stone-50 p-1.5"><dt className="text-[10px] text-stone-500">طلبيات</dt><dd className="font-black text-sm">{count(c.orders)}</dd></div>
                <div className="rounded-xl bg-stone-50 p-1.5"><dt className="text-[10px] text-stone-500">ROAS</dt><dd className={cn("font-black text-sm", roasTone(c.roas))}>{ratio(c.roas)}</dd></div>
              </dl>
              <p className="text-xs mt-2 text-stone-600">المبيعات: <span className="font-black text-stone-900">{jod(c.revenue)}</span>
                {c.owner_name && <span className="text-stone-400"> · المسؤول: {c.owner_name}</span>}</p>
            </Link>
          ))}
        </div>
      )}

      {creating && data && (
        <CampaignModal campaign={null} team={data.team} promoCodes={data.promo_codes}
          onClose={() => setCreating(false)} onSaved={(c) => { setCreating(false); router.push(`/marketing/campaigns/${c.id}`); }} />
      )}
    </div>
  );
}

export default function CampaignsPage() {
  return <Suspense fallback={null}><CampaignsPageInner /></Suspense>;
}
