import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Customers/Calls data layer. customers.assigned_rep_id is the
 * ONLY foreign key from customers to profiles, so — unlike orders, which
 * has four — embedding profiles here is unambiguous and safe to do
 * directly via PostgREST.
 */
export interface UiCustomerHistoryEntry {
  date: string;
  rep: string;
  outcome: string;
  notes: string;
}

export interface UiCustomer {
  id: string;
  legacy_id: number | null;
  name: string;
  phone: string;
  customer_type: string;
  classification: string;
  lead_source: string;
  address: string;
  city: string;
  rep_name_raw: string;
  notes: string;
  last_contact_date: string | null;
  next_call_date: string | null;
  history: UiCustomerHistoryEntry[];
}

const OUTCOME_LABELS: Record<string, string> = {
  answered: "تم الرد",
  no_answer: "لا يوجد رد",
  busy: "الخط مشغول",
  wrong_number: "رقم خاطئ",
  not_interested: "غير مهتم",
  callback_requested: "طلب معاودة الاتصال",
  order_placed: "تم تثبيت طلب",
  whatsapp_sent: "تم إرسال واتساب",
};

export async function listCustomers(supabase: SupabaseClient): Promise<UiCustomer[]> {
  const { data: customers, error } = await supabase
    .from("customers")
    .select("id, legacy_id, name, phone, customer_type, classification, lead_source, address, city, rep_name_raw, notes, last_contact_date, next_call_date")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  if (!customers || customers.length === 0) return [];

  const customerIds = customers.map((c) => c.id);
  const { data: logs, error: logsErr } = await supabase
    .from("call_logs")
    .select("customer_id, called_at, outcome, notes, rep_id")
    .in("customer_id", customerIds)
    .order("called_at", { ascending: false });
  if (logsErr) throw logsErr;

  const repIds = [...new Set((logs || []).map((l) => l.rep_id).filter(Boolean))];
  const { data: reps } = repIds.length
    ? await supabase.from("profiles").select("id, full_name_ar").in("id", repIds)
    : { data: [] as { id: string; full_name_ar: string }[] };
  const repById = new Map((reps || []).map((r) => [r.id, r.full_name_ar]));

  const historyByCustomer = new Map<string, UiCustomerHistoryEntry[]>();
  for (const log of logs || []) {
    const list = historyByCustomer.get(log.customer_id) || [];
    list.push({
      date: log.called_at,
      rep: log.rep_id ? repById.get(log.rep_id) || "—" : "—",
      outcome: OUTCOME_LABELS[log.outcome] || log.outcome,
      notes: log.notes || "",
    });
    historyByCustomer.set(log.customer_id, list);
  }

  return customers.map((c) => ({
    id: c.id,
    legacy_id: c.legacy_id,
    name: c.name,
    phone: c.phone,
    customer_type: c.customer_type,
    classification: c.classification,
    lead_source: c.lead_source,
    address: c.address || "",
    city: c.city || "",
    rep_name_raw: c.rep_name_raw || "",
    notes: c.notes || "",
    last_contact_date: c.last_contact_date,
    next_call_date: c.next_call_date,
    history: historyByCustomer.get(c.id) || [],
  }));
}

export interface UiCallQueueItem {
  id: string; // customer id — used to log a call against this customer
  customer_name: string;
  phone: string;
  city: string;
  address: string;
  rep_name: string;
  due_date: string;
  due_time: string;
  purpose: string;
  status: "today" | "upcoming" | "overdue";
}

export async function listDueCalls(supabase: SupabaseClient): Promise<UiCallQueueItem[]> {
  const { data: customers, error } = await supabase
    .from("customers")
    .select("id, name, phone, city, address, notes, next_call_date, next_call_time, assigned_rep_id, profiles(full_name_ar)")
    .not("next_call_date", "is", null)
    .eq("is_active", true)
    .order("next_call_date", { ascending: true })
    .limit(500);
  if (error) throw error;

  const todayStr = new Date().toISOString().split("T")[0];

  return (customers || []).map((c): UiCallQueueItem => {
    const rep = Array.isArray(c.profiles) ? c.profiles[0] : c.profiles;
    let status: UiCallQueueItem["status"] = "upcoming";
    if (c.next_call_date === todayStr) status = "today";
    else if (c.next_call_date < todayStr) status = "overdue";

    return {
      id: c.id,
      customer_name: c.name,
      phone: c.phone,
      city: c.city || "",
      address: c.address || "",
      rep_name: rep?.full_name_ar || "—",
      due_date: c.next_call_date,
      due_time: c.next_call_time ? c.next_call_time.slice(0, 5) : "10:00",
      purpose: c.notes || "متابعة دورية",
      status,
    };
  });
}

const ACTIVE_REPS = ["حمزة", "رحمه", "صابرين", "حنان", "سارة", "حنين"];
const VALID_LEAD_SOURCES = new Set([
  "sales", "social_media", "doctor", "google_maps", "whatsapp", "crm_legacy", "phone", "commercial", "unverified", "unknown",
]);

export interface CreateLeadInput {
  name?: string;
  phone: string;
  city?: string;
  address?: string;
  notes?: string;
  source?: string;
  repName?: string;
}

export interface CreateLeadResult {
  id: string;
  name: string;
  phone: string;
  repName: string;
  isDuplicate: boolean;
}

/**
 * Shared lead-intake logic used by both the public /api/leads webhook
 * (called with the service-role admin client — no staff session exists for
 * an external marketing tool) and the authenticated "Add Lead" action in
 * the Customers UI (called with the caller's own session, so RLS still
 * applies and a sales_rep can only create leads the same way they could
 * create any other customer).
 */
export async function createLead(supabase: SupabaseClient, input: CreateLeadInput): Promise<CreateLeadResult> {
  const cleanPhone = String(input.phone || "").replace(/[^\d+]/g, "").slice(0, 20);
  if (!cleanPhone) throw new Error("رقم هاتف العميل مطلوب لإضافة الليد.");

  const leadSource = input.source && VALID_LEAD_SOURCES.has(input.source) ? input.source : "social_media";

  let assignedRep = input.repName;
  if (!assignedRep || assignedRep === "auto") {
    const hash = [...cleanPhone].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    assignedRep = ACTIVE_REPS[hash % ACTIVE_REPS.length];
  }

  const { data: existing } = await supabase
    .from("customers")
    .select("id, name, rep_name_raw")
    .eq("phone", cleanPhone)
    .maybeSingle();

  if (existing) {
    return { id: existing.id, name: existing.name, phone: cleanPhone, repName: existing.rep_name_raw || assignedRep, isDuplicate: true };
  }

  const { data: newCustomer, error } = await supabase
    .from("customers")
    .insert({
      name: input.name || "عميل محتمل جديد",
      phone: cleanPhone,
      city: input.city || "عمان",
      address: input.address || "",
      notes: input.notes || "تم استلام الرقم آلياً من قسم التسويق / n8n",
      lead_source: leadSource,
      rep_name_raw: assignedRep,
      customer_type: "end_user",
      classification: "customer",
      last_contact_date: new Date().toISOString().split("T")[0],
    })
    .select("id, name")
    .single();
  if (error) throw error;

  return { id: newCustomer.id, name: newCustomer.name, phone: cleanPhone, repName: assignedRep, isDuplicate: false };
}

export interface LogCallInput {
  customerId: string;
  outcome: string;
  notes?: string;
  nextCallDate?: string;
  nextCallTime?: string;
}

const VALID_OUTCOMES = new Set(Object.keys(OUTCOME_LABELS));

export async function logCall(supabase: SupabaseClient, input: LogCallInput) {
  if (!input.customerId) throw new Error("العميل مطلوب لتسجيل المكالمة.");
  if (!VALID_OUTCOMES.has(input.outcome)) throw new Error("نتيجة الاتصال غير معروفة.");

  const { data, error } = await supabase.rpc("log_customer_call", {
    p_customer_id: input.customerId,
    p_outcome: input.outcome,
    p_notes: input.notes || null,
    p_next_call_date: input.nextCallDate || null,
    p_next_call_time: input.nextCallTime || null,
  });
  if (error) throw error;
  return data;
}
