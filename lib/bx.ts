import {DRIVERS, type DriverName} from "@/lib/driver-ops";

// BX Arabia is a delivery company, not a person on the payroll, and صابرين runs it. Everyone else's
// deliveries stay with ضياء.
//
// This is keyed on the ACCOUNT, not on a role: صابرين is a sales_rep and stays one — she keeps her
// leads, her own orders and /sales, and gains BX on top. Inventing a role for one person would have
// meant either giving every sales rep the delivery module or taking her sales work away.
export const BX_DRIVER: DriverName = "BX Arabia";

// Accounts that coordinate BX. A list so cover during leave is a one-line change rather than a
// migration; ids come from SYSTEM_ACCOUNTS in lib/auth.ts.
export const BX_COORDINATOR_IDS = ["rep-sabreen-01"];

// Management keeps every driver, as a fallback when a coordinator is away.
const FULL_ACCESS_ROLES = ["admin", "general_manager"];

export interface BxActor { id?: string; role?: string }

export const isBxCoordinator = (user: BxActor | null | undefined): boolean =>
  !!user?.id && BX_COORDINATOR_IDS.includes(user.id);

const hasFullAccess = (user: BxActor | null | undefined): boolean =>
  !!user?.role && FULL_ACCESS_ROLES.includes(user.role);

/**
 * The drivers this account may assign to and act on.
 *
 *   management        every driver
 *   BX coordinator    BX Arabia only
 *   driver manager    every driver EXCEPT BX — it moved off ضياء's board entirely
 *   anyone else       none
 */
export function driversFor(user: BxActor | null | undefined): DriverName[] {
  if (hasFullAccess(user)) return [...DRIVERS];
  if (isBxCoordinator(user)) return [BX_DRIVER];
  if (user?.role === "driver_manager") return DRIVERS.filter((d) => d !== BX_DRIVER);
  return [];
}

/** Whether this account may act on an order carrying this driver. */
export function mayActOnDriver(user: BxActor | null | undefined, driver: string | null | undefined): boolean {
  // An order with no driver yet is claimable by anyone who may assign one — that is how an order
  // reaches BX at all, since ضياء can no longer send anything there.
  if (!driver) return driversFor(user).length > 0;
  return (driversFor(user) as string[]).includes(driver);
}

/** Whether this order belongs on this account's board. */
export function inScopeFor(user: BxActor | null | undefined, driver: string | null | undefined): boolean {
  return mayActOnDriver(user, driver);
}
