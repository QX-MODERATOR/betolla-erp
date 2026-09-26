-- Management sends a rep the numbers to call (/sales → "إرسال أرقام للمندوب").
--
-- Until now a rep's queue was whatever the 12-09 legacy import had put in customers.rep_name_raw:
-- 45k rows spread over ~70 names, most of them codes from the old sheet ("23AR", "00HE", "Sales",
-- "غير محدد") that no employee answers to. The owner asked for every rep to start clean and receive
-- contacts only from management from now on.
--
-- 1. customer_rep_archive   what every customer's rep and scheduled call were before the clean
--                           start, so nothing is lost and any row can be put back by hand.
-- 2. The clean start itself — every customer is unassigned and loses its scheduled call. Customers,
--    call history and orders are untouched; orders carry their own rep (orders.business_details).
-- 3. customer_batches + business_customer_assign_batch(p_actor, p_key, p_data)
--      p_data = {rep, call_date, dry_run, contacts: [{name, phone}]}
--    Each phone (already normalised by the API) is matched exactly on customers.phone. A known
--    customer is moved to the rep with the call date (and takes the sheet's name when it has one);
--    an unknown one is created for her. With
--    dry_run it only reports what would happen, per phone, and writes nothing.
--
-- ORDERING: needs 006 (business_requests) and 022 (business_hr_replay). Replaces no function.
BEGIN;

CREATE TABLE public.customer_rep_archive (
  customer_id UUID PRIMARY KEY REFERENCES public.customers(id) ON DELETE CASCADE,
  rep_name_raw TEXT,
  next_call_date DATE,
  next_call_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.customer_rep_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_rep_archive FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.customer_rep_archive TO service_role;

INSERT INTO public.customer_rep_archive(customer_id, rep_name_raw, next_call_date, next_call_at)
SELECT id, rep_name_raw, next_call_date, next_call_at FROM public.customers
WHERE rep_name_raw IS NOT NULL OR next_call_date IS NOT NULL OR next_call_at IS NOT NULL;

UPDATE public.customers SET rep_name_raw = NULL, next_call_date = NULL, next_call_at = NULL, updated_at = now()
WHERE rep_name_raw IS NOT NULL OR next_call_date IS NOT NULL OR next_call_at IS NOT NULL;

CREATE TABLE public.customer_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id TEXT NOT NULL,
  rep_name TEXT NOT NULL CHECK (length(trim(rep_name)) BETWEEN 1 AND 100),
  call_date DATE NOT NULL,
  total INT NOT NULL,
  created INT NOT NULL,
  reassigned INT NOT NULL,
  unchanged INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.customer_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_batches FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.customer_batches TO service_role;

CREATE FUNCTION public.business_customer_assign_batch(p_actor text, p_key uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE replay uuid; batch customer_batches; v_rep text := trim(coalesce(p_data->>'rep',''));
  v_date date; v_dry boolean := coalesce((p_data->>'dry_run')::boolean, false);
  item jsonb; v_phone text; v_name text; cust customers; seen text[] := '{}';
  n_created int := 0; n_moved int := 0; n_same int := 0; rows jsonb := '[]'::jsonb;
BEGIN
 IF NOT v_dry THEN
   replay := business_hr_replay('customer_batch', p_actor, p_key, p_data);
   IF replay IS NOT NULL THEN
     SELECT * INTO batch FROM customer_batches WHERE id = replay;
     RETURN jsonb_build_object('batch_id', batch.id, 'total', batch.total, 'created', batch.created,
       'reassigned', batch.reassigned, 'unchanged', batch.unchanged, 'replayed', true);
   END IF;
 END IF;
 IF length(v_rep) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_BATCH'; END IF;
 BEGIN v_date := (p_data->>'call_date')::date; EXCEPTION WHEN others THEN RAISE EXCEPTION 'INVALID_DATE'; END;
 IF v_date IS NULL THEN RAISE EXCEPTION 'INVALID_DATE'; END IF;
 IF jsonb_typeof(p_data->'contacts') IS DISTINCT FROM 'array'
   OR jsonb_array_length(p_data->'contacts') NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'INVALID_BATCH'; END IF;

 FOR item IN SELECT value FROM jsonb_array_elements(p_data->'contacts') LOOP
   v_phone := trim(coalesce(item->>'phone',''));
   v_name := nullif(left(trim(coalesce(item->>'name','')), 200), '');
   IF v_phone !~ '^\+?[0-9]{7,15}$' THEN RAISE EXCEPTION 'INVALID_BATCH'; END IF;
   IF v_phone = ANY(seen) THEN CONTINUE; END IF;
   seen := seen || v_phone;
   IF NOT v_dry THEN PERFORM pg_advisory_xact_lock(hashtextextended('customer-phone:'||v_phone,0)); END IF;
   SELECT * INTO cust FROM customers WHERE phone = v_phone ORDER BY created_at LIMIT 1;
   IF NOT FOUND THEN
     n_created := n_created + 1;
     IF v_dry THEN
       rows := rows || jsonb_build_object('phone', v_phone, 'status', 'new');
     ELSE
       INSERT INTO customers(name, phone, notes, lead_source, rep_name_raw, customer_type, classification, next_call_date)
       VALUES(coalesce(v_name, 'عميل محتمل جديد'), v_phone, 'رقم مرسل من الإدارة للاتصال', 'unknown', v_rep,
         'end_user', 'customer', v_date);
     END IF;
   ELSE
     IF cust.rep_name_raw IS NOT DISTINCT FROM v_rep THEN n_same := n_same + 1; ELSE n_moved := n_moved + 1; END IF;
     IF v_dry THEN
       rows := rows || jsonb_build_object('phone', v_phone,
         'status', CASE WHEN cust.rep_name_raw IS NOT DISTINCT FROM v_rep THEN 'same_rep'
                        WHEN cust.rep_name_raw IS NULL THEN 'existing' ELSE 'other_rep' END,
         'current_rep', cust.rep_name_raw, 'existing_name', cust.name);
     ELSE
       UPDATE customers SET rep_name_raw = v_rep, next_call_date = v_date, next_call_at = NULL,
         -- The sheet's name wins: legacy names are often a note ("هبة. سالت عن ..."); the preview
         -- showed the old one as "مسجل باسم" before the admin sent.
         name = coalesce(v_name, nullif(trim(name), ''), 'عميل محتمل جديد'), updated_at = now()
       WHERE id = cust.id;
     END IF;
   END IF;
 END LOOP;

 IF v_dry THEN
   RETURN jsonb_build_object('total', n_created + n_moved + n_same, 'created', n_created, 'reassigned', n_moved,
     'unchanged', n_same, 'rows', rows, 'dry_run', true);
 END IF;
 INSERT INTO customer_batches(actor_id, rep_name, call_date, total, created, reassigned, unchanged)
 VALUES(p_actor, v_rep, v_date, n_created + n_moved + n_same, n_created, n_moved, n_same) RETURNING * INTO batch;
 INSERT INTO business_requests(operation, actor_id, request_key, payload, result_id)
 VALUES('customer_batch', p_actor, p_key, p_data, batch.id);
 RETURN jsonb_build_object('batch_id', batch.id, 'total', batch.total, 'created', batch.created,
   'reassigned', batch.reassigned, 'unchanged', batch.unchanged, 'replayed', false);
END $$;

REVOKE ALL ON FUNCTION public.business_customer_assign_batch(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_customer_assign_batch(text, uuid, jsonb) TO service_role;

COMMIT;
