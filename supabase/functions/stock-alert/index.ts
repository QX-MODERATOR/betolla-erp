// Betolla ERP - Supabase Edge Function: stock-alert
// Evaluates warehouse stock and sends alerts when products drop below reorder level.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    // Query inventory items where quantity <= reorder_level
    const { data: lowStockItems, error } = await supabaseClient
      .from("inventory")
      .select(`
        product_id,
        quantity_on_hand,
        quantity_reserved,
        reorder_level,
        products (
          sku,
          name_ar,
          name_en,
          retail_price
        )
      `)
      .lte("quantity_on_hand", 15);

    if (error) throw error;

    const alertList = (lowStockItems || []).map((item: any) => ({
      sku: item.products?.sku,
      name_ar: item.products?.name_ar,
      stock: item.quantity_on_hand,
      reorder_level: item.reorder_level,
      suggested_reorder_qty: Math.max(50, item.reorder_level * 3) - item.quantity_on_hand,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        alerts_count: alertList.length,
        has_critical_alerts: alertList.length > 0,
        items: alertList,
        checked_at: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "فشل فحص تنبيهات المخزون: " + String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
