import { timingSafeEqual } from "crypto";

/**
 * Verifies the `X-Webhook-Secret` header on public-facing automation
 * endpoints (POST /api/leads, and the whatsapp-order / ingest-lead Supabase
 * Edge Functions). CORS is NOT a security boundary for server-to-server
 * webhooks like n8n — it's a browser-enforced convention that a non-browser
 * caller simply ignores — so this shared secret is the actual gate.
 */
export function verifyWebhookSecret(providedSecret: string | null | undefined, expectedSecret: string | undefined): boolean {
  if (!expectedSecret) {
    // Fail closed: an unconfigured secret must never be treated as "no auth required".
    return false;
  }
  if (!providedSecret) return false;

  const a = Buffer.from(providedSecret);
  const b = Buffer.from(expectedSecret);
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

export const WEBHOOK_SECRET_HEADER = "x-webhook-secret";
