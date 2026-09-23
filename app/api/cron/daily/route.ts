import { isSchedulerRequest } from "@/lib/cron-auth";
import { dispatchExpiryAlerts } from "@/lib/hr-notify";
import { sendDailyCallDigest } from "@/lib/call-reminders";
import { businessRpc } from "@/lib/business-server";
import { publishDailyReport } from "@/lib/daily-report-server";
import { ammanToday, shiftDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

// Daily background work, called by Cloud Scheduler (job "betolla-daily", 08:00 Asia/Amman):
// HR expiry reminders, each sales rep's call summary for the day, and yesterday's tab in the daily
// report Google Sheet (lib/daily-report-server.ts; skipped until REPORT_SHEET_ID is set).
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
  // Yesterday is complete by 08:00. Claimed once per day, so a retried job does not rewrite it
  // (the admin can still rebuild any day from /settings).
  let dailyReport: string = "skipped";
  if (process.env.REPORT_SHEET_ID?.trim()) {
    const day = shiftDate(ammanToday(), -1);
    try {
      if (await businessRpc<boolean>("business_task_claim", { p_task: "daily_report", p_key: day })) {
        dailyReport = (await publishDailyReport(day)).url;
      } else dailyReport = "already written";
    } catch (e) {
      console.error("[cron/daily] daily report", e);
      dailyReport = "failed";
    }
  }
  return Response.json({ success: true, expiry_alerts_sent: expiryAlerts, call_digests_sent: callDigests, daily_report: dailyReport });
}
