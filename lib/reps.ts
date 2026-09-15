// Canonical roster of assignable sales rep display names (matches rep_name_raw
// values written by business_customer_create / lead auto-assignment, and the
// Arabic profile names in lib/profile-store.ts). Single source of truth so the
// auto-assignment pool (lib/business-server.ts) and the sales rep switcher UI
// (app/sales/page.tsx) never drift apart or disagree on spelling.
export const ACTIVE_SALES_REPS = ["حمزة", "رحمة", "صابرين", "حنان", "سارة", "حنين"];
