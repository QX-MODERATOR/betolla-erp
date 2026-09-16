-- Additive only: no backfill, deletion, or changes to existing tables/RLS/policies.
-- Server-side lead search for the header search box. Previously the browser downloaded the
-- whole customer list (45k+ rows) and filtered it locally, which also meant any role with the
-- search box received every lead. This returns only a small, relevant page of matches.
-- Matching mirrors lib/customer-search.ts (used as the app's fallback before this migration):
--   * phone: query digits with the Jordan prefix (00962 / 962 / 0) removed, at least 3 digits,
--     contained in the phone's digits with the same prefix removed;
--   * name: at least 2 characters, case-insensitive, with أ/إ/آ -> ا, ة -> ه, ى -> ي unified;
--     skipped for queries made only of digits and phone symbols (those are phone searches).
-- An empty or too-short query matches nothing (never "everything").
BEGIN;

CREATE OR REPLACE FUNCTION public.business_customer_search(p_query text, p_rep text, p_limit int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH q AS (
    SELECT
      CASE WHEN length(regexp_replace(coalesce(p_query, ''), '[^0-9]', '', 'g')) >= 3
           THEN regexp_replace(regexp_replace(coalesce(p_query, ''), '[^0-9]', '', 'g'), '^(00962|962|0)', '')
           ELSE '' END AS digits,
      CASE WHEN coalesce(p_query, '') ~ '[^0-9[:space:]+()-]'
           THEN translate(lower(trim(p_query)), 'أإآةى', 'اااهي')
           ELSE '' END AS name
  ),
  hits AS (
    SELECT c.*
    FROM customers c, q
    WHERE (p_rep IS NULL OR c.rep_name_raw = p_rep)
      AND (
        (length(q.digits) >= 3
          AND strpos(regexp_replace(regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g'), '^(00962|962|0)', ''), q.digits) > 0)
        OR (length(q.name) >= 2
          AND strpos(translate(lower(coalesce(c.name, '')), 'أإآةى', 'اااهي'), q.name) > 0)
      )
    ORDER BY c.updated_at DESC, c.id
    LIMIT least(greatest(coalesce(p_limit, 20), 1), 50)
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', h.id, 'name', coalesce(h.name, ''), 'phone', h.phone, 'city', coalesce(h.city, ''),
    'rep_name_raw', coalesce(h.rep_name_raw, ''), 'classification', h.classification,
    'customer_type', h.customer_type, 'updated_at', h.updated_at
  ) ORDER BY h.updated_at DESC, h.id), '[]'::jsonb)
  FROM hits h
$$;

REVOKE ALL ON FUNCTION public.business_customer_search(text, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_customer_search(text, text, int) TO service_role;

COMMIT;
