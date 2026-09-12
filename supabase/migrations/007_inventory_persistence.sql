-- =============================================================================
-- Migration 007: Inventory Persistence Foundation (Phase 2, module B)
--
-- Reuses categories/products/inventory/inventory_movements from
-- 001_initial_schema.sql as-is (already correctly modeled, already seeded
-- by 002_seed_products.sql) — no duplicate tables. Adds only RLS and one
-- atomic RPC for recording a movement + updating the stock count together.
-- =============================================================================

-- Read access: every authenticated staff member can see the catalog and
-- stock levels (a sales_rep needs to know what's actually in stock before
-- promising it to a customer). Only admin/sales_manager/driver_manager can
-- record movements or edit the catalog.
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "categories_select" ON public.categories;
CREATE POLICY "categories_select" ON public.categories FOR SELECT TO authenticated USING (true);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products_select" ON public.products;
CREATE POLICY "products_select" ON public.products FOR SELECT TO authenticated USING (true);

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inventory_select" ON public.inventory;
CREATE POLICY "inventory_select" ON public.inventory FOR SELECT TO authenticated USING (true);

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inventory_movements_select" ON public.inventory_movements;
CREATE POLICY "inventory_movements_select" ON public.inventory_movements
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "inventory_movements_insert" ON public.inventory_movements;
CREATE POLICY "inventory_movements_insert" ON public.inventory_movements
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_like() OR public.current_role() = 'driver_manager');

DROP POLICY IF EXISTS "inventory_update" ON public.inventory;
CREATE POLICY "inventory_update" ON public.inventory
  FOR UPDATE TO authenticated
  USING (public.is_admin_like() OR public.current_role() = 'driver_manager');

-- ---------------------------------------------------------------------------
-- Atomic movement recording: writes the audit-trail row and adjusts the
-- stock count in the same transaction, so the two can never drift apart
-- (which the old in-memory mock effectively risked by keeping them as two
-- independent pieces of client-visible state).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_inventory_movement(
  p_sku TEXT,
  p_movement_type inventory_movement_type_enum,
  p_quantity INT, -- signed: positive increases stock, negative decreases
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (movement public.inventory_movements, new_quantity_on_hand INT, reorder_level INT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_product_id UUID;
  v_actor_id UUID := public.current_profile_id();
  v_movement public.inventory_movements;
  v_current_qty INT;
  v_reorder_level INT;
BEGIN
  IF p_quantity = 0 THEN
    RAISE EXCEPTION 'movement quantity cannot be zero';
  END IF;

  SELECT id INTO v_product_id FROM public.products WHERE sku = p_sku AND is_active = true;
  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'active product with SKU % not found', p_sku;
  END IF;

  -- Lock the inventory row for the duration of this transaction so two
  -- concurrent movements on the same product can't both read the same
  -- starting quantity and silently lose one of the adjustments.
  SELECT quantity_on_hand, reorder_level INTO v_current_qty, v_reorder_level
  FROM public.inventory WHERE product_id = v_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.inventory (product_id, quantity_on_hand)
    VALUES (v_product_id, 0)
    RETURNING quantity_on_hand, reorder_level INTO v_current_qty, v_reorder_level;
  END IF;

  IF v_current_qty + p_quantity < 0 THEN
    RAISE EXCEPTION 'insufficient stock for %: have %, requested change %', p_sku, v_current_qty, p_quantity;
  END IF;

  INSERT INTO public.inventory_movements (product_id, movement_type, quantity, reference_type, notes, created_by)
  VALUES (v_product_id, p_movement_type, p_quantity, 'manual', p_notes, v_actor_id)
  RETURNING * INTO v_movement;

  UPDATE public.inventory
  SET quantity_on_hand = quantity_on_hand + p_quantity, updated_at = now()
  WHERE product_id = v_product_id
  RETURNING quantity_on_hand INTO v_current_qty;

  RETURN QUERY SELECT v_movement, v_current_qty, v_reorder_level;
END;
$$;

REVOKE ALL ON FUNCTION public.record_inventory_movement FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_inventory_movement TO authenticated;
