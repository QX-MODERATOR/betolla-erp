// Betolla ERP - Supabase Edge Function: calendar-reminder
// Integrates with Google Calendar API and provides daily follow-up notifications.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const GOOGLE_API_KEY = Deno.env.get("GOOGLE_CALENDAR_API_KEY") || "AIzaSyC4J_78XoISPpQye7Uy731n6YkHaw_qElE";

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

      return new Response(
        JSON.stringify({
          success: true,
          date: todayStr,
          due_calls_count: callsDue?.length || 0,
          calls: callsDue || [],
          google_calendar_configured: !!GOOGLE_API_KEY,
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
