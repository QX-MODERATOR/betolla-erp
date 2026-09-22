"use client";

import { ShoppingCart, Play, X } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

// An order the rep closed before saving. It floats at the bottom of the screen (like the driver's
// dock) with Continue, which reopens the order builder exactly as it was left, and Close, which
// throws the order away.
export function IncompleteOrderBar({
  customerName,
  itemCount,
  total,
  onContinue,
  onDiscard,
}: {
  customerName: string;
  itemCount: number;
  total: string;
  onContinue: () => void;
  onDiscard: () => void;
}) {
  const { t } = useLanguage();

  return (
    <div className="fixed inset-x-0 bottom-3 sm:bottom-5 z-40 px-3 flex justify-center pointer-events-none">
      <div
        role="status"
        className="animate-slideUp pointer-events-auto relative w-full max-w-xl rounded-2xl sm:rounded-3xl bg-white/95 backdrop-blur-xl border border-stone-200 shadow-2xl shadow-stone-900/10 p-3 sm:px-4 flex items-center gap-3 overflow-hidden"
      >
        <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-amber-500 to-transparent" />

        <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
          <ShoppingCart className="w-5 h-5" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-bold text-sm text-stone-900">{t("draft_order_title")}</p>
          <p className="text-[11px] text-stone-500 truncate">{customerName}</p>
          {itemCount > 0 && (
            <p className="text-[11px] text-stone-500">
              {itemCount} {t("draft_order_items")} • <span className="font-mono font-bold text-stone-700">{total}</span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onContinue}
            className="inline-flex items-center gap-1 px-3 sm:px-4 py-2 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 rtl:-scale-x-100" />
            <span>{t("draft_order_continue")}</span>
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="inline-flex items-center gap-1 px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-medium transition cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>{t("draft_order_close")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
