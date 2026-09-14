import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { addNotification } from "@/lib/notifications-store";
import { addLead, addLeadsBatch, getLeads } from "@/lib/leads-store";

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

    // 1. Check if bulk batch of leads was provided
    if (Array.isArray(body.leads) && body.leads.length > 0) {
      const repTarget = body.rep_name || "حنان";
      let assignedRep = repTarget;
      if (!assignedRep || assignedRep === "auto") {
        assignedRep = ACTIVE_REPS[roundRobinIndex % ACTIVE_REPS.length];
        roundRobinIndex++;
      }

      const createdLeads = addLeadsBatch(body.leads, assignedRep, {
        source: body.source || "admin_dispatch",
        defaultNotes: body.notes || "أرقام جديدة محولة من قبل المسؤول",
        defaultCity: body.city || "عمان",
      });

      // Attempt Supabase insert in background if available
      try {
        const supabase = createServerClient();
        await supabase.from("customers").insert(
          createdLeads.map((l) => ({
            name: l.name,
            phone: l.phone,
            city: l.city,
            address: l.address,
            notes: l.notes,
            lead_source: l.source,
            rep_name_raw: l.rep_name,
          }))
        );
      } catch {
        // Continue with local store if database is offline/unconfigured
      }

      // Fire EXACTLY ONE consolidated notification for the entire batch
      if (!body.silent) {
        try {
          addNotification({
            repName: assignedRep,
            repId: assignedRep === "حنان" ? "hanan" : undefined,
            title: body.notificationTitle || "بيانات جديدة 🔔 New Data",
            message: `قام المسؤول بإرسال (${createdLeads.length}) أرقام وأسماء جديدة لحسابك. تم تحديث سجل عملائك وجاهز للاتصال.`,
            phones: createdLeads.map((l) => l.phone),
            source: "admin",
            link: "/sales",
          });
        } catch {
          // Ignore notification error
        }
      }

      return NextResponse.json(
        {
          success: true,
          count: createdLeads.length,
          leads: createdLeads,
          message: `تم إسناد ${createdLeads.length} ليد بنجاح إلى المندوب (${assignedRep}).`,
        },
        { status: 201, headers: NO_CACHE_HEADERS }
      );
    }

    // 2. Single Lead ingestion
    const { name, phone, city, address, notes, source, rep_name, silent } = body;

    if (!phone) {
      return NextResponse.json(
        { error: "رقم هاتف العميل مطلوب لإضافة الليد." },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const cleanPhone = String(phone).replace(/[^\d+]/g, "").trim();

    // Auto-assign rep if not specified
    let assignedRep = rep_name;
    if (!assignedRep || assignedRep === "auto") {
      assignedRep = ACTIVE_REPS[roundRobinIndex % ACTIVE_REPS.length];
      roundRobinIndex++;
    }

    // Save to persistent server leads store
    const newLead = addLead({
      name,
      phone: cleanPhone,
      city,
      address,
      notes,
      source,
      rep_name: assignedRep,
    });

    // Try Supabase insert
    try {
      const supabase = createServerClient();
      await supabase.from("customers").insert({
        name: newLead.name,
        phone: newLead.phone,
        city: newLead.city,
        address: newLead.address,
        notes: newLead.notes,
        lead_source: newLead.source,
        rep_name_raw: newLead.rep_name,
      });
    } catch {
      // Continue with in-memory lead
    }

    // Real-time "New Data" notification (single notification)
    if (!silent) {
      try {
        addNotification({
          repName: assignedRep,
          repId: assignedRep === "حنان" ? "hanan" : undefined,
          title: "بيانات جديدة 🔔 New Data",
          message: `تم تحويل رقم هاتف جديد لحسابك (${cleanPhone}) من نظام ${source || "المسؤول / التسويق"}. يرجى المتابعة والاتصال فوراً.`,
          phones: [cleanPhone],
          source: source || "system",
          link: "/sales",
        });
      } catch {
        // Ignore notification creation errors
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: `تم تسجيل الليد بنجاح في قاعدة البيانات وتحويله إلى المندوب (${assignedRep}).`,
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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rep = searchParams.get("rep");
    const date = searchParams.get("date");
    const search = searchParams.get("search");
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : undefined;

    const { leads, total } = getLeads({ rep, date, search, limit });

    return NextResponse.json(
      {
        success: true,
        endpoint: "/api/leads",
        activeReps: ACTIVE_REPS,
        count: leads.length,
        total,
        leads,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "فشل جلب الليدات: " + String(error) },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
