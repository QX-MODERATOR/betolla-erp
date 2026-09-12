-- =============================================================================
-- Migration 008: Finance / Invoices / Payments Persistence (Phase 2, module C)
--
-- Reuses invoices/payments from 001_initial_schema.sql as-is — no duplicate
-- tables. paid_amount is intentionally NOT stored on invoices; it's always
-- derived as SUM(payments.amount), so it can never drift from the actual
-- ledger of payments (a classic double-entry-bookkeeping smell to avoid).
--
-- Business consistency (explicitly required by Phase 2): every order now
-- gets its invoice created atomically alongside it — extending
-- create_order_with_items() from migration 006 rather than creating
-- invoices as a disconnected, separately-triggered step — and recording a
-- payment keeps the parent order's payment_status in sync with the
-- invoice's derived status.
-- =============================================================================

-- record_payment() (below) needs to update orders.payment_status to keep it
-- in sync with the invoice it belongs to. migration 006's orders_update
-- policy didn't grant finance UPDATE on orders at all (finance had no
-- write use case yet) — widen it now, scoped to what finance actually
-- needs to touch being enforced at the application layer (this RPC only
-- ever writes payment_status here, never other order fields for finance).
DROP POLICY IF EXISTS "orders_update" ON public.orders;
CREATE POLICY "orders_update" ON public.orders
  FOR UPDATE TO authenticated
  USING (
    public.is_admin_like()
    OR public.current_role() IN ('driver_manager', 'finance')
    OR (public.current_role() = 'sales_rep' AND rep_id = public.current_profile_id())
  );

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invoices_select" ON public.invoices;
CREATE POLICY "invoices_select" ON public.invoices
  FOR SELECT TO authenticated
  USING (public.is_admin_like() OR public.current_role() = 'finance');

DROP POLICY IF EXISTS "invoices_insert" ON public.invoices;
CREATE POLICY "invoices_insert" ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_like() OR public.current_role() IN ('finance', 'sales_rep', 'driver_manager'));
-- (insert is only ever exercised by create_order_with_items(), which is
-- SECURITY INVOKER — so this must allow whichever roles can create orders)

DROP POLICY IF EXISTS "invoices_update" ON public.invoices;
CREATE POLICY "invoices_update" ON public.invoices
  FOR UPDATE TO authenticated
  USING (public.is_admin_like() OR public.current_role() = 'finance');

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payments_select" ON public.payments;
CREATE POLICY "payments_select" ON public.payments
  FOR SELECT TO authenticated
  USING (public.is_admin_like() OR public.current_role() = 'finance');

DROP POLICY IF EXISTS "payments_insert" ON public.payments;
CREATE POLICY "payments_insert" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_like() OR public.current_role() = 'finance');

CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 1;
GRANT USAGE ON SEQUENCE public.invoice_number_seq TO authenticated;

-- ---------------------------------------------------------------------------
-- Extend create_order_with_items (from migration 006) to also create the
-- matching invoice, atomically, in the same function/transaction. Same
-- signature as before — CREATE OR REPLACE, not a new function — so
-- app/api/orders callers are unaffected.
-- ---------------------------------------------------------------------------

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
  p_items JSONB
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
  v_invoice_number TEXT;
  v_due_date DATE;
BEGIN
  IF p_customer_phone IS NULL OR length(trim(p_customer_phone)) = 0 THEN
    RAISE EXCEPTION 'customer phone is required';
  END IF;

  v_order_number := 'BET-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.order_number_seq')::TEXT, 5, '0');

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

  -- Every order gets exactly one invoice, created here so the two can never
  -- go out of sync (no separate "issue invoice" step to forget). A draft
  -- (reservation) order still gets a pending invoice — it simply won't be
  -- collectible/printable as final until the order is confirmed, which the
  -- Finance UI can filter on via the order's own status if needed later.
  v_invoice_number := 'INV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::TEXT, 5, '0');
  v_due_date := CASE WHEN p_payment_method = 'installment' THEN (CURRENT_DATE + INTERVAL '30 days')::DATE ELSE CURRENT_DATE END;

  INSERT INTO public.invoices (invoice_number, order_id, customer_id, subtotal, discount_amount, total_amount, status, due_date)
  VALUES (v_invoice_number, v_order.id, v_customer_id, p_total_amount, 0, p_total_amount, 'pending', v_due_date);

  RETURN v_order;
END;
$$;

-- ---------------------------------------------------------------------------
-- Atomic payment recording: writes the payment, recomputes the invoice's
-- derived status from the real payments ledger, and keeps the parent
-- order's payment_status consistent with it — one transaction, so a
-- payment can never be recorded without the invoice/order reflecting it.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_payment(
  p_invoice_id UUID,
  p_amount NUMERIC,
  p_payment_method payment_method_enum,
  p_reference_number TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (invoice public.invoices, paid_amount NUMERIC)
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor UUID := public.current_profile_id();
  v_invoice public.invoices;
  v_total_paid NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'payment amount must be positive';
  END IF;

  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice not found';
  END IF;

  INSERT INTO public.payments (invoice_id, amount, payment_method, reference_number, notes, recorded_by)
  VALUES (p_invoice_id, p_amount, p_payment_method, p_reference_number, p_notes, v_actor);

  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid FROM public.payments WHERE invoice_id = p_invoice_id;

  UPDATE public.invoices SET
    status = CASE
      WHEN v_total_paid >= total_amount THEN 'paid'::payment_status_enum
      WHEN v_total_paid > 0 THEN 'partial'::payment_status_enum
      ELSE 'pending'::payment_status_enum
    END
  WHERE id = p_invoice_id
  RETURNING * INTO v_invoice;

  UPDATE public.orders SET payment_status = v_invoice.status, updated_by = v_actor
  WHERE id = v_invoice.order_id;

  RETURN QUERY SELECT v_invoice, v_total_paid;
END;
$$;

REVOKE ALL ON FUNCTION public.record_payment FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_payment TO authenticated;
