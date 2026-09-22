"use client";

// One delivery, step by step — the screen خالد and علي open with "بدء التوصيل" on their list.
//
// Like a food-delivery tracker, it shows where this order is on its journey:
//   assigned -> left the warehouse -> on the way (045) -> arrived (045) -> delivered / returned
// and offers exactly one next step in a big button at the bottom. Every step is saved in the
// database, so the rep who took the order and ضياء see the same timeline (with a notification)
// the moment the driver taps it. The page re-reads the order every 20 seconds and whenever it comes
// back to the foreground, so a change made elsewhere (ضياء reassigning, a postponement) shows up too.
//
// Navigation in and out is a 3D page turn (lib/page-turn.ts, CSS in globals.css).
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowRight, Bike, CheckCircle2, Clock, MapPin, MessageSquare, Navigation, Package, PackageCheck,
  Phone, RotateCcw, Truck, UserCheck, Warehouse, CalendarClock, Loader2,
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { loadBusiness, saveBusiness } from "@/lib/business-client";
import { useToast } from "@/components/common/toast";
import type { DeliveryProgress } from "@/lib/driver-ops";
import { turnPage, pageReady } from "@/lib/page-turn";

type Order = {
  id: string;
  dbStatus: string;
  customer_name: string;
  phone: string;
  area: string;
  address: string;
  products: string;
  rep_name: string;
  cash_to_collect: number;
  cash_collected: number | null;
  payment_method?: "cash" | "cliq";
  cliq_includes_delivery?: boolean;
  status: "pending" | "delivered" | "returned" | "postponed" | "remaining";
  postpone_date?: string;
  return_reason?: string;
  note?: string;
  assigned_at: string | null;
  dispatched_at: string | null;
  completed_at: string | null;
  progress: DeliveryProgress | null;
};

function clock(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ar-JO", { hour: "numeric", minute: "2-digit" });
}

function minutesSince(value: string | null | undefined, now: number): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((now - t) / 60000));
}

type Stage = "ready" | "on_the_way" | "arrived" | "delivered" | "returned" | "postponed";

function stageOf(o: Order): Stage {
  if (o.status === "delivered") return "delivered";
  if (o.status === "returned") return "returned";
  if (o.status === "postponed") return "postponed";
  if (o.progress?.stage === "arrived") return "arrived";
  if (o.progress?.stage === "on_the_way") return "on_the_way";
  return "ready";
}

const HERO: Record<Stage, { title: string; hint: string; icon: typeof Bike }> = {
  ready: { title: "جاهز للانطلاق", hint: "اضغط «ابدأ التوصيل» عند خروجك إلى العميل", icon: Package },
  on_the_way: { title: "في الطريق إلى العميل", hint: "المندوب ومدير التوصيل يرون أنك في الطريق", icon: Bike },
  arrived: { title: "وصلت إلى العميل", hint: "سلّم الطلب واستلم المبلغ", icon: MapPin },
  delivered: { title: "تم التسليم", hint: "أحسنت! تم حفظ التسليم والمبلغ", icon: PackageCheck },
  returned: { title: "مرتجع", hint: "أعد الطلب إلى المستودع", icon: RotateCcw },
  postponed: { title: "مؤجل", hint: "سيعود الطلب إلى قائمتك في موعده", icon: CalendarClock },
};

export default function DeliveryPage() {
  const { id } = useParams<{ id: string }>();
  const orderId = decodeURIComponent(id);
  const router = useRouter();
  const { showToast } = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [sheet, setSheet] = useState<null | "deliver" | "postpone" | "return">(null);
  const [cash, setCash] = useState("");
  const [postponeDate, setPostponeDate] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await loadBusiness<{ orders: Order[] }>("/api/driver");
      const found = (data.orders || []).find((o) => o.id === orderId) || null;
      setOrder(found);
      setError(found ? "" : "هذا الطلب لم يعد في قائمتك. ربما أعاد مدير التوصيل تعيينه.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل الطلب.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  // Keep in step with the other accounts: poll, and refresh on returning to the app.
  useEffect(() => {
    void Promise.resolve().then(load);
    const poll = window.setInterval(() => { void load(); }, 20000);
    const tick = window.setInterval(() => setNow(Date.now()), 30000);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(poll); window.clearInterval(tick); document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  const back = () => turnPage(() => router.push("/driver"), pageReady("driver-list"), "back");

  const progress = async (step: "start" | "arrive") => {
    if (!order || saving) return;
    setSaving(true);
    try {
      const res = await saveBusiness<{ order: Order; message: string }>(`driver-progress:${order.id}:${step}`, "/api/driver", {
        action: "progress", orderId: order.id, expectedStatus: order.dbStatus, step,
      });
      setOrder(res.order);
      showToast(res.message, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "تعذر الحفظ. أعد المحاولة.", "error", 6000);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const finish = async (status: "delivered" | "postponed" | "returned") => {
    if (!order || saving) return;
    const collected = Number(cash.trim());
    if (status === "delivered" && (cash.trim() === "" || !Number.isFinite(collected) || collected < 0)) {
      showToast("أدخل المبلغ المستلم فعلًا (اكتب 0 إذا لم يُدفع شيء).", "warning", 5000);
      return;
    }
    setSaving(true);
    try {
      const res = await saveBusiness<{ order: Order }>(`driver-status:${order.id}`, "/api/driver", {
        action: "update_status", orderId: order.id, expectedStatus: order.dbStatus, status, notes: "",
        cashCollected: status === "delivered" ? collected : undefined,
        returnReason: status === "returned" ? reason : undefined,
        postponeDate: status === "postponed" ? (postponeDate || undefined) : undefined,
      });
      setOrder(res.order);
      setSheet(null);
      showToast(status === "delivered" ? "تم تسليم الطلب 🎉" : status === "postponed" ? "تم تأجيل الطلب." : "تم تسجيل الطلب كمرتجع.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "تعذر الحفظ. أعد المحاولة.", "error", 6000);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const openSheet = (kind: "deliver" | "postpone" | "return") => {
    if (!order) return;
    setCash(kind === "deliver" ? String(order.cash_to_collect) : "");
    setPostponeDate("");
    setReason("");
    setSheet(kind);
  };

  const stage = order ? stageOf(order) : "ready";
  const hero = HERO[stage];
  const HeroIcon = hero.icon;
  const open = order ? (order.dbStatus === "processing" || order.dbStatus === "shipped") && ["pending", "remaining", "postponed"].includes(order.status) : false;
  const elapsed = order?.progress ? minutesSince(order.progress.arrived_at || order.progress.started_at, now) : null;

  // The journey. Each step is done, current (pulsing) or still ahead.
  const steps = order ? [
    { key: "assigned", label: "تم تعيين الطلب لك", at: order.assigned_at, done: true, icon: UserCheck },
    { key: "dispatched", label: "خرج من المستودع", at: order.dispatched_at, done: order.dbStatus !== "processing" || !!order.progress, icon: Warehouse },
    { key: "on_the_way", label: "في الطريق إلى العميل", at: order.progress?.started_at, done: !!order.progress || stage === "delivered", icon: Bike },
    { key: "arrived", label: "وصلت إلى العميل", at: order.progress?.arrived_at, done: stage === "arrived" || stage === "delivered", icon: MapPin },
    stage === "returned"
      ? { key: "returned", label: "مرتجع", at: order.completed_at, done: true, icon: RotateCcw }
      : stage === "postponed"
      ? { key: "postponed", label: `مؤجل${order.postpone_date ? ` إلى ${order.postpone_date}` : ""}`, at: null, done: true, icon: CalendarClock }
      : { key: "delivered", label: "تم التسليم", at: order.completed_at, done: stage === "delivered", icon: PackageCheck },
  ] : [];
  const currentIndex = steps.findIndex((s) => !s.done);

  const mapsUrl = order ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${order.address} ${order.area} الأردن`)}` : "";

  return (
      <div data-page="delivery-track" data-ready={loading ? undefined : ""} className="delivery-workspace delivery-track max-w-xl mx-auto pb-40 space-y-4" dir="rtl">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={back}
            className="flex items-center gap-1.5 px-3 rounded-xl bg-white border border-[#e8dfcf] text-sm font-bold text-[#533f16] cursor-pointer">
            <ArrowRight className="w-4 h-4" />
            <span>طلباتي</span>
          </button>
          {order && <span className="font-mono text-xs text-stone-500" dir="ltr">{order.id}</span>}
        </div>

        {loading ? (
          <div className="rounded-3xl bg-white border border-[#e8dfcf] p-10 text-center text-stone-500 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> جاري تحميل الطلب...
          </div>
        ) : !order ? (
          <div className="rounded-3xl bg-white border border-[#e8dfcf] p-8 text-center space-y-3">
            <p className="font-bold text-stone-800">{error || "الطلب غير موجود."}</p>
            <button type="button" onClick={back} className="px-4 rounded-xl bg-[#533f16] text-white font-bold cursor-pointer">العودة إلى طلباتي</button>
          </div>
        ) : (
          <>
            {/* Live stage — the part a customer would watch in a delivery app */}
            <div className={cn("track-hero relative overflow-hidden rounded-3xl p-5 text-white shadow-lg",
              stage === "returned" ? "bg-gradient-to-br from-rose-700 to-rose-900"
                : stage === "postponed" ? "bg-gradient-to-br from-stone-600 to-stone-800"
                : stage === "delivered" ? "bg-gradient-to-br from-emerald-600 to-emerald-800"
                : "bg-gradient-to-br from-[#533f16] to-[#241a08]")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-white/70">{order.customer_name}</p>
                  <h1 key={stage} className="track-stage text-2xl font-black leading-tight mt-1">{hero.title}</h1>
                  <p className="text-xs text-white/80 mt-1">{hero.hint}</p>
                </div>
                <div className={cn("w-14 h-14 rounded-2xl bg-white/15 grid place-items-center shrink-0", (stage === "on_the_way") && "track-bob")}>
                  <HeroIcon className="w-7 h-7" />
                </div>
              </div>
              {/* The road: a rider moving along it as the stages advance */}
              <div className="mt-5 relative h-2 rounded-full bg-white/20">
                <div className="absolute inset-y-0 right-0 rounded-full bg-amber-300 transition-all duration-700"
                  style={{ width: `${{ ready: 8, on_the_way: 55, arrived: 88, delivered: 100, returned: 100, postponed: 30 }[stage]}%` }} />
                <div className="absolute -top-3 transition-all duration-700"
                  style={{ right: `calc(${{ ready: 8, on_the_way: 55, arrived: 88, delivered: 100, returned: 100, postponed: 30 }[stage]}% - 14px)` }}>
                  <span className={cn("w-7 h-7 rounded-full bg-amber-300 text-[#241a08] grid place-items-center shadow", stage === "on_the_way" && "track-bob")}>
                    <Truck className="w-4 h-4 -scale-x-100" />
                  </span>
                </div>
              </div>
              {elapsed !== null && (stage === "on_the_way" || stage === "arrived") && (
                <p className="mt-4 text-xs text-white/80 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {stage === "on_the_way" ? "في الطريق منذ" : "عند العميل منذ"} {elapsed < 1 ? "أقل من دقيقة" : `${elapsed} دقيقة`}
                </p>
              )}
            </div>

            {/* Customer */}
            <div className="rounded-3xl bg-white border border-[#e8dfcf] p-4 space-y-3">
              <div className="min-w-0">
                <p className="font-black text-lg text-stone-900 break-words">{order.customer_name}</p>
                <p className="text-sm text-stone-600 flex items-start gap-1.5 mt-0.5">
                  <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-[#9e8959]" />
                  <span><b>{order.area}</b>{order.address && ` — ${order.address}`}</span>
                </p>
                {order.rep_name && <p className="text-xs text-stone-500 mt-1">المندوبة: {order.rep_name}</p>}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <a href={`tel:${order.phone}`} className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 py-2.5 text-xs font-bold">
                  <Phone className="w-5 h-5" />اتصال
                </a>
                <a href={`https://wa.me/${order.phone.replace(/^0/, "962")}`} target="_blank" rel="noreferrer"
                  className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-emerald-500 text-white py-2.5 text-xs font-bold">
                  <MessageSquare className="w-5 h-5" />واتساب
                </a>
                <a href={mapsUrl} target="_blank" rel="noreferrer"
                  className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-sky-50 border border-sky-200 text-sky-800 py-2.5 text-xs font-bold">
                  <Navigation className="w-5 h-5" />الخريطة
                </a>
              </div>
            </div>

            {/* Timeline */}
            <div className="rounded-3xl bg-white border border-[#e8dfcf] p-4">
              <p className="font-black text-stone-900 mb-3">مراحل التوصيل</p>
              <ol className="relative">
                {steps.map((step, i) => {
                  const Icon = step.icon;
                  const current = i === currentIndex;
                  const last = i === steps.length - 1;
                  const bad = step.key === "returned";
                  return (
                    <li key={step.key} className="track-step relative flex gap-3 pb-5 last:pb-0" style={{ animationDelay: `${i * 70}ms` }}>
                      {!last && (
                        <span className={cn("absolute right-[17px] top-9 bottom-0 w-0.5", step.done ? "bg-[#9e8959]" : "bg-stone-200")} />
                      )}
                      <span className={cn("relative z-10 w-9 h-9 rounded-full grid place-items-center shrink-0 border-2",
                        bad ? "bg-rose-600 border-rose-600 text-white"
                          : step.done ? "bg-[#533f16] border-[#533f16] text-white"
                          : current ? "bg-white border-[#9e8959] text-[#533f16] track-pulse"
                          : "bg-white border-stone-200 text-stone-300")}>
                        {step.done && !bad ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                      </span>
                      <div className="pt-1.5 min-w-0">
                        <p className={cn("text-sm font-bold", step.done ? "text-stone-900" : current ? "text-[#533f16]" : "text-stone-400")}>
                          {step.label}
                        </p>
                        <p className="text-[11px] text-stone-500">
                          {step.at ? clock(step.at) : current ? "الخطوة التالية" : ""}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>

            {/* The order */}
            <div className="rounded-3xl bg-white border border-[#e8dfcf] p-4 space-y-3">
              <div className="flex items-start gap-2 text-sm text-stone-700">
                <Package className="w-4 h-4 shrink-0 mt-0.5 text-[#9e8959]" />
                <p className="leading-relaxed">{order.products}</p>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-[#faf5e9] px-4 py-3">
                <span className="text-sm font-bold text-[#533f16]">
                  {order.status === "delivered" ? "المبلغ المستلم" : order.payment_method === "cliq" && !order.cliq_includes_delivery ? "أجرة التوصيل" : "المطلوب تحصيله"}
                </span>
                <span className="font-black text-xl text-stone-900" dir="ltr">
                  {formatCurrency(order.status === "delivered" ? (order.cash_collected ?? order.cash_to_collect) : order.cash_to_collect)}
                </span>
              </div>
              {order.note && <p className="text-xs text-stone-500">ملاحظة: {order.note}</p>}
            </div>
          </>
        )}

        {/* The one next step, always under the thumb */}
        {order && (
          <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 pt-2 bg-gradient-to-t from-[#fcfbf8] via-[#fcfbf8]/95 to-transparent">
            <div className="max-w-xl mx-auto space-y-2">
              {open ? (
                <>
                  {stage === "ready" || stage === "postponed" ? (
                    <button type="button" disabled={saving} onClick={() => progress("start")}
                      className="track-cta w-full rounded-2xl bg-[#533f16] text-white font-black text-lg py-4 flex items-center justify-center gap-2 shadow-lg disabled:opacity-60 cursor-pointer">
                      {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Bike className="w-5 h-5" />}
                      ابدأ التوصيل
                    </button>
                  ) : stage === "on_the_way" ? (
                    <button type="button" disabled={saving} onClick={() => progress("arrive")}
                      className="track-cta w-full rounded-2xl bg-[#533f16] text-white font-black text-lg py-4 flex items-center justify-center gap-2 shadow-lg disabled:opacity-60 cursor-pointer">
                      {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <MapPin className="w-5 h-5" />}
                      وصلت إلى العميل
                    </button>
                  ) : (
                    <button type="button" disabled={saving} onClick={() => openSheet("deliver")}
                      className="track-cta w-full rounded-2xl bg-emerald-600 text-white font-black text-lg py-4 flex items-center justify-center gap-2 shadow-lg disabled:opacity-60 cursor-pointer">
                      <PackageCheck className="w-5 h-5" />
                      تم التسليم
                    </button>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    <button type="button" disabled={saving} onClick={() => openSheet("deliver")}
                      className="rounded-xl bg-white border border-emerald-200 text-emerald-700 text-xs font-bold cursor-pointer">تسليم</button>
                    <button type="button" disabled={saving} onClick={() => openSheet("postpone")}
                      className="rounded-xl bg-white border border-stone-200 text-stone-700 text-xs font-bold cursor-pointer">تأجيل</button>
                    <button type="button" disabled={saving} onClick={() => openSheet("return")}
                      className="rounded-xl bg-white border border-rose-200 text-rose-700 text-xs font-bold cursor-pointer">مرتجع</button>
                  </div>
                </>
              ) : (
                <button type="button" onClick={back}
                  className="w-full rounded-2xl bg-[#533f16] text-white font-black text-base py-4 cursor-pointer">
                  العودة إلى طلباتي
                </button>
              )}
            </div>
          </div>
        )}

        {/* Finish sheet: deliver / postpone / return */}
        {order && sheet && (
          <div data-dialog="" className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={() => !saving && setSheet(null)}>
            <div className="track-sheet w-full max-w-xl bg-white rounded-t-3xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-black text-lg text-stone-900">
                {sheet === "deliver" ? "تسليم الطلب" : sheet === "postpone" ? "تأجيل الطلب" : "تسجيل مرتجع"}
              </h3>
              {sheet === "deliver" && (
                <label className="block space-y-1">
                  <span className="text-sm font-bold text-stone-700">المبلغ المستلم من العميل</span>
                  <input type="number" inputMode="decimal" min="0" step="0.001" value={cash} onChange={(e) => setCash(e.target.value)}
                    className="w-full rounded-xl border border-stone-300 px-4 py-3 text-lg font-mono font-bold outline-none focus:border-[#9e8959]" dir="ltr" />
                  <span className="text-[11px] text-stone-500">المطلوب: {formatCurrency(order.cash_to_collect)} — اكتب 0 إذا لم يُدفع شيء.</span>
                </label>
              )}
              {sheet === "postpone" && (
                <label className="block space-y-1">
                  <span className="text-sm font-bold text-stone-700">موعد التسليم الجديد (اختياري)</span>
                  <input type="date" value={postponeDate} onChange={(e) => setPostponeDate(e.target.value)}
                    className="w-full rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-[#9e8959]" />
                </label>
              )}
              {sheet === "return" && (
                <label className="block space-y-1">
                  <span className="text-sm font-bold text-stone-700">سبب الإرجاع</span>
                  <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                    className="w-full rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-[#9e8959]" />
                </label>
              )}
              <div className="flex gap-2">
                <button type="button" disabled={saving}
                  onClick={() => finish(sheet === "deliver" ? "delivered" : sheet === "postpone" ? "postponed" : "returned")}
                  className={cn("flex-1 rounded-xl py-3 font-black text-white disabled:opacity-60 cursor-pointer",
                    sheet === "deliver" ? "bg-emerald-600" : sheet === "postpone" ? "bg-stone-800" : "bg-rose-600")}>
                  {saving ? "جاري الحفظ..." : "تأكيد"}
                </button>
                <button type="button" disabled={saving} onClick={() => setSheet(null)}
                  className="px-5 rounded-xl bg-stone-100 text-stone-700 font-bold cursor-pointer">إلغاء</button>
              </div>
            </div>
          </div>
        )}
      </div>
  );
}
