-- =============================================================================
-- Migration 005: Authentication & Security Foundation
--
-- Part of Phase 1 (security/foundation-hardening). This migration does NOT
-- touch business data (customers/orders/products/etc.) — it only:
--   1. Wires public.profiles to Supabase Auth (auth.users) so staff accounts
--      live in a real, hashed, salted credential store instead of source code.
--   2. Adds a login_attempts table backing server-side brute-force throttling.
--   3. Enables Row Level Security on every existing business table with a
--      conservative, least-privilege default (deny anon; authenticated users
--      may read their own profile only). The main app does not query
--      Supabase directly yet (see the Phase 1 audit), so these policies are
--      intentionally strict placeholders — they exist so that the anon key
--      already shipped to the browser cannot read or write anything, and
--      will be refined per-resource in the Phase 2 persistence work.
--
-- Known pre-existing issue (not fixed here, out of scope for this
-- migration): 004_driver_schema.sql seeds `profiles` with non-UUID string
-- literals for `id` (e.g. 'mgr-diya-01'), which cannot succeed against the
-- `id UUID PRIMARY KEY` column. Real profile rows are now created by the
-- handle_new_user() trigger below, driven by scripts/provision_users.mjs —
-- do not rely on migration 004's seed rows being present.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Auto-create/refresh a profiles row whenever a Supabase Auth user is
--    created or its app_metadata changes (role, rep_key, full_name are set
--    only by the service role in scripts/provision_users.mjs — never by the
--    user themselves, since app_metadata is not client-writable).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_auth_user_upsert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (auth_user_id, full_name_ar, full_name_en, email, role, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_app_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_app_meta_data->>'full_name',
    NEW.email,
    COALESCE((NEW.raw_app_meta_data->>'role')::user_role_enum, 'sales_rep'),
    true
  )
  ON CONFLICT (auth_user_id) DO UPDATE SET
    full_name_ar = EXCLUDED.full_name_ar,
    full_name_en = EXCLUDED.full_name_en,
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- profiles.auth_user_id must be unique for the ON CONFLICT above to work.
ALTER TABLE public.profiles ADD CONSTRAINT profiles_auth_user_id_key UNIQUE (auth_user_id);

-- Short human-readable key used by app code that keys off e.g. "rahma" /
-- "khalid" rather than a UUID (mirrors app_metadata.rep_key).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS rep_key TEXT UNIQUE;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_upsert();

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE OF raw_app_meta_data ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_upsert();

-- ---------------------------------------------------------------------------
-- 2. Login throttling storage (service-role only; see lib/rate-limit.ts).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.login_attempts (
  id BIGSERIAL PRIMARY KEY,
  attempt_key TEXT NOT NULL,       -- "id:<email>" or "ip:<address>"
  success BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_key_time
  ON public.login_attempts(attempt_key, created_at DESC);

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
-- No policies defined on purpose: with RLS enabled and zero policies, every
-- role except the service role (which bypasses RLS) is denied entirely.

-- ---------------------------------------------------------------------------
-- 3. Row Level Security — least privilege default across all business
--    tables. The service role (used server-side only, see
--    lib/supabase/admin.ts) bypasses RLS and is unaffected by these
--    policies. The anon key shipped to the browser gets no access at all
--    until a specific feature needs it, decided deliberately in Phase 2.
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid());

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_withdrawals ENABLE ROW LEVEL SECURITY;
-- No policies added for these tables yet: deliberately deny-all for anon
-- and authenticated until Phase 2 designs real per-role access rules
-- (e.g. a sales_rep may only read customers/orders assigned to them, a
-- driver may only read/update deliveries assigned to them). All current
-- application reads/writes to these tables happen server-side via the
-- service role (Supabase Edge Functions), which bypasses RLS.
