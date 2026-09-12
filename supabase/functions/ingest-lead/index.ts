// Betolla ERP - Supabase Edge Function: ingest-lead
// Handles automated lead ingestion from Marketing, Meta Lead Ads, and n8n webhooks.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const ACTIVE_REPS = ["حمزة", "رحمه", "صابرين", "حنان", "سارة", "حنين"];

// Constant-time shared-secret check. CORS ('*') is not a security boundary
// here — the real caller is n8n/Meta Lead Ads (server-to-server), not a
// browser — so this header is the actual gate against unauthenticated lead injection.
function verifyWebhookSecret(provided: string | null, expected: string | undefined): boolean {
  if (!expected || !provided) return false;
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const providedSecret = req.headers.get("x-webhook-secret");
  if (!verifyWebhookSecret(providedSecret, Deno.env.get("WEBHOOK_SHARED_SECRET"))) {
    return new Response(
      JSON.stringify({ error: "غير مصرح. مفتاح الويب هوك مفقود أو غير صحيح." }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    const { name, phone, city, address, notes, source, rep_name } = body;

    if (!phone || typeof phone !== "string") {
      return new Response(
        JSON.stringify({ error: "رقم هاتف العميل مطلوب لإضافة الليد." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean phone number (strip spaces and non-digits)
    let cleanPhone = String(phone).replace(/[^\d+]/g, "");
    if (cleanPhone.startsWith("+962")) cleanPhone = "0" + cleanPhone.slice(4);
    else if (cleanPhone.startsWith("962")) cleanPhone = "0" + cleanPhone.slice(3);

    // 1. Check if customer already exists by phone
    const { data: existing } = await supabaseClient
      .from("customers")
      .select("id, name, phone, rep_name_raw")
      .eq("phone", cleanPhone)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({
          success: true,
          message: `العميل مسجل مسبقاً في النظام ومسند للمندوب (${existing.rep_name_raw || 'غير محدد'}).`,
          customer: existing,
          is_duplicate: true
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Select assigned sales rep (Round-robin or designated)
    let assignedRep = rep_name;
    if (!assignedRep || assignedRep === "auto") {
      const randomIndex = Math.floor(Math.random() * ACTIVE_REPS.length);
      assignedRep = ACTIVE_REPS[randomIndex];
    }

    // 3. Insert customer record into Supabase PostgreSQL
    const { data: newCustomer, error: insertError } = await supabaseClient
      .from("customers")
      .insert({
        name: name || "عميل محتمل جديد",
        phone: cleanPhone,
        city: city || "عمان",
        address: address || "",
        notes: notes || "تم استلام الرقم آلياً من التسويق / n8n",
        lead_source: source || "social_media",
        rep_name_raw: assignedRep,
        customer_type: "end_user",
        classification: "customer",
        last_contact_date: new Date().toISOString().split("T")[0],
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `تم تسجيل الليد بنجاح وتعيينه للمندوب (${assignedRep}) آلياً.`,
        customer: newCustomer,
        is_duplicate: false
      }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "فشل معالجة الليد: " + String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
