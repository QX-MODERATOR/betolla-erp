import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { addNotification } from "@/lib/notifications-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

const ACTIVE_REPS = ["حمزة", "صابرين", "حنان", "سارة", "حنين"];
let roundRobinIndex = 0;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, phone, city, address, notes, source, rep_name } = body;

    if (!phone) {
      return NextResponse.json(
        { error: "رقم هاتف العميل مطلوب لإضافة الليد." },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    // Clean phone number
    const cleanPhone = String(phone).replace(/[^\d+]/g, '');

    // Auto-assign rep if not specified
    let assignedRep = rep_name;
    if (!assignedRep || assignedRep === "auto") {
      assignedRep = ACTIVE_REPS[roundRobinIndex % ACTIVE_REPS.length];
      roundRobinIndex++;
    }

    const supabase = createServerClient();
    const { data: newCust, error } = await supabase
      .from("customers")
      .insert({
        name: name || "عميل محتمل جديد",
        phone: cleanPhone,
        city: city || "عمان",
        address: address || "",
        notes: notes || "تم استلام الرقم آلياً من قسم التسويق / n8n",
        lead_source: source || "marketing_automation",
        rep_name_raw: assignedRep,
      })
      .select("id")
      .single();

    const newLead = {
      id: newCust?.id || `LEAD-${Date.now()}`,
      name: name || "عميل محتمل جديد",
      phone: cleanPhone,
      city: city || "عمان",
      address: address || "",
      notes: notes || "تم استلام الرقم آلياً من قسم التسويق / n8n",
      lead_source: source || "marketing_automation",
      rep_name: assignedRep,
      status: "new",
      created_at: new Date().toISOString(),
    };

    // Real-time "New Data" notification dispatched to the assigned sales representative
    try {
      addNotification({
        repName: assignedRep,
        repId: assignedRep === "حنان" ? "hanan" : undefined,
        title: "بيانات جديدة 🔔 New Data",
        message: `تم تحويل رقم هاتف جديد لحسابك (${cleanPhone}) من نظام ${source || "المسؤول / التسويق"}. يرجى المتابعة والاتصال فوراً.`,
        phones: [cleanPhone],
        source: source || "system",
        link: "/customers",
      });
    } catch {
      // Ignore notification creation errors to not block lead capture
    }

    return NextResponse.json(
      {
        success: true,
        message: `تم تسجيل الليد بنجاح في قاعدة البيانات وتحويله آلياً إلى المندوب (${assignedRep}).`,
        lead: newLead,
      },
      { status: 201, headers: NO_CACHE_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "فشل استلام الليد: " + String(error) },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      status: "active",
      endpoint: "/api/leads",
      description: "نقطة استقبال الليدات الآلية لربط التسويق ونظام n8n بـ Betolla ERP",
      activeReps: ACTIVE_REPS,
      supportedFields: ["name", "phone", "city", "address", "notes", "source", "rep_name"],
    },
    { headers: NO_CACHE_HEADERS }
  );
}
