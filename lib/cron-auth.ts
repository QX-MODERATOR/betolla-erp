// Server-only: verifies that a request comes from our Cloud Scheduler job. The job attaches a
// Google-signed OIDC identity token for a dedicated service account; nothing secret is stored here.
import { createRemoteJWKSet, jwtVerify } from "jose";

const GOOGLE_JWKS_URL = process.env.CRON_JWKS_URL || "https://www.googleapis.com/oauth2/v3/certs";
const INVOKER = process.env.CRON_INVOKER_EMAIL || "betolla-scheduler@betolla-erp.iam.gserviceaccount.com";
const AUDIENCE = process.env.CRON_AUDIENCE || "https://betolla-erp--betolla-erp.us-east4.hosted.app/api/cron/daily";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export async function isSchedulerRequest(req: Request): Promise<boolean> {
  const header = req.headers.get("authorization") || "";
  if (!header.toLowerCase().startsWith("bearer ")) return false;
  try {
    jwks ??= createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
    const { payload } = await jwtVerify(header.slice(7).trim(), jwks, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: AUDIENCE,
      algorithms: ["RS256"],
    });
    return payload.email === INVOKER && payload.email_verified === true;
  } catch {
    return false;
  }
}

// For tests.
export function resetSchedulerKeys(): void {
  jwks = null;
}
