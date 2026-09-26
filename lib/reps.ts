// Canonical roster of assignable sales rep display names (matches rep_name_raw
// values written by business_customer_create / lead auto-assignment, and the
// Arabic profile names in lib/profile-store.ts). Single source of truth so the
// auto-assignment pool (lib/business-server.ts) and the sales rep switcher UI
// (app/sales/page.tsx) never drift apart or disagree on spelling.
// "سارة" was removed on 2026-09-18: no such employee, yet prepareLead below picks from this
// list at random, so inbound leads were being assigned to nobody. Her existing customers keep
// rep_name_raw = "سارة" and stay reachable — /sales unions this roster with the rep names
// actually present in the data, and the customers page keeps an off-roster rep in its dropdown.
export const ACTIVE_SALES_REPS = ["حمزة", "رحمة", "صابرين", "حنان", "حنين", "آية", "رشا"];

// Marketing staff who work their own leads and orders the way a sales rep does (see
// isOwnQueueRole). They can be picked as a lead's or an order's rep, but they are NOT in the
// round-robin above: inbound leads keep going to sales, and marketing's leads come from its own
// campaigns.
export const MARKETING_REPS = ["لين"];

// Everyone a lead or an order may be assigned to, for pickers and for server-side validation.
export const ASSIGNABLE_REPS = [...ACTIVE_SALES_REPS, ...MARKETING_REPS];

// The reps ranked against each other on /sales ("الترتيب #2 من 6"): the sales reps, not رشا, who
// manages them. Everyone is ranked, including a rep with no sales yet this month.
export const RANKED_REPS = ACTIVE_SALES_REPS.filter((r) => r !== "رشا");

export interface RepRank { rep: string; rank: number; total: number; orders: number }

// This month's standing by sales (JD), then by number of orders; cancelled and draft orders do not
// count. Ties share a rank ("#1, #1, #3"), so two reps with nothing yet are equal, not ordered by name.
export function rankReps(
  orders: { rep_name?: string | null; order_date?: string | null; status: string; total_amount: number }[],
  month: string,
  roster: readonly string[] = RANKED_REPS,
): RepRank[] {
  const sums = new Map(roster.map((r) => [r, { total: 0, orders: 0 }]));
  for (const o of orders) {
    const s = sums.get(o.rep_name || "");
    if (!s || o.order_date?.slice(0, 7) !== month || o.status === "cancelled" || o.status === "draft") continue;
    s.total = Math.round((s.total + o.total_amount) * 1000) / 1000;
    s.orders += 1;
  }
  const rows = [...sums].map(([rep, s]) => ({ rep, ...s }))
    .sort((a, b) => b.total - a.total || b.orders - a.orders || roster.indexOf(a.rep) - roster.indexOf(b.rep));
  return rows.map((r) => ({ ...r, rank: 1 + rows.filter((o) => o.total > r.total || (o.total === r.total && o.orders > r.orders)).length }));
}

// Roles that work a personal queue: they see only the leads assigned to them and the orders they
// own, and every write is scoped to those. A sales rep always has; since the marketing department
// (migration 044) a marketing specialist does too — same pages, same rules.
const OWN_QUEUE_ROLES = ["sales_rep", "marketing"];
export function isOwnQueueRole(role: string | null | undefined): boolean {
  return !!role && OWN_QUEUE_ROLES.includes(role);
}

// Sales-rep profile display names carry a role suffix ("رحمة (مبيعات)", "لين (تسويق)"), but
// customers.rep_name_raw and the roster above always use the bare name. Any
// value meant to be *matched* against a customer's assigned rep (not just
// displayed) must go through this first, or the join silently never matches.
export function normalizeRepName(name: string | null | undefined): string {
  return (name || "").replace(/\s*\((?:مبيعات|تسويق)\)\s*$/, "").trim();
}

// Resolves a rep's display name (e.g. customers.rep_name_raw = "رحمة") to the
// login username that can actually see her queue, or null if that rep has no
// login account (see ACTIVE_SALES_REPS comment above — most don't, today).
export async function repUsernameForDisplayName(repDisplayName: string): Promise<string | null> {
  const { SYSTEM_ACCOUNTS } = await import("@/lib/auth");
  const target = normalizeRepName(repDisplayName);
  if (!target) return null;
  const account = SYSTEM_ACCOUNTS.find((acc) => normalizeRepName(acc.profile.name) === target);
  return account?.profile.username ?? null;
}
