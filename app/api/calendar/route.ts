import { NextResponse } from "next/server";
import { verifyGoogleCalendarApiKey } from "@/lib/calendar";

// Status check used by app/calls/page.tsx. The actual "add to calendar" link
// is generated client-side via lib/calendar.ts's generateGoogleCalendarUrl()
// (no API key needed for a quick-add deep link) — this route previously also
// exposed a POST that duplicated that same logic server-side, but nothing in
// the app ever called it, so it was removed rather than left as dead code.
export async function GET() {
  const status = await verifyGoogleCalendarApiKey();
  return NextResponse.json({
    status: status.valid ? "active" : "configuration_needed",
    message: status.message,
    timestamp: new Date().toISOString(),
  });
}
