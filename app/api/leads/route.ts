import { timingSafeEqual } from "node:crypto";
import { businessRpc, prepareLead, readBody, businessFailure } from "@/lib/business-server";
import { securityRpc } from "@/lib/session";
import { repUsernameForDisplayName } from "@/lib/reps";
import type { BusinessCustomer } from "@/lib/business";

export const dynamic = "force-dynamic";

// Public lead intake (landing pages / n8n). If LEADS_WEBHOOK_SECRET is configured, callers must
// send it in the X-Leads-Secret header. Submissions are rate limited per client and in total.
const LEAD_LIMITS = { perClient: 20, perClientWindow: 600, total: 500, totalWindow: 3600 };

function secretMatches(req: Request): boolean {
  const expected = process.env.LEADS_WEBHOOK_SECRET?.trim();
  if (!expected) return true;
  const given = Buffer.from(req.headers.get("x-leads-secret") || "");
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}

// First X-Forwarded-For entry. A caller can forge it, so the total limit is the real ceiling.
const clientKey = (req: Request) =>
  (req.headers.get("x-forwarded-for") || "").split(",")[0].trim().slice(0, 64) || "unknown";

async function withinLimits(req: Request): Promise<boolean> {
  const hit = (bucket: string, limit: number, windowSeconds: number) =>
    securityRpc<{ allowed: boolean }>("security_rate_hit", { p_bucket: bucket, p_limit: limit, p_window_seconds: windowSeconds, p_lock_seconds: 0 });
  const perClient = await hit(`lead:client:${clientKey(req)}`, LEAD_LIMITS.perClient, LEAD_LIMITS.perClientWindow);
  if (perClient.status === "ok" && !perClient.data.allowed) return false;
  const total = await hit("lead:all", LEAD_LIMITS.total, LEAD_LIMITS.totalWindow);
  return !(total.status === "ok" && !total.data.allowed);
}

export async function POST(req: Request) {
  try {
    if (!secretMatches(req)) {
      return Response.json({ success: false, error: "رمز الربط غير صحيح." }, { status: 401 });
    }
    if (!(await withinLimits(req))) {
      return Response.json({ success: false, error: "طلبات كثيرة. حاول لاحقًا." }, { status: 429, headers: { "Retry-After": "600" } });
    }
    const body = await readBody(req);
    const prepared = prepareLead(body);
    const { customer, is_duplicate } = await businessRpc<{ customer: BusinessCustomer; is_duplicate: boolean }>(
      "business_customer_create",
      { p_data: prepared }
    );

    if (!is_duplicate) {
      // Best-effort: a rep with no login account (see lib/reps.ts) has nowhere
      // to receive this, and a notification failure must never fail the lead.
      try {
        const username = await repUsernameForDisplayName(customer.rep_name_raw || "");
        if (username) {
          await businessRpc("business_notification_create", {
            p_username: username,
            p_type: "new_lead",
            p_title: "ليد جديد مسند لك",
            p_body: `${customer.name} — ${customer.phone}`,
            p_link: "/sales",
          });
        }
      } catch {
        // Notification delivery is not part of the lead-creation contract.
      }
    }

    return Response.json(
      {
        success: true,
        is_duplicate,
        message: is_duplicate
          ? `العميل مسجل مسبقاً في النظام ومسند للمندوب (${customer.rep_name_raw || "غير محدد"}).`
          : `تم تسجيل الليد بنجاح وتحويله آلياً إلى المندوب (${customer.rep_name_raw}) دون الحاجة لطباعة أوراق.`,
        customer,
        // Kept for backward compatibility with any existing n8n workflow mapping `lead`.
        lead: customer,
      },
      { status: is_duplicate ? 200 : 201 }
    );
  } catch (e) {
    return businessFailure(e);
  }
}

export async function GET() {
  return Response.json({
    status: "active",
    endpoint: "/api/leads",
    description: "نقطة استقبال الليدات الآلية لربط التسويق ونظام n8n بـ Betolla ERP (تُخزَّن العملاء في قاعدة البيانات مباشرة)",
    supportedFields: ["name", "phone", "city", "address", "notes", "source", "rep_name"],
  });
}
