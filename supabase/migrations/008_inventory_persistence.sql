-- Additive only: no backfill, deletion, or changes to existing RLS/policies.
-- Connects the inventory catalog and stock-movement audit trail (app/inventory) to durable
-- storage in `products`/`inventory`/`inventory_movements`, replacing the in-memory movement log.
BEGIN;

CREATE FUNCTION public.business_inventory_catalog() RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',p.id,'sku',p.sku,'name_ar',p.name_ar,'name_en',p.name_en,
   'category',coalesce(c.slug,''),'category_label',coalesce(c.name_ar,''),
   'cost_price',p.cost_price,'price',p.retail_price,'sale_price',p.sale_price,
   'stock',coalesce(i.quantity_on_hand,0),'reserved',coalesce(i.quantity_reserved,0),
   'reorder',coalesce(i.reorder_level,10)
 ) ORDER BY coalesce(c.display_order,999),p.name_ar),'[]'::jsonb)
 FROM products p LEFT JOIN inventory i ON i.product_id=p.id LEFT JOIN categories c ON c.id=p.category_id
 WHERE p.is_active
$$;

CREATE FUNCTION public.business_inventory_movement_document(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT jsonb_build_object('id',m.id,'sku',pr.sku,'name',pr.name_ar,'type',m.movement_type,
   'quantity',m.quantity,'reference',coalesce(m.reference_type,''),'reference_id',m.reference_id,
   'notes',coalesce(m.notes,''),'created_at',m.created_at)
 FROM inventory_movements m JOIN products pr ON pr.id=m.product_id WHERE m.id=p_id
$$;

CREATE FUNCTION public.business_inventory_movements(p_limit int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(business_inventory_movement_document(id) ORDER BY created_at DESC,id DESC),'[]'::jsonb)
 FROM (SELECT id,created_at FROM inventory_movements ORDER BY created_at DESC,id DESC LIMIT least(greatest(coalesce(p_limit,200),1),500)) m
$$;

-- Every movement is additive: quantity is a signed delta (schema convention already documented
-- on inventory_movements.quantity). Nothing here ever rewrites or deletes a past movement.
CREATE FUNCTION public.business_inventory_movement_create(p_actor text,p_key uuid,p_data jsonb) RETURNS jsonb
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

-- A movement is never edited or deleted; "reversing" it posts a new, equal-and-opposite,
-- audit-linked movement (reference_type='reversal', reference_id = original movement id).
CREATE FUNCTION public.business_inventory_movement_reverse(p_actor text,p_key uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE old_request business_requests; orig inventory_movements; inv inventory; movement_id uuid := gen_random_uuid();
  orig_id uuid; new_stock int;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('inventory-reverse:'||p_actor||':'||p_key::text,0));
 SELECT * INTO old_request FROM business_requests WHERE operation='inventory_reverse' AND actor_id=p_actor AND request_key=p_key;
 IF FOUND THEN
   IF old_request.payload<>p_data THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   RETURN jsonb_build_object('movement',business_inventory_movement_document(old_request.result_id),'replayed',true);
 END IF;
 BEGIN orig_id := (p_data->>'movement_id')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'MOVEMENT_NOT_FOUND'; END;
 SELECT * INTO orig FROM inventory_movements WHERE id=orig_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'MOVEMENT_NOT_FOUND'; END IF;
 IF orig.reference_type='reversal' THEN RAISE EXCEPTION 'MOVEMENT_NOT_REVERSIBLE'; END IF;
 IF EXISTS(SELECT 1 FROM inventory_movements WHERE reference_type='reversal' AND reference_id=orig.id) THEN RAISE EXCEPTION 'ALREADY_REVERSED'; END IF;
 SELECT * INTO inv FROM inventory WHERE product_id=orig.product_id FOR UPDATE;
 IF inv.quantity_on_hand-orig.quantity<0 THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK'; END IF;
 new_stock := inv.quantity_on_hand-orig.quantity;
 UPDATE inventory SET quantity_on_hand=new_stock, updated_at=now() WHERE product_id=orig.product_id;
 INSERT INTO inventory_movements(id,product_id,movement_type,quantity,reference_type,reference_id,notes)
 VALUES(movement_id,orig.product_id,'adjustment',-orig.quantity,'reversal',orig.id,'عكس حركة رقم '||orig.id::text);
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('inventory_reverse',p_actor,p_key,p_data,movement_id);
 RETURN jsonb_build_object('movement',business_inventory_movement_document(movement_id),'stock',new_stock,'replayed',false);
END $$;

-- Only the existing server identity can call these RPCs; never expose the service key.
REVOKE ALL ON FUNCTION public.business_inventory_catalog(),public.business_inventory_movement_document(uuid),
 public.business_inventory_movements(int),public.business_inventory_movement_create(text,uuid,jsonb),
 public.business_inventory_movement_reverse(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_inventory_catalog(),public.business_inventory_movement_document(uuid),
 public.business_inventory_movements(int),public.business_inventory_movement_create(text,uuid,jsonb),
 public.business_inventory_movement_reverse(text,uuid,jsonb) TO service_role;
COMMIT;
