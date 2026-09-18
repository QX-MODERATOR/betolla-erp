-- One VIP code instead of three, and sample codes that do not argue with the basket.
--
-- Two problems, both in the rules rather than the engine:
--
--   1. An order carries ONE promo code, but VIP1/VIP2/VIP3 each priced a different slice of the
--      catalogue. A rep selling the duo package (25) and the quad package (40) together could type
--      VIP2 and get 60, or VIP3 and get 55, and had no way to get both discounts at once — the
--      second code replaces the first. business_promo_evaluate already walks every line of the
--      basket and discounts each one it recognises, so a single code listing all four products
--      gives 20 + 30 = 50 with no change to the engine at all.
--
--      VIP now prices: شامبو بلازما 11, بلسم بلازما 11, بكج ثنائي 20, بكج رباعي 30.
--      VIP1/VIP2/VIP3 are deactivated (not deleted — promo_redemptions references them, and the
--      history of what was sold under them stays readable). A rep who types VIP2 out of habit is
--      told the code is stopped rather than quietly given half the discount she expected.
--
--   2. Salons and Personal refused any basket without a 15 ml sample bottle in it
--      (PROMO_NOT_APPLICABLE). Per the business: a sample code applies to any order with at least
--      one item, whatever the rep put in it. So a sample code is never refused for the shape of the
--      basket — it frees the sample bottles it finds, up to the per-customer allowance, and leaves
--      everything else at catalogue price. A price code still refuses a basket it cannot touch,
--      because a rep typing VIP on an order with no VIP product HAS made a mistake.
--
-- The per-customer sample allowance is unchanged: 2 of each bottle for Personal, 5 for Salons.
--
-- ORDERING: apply after 038.
BEGIN;

-- The merged code. The same prices the three old codes gave, in one rule set.
INSERT INTO public.promo_codes (code, kind, label_ar, per_rep_monthly_cap, rules) VALUES
  ('VIP','price','سعر خاص: بلازما والبكجات',NULL,
    jsonb_build_object('prices',jsonb_build_object(
      'PL-SHMP-500-V2-01',11.000,
      'PL-COND-500-V2-02',11.000,
      'PL-PKG-DUO-V2-01',20.000,
      'PL-PKG-QUAD-V2-01',30.000)))
ON CONFLICT (code) DO UPDATE SET kind=EXCLUDED.kind, label_ar=EXCLUDED.label_ar,
  rules=EXCLUDED.rules, is_active=true, updated_at=now();

-- Retired, not removed: their redemptions still point here.
UPDATE public.promo_codes SET is_active=false, updated_at=now() WHERE code IN ('VIP1','VIP2','VIP3');

-- Same as 038 with two changes, both at the end of the walk:
--   * the per-rep monthly cap is checked only once we know the code actually grants something,
--     so a sample code that frees nothing cannot burn a slot out of the rep's five customers;
--   * PROMO_NOT_APPLICABLE is now raised for price codes only.
CREATE OR REPLACE FUNCTION public.business_promo_evaluate(p_code text, p_customer_id uuid, p_actor text, p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE promo promo_codes; item jsonb; v_sku text; v_qty int; prod products;
  allowance int; already int; promo_price numeric; base numeric;
  out_items jsonb := '[]'::jsonb; granted jsonb := '[]'::jsonb; saved numeric := 0;
  touched boolean := false; used_customers int;
BEGIN
 promo := business_promo_find(p_code);
 IF promo.code IS NULL THEN RETURN jsonb_build_object('ok',false,'error','PROMO_NOT_FOUND'); END IF;
 -- Name the code back: the app turns a stopped VIP1/VIP2/VIP3 into "use VIP instead".
 IF NOT promo.is_active THEN RETURN jsonb_build_object('ok',false,'error','PROMO_INACTIVE','code',promo.code); END IF;
 IF p_customer_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','PROMO_NEEDS_CUSTOMER'); END IF;
 IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)=0 THEN
   RETURN jsonb_build_object('ok',false,'error','INVALID_ITEMS');
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

 -- A price code that changes nothing in this basket is a mistake worth saying out loud, not a
 -- silent no-op that leaves the rep believing a discount was given. A sample code is different:
 -- it applies to any order, and frees whichever bottles happen to be in it.
 IF NOT touched AND promo.kind<>'sample' THEN
   RETURN jsonb_build_object('ok',false,'error','PROMO_NOT_APPLICABLE','code',promo.code);
 END IF;

 -- The per-rep monthly cap counts different customers, not orders: a second order for the same
 -- salon in the same month is the same salon. Only a code that actually granted something spends
 -- one of those customers.
 IF touched AND promo.per_rep_monthly_cap IS NOT NULL AND coalesce(length(trim(p_actor)),0)>0 THEN
   SELECT count(DISTINCT customer_id) INTO used_customers FROM promo_redemptions
   WHERE code=promo.code AND actor_id=p_actor AND customer_id<>p_customer_id
     AND redeemed_at >= date_trunc('month', (now() AT TIME ZONE 'Asia/Amman'));
   IF used_customers >= promo.per_rep_monthly_cap THEN
     RETURN jsonb_build_object('ok',false,'error','PROMO_REP_CAP','cap',promo.per_rep_monthly_cap);
   END IF;
 END IF;

 RETURN jsonb_build_object('ok',true,'code',promo.code,'kind',promo.kind,'label',promo.label_ar,
   'items',out_items,'granted',granted,'saved',round(saved,3));
END $$;

-- Same as 038, with one addition: a code that granted nothing records nothing. An empty redemption
-- row would count against the rep's monthly customers and inflate the usage figures in settings
-- for a code that cost the business nothing.
CREATE OR REPLACE FUNCTION public.business_promo_apply(p_actor text, p_order uuid, p_customer uuid, p_code text, p_rep text)
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

 IF jsonb_array_length(verdict->'granted')>0 THEN
   INSERT INTO promo_redemptions(code,order_id,customer_id,actor_id,rep_name,items,amount_saved)
   VALUES(promo.code,p_order,p_customer,p_actor,coalesce(p_rep,''),verdict->'granted',(verdict->>'saved')::numeric);
 END IF;
END $$;

COMMIT;
