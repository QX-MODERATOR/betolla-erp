// Server-only: phone push notifications through Firebase Cloud Messaging (HTTP v1).
// On Firebase App Hosting the server authenticates as its runtime service account through the
// metadata server, so no key file is needed. Elsewhere (local dev, tests) sending is skipped.
// Everything here is best-effort: a push failure never fails the action that caused it.
import { securityRpc } from "@/lib/session";

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT
  || (() => { try { return JSON.parse(process.env.FIREBASE_CONFIG || "{}").projectId as string | undefined; } catch { return undefined; } })()
  || "betolla-erp";
const METADATA_TOKEN_URL = process.env.PUSH_METADATA_TOKEN_URL
  || "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
const FCM_URL = process.env.PUSH_FCM_URL || `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;

let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string | null> {
  if (cached && Date.now() < cached.expiresAt) return cached.token;
  try {
    const res = await fetch(METADATA_TOKEN_URL, { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    const data = await res.json() as { access_token: string; expires_in: number };
    cached = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
    return cached.token;
  } catch {
    return null; // not running on Google Cloud
  }
}

export interface PushMessage {
  title: string;
  body: string;
  link?: string | null; // in-app path, e.g. "/driver"
  type?: string;
}

// Only in-app paths are passed to the phone; the app opens them inside the ERP.
const safeLink = (link?: string | null) => (link && link.startsWith("/") && !link.startsWith("//") ? link : "/");

async function sendOne(bearer: string, token: string, msg: PushMessage): Promise<"sent" | "gone" | "failed"> {
  try {
    const res = await fetch(FCM_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: msg.title.slice(0, 200), body: msg.body.slice(0, 1000) },
          data: { title: msg.title.slice(0, 200), body: msg.body.slice(0, 1000), link: safeLink(msg.link), type: msg.type || "" },
          android: { priority: "HIGH", notification: { channel_id: "betolla_default", icon: "ic_stat_notify", color: "#9e8959" } },
        },
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return "sent";
    const text = await res.text();
    // The device uninstalled the app or the token rotated.
    if (res.status === 404 || /UNREGISTERED|registration-token-not-registered|Invalid registration/i.test(text)) return "gone";
    console.warn(`[push] FCM ${res.status}: ${text.slice(0, 200)}`);
    return "failed";
  } catch {
    return "failed";
  }
}

export async function pushToAccounts(accountIds: string[], msg: PushMessage): Promise<void> {
  const ids = [...new Set(accountIds.filter(Boolean))];
  if (!ids.length) return;
  const devices = await securityRpc<{ token: string; account_id: string }[]>("business_push_tokens", { p_accounts: ids });
  if (devices.status !== "ok" || !devices.data.length) return;
  const bearer = await accessToken();
  if (!bearer) return;
  const results = await Promise.all(devices.data.map(async (d) => [d.token, await sendOne(bearer, d.token, msg)] as const));
  const gone = results.filter(([, r]) => r === "gone").map(([t]) => t);
  if (gone.length) await securityRpc("business_push_remove", { p_tokens: gone });
}

// For tests.
export function resetPushTokenCache(): void {
  cached = null;
}
