"use client";

// The order lifecycle screen. The body lives in components/orders/orders-workspace.tsx so that
// /drivers can render it alongside the delivery board — ضياء works both halves of the same job and
// should not have to change page to do it.
import { Suspense } from "react";
import { OrdersWorkspace } from "@/components/orders/orders-workspace";

export default function OrdersPage() {
  return (
    <Suspense fallback={
      <div className="min-h-96 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <OrdersWorkspace />
    </Suspense>
  );
}
