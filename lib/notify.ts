// Server-only notification helpers for the order -> driver-manager -> driver
// handoff. Mirrors the existing admin -> sales-rep pattern in app/api/leads/route.ts
// (lib/reps.ts's repUsernameForDisplayName + business_notification_create), just
// generalized to any account whose profile.name carries a trailing role suffix
// ("ضياء (مدير سائقين التوصيل)", "خالد (سائق توصيل)", ...).
import { businessRpc } from "@/lib/business-server";

function stripRoleSuffix(name: string): string {
  return (name || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
}

export async function driverManagerUsernames(): Promise<string[]> {
  const { SYSTEM_ACCOUNTS } = await import("@/lib/auth");
  return SYSTEM_ACCOUNTS.filter((acc) => acc.profile.role === "driver_manager").map((acc) => acc.profile.username);
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
// (order creation, driver assignment) it's attached to.
export async function notifyUser(username: string, type: string, title: string, body: string, link: string): Promise<void> {
  try {
    await businessRpc("business_notification_create", { p_username: username, p_type: type, p_title: title, p_body: body, p_link: link });
  } catch {
    // swallow
  }
}
