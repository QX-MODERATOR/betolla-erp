// Who may change what. Route access (which pages/APIs a role may open at all) lives in
// isRouteAllowedForRole (lib/auth.ts); this list decides which of those roles may also *write*.
// Pure data, safe to import in pages to hide controls a role cannot use.

export type Action =
  | "orders.create"
  | "orders.status"
  | "orders.dispatch"
  | "orders.edit"
  | "orders.issue"
  | "inventory.write"
  | "finance.write"
  | "customers.edit"
  | "customers.reassign"
  | "customers.assign_batch"
  | "customers.unassign"
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
  // Once an order is placed only admin and رشا change it (ACCOUNT_GRANTS below). Order entry no
  // longer stops at the stock on hand (migration 047), so the rep who places an order answers for
  // its quantities, and changing them afterwards is a manager's decision, not hers.
  "orders.edit": ["admin"],
  // Tagging an operational problem on an order (Out of Stock, delivery delay, ...) for the daily
  // report: management, the sales manager and ضياء, who see the problems happen (migration 051).
  "orders.issue": [...MANAGEMENT, "sales_manager", "driver_manager"],
  "inventory.write": [...MANAGEMENT, "driver_manager"],
  "finance.write": [...MANAGEMENT, "finance"],
  // Sales reps only on leads assigned to them.
  "customers.edit": [...MANAGEMENT, "sales_manager", "sales_rep", "marketing_manager", "marketing"],
  "customers.reassign": [...MANAGEMENT, "sales_manager", "marketing_manager", "marketing"],
  // Sending a rep a list of numbers to call ("إرسال أرقام للمندوب" on /sales, migration 052): the
  // admin accounts only — the owner decides who calls whom (not رشا, not the general manager).
  "customers.assign_batch": ["admin"],
  // Taking a contact off a rep's list (the remove button on /sales cards): admin only. Reassigning
  // to another rep stays with customers.reassign; leaving a customer with no rep does not.
  "customers.unassign": ["admin"],
  // Sales reps and marketing specialists only on leads assigned to them.
  "calls.log": [...MANAGEMENT, "sales_manager", "sales_rep", "marketing_manager", "marketing"],
  "telegram.send": [...MANAGEMENT],
  // Colleagues' phone, WhatsApp, email, city and bio.
  "profiles.viewPrivate": [...MANAGEMENT, "hr_operations"],
};

// Individual accounts allowed an action their role is not. رشا (mgr-rasha-01) edits orders; the
// other sales_manager account does not.
export const ACCOUNT_GRANTS: Partial<Record<Action, readonly string[]>> = {
  "orders.edit": ["mgr-rasha-01"],
};

export function can(role: string | null | undefined, action: Action, accountId?: string | null): boolean {
  if (accountId && ACCOUNT_GRANTS[action]?.includes(accountId)) return true;
  return !!role && PERMISSIONS[action].includes(role);
}
