-- Additive only: no backfill, deletion, or changes to existing RLS/policies.
-- Replaces the in-memory-only shift-closure map in lib/db.ts (module-level
-- object, lost on every server restart/redeploy and never shared across
-- instances) with real per-driver, per-day durable storage.
BEGIN;

CREATE TABLE IF NOT EXISTS public.driver_shift_closures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_name TEXT NOT NULL,
  shift_date DATE NOT NULL,
  is_closed BOOLEAN NOT NULL DEFAULT true,
  closed_at TIMESTAMPTZ,
  notes TEXT,
  cash_collected NUMERIC(10,3) NOT NULL DEFAULT 0,
  delivered_count INT NOT NULL DEFAULT 0,
  returned_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(driver_name, shift_date)
);

CREATE INDEX IF NOT EXISTS idx_driver_shift_closures_lookup ON public.driver_shift_closures(driver_name, shift_date);

DROP TRIGGER IF EXISTS trg_driver_shift_closures_updated_at ON public.driver_shift_closures;
CREATE TRIGGER trg_driver_shift_closures_updated_at
BEFORE UPDATE ON public.driver_shift_closures
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
