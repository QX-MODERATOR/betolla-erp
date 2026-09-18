-- Plasma packages (بكج ثنائي، بكج رباعي) as bundles that draw down their component bottles.
--
-- The sales team sells these two as single line items at a package price, but the warehouse has no
-- pre-assembled boxes: it picks the bottles. Adding them as ordinary products would give each its
-- own quantity_on_hand, counted separately from the bottles it is made of, so the same shampoo
-- could be sold twice — once as itself and once inside a package. Instead a bundle is sellable and
-- priced on its own while every stock movement is posted against its components.
--
-- Additive in schema (one new table, three new functions), and it replaces three function bodies:
--   * business_inventory_catalog  — a bundle's `stock` becomes how many are buildable from
--     components, so order entry (which hides stock = 0) shows it and the stock limit is real.
--   * business_create_order       — deduction goes through the new expander.
--   * business_order_update       — same, for an edited order.
--   * business_driver_stock_needed — the picking list shows bottles, which is what gets picked.
-- Reversals (cancellation 012, return, and the re-deduct in 036) already work off the order's own
-- inventory_movements rows, so they reverse components with no change.
--
-- ORDERING: apply after 034 (business_create_order clears the call queue) and 036
-- (business_order_update). The create_order body below already contains 034's change, so applying
-- this without 034 is safe — but do not apply 034 afterwards, it would drop the bundle expansion.
-- 036 is a hard requirement: business_order_update's body references order_changes.
BEGIN;

CREATE TABLE public.product_bundles (
  bundle_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  component_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity INT NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (bundle_product_id, component_product_id),
  -- A bundle of itself would recurse; one level is all the business needs.
  CHECK (bundle_product_id <> component_product_id)
);
ALTER TABLE public.product_bundles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_bundles FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.product_bundles TO service_role;

-- The two packages, and what each is made of (issues.txt: بكج رباعي = شامبو + بلسم + تريتمنت 500 +
-- سيروم 100؛ بكج ثنائي = شامبو + بلسم). Prices are the package prices the team sells at, which are
-- below the sum of the parts — that discount is the point of a package.
DO $$
DECLARE cat_plasma UUID; duo UUID; quad UUID;
  shampoo UUID; conditioner UUID; treatment UUID; serum UUID;
BEGIN
  SELECT id INTO cat_plasma FROM public.categories WHERE slug = 'plasma-hair-care';

  INSERT INTO public.products (sku, name_ar, name_en, category_id, retail_price, slug, description_ar)
  VALUES
    ('PL-PKG-DUO-V2-01', 'بكج ثنائي بلازما [شامبو + بلسم]', 'Plasma Duo Package [Shampoo + Conditioner]',
      cat_plasma, 25.000, 'plasma-duo-package', 'بكج ثنائي: شامبو بلازما + بلسم بلازما'),
    ('PL-PKG-QUAD-V2-01', 'بكج رباعي بلازما [شامبو + بلسم + تريتمنت + سيروم]', 'Plasma Quad Package [Shampoo + Conditioner + Treatment + Serum]',
      cat_plasma, 40.000, 'plasma-quad-package', 'بكج رباعي: شامبو + بلسم + تريتمنت 500 مل + سيروم 100 مل')
  ON CONFLICT (sku) DO UPDATE SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en,
    retail_price = EXCLUDED.retail_price, is_active = true;

  SELECT id INTO duo FROM public.products WHERE sku = 'PL-PKG-DUO-V2-01';
  SELECT id INTO quad FROM public.products WHERE sku = 'PL-PKG-QUAD-V2-01';
  SELECT id INTO shampoo FROM public.products WHERE sku = 'PL-SHMP-500-V2-01';
  SELECT id INTO conditioner FROM public.products WHERE sku = 'PL-COND-500-V2-02';
  SELECT id INTO treatment FROM public.products WHERE sku = 'PL-TREAT-500-V2-03';
  SELECT id INTO serum FROM public.products WHERE sku = 'PL-SERUM-100-V2-04';
  IF shampoo IS NULL OR conditioner IS NULL OR treatment IS NULL OR serum IS NULL THEN
    RAISE EXCEPTION 'PLASMA_COMPONENTS_MISSING';
  END IF;

  INSERT INTO public.product_bundles (bundle_product_id, component_product_id, quantity) VALUES
    (duo, shampoo, 1), (duo, conditioner, 1),
    (quad, shampoo, 1), (quad, conditioner, 1), (quad, treatment, 1), (quad, serum, 1)
  ON CONFLICT (bundle_product_id, component_product_id) DO UPDATE SET quantity = EXCLUDED.quantity;
END $$;

-- What `p_qty` of a product actually takes off the shelf: its components for a bundle, itself for
-- anything else. One level deep, matching the table's own no-self-reference rule.
CREATE FUNCTION public.business_bundle_expand(p_product_id uuid, p_qty int)
RETURNS TABLE (product_id uuid, quantity int)
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT b.component_product_id, b.quantity * p_qty FROM product_bundles b WHERE b.bundle_product_id = p_product_id
 UNION ALL
 SELECT p_product_id, p_qty WHERE NOT EXISTS (SELECT 1 FROM product_bundles WHERE bundle_product_id = p_product_id)
$$;

-- How many of a bundle the components on hand can make (the binding component wins), or the
-- product's own stock when it is not a bundle. This is the number order entry must respect.
CREATE FUNCTION public.business_bundle_buildable(p_product_id uuid) RETURNS int
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(min(coalesce(i.quantity_on_hand,0) / b.quantity), 0)::int
 FROM product_bundles b LEFT JOIN inventory i ON i.product_id = b.component_product_id
 WHERE b.bundle_product_id = p_product_id
$$;

-- Deduct one order line's stock and post its movements, expanding a bundle into its components.
-- Locks each component row before checking it, exactly as the inline code it replaces did.
CREATE FUNCTION public.business_apply_item_stock(p_order uuid, p_product_id uuid, p_qty int) RETURNS void
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE part record; inv inventory;
BEGIN
 FOR part IN SELECT * FROM business_bundle_expand(p_product_id, p_qty) LOOP
   INSERT INTO inventory(product_id,quantity_on_hand) VALUES(part.product_id,0) ON CONFLICT (product_id) DO NOTHING;
   SELECT * INTO inv FROM inventory WHERE product_id=part.product_id FOR UPDATE;
   IF inv.quantity_on_hand-part.quantity<0 THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK'; END IF;
   UPDATE inventory SET quantity_on_hand=quantity_on_hand-part.quantity, updated_at=now() WHERE product_id=part.product_id;
   INSERT INTO inventory_movements(product_id,movement_type,quantity,reference_type,reference_id)
   VALUES(part.product_id,'sale_out',-part.quantity,'order',p_order);
 END LOOP;
END $$;

-- A bundle reports the buildable count as its stock, and carries what it is made of so the picker
-- and the inventory screen can say so. Everything else is unchanged from 008.
CREATE OR REPLACE FUNCTION public.business_inventory_catalog() RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',p.id,'sku',p.sku,'name_ar',p.name_ar,'name_en',p.name_en,
   'category',coalesce(c.slug,''),'category_label',coalesce(c.name_ar,''),
   'cost_price',p.cost_price,'price',p.retail_price,'sale_price',p.sale_price,
   'stock',CASE WHEN bundled.parts IS NULL THEN coalesce(i.quantity_on_hand,0)
                ELSE business_bundle_buildable(p.id) END,
   'reserved',coalesce(i.quantity_reserved,0),
   'reorder',coalesce(i.reorder_level,10),
   'is_bundle',bundled.parts IS NOT NULL,
   'components',coalesce(bundled.parts,'[]'::jsonb)
 ) ORDER BY coalesce(c.display_order,999),p.name_ar),'[]'::jsonb)
 FROM products p
 LEFT JOIN inventory i ON i.product_id=p.id
 LEFT JOIN categories c ON c.id=p.category_id
 LEFT JOIN LATERAL (
   SELECT jsonb_agg(jsonb_build_object('sku',cp.sku,'name_ar',cp.name_ar,'quantity',b.quantity)
     ORDER BY cp.name_ar) AS parts
   FROM product_bundles b JOIN products cp ON cp.id=b.component_product_id
   WHERE b.bundle_product_id=p.id
 ) bundled ON true
 WHERE p.is_active
$$;

-- Same as 034, with the inline per-item deduction replaced by business_apply_item_stock.
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
 IF total IS NULL OR total<=0 OR total>=10000000 OR total<>round(total,3) THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
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
 INSERT INTO invoices(invoice_number,order_id,customer_id,subtotal,total_amount,due_date)
 VALUES('INV-'||order_uuid::text,order_uuid,customer_uuid,total,total,
   coalesce((p_data->>'due_date')::date,(p_data->>'order_date')::date,business_amman_today()));
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id)
 VALUES('order',p_actor,p_key,p_data,order_uuid);
 result := business_order_document(order_uuid);
 RETURN jsonb_build_object('order',result,'replayed',false);
END $$;

-- Same as 036, with the inline per-item deduction replaced by business_apply_item_stock. The
-- reversal above it already reads the order's own movements, so it gives components back.
CREATE OR REPLACE FUNCTION public.business_order_update(p_actor text,p_scope text,p_key uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE old_request business_requests; ord orders; before_snap jsonb; after_snap jsonb; diff jsonb;
  item jsonb; item_qty int; item_product_id uuid; new_total numeric; details jsonb; mv record;
  already_paid numeric;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('order-edit:'||p_actor||':'||p_key::text,0));
 SELECT * INTO old_request FROM business_requests WHERE operation='order_edit' AND actor_id=p_actor AND request_key=p_key;
 IF FOUND THEN
   IF old_request.payload<>p_data THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   RETURN jsonb_build_object('order',business_order_document(old_request.result_id),'replayed',true);
 END IF;
 IF coalesce(length(trim(p_actor)),0)=0 THEN RAISE EXCEPTION 'INVALID_ACTOR'; END IF;
 SELECT * INTO ord FROM orders WHERE order_number=p_data->>'id' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
 IF p_scope IS NOT NULL AND ord.owner_account_id IS DISTINCT FROM p_scope THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF ord.status NOT IN ('draft','confirmed','processing') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
 SELECT coalesce(sum(p.amount),0) INTO already_paid FROM payments p JOIN invoices i ON i.id=p.invoice_id WHERE i.order_id=ord.id;
 IF already_paid>0 AND p_data ? 'items' THEN RAISE EXCEPTION 'HAS_PAYMENTS'; END IF;

 before_snap := jsonb_build_object('city',coalesce(ord.delivery_city,''),'address',coalesce(ord.delivery_address,''),
   'notes',coalesce(ord.notes,''),'customer_name',coalesce(ord.business_details->>'customer_name',''),
   'customer_phone',coalesce(ord.business_details->>'customer_phone',''),'total_amount',ord.total_amount,
   'items_summary',coalesce(ord.business_details->>'items_summary',
     (SELECT string_agg(quantity::text||' × '||product_name_raw,' + ') FROM order_items WHERE order_id=ord.id),''));

 details := ord.business_details;
 IF p_data ? 'customer_name' THEN details := details || jsonb_build_object('customer_name',nullif(trim(p_data->>'customer_name'),'')); END IF;
 IF p_data ? 'customer_phone' THEN details := details || jsonb_build_object('customer_phone',nullif(trim(p_data->>'customer_phone'),'')); END IF;

 new_total := ord.total_amount;
 IF p_data ? 'items' THEN
   IF jsonb_typeof(p_data->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'items')=0
     OR jsonb_array_length(p_data->'items')>200 THEN RAISE EXCEPTION 'INVALID_ITEMS'; END IF;
   -- Reverse whatever stock this order already deducted (draft never deducted anything).
   IF ord.status IN ('confirmed','processing') THEN
     FOR mv IN SELECT m.product_id,-sum(m.quantity)::int AS qty FROM inventory_movements m
       WHERE m.reference_type='order' AND m.reference_id=ord.id GROUP BY m.product_id HAVING -sum(m.quantity)>0 LOOP
       UPDATE inventory SET quantity_on_hand=quantity_on_hand+mv.qty, updated_at=now() WHERE product_id=mv.product_id;
       INSERT INTO inventory_movements(product_id,movement_type,quantity,reference_type,reference_id)
       VALUES(mv.product_id,'return_in',mv.qty,'order',ord.id);
     END LOOP;
   END IF;
   DELETE FROM order_items WHERE order_id=ord.id;
   new_total := 0;
   FOR item IN SELECT * FROM jsonb_array_elements(p_data->'items') LOOP
     IF coalesce(length(trim(item->>'name')),0)=0 OR (item->>'qty')::numeric<=0
       OR (item->>'qty')::numeric<>trunc((item->>'qty')::numeric) OR (item->>'qty') IS NULL
       OR (item->>'qty')::numeric>100000 OR (item->>'price')::numeric<0
       OR (item->>'price')::numeric>=10000000 THEN RAISE EXCEPTION 'INVALID_ITEMS'; END IF;
     item_qty := (item->>'qty')::integer;
     new_total := new_total + coalesce((item->>'price')::numeric,0)*item_qty;
     item_product_id := business_resolve_product(item->>'name');
     INSERT INTO order_items(order_id,product_id,product_name_raw,quantity,unit_price,total_price,price_is_known)
     VALUES(ord.id,item_product_id,item->>'name',item_qty,coalesce((item->>'price')::numeric,0),
       coalesce((item->>'price')::numeric,0)*item_qty,item->>'price' IS NOT NULL);
     IF item_product_id IS NOT NULL AND ord.status IN ('confirmed','processing') THEN
       PERFORM business_apply_item_stock(ord.id,item_product_id,item_qty);
     END IF;
   END LOOP;
   IF new_total<=0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
   details := details - 'items_summary';
 END IF;

 UPDATE orders SET
   delivery_city=CASE WHEN p_data ? 'city' THEN nullif(trim(p_data->>'city'),'') ELSE delivery_city END,
   delivery_address=CASE WHEN p_data ? 'address' THEN nullif(trim(p_data->>'address'),'') ELSE delivery_address END,
   notes=CASE WHEN p_data ? 'notes' THEN nullif(trim(p_data->>'notes'),'') ELSE notes END,
   total_amount=CASE WHEN p_data ? 'items' THEN new_total ELSE total_amount END,
   subtotal=CASE WHEN p_data ? 'items' THEN new_total ELSE subtotal END,
   business_details=details,
   updated_at=now()
 WHERE id=ord.id
 RETURNING * INTO ord;

 IF p_data ? 'items' THEN
   UPDATE invoices SET total_amount=new_total,subtotal=new_total WHERE order_id=ord.id;
 END IF;

 after_snap := jsonb_build_object('city',coalesce(ord.delivery_city,''),'address',coalesce(ord.delivery_address,''),
   'notes',coalesce(ord.notes,''),'customer_name',coalesce(ord.business_details->>'customer_name',''),
   'customer_phone',coalesce(ord.business_details->>'customer_phone',''),'total_amount',ord.total_amount,
   'items_summary',coalesce((SELECT string_agg(quantity::text||' × '||product_name_raw,' + ') FROM order_items WHERE order_id=ord.id),''));

 SELECT coalesce(jsonb_object_agg(k,jsonb_build_object('from',b.v,'to',a.v)),'{}'::jsonb) INTO diff
 FROM jsonb_each(before_snap) b(k,v) JOIN jsonb_each(after_snap) a(k,v) USING (k)
 WHERE a.v IS DISTINCT FROM b.v;
 IF diff<>'{}'::jsonb THEN
   INSERT INTO order_changes(order_id,actor_id,changes) VALUES(ord.id,p_actor,diff);
 END IF;

 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id)
 VALUES('order_edit',p_actor,p_key,p_data,ord.id);
 RETURN jsonb_build_object('order',business_order_document(ord.id),'replayed',false);
END $$;

-- Stocking a bundle directly is a trap: the row would be written and then ignored, because a
-- bundle's availability is computed from its components. Say so instead of accepting the entry.
-- Identical to 008 apart from that one check.
CREATE OR REPLACE FUNCTION public.business_inventory_movement_create(p_actor text,p_key uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE old_request business_requests; prod products; inv inventory; delta int; mtype inventory_movement_type_enum;
  movement_id uuid := gen_random_uuid(); new_stock int;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('inventory:'||p_actor||':'||p_key::text,0));
 SELECT * INTO old_request FROM business_requests WHERE operation='inventory' AND actor_id=p_actor AND request_key=p_key;
 IF FOUND THEN
   IF old_request.payload<>p_data THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   RETURN jsonb_build_object('movement',business_inventory_movement_document(old_request.result_id),'replayed',true);
 END IF;
 IF coalesce(length(trim(p_data->>'sku')),0)=0 THEN RAISE EXCEPTION 'INVALID_MOVEMENT'; END IF;
 SELECT * INTO prod FROM products WHERE sku=p_data->>'sku' AND is_active;
 IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
 IF EXISTS (SELECT 1 FROM product_bundles WHERE bundle_product_id=prod.id) THEN RAISE EXCEPTION 'PRODUCT_IS_BUNDLE'; END IF;
 BEGIN
   mtype := (p_data->>'type')::inventory_movement_type_enum;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'INVALID_MOVEMENT';
 END;
 delta := (p_data->>'delta')::int;
 IF delta IS NULL OR delta=0 OR delta<-1000000 OR delta>1000000 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
 INSERT INTO inventory(product_id,quantity_on_hand) VALUES(prod.id,0) ON CONFLICT (product_id) DO NOTHING;
 SELECT * INTO inv FROM inventory WHERE product_id=prod.id FOR UPDATE;
 IF inv.quantity_on_hand+delta<0 THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK'; END IF;
 new_stock := inv.quantity_on_hand+delta;
 UPDATE inventory SET quantity_on_hand=new_stock, updated_at=now() WHERE product_id=prod.id;
 INSERT INTO inventory_movements(id,product_id,movement_type,quantity,reference_type,notes)
 VALUES(movement_id,prod.id,mtype,delta,nullif(trim(p_data->>'reference'),''),nullif(trim(p_data->>'notes'),''));
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('inventory',p_actor,p_key,p_data,movement_id);
 RETURN jsonb_build_object('movement',business_inventory_movement_document(movement_id),'stock',new_stock,'replayed',false);
END $$;

-- The warehouse picks bottles, not packages, so the "stock needed" list expands bundles too.
CREATE OR REPLACE FUNCTION public.business_driver_stock_needed() RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.sku,'product',x.name_ar,'needed',x.needed,'available',x.available,
   'status',CASE WHEN x.available<x.needed THEN 'Low' ELSE 'OK' END) ORDER BY x.name_ar),'[]'::jsonb)
 FROM (
   SELECT p.sku,p.name_ar,sum(parts.quantity)::int AS needed,coalesce(max(inv.quantity_on_hand),0)::int AS available
   FROM orders o
   JOIN order_items oi ON oi.order_id=o.id
   CROSS JOIN LATERAL business_bundle_expand(oi.product_id,oi.quantity) parts
   JOIN products p ON p.id=parts.product_id
   LEFT JOIN inventory inv ON inv.product_id=p.id
   WHERE o.status='processing' AND business_driver_of(o.business_details,o.notes) IS NOT NULL
   GROUP BY p.sku,p.name_ar
 ) x
$$;

REVOKE ALL ON FUNCTION public.business_bundle_expand(uuid,int),public.business_bundle_buildable(uuid),
  public.business_apply_item_stock(uuid,uuid,int) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_bundle_expand(uuid,int),public.business_bundle_buildable(uuid),
  public.business_apply_item_stock(uuid,uuid,int) TO service_role;

COMMIT;
