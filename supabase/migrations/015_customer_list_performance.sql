-- Additive only: no backfill, deletion, or changes to existing RLS/policies.
-- business_customer_list() previously called business_customer_document(id) once
-- per row via jsonb_agg(...), i.e. one correlated call_logs+profiles subquery
-- execution per customer. At real production scale (45k+ customers) this is
-- expensive enough to intermittently time out under concurrent requests
-- (observed as 503s on /api/customers, surfaced in the UI as "0 customers").
-- Rewritten as a single set-based query: one LEFT JOIN against a pre-aggregated
-- call_logs/profiles subquery, grouped once. Output shape (field names, nested
-- history array shape/order) is unchanged, so no API or frontend changes needed.
-- business_customer_document(id) is untouched — fetching a single customer's
-- detail was never the slow path.
BEGIN;

CREATE OR REPLACE FUNCTION public.business_customer_list() RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id, 'legacy_id', c.legacy_id, 'name', c.name, 'phone', c.phone,
      'customer_type', c.customer_type, 'classification', c.classification, 'lead_source', c.lead_source,
      'address', coalesce(c.address, ''), 'city', coalesce(c.city, ''), 'rep_name_raw', coalesce(c.rep_name_raw, ''),
      'notes', coalesce(c.notes, ''), 'last_contact_date', c.last_contact_date, 'next_call_date', c.next_call_date,
      'created_at', c.created_at, 'updated_at', c.updated_at,
      'history', coalesce(h.history, '[]'::jsonb)
    ) ORDER BY c.created_at DESC, c.id
  ), '[]'::jsonb)
  FROM customers c
  LEFT JOIN (
    SELECT l.customer_id,
           jsonb_agg(jsonb_build_object(
             'date', l.called_at::date, 'rep', coalesce(p.full_name_ar, ''),
             'outcome', l.outcome, 'notes', coalesce(l.notes, '')
           ) ORDER BY l.called_at DESC) AS history
    FROM call_logs l
    LEFT JOIN profiles p ON p.id = l.rep_id
    GROUP BY l.customer_id
  ) h ON h.customer_id = c.id
$$;

COMMIT;
