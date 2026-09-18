"use client";

import { useSyncExternalStore } from "react";
import { can, type Action } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/client-api";

// The signed-in role, read after hydration (null during server rendering). Only hides controls;
// the API enforces the same rules.
const subscribe = (onChange: () => void) => {
  window.addEventListener("betolla_user_updated", onChange);
  return () => window.removeEventListener("betolla_user_updated", onChange);
};
const readRole = (): string | null => getCurrentUser()?.role ?? null;

export function useCan(action: Action): boolean {
  return can(useRole(), action);
}

// The role itself, for the few places that switch layout rather than hide a control — /drivers
// shows ضياء the order lifecycle beside the delivery board. Null until hydration, same as useCan.
export function useRole(): string | null {
  return useSyncExternalStore(subscribe, readRole, () => null);
}
