// Betolla ERP - Supabase Edge Function: calendar-reminder
// Integrates with Google Calendar API and provides daily follow-up notifications.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const GOOGLE_API_KEY = Deno.env.get("GOOGLE_CALENDAR_API_KEY") || "";
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const TELEGRAM_ADMIN_CHAT_ID = Deno.env.get("TELEGRAM_ADMIN_CHAT_ID") || "";

// Mirrors lib/telegram.ts's sendTelegramNotification — duplicated rather than
// shared because this function runs on Deno, not Node, and can't import the
// Next.js app's lib/ directly.
async function sendTelegramNotification(message: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_ADMIN_CHAT_ID, text: message, parse_mode: "Markdown" }),
    });
  } catch (error) {
    console.error("Telegram send failed:", error);
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "today_due";

    // Mode A: Fetch all follow-ups due today for notification/reminder
    if (action === "today_due") {
      const todayStr = new Date().toISOString().split("T")[0];

      const { data: callsDue, error } = await supabaseClient
        .from("customers")
        .select("id, name, phone, city, notes, rep_name_raw, next_call_date")
        .eq("next_call_date", todayStr);

      if (error) throw error;

      // This is what makes the daily cron trigger actually notify someone —
      // without it, a scheduled call here just fetches data into the void.
      // The endpoint is public (--no-verify-jwt), so an atomic "already
      // notified today" insert guards against duplicate Telegram spam from
      // a double-fired cron or a repeat manual/public hit on the same day.
      let telegramNotified = false;
      if (callsDue && callsDue.length > 0) {
        const { error: dedupError } = await supabaseClient
          .from("calendar_reminder_log")
          .insert({ reminder_date: todayStr, due_count: callsDue.length });

        if (!dedupError) {
          const lines = callsDue
            .slice(0, 20)
            .map((c) => `• *${c.name}* (${c.phone})${c.rep_name_raw ? ` — ${c.rep_name_raw}` : ""}`)
            .join("\n");
          const more = callsDue.length > 20 ? `\n_...and ${callsDue.length - 20} more_` : "";
          await sendTelegramNotification(
            `🔵 *Follow-up calls due today (${todayStr})*\n_${callsDue.length} customer(s)_\n\n${lines}${more}`
          );
          telegramNotified = true;
        }
        // dedupError (unique violation on reminder_date) means today's
        // reminder was already sent — silently skip, not a failure.
      }

      return new Response(
        JSON.stringify({
          success: true,
          date: todayStr,
          due_calls_count: callsDue?.length || 0,
          calls: callsDue || [],
          google_calendar_configured: !!GOOGLE_API_KEY,
          telegram_notified: telegramNotified,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mode B: Generate Google Calendar Link for a specific customer appointment
    const body = await req.json();
    const { customerName, phone, date, time, notes, address, repName } = body;

    const startTime = time || "10:00";
    const cleanDate = date.replace(/-/g, "");
    const [h, m] = startTime.split(":");
    const startStr = `${cleanDate}T${h.padStart(2, "0")}${m.padStart(2, "0")}00`;
    
    // Add 20 minutes
    const endHour = String(parseInt(h) + (parseInt(m) + 20 >= 60 ? 1 : 0)).padStart(2, "0");
    const endMin = String((parseInt(m) + 20) % 60).padStart(2, "0");
    const endStr = `${cleanDate}T${endHour}${endMin}00`;

    const title = encodeURIComponent(`متابعة اتصال عميل: ${customerName}`);
    const details = encodeURIComponent(
      `📞 العميل: ${customerName}\n📱 الهاتف: ${phone}\n📍 المدينة: ${address || 'عمان'}\n👤 المندوب: ${repName || 'مبيعات'}\n📝 ملاحظات: ${notes || ''}`
    );

    const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startStr}/${endStr}&details=${details}&location=${encodeURIComponent(address || 'الأردن')}`;

    return new Response(
      JSON.stringify({
        success: true,
        calendarUrl,
        api_key_active: !!GOOGLE_API_KEY,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "فشل جدولة الموعد: " + String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
