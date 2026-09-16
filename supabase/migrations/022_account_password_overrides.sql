-- Additive only: no backfill, deletion, or changes to existing RLS/policies.
-- setUserPassword() in lib/auth.ts previously wrote a changed password into an
-- in-memory Map (OVERRIDE_PASSWORDS) with no database write at all. That map
-- resets on every server restart / cold start / redeploy, so /api/auth/password
-- reported "password updated successfully" for a change that silently reverted
-- to the original .env password the next time the process restarted (or, on a
-- serverless deploy, possibly on the very next request landing on a different
-- instance). This table gives password overrides real, durable storage.
BEGIN;

CREATE TABLE IF NOT EXISTS public.account_password_overrides (
  username TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.account_password_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_password_overrides FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.account_password_overrides TO service_role;

CREATE FUNCTION public.business_password_override_get(p_username text) RETURNS text
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT password_hash FROM account_password_overrides WHERE username = lower(trim(p_username))
$$;

CREATE FUNCTION public.business_password_override_set(p_username text, p_hash text) RETURNS jsonb
LANGUAGE sql SET search_path = public AS $$
  INSERT INTO account_password_overrides(username, password_hash)
  VALUES(lower(trim(p_username)), p_hash)
  ON CONFLICT (username) DO UPDATE SET password_hash = excluded.password_hash, updated_at = now();
  SELECT jsonb_build_object('success', true);
$$;

REVOKE ALL ON FUNCTION public.business_password_override_get(text),
  public.business_password_override_set(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_password_override_get(text),
  public.business_password_override_set(text,text) TO service_role;

COMMIT;
