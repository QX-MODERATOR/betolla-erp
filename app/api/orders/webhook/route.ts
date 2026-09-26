import { timingSafeEqual } from "node:crypto";
import { businessRpc, requestKey, readBody, BusinessError } from "@/lib/business-server";
import { securityRpc } from "@/lib/session";
import { validateWebhookOrder, OrderWebhookError, type WebhookOrderInput } from "@/lib/order-webhook";
import type { BusinessOrder } from "@/lib/business";

export const dynamic = "force-dynamic";

// Public order intake for the Betolla PLASMA landing page (a separate Firebase project — see
// n8n/README_WEBHOOKS.md section 3). Unlike /api/leads, this creates a real confirmed order and
// deducts real inventory, so — unlike LEADS_WEBHOOK_SECRET — a missing secret refuses every
// request instead of defaulting to open.
const ORDER_LIMITS = { perClient: 10, perClientWindow: 600, total: 200, totalWindow: 3600 };
const ACTOR = "landing-page";

function secretMatches(req: Request): boolean {
  const expected = process.env.ORDERS_WEBHOOK_SECRET?.trim();
  if (!expected) return false;
  const given = Buffer.from(req.headers.get("x-orders-secret") || "");
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}

const clientKey = (req: Request) =>
  (req.headers.get("x-forwarded-for") || "").split(",")[0].trim().slice(0, 64) || "unknown";

async function withinLimits(req: Request): Promise<boolean> {
  const hit = (bucket: string, limit: number, windowSeconds: number) =>
    securityRpc<{ allowed: boolean }>("security_rate_hit", { p_bucket: bucket, p_limit: limit, p_window_seconds: windowSeconds, p_lock_seconds: 0 });
  const perClient = await hit(`order-webhook:client:${clientKey(req)}`, ORDER_LIMITS.perClient, ORDER_LIMITS.perClientWindow);
  if (perClient.status === "ok" && !perClient.data.allowed) return false;
  const total = await hit("order-webhook:all", ORDER_LIMITS.total, ORDER_LIMITS.totalWindow);
  return !(total.status === "ok" && !total.data.allowed);
}

const ERROR_MESSAGES: Record<string, string> = {
  UNKNOWN_PACKAGE: "الرجاء اختيار بكج صحيح.",
  INVALID_QUANTITY: "الكمية غير صحيحة.",
  MISSING_NAME: "الاسم الكامل مطلوب.",
  INVALID_PHONE: "رقم هاتف أردني غير صحيح.",
  MISSING_CITY: "المحافظة مطلوبة.",
  MISSING_ADDRESS: "العنوان مطلوب.",
};

export async function POST(req: Request) {
  try {
    if (!secretMatches(req)) {
      return Response.json({ success: false, error: "رمز الربط غير صحيح أو غير مُهيأ." }, { status: 401 });
    }
    if (!(await withinLimits(req))) {
      return Response.json({ success: false, error: "طلبات كثيرة. حاول لاحقًا." }, { status: 429, headers: { "Retry-After": "600" } });
    }

    const key = requestKey(req); // Idempotency-Key header, required — same UUID the landing
    // page already generated for its own Firestore order, so a retried sync never duplicates.
    const body = (await readBody(req)) as unknown as WebhookOrderInput;

    let validated;
    try {
      validated = validateWebhookOrder(body);
    } catch (e) {
      if (e instanceof OrderWebhookError) {
        return Response.json({ success: false, error: ERROR_MESSAGES[e.message] || e.message }, { status: e.status });
      }
      throw e;
    }

    const orderData: Record<string, unknown> = {
      customer_name: validated.customerName,
      customer_phone: validated.customerPhone,
      city: validated.city,
      address: validated.address,
      items: [{ name: validated.itemName, qty: validated.quantity, price: validated.unitPrice }],
      total_amount: validated.totalAmount,
      source: "landing_page",
      payment_method: "cash_on_delivery",
      status: "confirmed",
      installment_notes: validated.notes,
      rep_name: "Website",
      // No customer_id: dedupe by phone against ANY existing customer, not scoped to one rep —
      // a landing-page order is a company-wide channel, not a single rep's lead.
      reuse_phone: true,
    };

    const result = await businessRpc<{ order: BusinessOrder; replayed: boolean }>("business_create_order", {
      p_actor: ACTOR,
      p_key: key,
      p_data: orderData,
    });

    // Only the safe subset the landing page needs to show the customer — never the full order
    // or any customer record.
    return Response.json(
      { success: true, replayed: result.replayed, orderNumber: result.order.id, total: result.order.total_amount },
      { status: result.replayed ? 200 : 201 }
    );
  } catch (e) {
    if (e instanceof BusinessError) {
      return Response.json({ success: false, error: e.message }, { status: e.status });
    }
    return Response.json({ success: false, error: "تعذر تأكيد الحفظ أو القراءة. أعد المحاولة بنفس العملية؛ لا تنشئ عملية بديلة." }, { status: 503 });
  }
}

export async function GET() {
  return Response.json({
    status: "active",
    endpoint: "/api/orders/webhook",
    description: "نقطة استقبال الطلبات الآلية من صفحة الهبوط (Landing Page) — تُنشئ طلبًا حقيقيًا وتُخصم المخزون مباشرة.",
    requiredHeaders: ["X-Orders-Secret", "Idempotency-Key"],
    supportedFields: ["packageId", "quantity", "fullName", "phone", "city", "address", "notes", "language"],
  });
}
