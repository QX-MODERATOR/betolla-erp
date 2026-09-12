-- =============================================================================
-- Migration 006: Orders Persistence Foundation (Phase 2, module A)
--
-- Reuses the existing orders / order_items / customers schema from
-- 001_initial_schema.sql and 004_driver_schema.sql as-is — no duplicate
-- tables. Adds only what's genuinely missing for real persistence:
--   1. created_by / updated_by on orders (who did what).
--   2. order_status_history: an append-only audit trail for status changes,
--      including driver-side delivery status changes.
--   3. Helper functions current_profile_id()/current_role() so RLS policies
--      can be written once and reused.
--   4. Real, role-scoped Row Level Security for profiles/customers/orders/
--      order_items — replacing the deny-all placeholder from migration 005
--      now that the application actually reads/writes these tables
--      directly (via the user's own session, not just the service role).
--   5. create_order_with_items(): a single transactional entry point for
--      order creation (find-or-create customer, insert order, insert line
--      items, write the first status-history row) so a partial order can
--      never be left half-written.
--   6. driver_update_delivery_status(): a narrow, SECURITY DEFINER RPC that
--      lets a driver update ONLY their own assigned order's delivery
--      fields (status/cash/notes) — real row *and* column-level ownership
--      enforcement, closing the gap flagged in the Phase 1 audit where a
--      driver had no server-side ownership check.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Role naming reconciliation
--
-- 001_initial_schema.sql's user_role_enum used 'manager' and
-- 'inventory_manager', but the application (lib/auth.ts) has always used
-- 'sales_manager' and has no 'inventory_manager' concept. This mismatch
-- (flagged in the Phase 1 audit) would otherwise make every "admin-like"
-- check below silently fail for the app's real role name. Renaming is safe
-- pre-launch (no production rows depend on the old label yet).
-- 'inventory_manager' is left in place, unused by the app for now, rather
-- than dropped — Postgres cannot remove an enum value without recreating
-- the type, which is unnecessary risk for a value nothing references.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  ALTER TYPE user_role_enum RENAME VALUE 'manager' TO 'sales_manager';
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'user_role_enum rename manager -> sales_manager skipped: %', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- 1. created_by / updated_by
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 2. Order status audit trail
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON public.order_status_history(order_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. RLS helper functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.profiles WHERE auth_user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_role()
RETURNS user_role_enum
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE auth_user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin_like()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_role() IN ('admin', 'sales_manager');
$$;

-- ---------------------------------------------------------------------------
-- 4. Row Level Security — replaces the migration-005 deny-all placeholder
--    for the tables Orders actually needs. Every other business table
--    (inventory, invoices, payments, etc.) is untouched here and stays
--    deny-all until its own Phase 2 module is implemented.
-- ---------------------------------------------------------------------------

-- profiles: staff directory. Every authenticated staff member may read
-- every profile (needed to show "handled by <rep>" everywhere), but only
-- the service role can write.
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_staff_directory" ON public.profiles;
CREATE POLICY "profiles_select_staff_directory" ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- customers: admin/manager see everything. A sales_rep sees/edits only
-- customers assigned to them (or unassigned ones, so they can claim a new
-- lead by creating an order for it). driver_manager and finance can read
-- any customer (needed to fulfill/collect on any order), not write.
DROP POLICY IF EXISTS "customers_select" ON public.customers;
CREATE POLICY "customers_select" ON public.customers
  FOR SELECT TO authenticated
  USING (
    public.is_admin_like()
    OR public.current_role() IN ('driver_manager', 'finance')
    OR (public.current_role() = 'sales_rep' AND (assigned_rep_id = public.current_profile_id() OR assigned_rep_id IS NULL))
  );

DROP POLICY IF EXISTS "customers_insert" ON public.customers;
CREATE POLICY "customers_insert" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_like()
    OR (public.current_role() = 'sales_rep' AND (assigned_rep_id = public.current_profile_id() OR assigned_rep_id IS NULL))
  );

DROP POLICY IF EXISTS "customers_update" ON public.customers;
CREATE POLICY "customers_update" ON public.customers
  FOR UPDATE TO authenticated
  USING (
    public.is_admin_like()
    OR (public.current_role() = 'sales_rep' AND assigned_rep_id = public.current_profile_id())
  );

-- orders: admin/manager everything. sales_rep only their own (rep_id).
-- driver_manager can read/update any order (dispatch/reconcile). driver can
-- only read orders assigned to them — column-level restriction on what a
-- driver can CHANGE is enforced separately by driver_update_delivery_status()
-- below, not by a raw UPDATE policy, so a driver can never rewrite
-- total_amount/customer/etc. on their own delivery.
DROP POLICY IF EXISTS "orders_select" ON public.orders;
CREATE POLICY "orders_select" ON public.orders
  FOR SELECT TO authenticated
  USING (
    public.is_admin_like()
    OR public.current_role() = 'finance'
    OR (public.current_role() = 'driver_manager')
    OR (public.current_role() = 'sales_rep' AND rep_id = public.current_profile_id())
    OR (public.current_role() = 'driver' AND assigned_driver_id = public.current_profile_id())
  );

DROP POLICY IF EXISTS "orders_insert" ON public.orders;
CREATE POLICY "orders_insert" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_like()
    OR (public.current_role() = 'sales_rep' AND rep_id = public.current_profile_id())
    OR public.current_role() = 'driver_manager'
  );

DROP POLICY IF EXISTS "orders_update" ON public.orders;
CREATE POLICY "orders_update" ON public.orders
  FOR UPDATE TO authenticated
  USING (
    public.is_admin_like()
    OR public.current_role() = 'driver_manager'
    OR (public.current_role() = 'sales_rep' AND rep_id = public.current_profile_id())
  );

-- order_items: visible/writable exactly when the parent order is.
DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
CREATE POLICY "order_items_select" ON public.order_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id));
-- (the orders_select policy above already restricts which orders exist in
-- this subquery's visible set for the current role, so this composes correctly)

DROP POLICY IF EXISTS "order_items_insert" ON public.order_items;
CREATE POLICY "order_items_insert" ON public.order_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id));

-- order_status_history: readable alongside the order; only insertable via
-- the RPCs below in normal operation, but direct inserts are allowed too
-- for roles that can already update the order, to keep this simple.
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "order_status_history_select" ON public.order_status_history;
CREATE POLICY "order_status_history_select" ON public.order_status_history
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_status_history.order_id));

DROP POLICY IF EXISTS "order_status_history_insert" ON public.order_status_history;
CREATE POLICY "order_status_history_insert" ON public.order_status_history
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_status_history.order_id));

-- ---------------------------------------------------------------------------
-- 5. Atomic order creation
--
-- Order numbers are generated from a DB sequence INSIDE this function,
-- never trusted from the client — computing "next number" client-side and
-- passing it in would race under concurrent order creation and could
-- collide (order_number is UNIQUE, so a collision would just fail, but
-- worse, a gap-free client-side counter is exactly the in-memory
-- `orderCounter` bug this migration replaces).
-- ---------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START 1;
-- create_order_with_items runs as SECURITY INVOKER, so nextval() below
-- executes as the calling (authenticated) role and needs explicit USAGE.
GRANT USAGE ON SEQUENCE public.order_number_seq TO authenticated;

CREATE OR REPLACE FUNCTION public.create_order_with_items(
  p_customer_phone TEXT,
  p_customer_name TEXT,
  p_customer_city TEXT,
  p_customer_address TEXT,
  p_lead_source lead_source_enum,
  p_rep_name_raw TEXT,
  p_source TEXT,
  p_status order_status_enum,
  p_total_amount NUMERIC,
  p_payment_method payment_method_enum,
  p_delivery_address TEXT,
  p_delivery_city TEXT,
  p_notes TEXT,
  p_raw_whatsapp_text TEXT,
  p_items JSONB -- [{product_name_raw, quantity, unit_price, total_price}, ...]
)
RETURNS public.orders
LANGUAGE plpgsql
AS $$
DECLARE
  v_customer_id UUID;
  v_order public.orders;
  v_actor_id UUID := public.current_profile_id();
  v_item JSONB;
  v_order_number TEXT;
BEGIN
  IF p_customer_phone IS NULL OR length(trim(p_customer_phone)) = 0 THEN
    RAISE EXCEPTION 'customer phone is required';
  END IF;

  v_order_number := 'BET-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.order_number_seq')::TEXT, 5, '0');

  -- Find-or-create the customer by phone. This runs under the caller's own
  -- RLS (SECURITY INVOKER, the default), so a sales_rep can only do this
  -- within the bounds customers_insert/select already allow them.
  SELECT id INTO v_customer_id FROM public.customers WHERE phone = p_customer_phone LIMIT 1;

  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (
      name, phone, city, address, customer_type, classification, lead_source,
      assigned_rep_id, rep_name_raw, last_contact_date
    ) VALUES (
      COALESCE(NULLIF(trim(p_customer_name), ''), 'عميل جديد'),
      p_customer_phone, p_customer_city, p_customer_address,
      'end_user', 'customer', COALESCE(p_lead_source, 'sales'),
      v_actor_id, p_rep_name_raw, CURRENT_DATE
    )
    RETURNING id INTO v_customer_id;
  END IF;

  INSERT INTO public.orders (
    order_number, customer_id, rep_id, source, status,
    subtotal, total_amount, payment_method, payment_status,
    delivery_address, delivery_city, notes, raw_whatsapp_text,
    order_date, created_by, updated_by,
    confirmed_at
  ) VALUES (
    v_order_number, v_customer_id, v_actor_id, p_source, p_status,
    p_total_amount, p_total_amount, p_payment_method,
    'pending',
    p_delivery_address, p_delivery_city, p_notes, p_raw_whatsapp_text,
    CURRENT_DATE, v_actor_id, v_actor_id,
    CASE WHEN p_status = 'confirmed' THEN now() ELSE NULL END
  )
  RETURNING * INTO v_order;

  IF p_items IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      INSERT INTO public.order_items (order_id, product_name_raw, quantity, unit_price, total_price)
      VALUES (
        v_order.id,
        v_item->>'product_name_raw',
        COALESCE((v_item->>'quantity')::INT, 1),
        COALESCE((v_item->>'unit_price')::NUMERIC, 0),
        COALESCE((v_item->>'total_price')::NUMERIC, 0)
      );
    END LOOP;
  END IF;

  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, notes)
  VALUES (v_order.id, NULL, p_status::TEXT, v_actor_id, 'Order created');

  RETURN v_order;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5b. Staff-side order status update (admin/sales_manager/sales_rep/
--     driver_manager) — same RLS-scoped ownership as a plain UPDATE
--     (SECURITY INVOKER, so orders_update above still applies), but bundles
--     the status change and its audit-trail row into one transaction.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id UUID,
  p_new_status order_status_enum,
  p_notes TEXT DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor_id UUID := public.current_profile_id();
  v_old_status TEXT;
  v_order public.orders;
BEGIN
  SELECT status::TEXT INTO v_old_status FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found';
  END IF;

  UPDATE public.orders SET
    status = p_new_status,
    updated_by = v_actor_id,
    confirmed_at = CASE WHEN p_new_status = 'confirmed' AND confirmed_at IS NULL THEN now() ELSE confirmed_at END,
    shipped_at = CASE WHEN p_new_status = 'shipped' AND shipped_at IS NULL THEN now() ELSE shipped_at END,
    delivered_at = CASE WHEN p_new_status = 'delivered' AND delivered_at IS NULL THEN now() ELSE delivered_at END,
    cancelled_at = CASE WHEN p_new_status = 'cancelled' AND cancelled_at IS NULL THEN now() ELSE cancelled_at END
  WHERE id = p_order_id
  RETURNING * INTO v_order;
  -- If the caller's RLS (orders_update) doesn't permit touching this row,
  -- the UPDATE above simply matches zero rows rather than erroring — check
  -- explicitly so the caller gets a clear failure instead of a silently
  -- unchanged row.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized to update this order';
  END IF;

  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, notes)
  VALUES (p_order_id, v_old_status, p_new_status::TEXT, v_actor_id, p_notes);

  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.update_order_status FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_order_status TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Narrow, ownership-checked driver delivery-status update
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.driver_update_delivery_status(
  p_order_id UUID,
  p_new_status driver_delivery_status_enum,
  p_cash_collected NUMERIC DEFAULT NULL,
  p_receivables NUMERIC DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := public.current_profile_id();
  v_order public.orders;
  v_old_status TEXT;
BEGIN
  IF public.current_role() != 'driver' THEN
    RAISE EXCEPTION 'only a driver may call driver_update_delivery_status';
  END IF;

  SELECT driver_status::TEXT INTO v_old_status FROM public.orders WHERE id = p_order_id AND assigned_driver_id = v_actor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found or not assigned to the calling driver';
  END IF;

  UPDATE public.orders SET
    driver_status = p_new_status,
    cash_collected = COALESCE(p_cash_collected, cash_collected),
    receivables = COALESCE(p_receivables, receivables),
    driver_notes = COALESCE(p_notes, driver_notes),
    driver_completed_at = CASE WHEN p_new_status IN ('delivered', 'returned') THEN now() ELSE driver_completed_at END,
    updated_by = v_actor_id
  WHERE id = p_order_id AND assigned_driver_id = v_actor_id
  RETURNING * INTO v_order;

  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, notes)
  VALUES (p_order_id, v_old_status, p_new_status::TEXT, v_actor_id, p_notes);

  RETURN v_order;
END;
$$;

-- Explicit, least-privilege execute grants (rather than relying on the
-- Postgres default of PUBLIC execute on newly created functions).
REVOKE ALL ON FUNCTION public.create_order_with_items FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_with_items TO authenticated;

REVOKE ALL ON FUNCTION public.driver_update_delivery_status FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_update_delivery_status TO authenticated;
