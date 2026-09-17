import { isSchedulerRequest } from "@/lib/cron-auth";
import { dispatchExpiryAlerts } from "@/lib/hr-notify";
import { sendDailyCallDigest } from "@/lib/call-reminders";

export const dynamic = "force-dynamic";

// Daily background work, called by Cloud Scheduler (job "betolla-daily", 08:00 Asia/Amman):
// HR expiry reminders and each sales rep's call summary for the day.
// Document, contract and probation reminders used to go out only when someone opened the HR
// dashboard; now they are sent every morning (each reminder still only once).
export async function POST(req: Request) {
  if (!(await isSchedulerRequest(req, "/api/cron/daily"))) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const expiryAlerts = await dispatchExpiryAlerts();
  let callDigests = 0;
  try {
    callDigests = await sendDailyCallDigest();
  } catch (e) {
    console.error("[cron/daily] call digest", e);
  }
  return Response.json({ success: true, expiry_alerts_sent: expiryAlerts, call_digests_sent: callDigests });
}
