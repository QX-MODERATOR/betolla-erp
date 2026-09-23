// Shared driver-module model (client + server). The database functions in migration 027
// (business_driver_*) are authoritative; this file only shapes their documents for the pages.

export const DRIVERS = ["خالد", "علي", "BX Arabia"] as const;
export type DriverName = (typeof DRIVERS)[number];

// Roles that manage deliveries (assign, dispatch, reconcile, reopen a shift).
// Drivers who get the step-by-step delivery screen (/driver/delivery/[id]); BX Arabia is a courier
// company with its own tracking.
export const TRACKED_DRIVERS: string[] = ["خالد", "علي"];

export const DRIVER_MANAGER_ROLES = ["admin", "general_manager", "driver_manager"];
// Roles that may post an end-of-day reconciliation (managers + finance).
export const RECONCILE_ROLES = [...DRIVER_MANAGER_ROLES, "finance"];

const stripRoleSuffix = (name: string) => (name || "").replace(/\s*\([^)]*\)\s*$/, "").trim();

// Mirrors SQL business_driver_canonical.
export function canonicalDriver(name: string | null | undefined): string | null {
  const n = stripRoleSuffix(name || "");
  if (!n || ["unassigned", "null", "none", "all"].includes(n.toLowerCase())) return null;
  if (n.toLowerCase().startsWith("bx")) return "BX Arabia";
  return n;
}

const DRIVER_BY_ACCOUNT_KEY: Record<string, DriverName> = {
  khalid: "خالد", "khalid.driver": "خالد", ali: "علي", "ali.driver": "علي",
  bx: "BX Arabia", "bx arabia": "BX Arabia", bxarabia: "BX Arabia",
};

// The driver a signed-in driver account is. Never falls back to another driver.
export function driverOfAccount(user: { role?: string; name?: string; username?: string; repId?: string } | null | undefined): DriverName | null {
  if (!user || user.role !== "driver") return null;
  for (const key of [user.repId, user.username]) {
    const hit = key ? DRIVER_BY_ACCOUNT_KEY[key.toLowerCase().trim()] : undefined;
    if (hit) return hit;
  }
  const byName = canonicalDriver(user.name);
  return (DRIVERS as readonly string[]).includes(byName || "") ? (byName as DriverName) : null;
}

export type DriverStatus = "pending" | "delivered" | "returned" | "postponed" | "remaining";

export interface DriverOrderRecord {
  id: string;
  dbId: string;
  dbStatus: string; // orders.status, sent back as expected_status on every write
  customer_name: string;
  phone: string;
  area: string;
  address: string;
  products: string;
  rep_name: string;
  order_total: number;
  paid_amount: number;
  cash_to_collect: number;
  cash_collected: number | null; // what the driver actually handed in (delivered orders)
  receivables: number;
  payment_method: "cash" | "cliq";
  cliq_includes_delivery: boolean;
  delivery_fee: number;
  status: DriverStatus;
  postpone_date: string;
  return_reason: string;
  driver: string | null;
  note: string;
  notes: string;
  order_date: string;
  date: string;
  // The journey stamps for the delivery timeline (migration 045 adds started/arrived).
  assigned_at: string | null;
  dispatched_at: string | null;
  completed_at: string | null;
  progress: DeliveryProgress | null;
}

// Where the driver is on this delivery attempt (migration 045, business_driver_progress).
export interface DeliveryProgress { stage: "on_the_way" | "arrived"; started_at: string; arrived_at: string | null }

const stampOf = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

// A progress stamp belongs to one attempt. Postpone / remaining (business_driver_action) set
// delivery.state and state_at without touching progress, so progress only counts while no state is
// set and it was started after the last state change. Shared by the driver board and the order
// document, so the driver, ضياء and the rep never disagree about where the driver is.
export function deliveryProgress(progress: unknown, state: unknown, stateAt: unknown): DeliveryProgress | null {
  if (!progress || typeof progress !== "object") return null;
  const p = progress as Record<string, unknown>;
  const started = stampOf(p.started_at);
  if (!started || stampOf(state)) return null;
  const since = stampOf(stateAt);
  if (since && new Date(started).getTime() <= new Date(since).getTime()) return null;
  const arrived = stampOf(p.arrived_at);
  return { stage: arrived ? "arrived" : "on_the_way", started_at: started, arrived_at: arrived };
}

// Raw document from SQL business_driver_order.
export interface DriverOrderDocument {
  id: string; db_id: string; status: string; order_date: string | null;
  customer_name: string; phone: string; city: string; address: string; rep_name: string;
  items_summary: string; notes: string; total_amount: number | string; paid_amount: number | string;
  payment_method: string; payment_status: string; delivery_fee: number | string | null;
  driver: string | null; delivery: Record<string, unknown> | null; done_day: string | null; updated_at: string;
}

const DEFAULT_DELIVERY_FEE = 2.5;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const tagValue = (notes: string, label: string) => notes.match(new RegExp(`\\[${label}:\\s*([^\\[\\]]+)\\]`))?.[1]?.trim() || "";

export function toDriverOrder(doc: DriverOrderDocument): DriverOrderRecord {
  const d = (doc.delivery || {}) as Record<string, unknown>;
  const notes = doc.notes || "";
  const total = Number(doc.total_amount) || 0;
  const paid = Number(doc.paid_amount) || 0;
  const paymentMethod: "cash" | "cliq" = doc.payment_method === "cliq" ? "cliq" : "cash";
  const fee = Number(doc.delivery_fee) || DEFAULT_DELIVERY_FEE;
  // Legacy rows kept CliQ details only as free text; the structured flag wins when present.
  const cliqIncludesDelivery = typeof d.cliq_includes_delivery === "boolean"
    ? d.cliq_includes_delivery
    : paymentMethod === "cliq" && (notes.includes("شامل") || notes.includes("0.000"));
  const cashToCollect = paymentMethod === "cliq"
    ? (cliqIncludesDelivery ? 0 : fee)
    : round3(Math.max(0, total - paid));

  let status: DriverStatus = "pending";
  if (doc.status === "delivered") status = "delivered";
  else if (doc.status === "returned") status = "returned";
  else if (d.state === "postponed") status = "postponed";
  else if (d.state === "remaining") status = "remaining";
  else if (!("state" in d) && !("driver" in d) && notes.includes("[تاريخ التأجيل:")) status = "postponed";

  let collected: number | null = null;
  if (status === "delivered") {
    if (d.collected !== undefined && d.collected !== null) collected = Number(d.collected);
    else if (tagValue(notes, "المبلغ المستلم")) collected = Number(tagValue(notes, "المبلغ المستلم")) || 0;
  }

  return {
    id: doc.id,
    dbId: doc.db_id,
    dbStatus: doc.status,
    customer_name: doc.customer_name || "",
    phone: doc.phone || "",
    area: doc.city || "",
    address: doc.address || "",
    products: doc.items_summary || "",
    rep_name: doc.rep_name || "",
    order_total: total,
    paid_amount: paid,
    cash_to_collect: cashToCollect,
    cash_collected: collected,
    receivables: 0,
    payment_method: paymentMethod,
    cliq_includes_delivery: cliqIncludesDelivery,
    delivery_fee: fee,
    status,
    postpone_date: typeof d.postpone_date === "string" ? d.postpone_date : tagValue(notes, "تاريخ التأجيل"),
    return_reason: typeof d.return_reason === "string" ? d.return_reason : tagValue(notes, "سبب الإرجاع"),
    driver: canonicalDriver(doc.driver),
    note: typeof d.note === "string" ? d.note : "",
    notes,
    order_date: doc.order_date || "",
    date: doc.order_date || "",
    assigned_at: stampOf(d.assigned_at),
    dispatched_at: stampOf(d.dispatched_at),
    completed_at: stampOf(d.completed_at),
    progress: deliveryProgress(d.progress, d.state, d.state_at),
  };
}

export interface DriverShiftSummary {
  driver: string;
  date: string;
  delivered_count: number;
  returned_count: number;
  open_count: number;
  expected_cash: number;
  closure: null | {
    is_closed: boolean; closed_at: string | null; closed_by: string | null; notes: string;
    cash_collected: number; counted_cash: number | null; delivered_count: number; returned_count: number;
    reopened_by: string | null; reopened_at: string | null;
  };
}

// Actions a driver-facing status maps to (SQL business_driver_action).
export const ACTION_FOR_STATUS: Record<Exclude<DriverStatus, "pending">, string> = {
  delivered: "deliver", returned: "return", postponed: "postpone", remaining: "remaining",
};
