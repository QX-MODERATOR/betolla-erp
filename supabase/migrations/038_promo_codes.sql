-- Promo codes: five of them, short enough to read down a phone line and type without a mistake.
--
--   Salons    free samples for a salon      — up to 5 of each 15 ml sample, per salon
--   Personal  free samples for a customer   — up to 2 of each 15 ml sample, per customer
--   VIP1      شامبو بلازما / بلسم بلازما      13.000 -> 11.000 each
--   VIP2      بكج ثنائي                       25.000 -> 20.000
--   VIP3      بكج رباعي                       40.000 -> 30.000
--
-- Two shapes, one mechanism. A `sample` code makes listed products free up to a per-customer
-- lifetime allowance; a `price` code overrides the unit price of listed products. Both are
-- data in promo_codes.rules, so a price or an allowance changes with an UPDATE, not a deployment.
--
-- How the price a customer is charged stays honest: the app quotes a code through
-- business_promo_quote before sending the order, and business_create_order then calls
-- business_promo_apply, which re-derives the same answer from the same rules and refuses the order
-- if the stored unit prices disagree. The browser can ask for a discount; it cannot grant one.
--
-- Every use is recorded in promo_redemptions with the rep who applied it, so the allowances and
-- the per-rep monthly cap are counted from facts rather than trusted.
--
-- ORDERING: apply after 037 (VIP2/VIP3 price the packages it creates).
BEGIN;

-- The physical 15 ml sample bottles. Real products with real stock — a sample handed out is a
-- bottle gone — priced at 0 because that is what the customer pays.
DO $$
DECLARE cat_plasma UUID;
BEGIN
  SELECT id INTO cat_plasma FROM public.categories WHERE slug = 'plasma-hair-care';
  INSERT INTO public.products (sku, name_ar, name_en, category_id, retail_price, slug, description_ar)
  VALUES
    ('PL-SAMP-SHMP-15-01', 'عينة / شامبو بلازما / 15 مل', 'Sample / Plasma Shampoo / 15ml',
      cat_plasma, 0.000, 'plasma-shampoo-sample-15ml', 'عينة مجانية شامبو بلازما 15 مل'),
    ('PL-SAMP-COND-15-02', 'عينة / بلسم بلازما / 15 مل', 'Sample / Plasma Conditioner / 15ml',
      cat_plasma, 0.000, 'plasma-conditioner-sample-15ml', 'عينة مجانية بلسم بلازما 15 مل'),
    ('PL-SAMP-TREAT-15-03', 'عينة / تريتمنت بلازما / 15 مل', 'Sample / Plasma Treatment / 15ml',
      cat_plasma, 0.000, 'plasma-treatment-sample-15ml', 'عينة مجانية تريتمنت بلازما 15 مل')
  ON CONFLICT (sku) DO UPDATE SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en,
    retail_price = EXCLUDED.retail_price, is_active = true;
END $$;

CREATE TABLE public.promo_codes (
  code TEXT PRIMARY KEY CHECK (code = trim(code) AND length(code) BETWEEN 2 AND 24),
  kind TEXT NOT NULL CHECK (kind IN ('sample','price')),
  label_ar TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- How many different customers one rep may use this code with in a calendar month.
  -- NULL means no cap, which is what the VIP price codes use.
  per_rep_monthly_cap INT CHECK (per_rep_monthly_cap IS NULL OR per_rep_monthly_cap > 0),
  rules JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.promo_codes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.promo_codes TO service_role;

CREATE TABLE public.promo_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL REFERENCES public.promo_codes(code) ON DELETE RESTRICT,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  rep_name TEXT NOT NULL DEFAULT '',
  items JSONB NOT NULL,
  amount_saved NUMERIC(12,3) NOT NULL DEFAULT 0,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (code, order_id)
);
CREATE INDEX idx_promo_redemptions_customer ON public.promo_redemptions(code, customer_id);
CREATE INDEX idx_promo_redemptions_actor ON public.promo_redemptions(code, actor_id, redeemed_at DESC);
ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.promo_redemptions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.promo_redemptions TO service_role;

INSERT INTO public.promo_codes (code, kind, label_ar, per_rep_monthly_cap, rules) VALUES
  ('Salons','sample','عينات مجانية للصالونات',5,
    jsonb_build_object('max_per_customer',5,'skus',
      jsonb_build_array('PL-SAMP-SHMP-15-01','PL-SAMP-COND-15-02','PL-SAMP-TREAT-15-03'))),
  ('Personal','sample','عينات مجانية للعميلات',5,
    jsonb_build_object('max_per_customer',2,'skus',
      jsonb_build_array('PL-SAMP-SHMP-15-01','PL-SAMP-COND-15-02','PL-SAMP-TREAT-15-03'))),
  ('VIP1','price','سعر خاص: شامبو وبلسم بلازما',NULL,
    jsonb_build_object('prices',jsonb_build_object('PL-SHMP-500-V2-01',11.000,'PL-COND-500-V2-02',11.000))),
  ('VIP2','price','سعر خاص: البكج الثنائي',NULL,
    jsonb_build_object('prices',jsonb_build_object('PL-PKG-DUO-V2-01',20.000))),
  ('VIP3','price','سعر خاص: البكج الرباعي',NULL,
    jsonb_build_object('prices',jsonb_build_object('PL-PKG-QUAD-V2-01',30.000)))
ON CONFLICT (code) DO UPDATE SET kind=EXCLUDED.kind, label_ar=EXCLUDED.label_ar,
  rules=EXCLUDED.rules, updated_at=now();

-- Codes are typed by hand down a phone line, so match them case-insensitively and trimmed.
CREATE FUNCTION public.business_promo_find(p_code text) RETURNS promo_codes
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT * FROM promo_codes WHERE lower(code)=lower(trim(coalesce(p_code,''))) LIMIT 1
$$;

-- The one place that decides what a code does to a basket. Both the quote the app shows and the
-- check the order goes through call this, so they can never drift apart.
--
-- p_items: [{sku, qty}] — the basket as the catalog knows it.
-- Returns {ok, error, items:[{sku,qty,price,free,discounted}], saved, granted:[{sku,qty}]}.
CREATE FUNCTION public.business_promo_evaluate(p_code text, p_customer_id uuid, p_actor text, p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE promo promo_codes; item jsonb; v_sku text; v_qty int; prod products;
  allowance int; already int; promo_price numeric; base numeric;
  out_items jsonb := '[]'::jsonb; granted jsonb := '[]'::jsonb; saved numeric := 0;
  touched boolean := false; used_customers int;
BEGIN
 promo := business_promo_find(p_code);
 IF promo.code IS NULL THEN RETURN jsonb_build_object('ok',false,'error','PROMO_NOT_FOUND'); END IF;
 IF NOT promo.is_active THEN RETURN jsonb_build_object('ok',false,'error','PROMO_INACTIVE'); END IF;
 IF p_customer_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','PROMO_NEEDS_CUSTOMER'); END IF;
 IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)=0 THEN
   RETURN jsonb_build_object('ok',false,'error','INVALID_ITEMS');
 END IF;

 -- The per-rep monthly cap counts different customers, not orders: a second order for the same
 -- salon in the same month is the same salon.
 IF promo.per_rep_monthly_cap IS NOT NULL AND coalesce(length(trim(p_actor)),0)>0 THEN
   SELECT count(DISTINCT customer_id) INTO used_customers FROM promo_redemptions
   WHERE code=promo.code AND actor_id=p_actor AND customer_id<>p_customer_id
     AND redeemed_at >= date_trunc('month', (now() AT TIME ZONE 'Asia/Amman'));
   IF used_customers >= promo.per_rep_monthly_cap THEN
     RETURN jsonb_build_object('ok',false,'error','PROMO_REP_CAP','cap',promo.per_rep_monthly_cap);
   END IF;
 END IF;

 FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
   v_sku := trim(coalesce(item->>'sku',''));
   v_qty := coalesce((item->>'qty')::int,0);
   IF v_sku='' OR v_qty<=0 THEN RETURN jsonb_build_object('ok',false,'error','INVALID_ITEMS'); END IF;
   SELECT * INTO prod FROM products WHERE products.sku=v_sku AND is_active;
   IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','PRODUCT_NOT_FOUND','sku',v_sku); END IF;
   base := coalesce(prod.sale_price,prod.retail_price);

   IF promo.kind='sample' AND promo.rules->'skus' ? v_sku THEN
     allowance := (promo.rules->>'max_per_customer')::int;
     SELECT coalesce(sum((line->>'qty')::int),0) INTO already
     FROM promo_redemptions r, jsonb_array_elements(r.items) line
     WHERE r.code=promo.code AND r.customer_id=p_customer_id AND line->>'sku'=v_sku;
     IF already+v_qty > allowance THEN
       -- Report the requested amount too: "allowed 5, used 0" alone reads like a contradiction
       -- when the basket is asking for ten.
       RETURN jsonb_build_object('ok',false,'error','PROMO_ALLOWANCE','sku',v_sku,
         'name',prod.name_ar,'allowance',allowance,'already',already,'requested',v_qty);
     END IF;
     touched := true;
     out_items := out_items || jsonb_build_array(jsonb_build_object('sku',v_sku,'qty',v_qty,'price',0,'free',true));
     granted := granted || jsonb_build_array(jsonb_build_object('sku',v_sku,'qty',v_qty));
     saved := saved + base*v_qty;
   ELSIF promo.kind='price' AND promo.rules->'prices' ? v_sku THEN
     promo_price := (promo.rules->'prices'->>v_sku)::numeric;
     touched := true;
     out_items := out_items || jsonb_build_array(jsonb_build_object('sku',v_sku,'qty',v_qty,'price',promo_price,'discounted',true));
     granted := granted || jsonb_build_array(jsonb_build_object('sku',v_sku,'qty',v_qty));
     saved := saved + greatest(base-promo_price,0)*v_qty;
   ELSE
     out_items := out_items || jsonb_build_array(jsonb_build_object('sku',v_sku,'qty',v_qty,'price',base));
   END IF;
 END LOOP;

 -- A code that changes nothing in this basket is a mistake worth saying out loud, not a silent
 -- no-op that leaves the rep believing a discount was given.
 IF NOT touched THEN RETURN jsonb_build_object('ok',false,'error','PROMO_NOT_APPLICABLE','code',promo.code); END IF;

 RETURN jsonb_build_object('ok',true,'code',promo.code,'kind',promo.kind,'label',promo.label_ar,
   'items',out_items,'granted',granted,'saved',round(saved,3));
END $$;

-- What the app asks before it sends the order, so the rep sees the real price on screen.
CREATE FUNCTION public.business_promo_quote(p_code text, p_customer_id uuid, p_actor text, p_items jsonb)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT business_promo_evaluate(p_code,p_customer_id,p_actor,p_items)
$$;

-- Called from inside business_create_order, after the order's items exist. Re-derives the answer
-- from the same rules and refuses the order unless every stored unit price matches, then records
-- the redemption. This is what makes the discount the database's decision, not the browser's.
CREATE FUNCTION public.business_promo_apply(p_actor text, p_order uuid, p_customer uuid, p_code text, p_rep text)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE promo promo_codes; basket jsonb; verdict jsonb; expected jsonb; line record;
BEGIN
 promo := business_promo_find(p_code);
 IF promo.code IS NULL THEN RAISE EXCEPTION 'PROMO_NOT_FOUND'; END IF;
 -- One rep, one code, one customer at a time: the allowance and the cap are both read-then-write.
 PERFORM pg_advisory_xact_lock(hashtextextended('promo:'||promo.code||':'||p_actor,0));

 SELECT coalesce(jsonb_agg(jsonb_build_object('sku',p.sku,'qty',oi.quantity)),'[]'::jsonb) INTO basket
 FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=p_order;
 IF basket='[]'::jsonb THEN RAISE EXCEPTION 'PROMO_NOT_APPLICABLE'; END IF;

 verdict := business_promo_evaluate(promo.code,p_customer,p_actor,basket);
 IF NOT (verdict->>'ok')::boolean THEN RAISE EXCEPTION '%', verdict->>'error'; END IF;

 -- Every price the promo dictates must be the price actually stored on the order.
 FOR line IN SELECT * FROM jsonb_array_elements(verdict->'items') AS t(v) LOOP
   expected := line.v;
   IF (expected ? 'free') OR (expected ? 'discounted') THEN
     IF NOT EXISTS (
       SELECT 1 FROM order_items oi JOIN products p ON p.id=oi.product_id
       WHERE oi.order_id=p_order AND p.sku=expected->>'sku'
         AND oi.quantity=(expected->>'qty')::int
         AND oi.unit_price=(expected->>'price')::numeric
     ) THEN RAISE EXCEPTION 'PROMO_PRICE_MISMATCH'; END IF;
   END IF;
 END LOOP;

 INSERT INTO promo_redemptions(code,order_id,customer_id,actor_id,rep_name,items,amount_saved)
 VALUES(promo.code,p_order,p_customer,p_actor,coalesce(p_rep,''),verdict->'granted',(verdict->>'saved')::numeric);
END $$;

-- Same as 037, with one addition: an order may carry a promo code, checked and recorded here.
CREATE OR REPLACE FUNCTION public.business_create_order(p_actor text,p_key uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE old_request business_requests; customer_uuid uuid; order_uuid uuid := gen_random_uuid();
  item jsonb; total numeric; order_state order_status_enum; result jsonb; priced_total numeric := 0;
  all_priced boolean := true; item_product_id uuid; item_qty int;
  owner_id text := coalesce(nullif(trim(p_data->>'owner_account_id'),''),p_actor);
  phone_core text; matches uuid[];
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('order:'||p_actor||':'||p_key::text,0));
 SELECT * INTO old_request FROM business_requests WHERE operation='order' AND actor_id=p_actor AND request_key=p_key;
 IF FOUND THEN
   IF old_request.payload<>p_data THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   RETURN jsonb_build_object('order',business_order_document(old_request.result_id),'replayed',true);
 END IF;
 IF coalesce(length(trim(p_actor)),0)=0 OR coalesce(length(trim(p_data->>'customer_name')),0)=0
   OR coalesce(length(trim(p_data->>'customer_phone')),0)=0 THEN RAISE EXCEPTION 'INVALID_ORDER'; END IF;
 total := (p_data->>'total_amount')::numeric;
 IF total IS NULL OR total<0 OR total>=10000000 OR total<>round(total,3) THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
 -- A samples-only order is genuinely worth nothing, so zero is allowed when a promo says so.
 IF total=0 AND coalesce(length(trim(p_data->>'promo_code')),0)=0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
 order_state := coalesce(p_data->>'status','confirmed')::order_status_enum;
 IF order_state NOT IN ('draft','confirmed') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
 IF jsonb_typeof(p_data->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'items')=0
   OR jsonb_array_length(p_data->'items')>200 THEN RAISE EXCEPTION 'INVALID_ITEMS'; END IF;
 -- Reuse a customer only when an explicit ID is provided. Never merge people by phone.
 IF p_data->>'customer_id' IS NOT NULL THEN
   SELECT id INTO customer_uuid FROM customers WHERE id=(p_data->>'customer_id')::uuid;
   IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
 ELSE
   IF p_data->>'reuse_phone'='true' THEN
     phone_core := regexp_replace(regexp_replace(p_data->>'customer_phone','[^0-9]','','g'),'^(00962|962|0)','');
     IF length(phone_core)>=7 THEN
       SELECT array_agg(c.id) INTO matches FROM customers c
       WHERE regexp_replace(regexp_replace(coalesce(c.phone,''),'[^0-9]','','g'),'^(00962|962|0)','')=phone_core
         AND (p_data->>'scope_rep' IS NULL OR c.rep_name_raw=p_data->>'scope_rep');
       IF coalesce(array_length(matches,1),0)=1 THEN customer_uuid := matches[1]; END IF;
     END IF;
   END IF;
   IF customer_uuid IS NULL THEN
     INSERT INTO customers(name,phone,city,address,rep_name_raw)
     VALUES(p_data->>'customer_name',p_data->>'customer_phone',p_data->>'city',p_data->>'address',p_data->>'rep_name')
     RETURNING id INTO customer_uuid;
   END IF;
 END IF;
 -- An order means this lead has been worked: drop her from the call queue and dashboard count.
 UPDATE customers SET last_contact_date=business_amman_today(), next_call_date=NULL, updated_at=now()
 WHERE id=customer_uuid;
 INSERT INTO orders(id,order_number,customer_id,owner_account_id,source,status,subtotal,total_amount,
   payment_method,delivery_address,delivery_city,notes,raw_whatsapp_text,order_date,business_details)
 VALUES(order_uuid,'BET-'||order_uuid::text,customer_uuid,owner_id,coalesce(p_data->>'source','manual'),order_state,total,total,
   (p_data->>'payment_method')::payment_method_enum,p_data->>'address',p_data->>'city',p_data->>'installment_notes',
   p_data->>'raw_whatsapp_text',coalesce((p_data->>'order_date')::date,business_amman_today()),p_data);
 FOR item IN SELECT * FROM jsonb_array_elements(p_data->'items') LOOP
   IF coalesce(length(trim(item->>'name')),0)=0 OR (item->>'qty')::numeric<=0
     OR (item->>'qty')::numeric<>trunc((item->>'qty')::numeric) OR (item->>'qty') IS NULL
     OR (item->>'qty')::numeric>100000 OR (item->>'price')::numeric>=10000000
     OR (item->>'price')::numeric<0 OR (item->>'price')::numeric<>round((item->>'price')::numeric,3)
     THEN RAISE EXCEPTION 'INVALID_ITEMS'; END IF;
   all_priced := all_priced AND (item->>'price' IS NOT NULL);
   priced_total := priced_total + coalesce((item->>'price')::numeric,0)*(item->>'qty')::integer;
   IF priced_total>total THEN RAISE EXCEPTION 'TOTAL_MISMATCH'; END IF;
   item_qty := (item->>'qty')::integer;
   item_product_id := business_resolve_product(item->>'name');
   INSERT INTO order_items(order_id,product_id,product_name_raw,quantity,unit_price,total_price,price_is_known)
   VALUES(order_uuid,item_product_id,item->>'name',item_qty,coalesce((item->>'price')::numeric,0),
     coalesce((item->>'price')::numeric,0)*item_qty,item->>'price' IS NOT NULL);
   IF item_product_id IS NOT NULL AND order_state='confirmed' THEN
     PERFORM business_apply_item_stock(order_uuid,item_product_id,item_qty);
   END IF;
 END LOOP;
 IF all_priced AND priced_total<>total THEN RAISE EXCEPTION 'TOTAL_MISMATCH'; END IF;
 IF coalesce(length(trim(p_data->>'promo_code')),0)>0 THEN
   PERFORM business_promo_apply(p_actor,order_uuid,customer_uuid,p_data->>'promo_code',p_data->>'rep_name');
 END IF;
 INSERT INTO invoices(invoice_number,order_id,customer_id,subtotal,total_amount,due_date)
 VALUES('INV-'||order_uuid::text,order_uuid,customer_uuid,total,total,
   coalesce((p_data->>'due_date')::date,(p_data->>'order_date')::date,business_amman_today()));
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id)
 VALUES('order',p_actor,p_key,p_data,order_uuid);
 result := business_order_document(order_uuid);
 RETURN jsonb_build_object('order',result,'replayed',false);
END $$;

-- The admin list: each code with how it is doing this month, so a cap can be set from evidence.
CREATE FUNCTION public.business_promo_codes() RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'code',pc.code,'kind',pc.kind,'label',pc.label_ar,'is_active',pc.is_active,
   'per_rep_monthly_cap',pc.per_rep_monthly_cap,'rules',pc.rules,
   'redemptions_total',coalesce(stats.total,0),
   'redemptions_this_month',coalesce(stats.this_month,0),
   'customers_this_month',coalesce(stats.customers,0),
   'saved_this_month',coalesce(stats.saved,0)
 ) ORDER BY pc.kind,pc.code),'[]'::jsonb)
 FROM promo_codes pc
 LEFT JOIN LATERAL (
   SELECT count(*) AS total,
     count(*) FILTER (WHERE r.redeemed_at >= date_trunc('month',(now() AT TIME ZONE 'Asia/Amman'))) AS this_month,
     count(DISTINCT r.customer_id) FILTER (WHERE r.redeemed_at >= date_trunc('month',(now() AT TIME ZONE 'Asia/Amman'))) AS customers,
     round(coalesce(sum(r.amount_saved) FILTER (WHERE r.redeemed_at >= date_trunc('month',(now() AT TIME ZONE 'Asia/Amman'))),0),3) AS saved
   FROM promo_redemptions r WHERE r.code=pc.code
 ) stats ON true
$$;

-- Admin edits: the cap and whether the code is live. Prices and allowances are deliberately not
-- editable from the app — changing what VIP3 costs is a pricing decision, not a settings toggle.
CREATE FUNCTION public.business_promo_code_update(p_actor text, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE promo promo_codes; new_cap int;
BEGIN
 IF coalesce(length(trim(p_actor)),0)=0 THEN RAISE EXCEPTION 'INVALID_ACTOR'; END IF;
 promo := business_promo_find(p_data->>'code');
 IF promo.code IS NULL THEN RAISE EXCEPTION 'PROMO_NOT_FOUND'; END IF;
 IF p_data ? 'per_rep_monthly_cap' THEN
   IF p_data->>'per_rep_monthly_cap' IS NULL OR p_data->>'per_rep_monthly_cap'='' THEN new_cap := NULL;
   ELSE
     new_cap := (p_data->>'per_rep_monthly_cap')::int;
     IF new_cap<=0 OR new_cap>10000 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
   END IF;
 ELSE new_cap := promo.per_rep_monthly_cap;
 END IF;
 UPDATE promo_codes SET
   per_rep_monthly_cap=new_cap,
   is_active=CASE WHEN p_data ? 'is_active' THEN (p_data->>'is_active')::boolean ELSE is_active END,
   updated_at=now()
 WHERE code=promo.code;
 RETURN business_promo_codes();
END $$;

REVOKE ALL ON FUNCTION public.business_promo_find(text),public.business_promo_evaluate(text,uuid,text,jsonb),
  public.business_promo_quote(text,uuid,text,jsonb),public.business_promo_apply(text,uuid,uuid,text,text),
  public.business_promo_codes(),public.business_promo_code_update(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_promo_find(text),public.business_promo_evaluate(text,uuid,text,jsonb),
  public.business_promo_quote(text,uuid,text,jsonb),public.business_promo_apply(text,uuid,uuid,text,text),
  public.business_promo_codes(),public.business_promo_code_update(text,jsonb) TO service_role;

COMMIT;
