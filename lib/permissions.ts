// Who may change what. Route access (which pages/APIs a role may open at all) lives in
// isRouteAllowedForRole (lib/auth.ts); this list decides which of those roles may also *write*.
// Pure data, safe to import in pages to hide controls a role cannot use.

export type Action =
  | "orders.create"
  | "orders.status"
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
  // Sales reps only on their own orders (enforced by the order scope in business_status).
  "orders.status": [...MANAGEMENT, "sales_manager", "sales_rep", "driver_manager"],
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
