// Who may change what. Route access (which pages/APIs a role may open at all) lives in
// isRouteAllowedForRole (lib/auth.ts); this list decides which of those roles may also *write*.
// Pure data, safe to import in pages to hide controls a role cannot use.

export type Action =
  | "orders.create"
  | "orders.status"
  | "orders.dispatch"
  | "orders.edit"
  | "inventory.write"
  | "finance.write"
  | "customers.edit"
  | "customers.reassign"
  | "calls.log"
  | "telegram.send"
  | "profiles.viewPrivate";

const MANAGEMENT = ["admin", "general_manager"];

export const PERMISSIONS: Record<Action, readonly string[]> = {
  "orders.create": [...MANAGEMENT, "sales_manager", "sales_rep", "marketing_manager", "marketing"],
  // Not sales reps. A rep takes the order and then follows it — confirming, processing, shipping,
  // delivering and returning are operations' decisions, and a rep marking her own order delivered
  // is the one thing that lets stock and cash drift without anyone noticing. She still sees the
  // status on every order she owns; she just cannot move it.
  "orders.status": [...MANAGEMENT, "sales_manager", "driver_manager"],
  // Handing an order to a driver is a narrower thing than moving its status, and it belongs to the
  // person who knows where the drivers are. A sales manager still confirms, processes and cancels;
  // only ضياء (driver_manager) and management send goods out, naming the driver as they do.
  // Enforced on processing -> shipped in /api/orders, and in the database by DRIVER_REQUIRED.
  "orders.dispatch": [...MANAGEMENT, "driver_manager"],
  // Sales reps only on their own orders, and only draft/confirmed/processing (enforced by
  // business_order_update's owner/status checks).
  "orders.edit": [...MANAGEMENT, "sales_manager", "sales_rep"],
  "inventory.write": [...MANAGEMENT, "driver_manager"],
  "finance.write": [...MANAGEMENT, "finance"],
  // Sales reps only on leads assigned to them.
  "customers.edit": [...MANAGEMENT, "sales_manager", "sales_rep", "marketing_manager", "marketing"],
  "customers.reassign": [...MANAGEMENT, "sales_manager", "marketing_manager", "marketing"],
  // Sales reps only on leads assigned to them.
  "calls.log": [...MANAGEMENT, "sales_manager", "sales_rep"],
  "telegram.send": [...MANAGEMENT],
  // Colleagues' phone, WhatsApp, email, city and bio.
  "profiles.viewPrivate": [...MANAGEMENT, "hr_operations"],
};

export function can(role: string | null | undefined, action: Action): boolean {
  return !!role && PERMISSIONS[action].includes(role);
}
