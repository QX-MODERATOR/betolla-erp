-- =============================================================================
-- Migration 009: Customers / Leads / Calls Persistence (Phase 2, module D)
--
-- Reuses customers/call_logs from 001_initial_schema.sql as-is. Adds RLS
-- for call_logs (customers/orders already got theirs in migrations 006-008)
-- and one atomic RPC for logging a call + advancing the customer's
-- next-follow-up date together.
-- =============================================================================

-- The original mock UI scheduled follow-ups with a specific time
-- ("11:30"), but customers.next_call_date is DATE-only — there's nowhere
-- to actually store that. Adding the column rather than silently
-- defaulting every follow-up to a fake fixed time in the API layer.
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS next_call_time TIME;

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "call_logs_select" ON public.call_logs;
CREATE POLICY "call_logs_select" ON public.call_logs
  FOR SELECT TO authenticated
  USING (
    public.is_admin_like()
    OR public.current_role() IN ('driver_manager', 'finance')
    OR (public.current_role() = 'sales_rep' AND rep_id = public.current_profile_id())
  );

DROP POLICY IF EXISTS "call_logs_insert" ON public.call_logs;
CREATE POLICY "call_logs_insert" ON public.call_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_like()
    OR (public.current_role() = 'sales_rep' AND rep_id = public.current_profile_id())
  );

-- ---------------------------------------------------------------------------
-- Atomic call logging: writes the call_logs row and advances the
-- customer's last_contact_date/next_call_date together, so a logged call
-- can never leave the customer's follow-up schedule out of sync (which is
-- exactly what the old mock UI risked — it updated local call-queue state
-- without touching any "customer" record at all).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_customer_call(
  p_customer_id UUID,
  p_outcome call_outcome_enum,
  p_notes TEXT DEFAULT NULL,
  p_next_call_date DATE DEFAULT NULL,
  p_next_call_time TIME DEFAULT NULL
)
RETURNS public.call_logs
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor UUID := public.current_profile_id();
  v_log public.call_logs;
BEGIN
  INSERT INTO public.call_logs (customer_id, rep_id, outcome, notes, next_call_date)
  VALUES (p_customer_id, v_actor, p_outcome, p_notes, p_next_call_date)
  RETURNING * INTO v_log;

  UPDATE public.customers SET
    last_contact_date = CURRENT_DATE,
    next_call_date = COALESCE(p_next_call_date, next_call_date),
    next_call_time = CASE WHEN p_next_call_date IS NOT NULL THEN p_next_call_time ELSE next_call_time END
  WHERE id = p_customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'customer not found or not authorized';
  END IF;

  RETURN v_log;
END;
$$;

REVOKE ALL ON FUNCTION public.log_customer_call FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_customer_call TO authenticated;

-- ---------------------------------------------------------------------------
-- /api/leads (Next.js) and the ingest-lead Edge Function both write new
-- customers with no authenticated staff session — they run under the
-- service role (gated by the webhook shared secret instead of RLS). No
-- policy change needed here since the service role bypasses RLS entirely;
-- this comment just documents why customers_insert (migration 006) never
-- needed an "anon" branch.
-- ---------------------------------------------------------------------------
