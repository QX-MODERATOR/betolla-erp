"use client";

// BX Arabia — صابرين's delivery board.
//
// BX is a delivery company rather than someone on the payroll, and it is run by صابرين while she
// stays a sales rep. Everyone else's deliveries remain with ضياء, whose board no longer carries BX
// at all.
//
// The board itself is the same component /drivers uses. It is not filtered here: /api/drivers
// already scopes what it returns to the drivers the account runs (lib/bx.ts), so this page shows
// BX and unassigned orders because that is what the server sends — not because the browser hid the
// rest. Filtering in the page would have been a display trick with the real orders still on the
// wire.
import { Suspense } from "react";
import { Truck } from "lucide-react";
import { DriversWorkspace } from "@/components/drivers/drivers-workspace";

export default function BxPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-l from-[#160f02] to-[#3b2f14] text-white">
        <span className="w-10 h-10 rounded-xl bg-white/10 grid place-items-center shrink-0">
          <Truck className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-base font-black leading-tight">BX Arabia</h1>
          <p className="text-[11px] text-white/70">
            طلبيات شركة BX Arabia: التعيين، الإخراج للتوصيل، التسليم والمرتجع، وتسوية العهدة.
          </p>
        </div>
      </div>

      <Suspense fallback={
        <div className="min-h-96 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }>
        <DriversWorkspace />
      </Suspense>
    </div>
  );
}
