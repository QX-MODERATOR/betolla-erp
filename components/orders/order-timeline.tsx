"use client";

// The order's journey, the way a shipment tracker shows it: every step the order will pass
// through, with the ones it has reached filled in and stamped with when they happened.
//
// The steps come from the lifecycle in business_status (migration 012), not from a guess:
//   draft -> confirmed -> processing -> shipped -> delivered
// with cancelled and returned as the two ways out. An order that ended one of those ways shows
// the steps it did reach, then the exit, rather than pretending the rest is still coming.
//
// Timestamps come from the order document (migration 041). `processing` has no column of its own —
// nothing ever stamped it — so that step shows as reached without a time rather than inventing one.
import { CheckCircle2, Circle, Truck, PackageCheck, ClipboardList, PackageOpen, XCircle, RotateCcw, Bike, MapPin } from "lucide-react";
import type { BusinessOrder } from "@/lib/business";
import { deliveryProgress } from "@/lib/driver-ops";
import { cn } from "@/lib/utils";

const LIFECYCLE = ["draft", "confirmed", "processing", "shipped", "delivered"] as const;

const STEP: Record<string, { label: string; icon: typeof Circle }> = {
  draft: { label: "مسودة", icon: ClipboardList },
  confirmed: { label: "تم التأكيد", icon: CheckCircle2 },
  processing: { label: "قيد التجهيز", icon: PackageOpen },
  shipped: { label: "خرج مع السائق", icon: Truck },
  on_the_way: { label: "السائق في الطريق إلى العميل", icon: Bike },
  arrived: { label: "وصل السائق إلى العميل", icon: MapPin },
  delivered: { label: "تم التسليم", icon: PackageCheck },
  cancelled: { label: "أُلغي الطلب", icon: XCircle },
  returned: { label: "مرتجع", icon: RotateCcw },
};

// "١٨ أيلول ٢٠٢٦، ٣:٤٢ م" — the same locale the rest of the app reads in.
function stamp(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ar-JO", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
}

export function OrderTimeline({ order }: { order: BusinessOrder }) {
  const status = order.status;
  const ended = status === "cancelled" || status === "returned";
  // How far the order actually got. A cancelled order stops at the last step it completed, which
  // its timestamps tell us — cancelled_at alone does not say whether it was ever processed.
  const reachedIndex = ended
    ? (order.shipped_at ? LIFECYCLE.indexOf("shipped") : order.confirmed_at ? LIFECYCLE.indexOf("confirmed") : 0)
    : Math.max(0, LIFECYCLE.indexOf(status as (typeof LIFECYCLE)[number]));

  const at: Record<string, string | null | undefined> = {
    draft: order.created_at,
    confirmed: order.confirmed_at,
    processing: null, // never stamped; the step is real, the time is not recorded
    shipped: order.shipped_at,
    delivered: order.delivered_at,
  };

  type Step = { key: string; done: boolean; current: boolean; time: string | null | undefined };
  const steps: Step[] = LIFECYCLE.map((key, i) => ({ key, done: i <= reachedIndex, current: !ended && i === reachedIndex, time: at[key] }));
  // Migration 045: خالد and علي mark "on the way" and "arrived" from their delivery screen. Those
  // steps sit between shipped and delivered, and while the order is out they are where it is now.
  const progress = deliveryProgress(order.delivery_progress, order.delivery_state, order.delivery_state_at);
  if (progress && !ended) {
    const live = status === "processing" || status === "shipped";
    const shipped = steps.find((s) => s.key === "shipped")!;
    shipped.done = true;
    const extra: Step[] = [{ key: "on_the_way", done: true, current: false, time: progress.started_at }];
    if (progress.arrived_at || live) extra.push({ key: "arrived", done: !!progress.arrived_at, current: false, time: progress.arrived_at });
    if (live) {
      steps.forEach((s) => { s.current = false; });
      extra[progress.arrived_at ? 1 : 0].current = true;
    }
    steps.splice(steps.indexOf(shipped) + 1, 0, ...extra);
  }
  // There is no returned_at column, so a return is stamped with the last time the row moved.
  if (ended) steps.push({ key: status, done: true, current: true, time: status === "cancelled" ? order.cancelled_at : order.updated_at });

  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50/60 p-3">
      <p className="text-[11px] font-bold text-stone-700 mb-2.5">مسار الطلب:</p>
      <ol className="space-y-0">
        {steps.map((step, i) => {
          const meta = STEP[step.key];
          const Icon = step.done ? meta.icon : Circle;
          const isExit = step.key === "cancelled" || step.key === "returned";
          const last = i === steps.length - 1;
          return (
            <li key={step.key} className="flex gap-2.5">
              {/* Rail: the dot for this step, and the line down to the next one. */}
              <div className="flex flex-col items-center shrink-0">
                <span
                  className={cn(
                    "w-6 h-6 rounded-full grid place-items-center border-2 transition",
                    isExit && step.done
                      ? "bg-rose-50 border-rose-300 text-rose-600"
                      : step.done
                        ? "bg-emerald-50 border-emerald-400 text-emerald-600"
                        : "bg-white border-stone-200 text-stone-300",
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                </span>
                {!last && (
                  <span
                    aria-hidden
                    className={cn("w-0.5 flex-1 min-h-5", steps[i + 1].done ? (isExit ? "bg-rose-200" : "bg-emerald-300") : "bg-stone-200")}
                  />
                )}
              </div>

              <div className={cn("pb-3 min-w-0", last && "pb-0")}>
                <p
                  className={cn(
                    "text-[11px] font-bold leading-6",
                    isExit && step.done ? "text-rose-700" : step.done ? "text-stone-900" : "text-stone-400",
                  )}
                >
                  {meta.label}
                  {step.current && !isExit && (
                    <span className="mr-1.5 text-[9px] font-bold text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-1.5 py-0.5">
                      الحالية
                    </span>
                  )}
                </p>
                {step.time && <p className="text-[10px] text-stone-500 font-mono">{stamp(step.time)}</p>}
                {/* The driver belongs on the step where the goods actually left. */}
                {step.key === "shipped" && step.done && (
                  <p className="text-[10px] text-stone-600">
                    السائق: <span className="font-bold">{order.driver || "— (غير مسجل)"}</span>
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
