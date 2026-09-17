import { isSchedulerRequest } from "@/lib/cron-auth";
import { dispatchExpiryAlerts } from "@/lib/hr-notify";

export const dynamic = "force-dynamic";

// Daily background work, called by Cloud Scheduler (job "betolla-daily", 08:00 Asia/Amman).
// Document, contract and probation reminders used to go out only when someone opened the HR
// dashboard; now they are sent every morning (each reminder still only once).
export async function POST(req: Request) {
  if (!(await isSchedulerRequest(req))) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const expiryAlerts = await dispatchExpiryAlerts();
  return Response.json({ success: true, expiry_alerts_sent: expiryAlerts });
}
