"use client";

import { Clock } from "lucide-react";
import { ALL_INITIAL_PROFILES } from "@/lib/profile-store";
import type { OrderChange } from "@/lib/business";

// business_order_changes (migration 036) diffs an order by database column name. Everyone who
// reads this panel — the rep, Diya, the managers — reads Arabic, so translate the keys, and always
// name the person who made the change: that attribution is the whole point of the audit trail.
const FIELD_LABELS: Record<string, string> = {
  city: "المدينة",
  address: "العنوان",
  notes: "الملاحظات",
  customer_name: "اسم العميل",
  customer_phone: "رقم الهاتف",
  total_amount: "المبلغ",
  items_summary: "الأصناف",
};

const fieldLabel = (field: string) => FIELD_LABELS[field] || field;
const actorName = (id: string) => ALL_INITIAL_PROFILES[id]?.name || id;
const shown = (value: unknown) => {
  const text = value === null || value === undefined ? "" : String(value);
  return text.trim() === "" ? "—" : text;
};

/** The edit history of one order, newest first. Renders nothing when the order was never edited. */
export function OrderChangeLog({ entries, heading }: { entries: OrderChange[]; heading?: string }) {
  if (!entries.length) return null;
  return (
    <div className="bg-sky-50/60 p-3.5 rounded-2xl border border-sky-200/70 text-xs space-y-2">
      <h4 className="font-bold text-sky-900 flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5" />
        <span>{heading || "سجل التعديلات"} ({entries.length})</span>
      </h4>
      {entries.map((entry, i) => (
        <div key={i} className="text-[11px] text-sky-900/90 border-t border-sky-200/60 pt-1.5 first:border-t-0 first:pt-0 space-y-0.5">
          <div className="font-bold text-sky-800">
            {actorName(entry.actor_id)}
            {" — "}
            <span className="font-mono font-normal text-sky-700">
              {new Date(entry.changed_at).toLocaleString("ar")}
            </span>
          </div>
          <ul className="space-y-0.5">
            {Object.entries(entry.changes).map(([field, { from, to }]) => (
              <li key={field}>
                <span className="font-bold">{fieldLabel(field)}:</span>{" "}
                <span className="line-through opacity-70">{shown(from)}</span>
                {" ← "}
                <span className="font-bold">{shown(to)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
