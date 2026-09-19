// The marketing department: who is in it, what each person may do, and the shared vocabulary of
// campaigns and tasks. Pure data, safe to import in pages (no server imports, no '@/' imports, so
// the tests can load it with bare node).
//
// Membership is keyed on the ACCOUNT, not on a role, for the same reason as BX (lib/bx.ts): رحمة
// and حمزة are sales reps and stay sales reps — they keep their leads, their orders and /sales —
// and join marketing on top. A "marketing" role could not say that without taking their sales work
// away. The marketing_manager and marketing roles are members by role as well, so a new marketing
// login joins the department without a code change here.

export type MarketingPosition = "manager" | "coordinator" | "specialist" | "meta_orders";

export interface MarketingMember {
  accountId: string;
  position: MarketingPosition;
  titleAr: string;
  titleEn: string;
  focusAr: string;
}

// Account ids come from SYSTEM_ACCOUNTS in lib/auth.ts.
export const MARKETING_TEAM: readonly MarketingMember[] = [
  { accountId: "mgr-mkt-01", position: "manager", titleAr: "مدير التسويق", titleEn: "Marketing Manager",
    focusAr: "يعتمد الحملات والميزانيات، يوزّع المهام ويراجعها" },
  { accountId: "rep-hamza-01", position: "coordinator", titleAr: "منسّق التسويق والتخطيط", titleEn: "Marketing Coordinator",
    focusAr: "يخطط الحملات مع المدير، يسجّل المصاريف ويتابع تنفيذ المهام" },
  { accountId: "rep-rahma-01", position: "meta_orders", titleAr: "طلبات منصات ميتا", titleEn: "Meta Orders",
    focusAr: "تستقبل طلبات فيسبوك وإنستغرام وتسجّلها من صفحة المبيعات وتربطها بالحملة" },
  { accountId: "mkt-leen-01", position: "specialist", titleAr: "أخصائية تسويق", titleEn: "Marketing Specialist",
    focusAr: "تتابع ليداتها وطلباتها وتنفّذ مهام الحملات" },
  { accountId: "mkt-team-01", position: "specialist", titleAr: "أخصائية تسويق ومحتوى", titleEn: "Marketing & Content",
    focusAr: "تنفّذ مهام المحتوى المسندة من مدير التسويق وترفعها للمراجعة" },
];

// Sign-off: create and edit campaigns, record spend, assign any task, close or reopen tasks.
const MANAGING_ROLES = ["admin", "general_manager", "marketing_manager"];
const MEMBER_ROLES = ["marketing"];

export type MarketingAccess = "manage" | "member" | null;

export interface MarketingActor { id?: string; role?: string }

export function marketingMember(user: MarketingActor | null | undefined): MarketingMember | null {
  return (user?.id && MARKETING_TEAM.find((m) => m.accountId === user.id)) || null;
}

export function marketingAccess(user: MarketingActor | null | undefined): MarketingAccess {
  if (!user?.role) return null;
  const member = marketingMember(user);
  if (MANAGING_ROLES.includes(user.role) || member?.position === "manager" || member?.position === "coordinator") return "manage";
  if (member || MEMBER_ROLES.includes(user.role)) return "member";
  return null;
}

/** Account ids that are members of the department by account (the sidebar and route guard use these). */
export const MARKETING_ACCOUNT_IDS = MARKETING_TEAM.map((m) => m.accountId);

/** Who gets told when work is waiting for sign-off. */
export const MARKETING_SIGNOFF_IDS = MARKETING_TEAM.filter((m) => m.position === "manager" || m.position === "coordinator").map((m) => m.accountId);

// ---- Vocabulary -------------------------------------------------------------------------------

export type CampaignChannel = "facebook" | "instagram" | "tiktok" | "snapchat" | "google" | "whatsapp" | "influencer" | "offline" | "other";
export type CampaignObjective = "awareness" | "leads" | "sales" | "retention";
export type CampaignStatus = "planned" | "active" | "paused" | "completed" | "cancelled";
export type TaskStatus = "todo" | "in_progress" | "review" | "done" | "cancelled";
export type TaskPriority = "low" | "normal" | "high" | "urgent";

export const CHANNEL_LABELS: Record<CampaignChannel, string> = {
  facebook: "فيسبوك", instagram: "إنستغرام", tiktok: "تيك توك", snapchat: "سناب شات", google: "جوجل",
  whatsapp: "واتساب", influencer: "مؤثرين", offline: "ميداني / مطبوعات", other: "أخرى",
};
export const OBJECTIVE_LABELS: Record<CampaignObjective, string> = {
  awareness: "الوعي بالعلامة", leads: "جلب ليدات", sales: "مبيعات مباشرة", retention: "استرجاع العملاء",
};
export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, { label: string; color: string }> = {
  planned: { label: "مخططة", color: "bg-sky-50 text-sky-700 border-sky-200" },
  active: { label: "فعّالة", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  paused: { label: "متوقفة مؤقتًا", color: "bg-amber-50 text-amber-800 border-amber-200" },
  completed: { label: "منتهية", color: "bg-stone-100 text-stone-600 border-stone-200" },
  cancelled: { label: "ملغاة", color: "bg-rose-50 text-rose-700 border-rose-200" },
};
export const TASK_STATUS_LABELS: Record<TaskStatus, { label: string; color: string }> = {
  todo: { label: "جديدة", color: "bg-stone-100 text-stone-700 border-stone-200" },
  in_progress: { label: "قيد التنفيذ", color: "bg-sky-50 text-sky-700 border-sky-200" },
  review: { label: "بانتظار المراجعة", color: "bg-violet-50 text-violet-700 border-violet-200" },
  done: { label: "منجزة", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelled: { label: "ملغاة", color: "bg-rose-50 text-rose-700 border-rose-200" },
};
export const TASK_PRIORITY_LABELS: Record<TaskPriority, { label: string; color: string }> = {
  low: { label: "منخفضة", color: "text-stone-500" },
  normal: { label: "عادية", color: "text-stone-700" },
  high: { label: "مرتفعة", color: "text-amber-700" },
  urgent: { label: "عاجلة", color: "text-rose-700" },
};

// The moves a person may make from a status. Members stop at "review"; closing and reopening is the
// manager's sign-off. Mirrors business_mkt_task_update (044), which enforces it again.
export function taskMoves(status: TaskStatus, access: MarketingAccess): TaskStatus[] {
  const open: TaskStatus[] = ["todo", "in_progress", "review"];
  if (access === "manage") {
    if (status === "done" || status === "cancelled") return ["in_progress"];
    return [...open.filter((s) => s !== status), "done", "cancelled"];
  }
  if (status === "done" || status === "cancelled") return [];
  return open.filter((s) => s !== status);
}

// ---- Shapes returned by /api/marketing -------------------------------------------------------

export interface MktCampaign {
  id: string; code: string; name: string; channel: CampaignChannel; objective: CampaignObjective; status: CampaignStatus;
  start_date: string; end_date: string | null; budget: number; target_leads: number | null; target_revenue: number | null;
  owner_account_id: string | null; owner_name?: string; promo_code: string | null; audience: string; notes: string;
  created_by: string; created_at: string; updated_at: string;
  spend: number; spend_this_month: number; leads: number; leads_this_month: number; new_leads: number;
  converted: number; orders: number; revenue: number; delivered_revenue: number;
  promo_redemptions: number; promo_saved: number;
  cost_per_lead: number | null; cost_per_customer: number | null; conversion_rate: number | null;
  roas: number | null; budget_used: number | null;
}

export interface MktSpend {
  id: string; campaign_id: string; spend_date: string; amount: number; description: string;
  created_by: string; created_by_name?: string; created_at: string;
  voided_at: string | null; voided_by: string | null; void_reason: string;
}

export interface MktCampaignLead {
  customer_id: string; name: string; phone: string; city: string; rep_name: string; lead_source: string;
  customer_created_at: string; attributed_by: string; attributed_by_name?: string; attributed_at: string;
  orders: number; revenue: number;
}

export interface MktTaskUpdate {
  id: string; actor_id: string; actor_name?: string; kind: "created" | "edited" | "status" | "comment";
  status_from: TaskStatus | null; status_to: TaskStatus | null; note: string; created_at: string;
}

export interface MktTask {
  id: string; title: string; description: string; campaign_id: string | null; campaign_name: string;
  assignee_account_id: string; assignee_name?: string; created_by: string; created_by_name?: string;
  due_date: string | null; priority: TaskPriority; status: TaskStatus; completed_at: string | null;
  created_at: string; updated_at: string; comments: number; last_activity: string | null;
  thread?: MktTaskUpdate[];
}

export interface MktTeamMember extends MarketingMember { name: string; username: string }

// A campaign that ran up more than its budget, or is running with no budget at all.
export function budgetTone(c: Pick<MktCampaign, "budget" | "budget_used">): string {
  if (c.budget_used === null) return "text-stone-500";
  if (c.budget_used > 100) return "text-rose-600";
  if (c.budget_used >= 85) return "text-amber-600";
  return "text-emerald-700";
}

// Return on ad spend, coloured against break-even (1.0 = the ads paid for themselves in orders).
export function roasTone(roas: number | null): string {
  if (roas === null) return "text-stone-400";
  if (roas >= 3) return "text-emerald-700";
  if (roas >= 1) return "text-amber-700";
  return "text-rose-600";
}
