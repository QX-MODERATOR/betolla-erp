-- Additive only: one new table and its functions.
-- Phone push notifications: each signed-in Android app registers its Firebase Cloud Messaging
-- token for the account using it. The server sends every in-app notification to those devices
-- as well, and drops tokens Firebase reports as no longer valid.
BEGIN;

CREATE TABLE public.push_devices (
  token TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'android',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_push_devices_account ON public.push_devices(account_id);
ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_devices FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.push_devices TO service_role;

-- A device belongs to whoever signed in on it last (a shared phone moves to the new account).
CREATE FUNCTION public.business_push_register(p_token text, p_account text, p_platform text) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF coalesce(length(p_token),0) NOT BETWEEN 20 AND 4096 OR coalesce(length(trim(p_account)),0)=0 THEN
   RAISE EXCEPTION 'INVALID_DEVICE';
 END IF;
 INSERT INTO push_devices(token,account_id,platform) VALUES(p_token,p_account,coalesce(nullif(p_platform,''),'android'))
 ON CONFLICT (token) DO UPDATE SET account_id=excluded.account_id,platform=excluded.platform,last_seen_at=now();
 -- A device silent for 60 days is gone (Firebase rotates tokens of active apps well before that).
 DELETE FROM push_devices WHERE last_seen_at<now()-interval '60 days';
 RETURN jsonb_build_object('registered',true);
END $$;

-- Sign-out on a device: only that account's own registration of the token is removed.
CREATE FUNCTION public.business_push_unregister(p_token text, p_account text) RETURNS jsonb
LANGUAGE sql SET search_path = public AS $$
 WITH gone AS (DELETE FROM push_devices WHERE token=p_token AND account_id=p_account RETURNING 1)
 SELECT jsonb_build_object('removed',(SELECT count(*) FROM gone))
$$;

-- Password change: every device of the account stops receiving until it signs in again.
CREATE FUNCTION public.business_push_unregister_account(p_account text) RETURNS jsonb
LANGUAGE sql SET search_path = public AS $$
 WITH gone AS (DELETE FROM push_devices WHERE account_id=p_account RETURNING 1)
 SELECT jsonb_build_object('removed',(SELECT count(*) FROM gone))
$$;

CREATE FUNCTION public.business_push_tokens(p_accounts text[]) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('token',token,'account_id',account_id)),'[]'::jsonb)
 FROM push_devices WHERE account_id=ANY(p_accounts)
$$;

-- Tokens Firebase rejected as unregistered/invalid.
CREATE FUNCTION public.business_push_remove(p_tokens text[]) RETURNS jsonb
LANGUAGE sql SET search_path = public AS $$
 WITH gone AS (DELETE FROM push_devices WHERE token=ANY(p_tokens) RETURNING 1)
 SELECT jsonb_build_object('removed',(SELECT count(*) FROM gone))
$$;

REVOKE ALL ON FUNCTION public.business_push_register(text,text,text),public.business_push_unregister(text,text),
 public.business_push_unregister_account(text),public.business_push_tokens(text[]),public.business_push_remove(text[])
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_push_register(text,text,text),public.business_push_unregister(text,text),
 public.business_push_unregister_account(text),public.business_push_tokens(text[]),public.business_push_remove(text[])
 TO service_role;

COMMIT;
