import { matchesRep } from "./rep-utils";

export interface BetollaLead {
  id: string;
  legacy_id?: number;
  name: string;
  phone: string;
  city: string;
  address: string;
  notes: string;
  source: string;
  rep_name: string;
  status: string;
  created_at: string;
  assigned_date: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __betolla_leads__: BetollaLead[] | undefined;
}

const LEADS_STORE: BetollaLead[] = global.__betolla_leads__ || [];

if (process.env.NODE_ENV !== "production") {
  global.__betolla_leads__ = LEADS_STORE;
}

let leadCounter = 45310;

/**
 * Add a single lead to the persistent store
 */
export function addLead(data: {
  name?: string;
  phone: string;
  city?: string;
  address?: string;
  notes?: string;
  source?: string;
  rep_name: string;
  status?: string;
  assigned_date?: string;
}): BetollaLead {
  leadCounter++;
  const cleanPhone = String(data.phone || "").replace(/[^\d+]/g, "").trim();
  const today = new Date().toISOString().split("T")[0];

  const newLead: BetollaLead = {
    id: `lead_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    legacy_id: leadCounter,
    name: (data.name && data.name.trim()) || "عميل محتمل جديد",
    phone: cleanPhone,
    city: (data.city && data.city.trim()) || "عمان",
    address: (data.address && data.address.trim()) || "",
    notes: (data.notes && data.notes.trim()) || "ليد جديد محول من الإدارة",
    source: data.source || "admin_dispatch",
    rep_name: data.rep_name || "حنان",
    status: data.status || "new",
    created_at: new Date().toISOString(),
    assigned_date: data.assigned_date || today,
  };

  LEADS_STORE.unshift(newLead);
  return newLead;
}

/**
 * Add a batch of leads to the persistent store
 */
export function addLeadsBatch(
  leads: Array<{
    name?: string;
    phone: string;
    city?: string;
    address?: string;
    notes?: string;
    source?: string;
  }>,
  repName: string,
  options?: {
    source?: string;
    defaultNotes?: string;
    defaultCity?: string;
  }
): BetollaLead[] {
  const created: BetollaLead[] = [];
  const today = new Date().toISOString().split("T")[0];

  for (const item of leads) {
    const cleanPhone = String(item.phone || "").replace(/[^\d+]/g, "").trim();
    if (!cleanPhone || cleanPhone.length < 7) continue;

    leadCounter++;
    const lead: BetollaLead = {
      id: `lead_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      legacy_id: leadCounter,
      name: (item.name && item.name.trim()) || "عميل محتمل جديد",
      phone: cleanPhone,
      city: (item.city && item.city.trim()) || options?.defaultCity || "عمان",
      address: (item.address && item.address.trim()) || "",
      notes: (item.notes && item.notes.trim()) || options?.defaultNotes || "ليد جديد محول من الإدارة",
      source: item.source || options?.source || "admin_dispatch",
      rep_name: repName || "حنان",
      status: "new",
      created_at: new Date().toISOString(),
      assigned_date: today,
    };

    LEADS_STORE.unshift(lead);
    created.push(lead);
  }

  return created;
}

/**
 * Query leads from store with rep filtering, date filtering, and search
 */
export function getLeads(options?: {
  rep?: string | null;
  date?: string | null;
  search?: string | null;
  limit?: number;
}): {
  leads: BetollaLead[];
  total: number;
} {
  let results = [...LEADS_STORE];

  // Filter by sales rep (Admin gets all, sales reps get only assigned)
  if (options?.rep && options.rep !== "admin" && options.rep !== "all") {
    results = results.filter((lead) => matchesRep(lead.rep_name, options.rep!));
  }

  // Filter by assigned date if specified
  if (options?.date) {
    results = results.filter((lead) => lead.assigned_date === options.date);
  }

  // Filter by search query
  if (options?.search) {
    const q = options.search.toLowerCase().trim();
    results = results.filter(
      (lead) =>
        lead.name.toLowerCase().includes(q) ||
        lead.phone.includes(q) ||
        lead.city.toLowerCase().includes(q) ||
        lead.notes.toLowerCase().includes(q)
    );
  }

  // Sort by newest first
  results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const total = results.length;
  if (options?.limit && options.limit > 0) {
    results = results.slice(0, options.limit);
  }

  return { leads: results, total };
}
