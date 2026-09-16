// Shared lead-search matching (client + server). Mirrors SQL business_customer_search
// (migration 026), which is authoritative; this copy is the server fallback and the
// client-side check that decides whether a query is specific enough to send.

export interface CustomerSearchHit {
  id: string; name: string; phone: string; city: string; rep_name_raw: string;
  classification: string; customer_type: string; updated_at: string;
}

export const SEARCH_RESULT_LIMIT = 20;

export const normalizeArabic = (t: string | null | undefined) =>
  (t || "").trim().toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");

// Digits of a phone number without the Jordan prefix (00962 / 962 / 0).
export const phoneCore = (p: string | null | undefined) =>
  (p || "").replace(/\D/g, "").replace(/^(?:00962|962|0)/, "");

export interface SearchTerms { digits: string; name: string }

// An empty or too-short term is "" and must never be treated as a match.
export function searchTerms(query: string): SearchTerms {
  const raw = (query || "").trim();
  const digits = raw.replace(/\D/g, "").length >= 3 ? phoneCore(raw) : "";
  // A query of only digits / phone symbols is a phone search, never a name search.
  const name = /[^\d\s+()\-]/.test(raw) ? normalizeArabic(raw) : "";
  return { digits: digits.length >= 3 ? digits : "", name: name.length >= 2 ? name : "" };
}

export const isSearchable = (t: SearchTerms) => !!(t.digits || t.name);

export function matchesCustomer(c: { name?: string | null; phone?: string | null }, t: SearchTerms): boolean {
  if (t.digits && phoneCore(c.phone).includes(t.digits)) return true;
  if (t.name && normalizeArabic(c.name).includes(t.name)) return true;
  return false;
}
