"use client";

// ضياء's workspace: the delivery board and the order lifecycle on one route.
//
// They were two pages, and the split was the whole reason they drifted apart — an order could be
// marked "خرج مع السائق" on /orders and never appear on /drivers, because /orders shipped it with
// no driver (fixed in migration 041). Keeping them on one route means the person assigning drivers
// is looking at the same orders she is dispatching, in the same place.
//
// Only the roles that do both jobs get the tabs. Everyone else lands on the board exactly as
// before, and /orders is still its own page for the sales side.
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Truck, ShoppingCart } from "lucide-react";
import { useRole } from "@/lib/use-permission";
import { DriversWorkspace } from "@/components/drivers/drivers-workspace";
import { OrdersWorkspace } from "@/components/orders/orders-workspace";
import { cn } from "@/lib/utils";

const BOTH_JOBS = ["admin", "general_manager", "driver_manager"];

type Tab = "delivery" | "orders";

function DriversTabs() {
  const role = useRole();
  const searchParams = useSearchParams();
  // A "new order waiting for a driver" notification links to /drivers?order=… — open on the tab
  // that holds the order, or the link lands on the delivery board and appears to have done nothing.
  const [tab, setTab] = useState<Tab>(searchParams.get("order") ? "orders" : "delivery");

  // Null until hydration, so everyone briefly sees the board alone — the same way useCan hides
  // controls until the role is known. Never a permission decision; the API enforces those.
  if (!role || !BOTH_JOBS.includes(role)) return <DriversWorkspace />;

  const tabs: { id: Tab; label: string; icon: typeof Truck }[] = [
    { id: "delivery", label: "لوحة التوصيل", icon: Truck },
    { id: "orders", label: "إدارة الطلبات", icon: ShoppingCart },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 p-1 bg-stone-100 rounded-2xl border border-stone-200 w-fit max-w-full overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap",
                active ? "bg-white text-stone-900 shadow-2xs border border-stone-200" : "text-stone-500 hover:text-stone-800",
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Both stay mounted: switching tabs mid-reconciliation must not throw away the half-entered
          numbers on the delivery board, and the orders list should not refetch on every glance. */}
      <div hidden={tab !== "delivery"}>
        <DriversWorkspace />
      </div>
      <div hidden={tab !== "orders"}>
        <Suspense fallback={
          <div className="min-h-96 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        }>
          <OrdersWorkspace />
        </Suspense>
      </div>
    </div>
  );
}

// useSearchParams needs a Suspense boundary around the component that calls it.
export default function DriversPage() {
  return (
    <Suspense fallback={<DriversWorkspace />}>
      <DriversTabs />
    </Suspense>
  );
}
