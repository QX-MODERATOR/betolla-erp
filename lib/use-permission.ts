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
  const role = useSyncExternalStore(subscribe, readRole, () => null);
  return can(role, action);
}
