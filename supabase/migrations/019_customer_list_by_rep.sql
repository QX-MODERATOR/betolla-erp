-- Additive only: no backfill, deletion, or changes to existing RLS/policies.
-- A sales_rep only ever needs her own customers (the /sales page already
-- filters to activeRep client-side), but was fetching the full 45k-row
-- business_customer_list() first — the same expensive query already fixed
-- for the unscoped case in migration 015, still expensive here because it's
-- shipping every OTHER rep's rows over the wire just to filter them out
-- client-side. Adds a server-scoped equivalent, same JOIN+GROUP BY shape.
BEGIN;

CREATE INDEX IF NOT EXISTS idx_customers_rep_name_raw ON public.customers(rep_name_raw);

CREATE FUNCTION public.business_customer_list_by_rep(p_rep text) RETURNS jsonb
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
             'date', l.called_at::date, 'rep', coalesce(l.rep_name, p.full_name_ar, ''),
             'outcome', l.outcome, 'notes', coalesce(l.notes, '')
           ) ORDER BY l.called_at DESC) AS history
    FROM call_logs l
    LEFT JOIN profiles p ON p.id = l.rep_id
    GROUP BY l.customer_id
  ) h ON h.customer_id = c.id
  WHERE c.rep_name_raw = p_rep
$$;

REVOKE ALL ON FUNCTION public.business_customer_list_by_rep(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_customer_list_by_rep(text) TO service_role;

COMMIT;
