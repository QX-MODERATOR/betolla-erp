// Canonical roster of assignable sales rep display names (matches rep_name_raw
// values written by business_customer_create / lead auto-assignment, and the
// Arabic profile names in lib/profile-store.ts). Single source of truth so the
// auto-assignment pool (lib/business-server.ts) and the sales rep switcher UI
// (app/sales/page.tsx) never drift apart or disagree on spelling.
export const ACTIVE_SALES_REPS = ["حمزة", "رحمة", "صابرين", "حنان", "سارة", "حنين"];

// Sales-rep profile display names carry a role suffix ("رحمة (مبيعات)"), but
// customers.rep_name_raw and the roster above always use the bare name. Any
// value meant to be *matched* against a customer's assigned rep (not just
// displayed) must go through this first, or the join silently never matches.
export function normalizeRepName(name: string | null | undefined): string {
  return (name || "").replace(/\s*\(مبيعات\)\s*$/, "").trim();
}
