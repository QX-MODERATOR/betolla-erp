// Server-only notification helpers for the order -> driver-manager -> driver
// handoff. Mirrors the existing admin -> sales-rep pattern in app/api/leads/route.ts
// (lib/reps.ts's repUsernameForDisplayName + business_notification_create), just
// generalized to any account whose profile.name carries a trailing role suffix
// ("ضياء (مدير سائقين التوصيل)", "خالد (سائق توصيل)", ...).
import { businessRpc } from "@/lib/business-server";
import { pushToAccounts } from "@/lib/push";

function stripRoleSuffix(name: string): string {
  return (name || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
}

export async function driverManagerUsernames(): Promise<string[]> {
  const { SYSTEM_ACCOUNTS } = await import("@/lib/auth");
  return SYSTEM_ACCOUNTS.filter((acc) => acc.profile.role === "driver_manager").map((acc) => acc.profile.username);
}

export async function financeUsernames(): Promise<string[]> {
  const { SYSTEM_ACCOUNTS } = await import("@/lib/auth");
  return SYSTEM_ACCOUNTS.filter((acc) => acc.profile.role === "finance").map((acc) => acc.profile.username);
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  confirmed: "تم تأكيد الطلب", processing: "الطلب قيد التجهيز", shipped: "تم شحن الطلب",
  delivered: "تم تسليم الطلب", cancelled: "تم إلغاء الطلب", returned: "تم إرجاع الطلب",
};

// The rep who owns the order, the driver manager(s), and finance all need to see the order's
// lifecycle, not just its creation (which app/api/orders/route.ts's POST already notifies about).
export async function notifyOrderStatusChange(
  order: { id: string; customer_name: string; rep_name?: string },
  status: string
): Promise<void> {
  const label = ORDER_STATUS_LABELS[status];
  if (!label) return;
  const { repUsernameForDisplayName } = await import("@/lib/reps");
  const usernames = new Set<string>();
  if (order.rep_name) {
    const repUsername = await repUsernameForDisplayName(order.rep_name);
    if (repUsername) usernames.add(repUsername);
  }
  for (const u of await driverManagerUsernames()) usernames.add(u);
  for (const u of await financeUsernames()) usernames.add(u);
  await Promise.all(
    // Deep link: a notification about one order should open that order, not drop the reader on a
    // list to find it again. The orders screen reads ?order= and opens its details.
    [...usernames].map((u) => notifyUser(u, "order_status", label, `${order.customer_name} — ${order.id}`, `/orders?order=${encodeURIComponent(order.id)}`))
  );
}

// Resolves a driver display name as stored on orders (e.g. "خالد", "BX Arabia")
// to the login username that can receive a notification, or null if that driver
// has no login account.
export async function usernameForDriverDisplayName(driverDisplayName: string): Promise<string | null> {
  const { SYSTEM_ACCOUNTS } = await import("@/lib/auth");
  const target = stripRoleSuffix(driverDisplayName);
  if (!target) return null;
  const account = SYSTEM_ACCOUNTS.find(
    (acc) => acc.profile.role === "driver" && (stripRoleSuffix(acc.profile.name) === target || acc.profile.repId === driverDisplayName)
  );
  return account?.profile.username ?? null;
}

// Best-effort: a notification failure must never fail the real operation
// (order creation, driver assignment) it's attached to. The in-app notification is also sent to
// the person's phones (Android app) as a push notification.
export async function notifyUser(username: string, type: string, title: string, body: string, link: string): Promise<void> {
  try {
    await businessRpc("business_notification_create", { p_username: username, p_type: type, p_title: title, p_body: body, p_link: link });
  } catch {
    return;
  }
  try {
    const { SYSTEM_ACCOUNTS } = await import("@/lib/auth");
    const account = SYSTEM_ACCOUNTS.find((acc) => acc.profile.username === username);
    if (account) await pushToAccounts([account.profile.id], { title, body, link, type });
  } catch {
    // swallow
  }
}
