-- Additive only: new read functions and two indexes.
-- Scale fixes (QA audit group 6): pages that used to download all 45k+ customers (with their full
-- call history) now ask the database for what they show:
--   * business_customer_page  — one filtered page of the customer list plus the totals;
--   * business_call_queue     — only customers that have a next call scheduled;
--   * business_dashboard_summary — the dashboard's counts and today's calls.
-- Search matching follows business_customer_search (migration 026): Arabic letter variants are
-- unified, phone numbers match without the Jordan prefix. p_rep_scope limits a sales rep to her
-- own customers.
BEGIN;

CREATE INDEX IF NOT EXISTS idx_customers_next_call ON public.customers(next_call_date) WHERE next_call_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_created ON public.customers(created_at DESC, id);

-- A customer row as the list pages show it; history is limited to the latest p_history calls.
CREATE FUNCTION public.business_customer_row(c customers, p_history int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT jsonb_build_object(
   'id',c.id,'legacy_id',c.legacy_id,'name',c.name,'phone',c.phone,
   'customer_type',c.customer_type,'classification',c.classification,'lead_source',c.lead_source,
   'address',coalesce(c.address,''),'city',coalesce(c.city,''),'rep_name_raw',coalesce(c.rep_name_raw,''),
   'notes',coalesce(c.notes,''),'last_contact_date',c.last_contact_date,'next_call_date',c.next_call_date,
   'created_at',c.created_at,'updated_at',c.updated_at,
   'history',CASE WHEN p_history<=0 THEN '[]'::jsonb ELSE coalesce((
     SELECT jsonb_agg(h.doc ORDER BY h.called_at DESC) FROM (
       SELECT l.called_at,jsonb_build_object('date',l.called_at::date,'rep',coalesce(l.rep_name,p.full_name_ar,''),
         'outcome',l.outcome,'notes',coalesce(l.notes,'')) AS doc
       FROM call_logs l LEFT JOIN profiles p ON p.id=l.rep_id
       WHERE l.customer_id=c.id ORDER BY l.called_at DESC LIMIT p_history) h),'[]'::jsonb) END)
$$;

CREATE FUNCTION public.business_customer_page(p_rep_scope text, p_query text, p_rep text, p_type text, p_offset int, p_limit int)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
 WITH q AS (
   SELECT
     CASE WHEN length(regexp_replace(coalesce(p_query,''),'[^0-9]','','g'))>=3
          THEN regexp_replace(regexp_replace(coalesce(p_query,''),'[^0-9]','','g'),'^(00962|962|0)','') ELSE '' END AS digits,
     CASE WHEN coalesce(p_query,'') ~ '[^0-9[:space:]+()-]' THEN translate(lower(trim(p_query)),'أإآةى','اااهي') ELSE '' END AS term,
     length(trim(coalesce(p_query,''))) AS qlen
 ),
 scoped AS (
   SELECT c.* FROM customers c WHERE p_rep_scope IS NULL OR c.rep_name_raw=p_rep_scope
 ),
 filtered AS (
   SELECT s.* FROM scoped s, q
   WHERE (nullif(p_rep,'') IS NULL OR s.rep_name_raw=p_rep)
     AND (nullif(p_type,'') IS NULL OR s.customer_type::text=p_type)
     AND (q.qlen=0
       OR (length(q.digits)>=3 AND strpos(regexp_replace(regexp_replace(coalesce(s.phone,''),'[^0-9]','','g'),'^(00962|962|0)',''),q.digits)>0)
       OR (length(q.term)>=1 AND (
            strpos(translate(lower(coalesce(s.name,'')),'أإآةى','اااهي'),q.term)>0
         OR strpos(translate(lower(coalesce(s.city,'')),'أإآةى','اااهي'),q.term)>0
         OR strpos(translate(lower(coalesce(s.address,'')),'أإآةى','اااهي'),q.term)>0
         OR strpos(translate(lower(coalesce(s.notes,'')),'أإآةى','اااهي'),q.term)>0)))
 ),
 page AS (
   SELECT f.* FROM filtered f ORDER BY f.created_at DESC, f.id
   OFFSET greatest(coalesce(p_offset,0),0) LIMIT least(greatest(coalesce(p_limit,50),1),200)
 )
 SELECT jsonb_build_object(
   'total',(SELECT count(*) FROM filtered),
   'all_total',(SELECT count(*) FROM scoped),
   'customers',coalesce((SELECT jsonb_agg(business_customer_row(p,0) ORDER BY p.created_at DESC, p.id) FROM page p),'[]'::jsonb))
$$;

-- Customers with a scheduled call (the call schedule page), each with the latest call only.
CREATE FUNCTION public.business_call_queue(p_rep_scope text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(business_customer_row(c,1) ORDER BY c.next_call_date, c.id),'[]'::jsonb)
 FROM customers c
 WHERE c.next_call_date IS NOT NULL AND (p_rep_scope IS NULL OR c.rep_name_raw=p_rep_scope)
$$;

CREATE FUNCTION public.business_dashboard_summary(p_today date) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT jsonb_build_object(
   'customers_total',(SELECT count(*) FROM customers),
   'scheduled_calls',(SELECT count(*) FROM customers WHERE next_call_date IS NOT NULL),
   'today_calls',coalesce((SELECT jsonb_agg(business_customer_row(t,1) ORDER BY t.id) FROM
      (SELECT c.* FROM customers c WHERE c.next_call_date=p_today ORDER BY c.id LIMIT 6) t),'[]'::jsonb),
   'rep_counts',coalesce((SELECT jsonb_agg(jsonb_build_object('name',r.rep,'count',r.n) ORDER BY r.n DESC, r.rep)
      FROM (SELECT coalesce(nullif(rep_name_raw,''),'') AS rep,count(*) AS n FROM customers GROUP BY 1) r),'[]'::jsonb),
   'active_orders',(SELECT count(*) FROM orders WHERE status NOT IN ('delivered','cancelled','returned')),
   'products',(SELECT count(*) FROM products WHERE is_active)
 )
$$;

REVOKE ALL ON FUNCTION public.business_customer_row(customers,int),
 public.business_customer_page(text,text,text,text,int,int),public.business_call_queue(text),
 public.business_dashboard_summary(date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_customer_row(customers,int),
 public.business_customer_page(text,text,text,text,int,int),public.business_call_queue(text),
 public.business_dashboard_summary(date) TO service_role;

COMMIT;
