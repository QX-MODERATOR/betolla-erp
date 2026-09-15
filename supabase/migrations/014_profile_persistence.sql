-- Additive only: no backfill, deletion, or changes to existing RLS/policies.
-- Replaces lib/profile-store.ts's `global.__betolla_profiles__` in-memory
-- object (a Node global: lost on every restart/redeploy, never shared across
-- server instances) with real per-username overrides. app/api/profile did not
-- exist before this — profile-context.tsx's fetch("/api/profile") always
-- 404'd, so every profile edit only ever reached localStorage.
BEGIN;

CREATE TABLE IF NOT EXISTS public.user_profile_overrides (
  username TEXT PRIMARY KEY,
  name TEXT,
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  city TEXT,
  bio TEXT,
  avatar TEXT,
  avatar_color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_user_profile_overrides_updated_at ON public.user_profile_overrides;
CREATE TRIGGER trg_user_profile_overrides_updated_at
BEFORE UPDATE ON public.user_profile_overrides
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
