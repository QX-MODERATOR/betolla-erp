// Betolla ERP - Supabase Edge Function: whatsapp-order
// Webhook that automatically parses Arabic WhatsApp order messages and persists orders to PostgreSQL.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const JORDAN_CITIES = [
  "طبربور", "عمان", "الزرقاء", "الزرقا", "إربد", "اربد", "الرصيفة", "السلط", 
  "مادبا", "العقبة", "الكرك", "معان", "المفرق", "جرش", "عجلون", "الطفيلة", 
  "مرج الحمام", "شفا بدران", "سحاب", "ضاحية الرشيد", "المقابلين", "خلدا", 
  "تلاع العلي", "ماركا", "الجبيهة", "صويلح"
];

const KNOWN_REPS = ["رحمه", "حمزة", "صابرين", "حنان", "سارة", "حنين", "شهد", "رشا"];

function parseArabicWhatsAppMessage(raw: string) {
  const cleanRaw = raw.trim();
  const lines = cleanRaw.split("\n").map(l => l.trim()).filter(Boolean);

  // 1. Phone number
  const phoneMatch = cleanRaw.match(/07[789]\d{7}/);
  const phone = phoneMatch ? phoneMatch[0] : "";

  // 2. City
  let city = "عمان";
  for (const c of JORDAN_CITIES) {
    if (cleanRaw.includes(c)) {
      city = c === "الزرقا" ? "الزرقاء" : c === "اربد" ? "إربد" : c;
      break;
    }
  }

  // 3. Price
  let totalAmount = 0;
  for (const line of lines) {
    const match = line.match(/^(\d+(\.\d+)?)\s*(د|JD|دينار)?$/);
    if (match) {
      const val = parseFloat(match[1]);
      if (val >= 10 && val < 1000) {
        totalAmount = val;
        break;
      }
    }
  }
  if (totalAmount === 0) {
    const priceMatches = cleanRaw.match(/(\b\d+(\.\d+)?)\s*(د\.?أ?|د|JD|دينار)/g);
    if (priceMatches) {
      for (const p of priceMatches) {
        const num = p.match(/\d+(\.\d+)?/);
        if (num && parseFloat(num[0]) >= 10 && parseFloat(num[0]) < 1000) {
          totalAmount = parseFloat(num[0]);
          break;
        }
      }
    }
  }

  // 4. Rep & Source
  let repName = "مبيعات عامة";
  for (const rep of KNOWN_REPS) {
    if (cleanRaw.includes(rep)) {
      repName = rep;
      break;
    }
  }

  // 5. Customer Name & Address
  let customerName = "عميل واتساب";
  let address = city;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes(phone) && i > 0) {
      customerName = lines[i - 1];
    }
    if (line.includes("شارع") || line.includes("عمارة") || line.includes("عماره") || line.includes("قرب") || line.includes("مركز") || line.includes("حي") || line.includes("جبل")) {
      address = line;
    }
  }

  // 6. Line items
  const productKeywords = ["شامبو", "بلسم", "ماسك", "سيروم", "مورفوزيس", "بكج", "بكجات", "تريتمنت", "ليف", "ليف أن", "سيشتات", "بروتين", "ماراكوجا", "أرجان", "عدسات", "سشوار", "مملس"];
  const items = lines.filter(l => productKeywords.some(k => l.includes(k)));
  const itemsSummary = items.length > 0 ? items.join(" + ") : "مستحضرات عناية وتجميل";

  const isInstallment = cleanRaw.includes("شهر") || cleanRaw.includes("أقساط");

  return {
    customerName,
    phone,
    city,
    address,
    itemsSummary,
    totalAmount,
    repName,
    isInstallment,
    isReservation: cleanRaw.includes("حجز"),
    rawText: cleanRaw,
  };
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

    const body = await req.json();
    const rawText = body.rawText || body.text || body.message || body.body || "";

    if (!rawText) {
      return new Response(
        JSON.stringify({ error: "نص رسالة الواتساب مطلوب لتحليله واعتماد الطلب." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const parsed = parseArabicWhatsAppMessage(rawText);

    // 1. Find or create customer
    let customerId: string;
    const { data: existingCust } = await supabaseClient
      .from("customers")
      .select("id")
      .eq("phone", parsed.phone)
      .maybeSingle();

    if (existingCust) {
      customerId = existingCust.id;
    } else {
      const { data: newCust, error: cErr } = await supabaseClient
        .from("customers")
        .insert({
          name: parsed.customerName,
          phone: parsed.phone,
          city: parsed.city,
          address: parsed.address,
          customer_type: "end_user",
          classification: "customer",
          lead_source: "whatsapp",
          rep_name_raw: parsed.repName,
        })
        .select("id")
        .single();

      if (cErr) throw cErr;
      customerId = newCust.id;
    }

    // 2. Generate unique order number
    const orderNumber = `BET-2026-${Date.now().toString().slice(-5)}`;

    // 3. Insert order
    const { data: order, error: oErr } = await supabaseClient
      .from("orders")
      .insert({
        order_number: orderNumber,
        customer_id: customerId,
        source: "whatsapp_automation",
        status: parsed.isReservation ? "draft" : "confirmed",
        total_amount: parsed.totalAmount,
        payment_method: parsed.isInstallment ? "installment" : "cash_on_delivery",
        delivery_address: parsed.address,
        delivery_city: parsed.city,
        notes: parsed.itemsSummary,
        raw_whatsapp_text: parsed.rawText,
        order_date: new Date().toISOString().split("T")[0],
      })
      .select()
      .single();

    if (oErr) throw oErr;

    return new Response(
      JSON.stringify({
        success: true,
        message: `تم تحويل رسالة الواتساب بنجاح إلى طلب معتمد برقم (${orderNumber}).`,
        order,
      }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "فشل معالجة طلب الواتساب: " + String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
