import { isSchedulerRequest } from "@/lib/cron-auth";
import { sendDueCallReminders } from "@/lib/call-reminders";

export const dynamic = "force-dynamic";

// Called by Cloud Scheduler every 5 minutes (job "betolla-call-reminders"): reminds reps of calls
// starting within the next 10 minutes (bell + phone push), each call once.
export async function POST(req: Request) {
  if (!(await isSchedulerRequest(req, "/api/cron/reminders"))) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    return Response.json({ success: true, call_reminders_sent: await sendDueCallReminders() });
  } catch (e) {
    console.error("[cron/reminders]", e);
    return Response.json({ success: false, error: "reminders failed" }, { status: 500 });
  }
}
