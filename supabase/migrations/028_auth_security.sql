-- Additive only: new tables/functions, no changes to existing data or policies.
-- Sign-in hardening (QA audit group 4):
--   * password changes are stored (scrypt hash, never plain text) instead of in one server's memory;
--   * sessions can be ended: a single token on logout, all of an account's tokens on password change;
--   * repeated failed logins lock the account for a while, and lead intake is rate limited.
-- The app works unchanged if this migration is missing (these checks are skipped), so it can be
-- applied before or after the deploy.
BEGIN;

CREATE TABLE public.auth_account_state (
  account_id TEXT PRIMARY KEY,
  password_hash TEXT,
  password_changed_at TIMESTAMPTZ,
  sessions_valid_after TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.auth_revoked_tokens (
  jti TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_auth_revoked_tokens_expires ON public.auth_revoked_tokens(expires_at);

-- Fixed-window counters: failed logins per account, lead submissions per client/globally.
CREATE TABLE public.security_rate_limits (
  bucket TEXT PRIMARY KEY,
  hits INT NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.auth_account_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_revoked_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_account_state, public.auth_revoked_tokens, public.security_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.auth_account_state, public.auth_revoked_tokens, public.security_rate_limits TO service_role;

CREATE FUNCTION public.auth_account_get(p_account_id text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce((SELECT jsonb_build_object('password_hash',password_hash,'password_changed_at',password_changed_at,
   'sessions_valid_after',sessions_valid_after) FROM auth_account_state WHERE account_id=p_account_id),
   jsonb_build_object('password_hash',NULL,'password_changed_at',NULL,'sessions_valid_after',NULL))
$$;

-- Stores a new password hash and ends every session issued before now. The app then issues a fresh
-- session to the device that made the change.
CREATE FUNCTION public.auth_password_set(p_account_id text, p_hash text) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF coalesce(length(trim(p_account_id)),0)=0 OR p_hash IS NULL OR p_hash NOT LIKE 'scrypt$%' THEN
   RAISE EXCEPTION 'INVALID_PASSWORD';
 END IF;
 INSERT INTO auth_account_state(account_id,password_hash,password_changed_at,sessions_valid_after,updated_at)
 VALUES(p_account_id,p_hash,now(),now(),now())
 ON CONFLICT (account_id) DO UPDATE SET password_hash=excluded.password_hash,password_changed_at=now(),
   sessions_valid_after=now(),updated_at=now();
 RETURN jsonb_build_object('changed_at',now());
END $$;

-- Ends every session of an account (e.g. an admin forcing sign-out).
CREATE FUNCTION public.auth_sessions_revoke_all(p_account_id text) RETURNS jsonb
LANGUAGE sql SET search_path = public AS $$
 INSERT INTO auth_account_state(account_id,sessions_valid_after,updated_at) VALUES(p_account_id,now(),now())
 ON CONFLICT (account_id) DO UPDATE SET sessions_valid_after=now(),updated_at=now()
 RETURNING jsonb_build_object('revoked_after',sessions_valid_after)
$$;

CREATE FUNCTION public.auth_token_revoke(p_jti text, p_account_id text, p_expires timestamptz) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF coalesce(length(p_jti),0)=0 THEN RETURN jsonb_build_object('revoked',false); END IF;
 DELETE FROM auth_revoked_tokens WHERE expires_at<now();
 INSERT INTO auth_revoked_tokens(jti,account_id,expires_at) VALUES(p_jti,p_account_id,coalesce(p_expires,now()+interval '7 days'))
 ON CONFLICT (jti) DO NOTHING;
 RETURN jsonb_build_object('revoked',true);
END $$;

-- Is this token still a live session? (Not revoked, and issued after the account's last reset.)
-- p_iat is the token's issued-at time in epoch seconds.
CREATE FUNCTION public.auth_session_check(p_account_id text, p_jti text, p_iat bigint) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT NOT EXISTS(SELECT 1 FROM auth_revoked_tokens WHERE jti=p_jti)
   AND NOT EXISTS(SELECT 1 FROM auth_account_state WHERE account_id=p_account_id
     AND sessions_valid_after IS NOT NULL AND to_timestamp(p_iat) < date_trunc('second',sessions_valid_after))
$$;

-- Read-only: seconds until the bucket unlocks (0 = not locked).
CREATE FUNCTION public.security_lock_remaining(p_bucket text) RETURNS int
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce((SELECT greatest(0,ceil(extract(epoch FROM locked_until-now())))::int
   FROM security_rate_limits WHERE bucket=p_bucket AND locked_until>now()),0)
$$;

-- Counts one event in the bucket's window. Once p_limit events happen inside p_window_seconds the
-- bucket is locked for p_lock_seconds. Returns {allowed, hits, retry_after, just_locked}.
CREATE FUNCTION public.security_rate_hit(p_bucket text, p_limit int, p_window_seconds int, p_lock_seconds int) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r security_rate_limits; just_locked boolean := false;
BEGIN
 IF coalesce(length(p_bucket),0)=0 OR p_limit<1 OR p_window_seconds<1 OR p_lock_seconds<0 THEN RAISE EXCEPTION 'INVALID_LIMIT'; END IF;
 INSERT INTO security_rate_limits(bucket) VALUES(p_bucket) ON CONFLICT (bucket) DO NOTHING;
 SELECT * INTO r FROM security_rate_limits WHERE bucket=p_bucket FOR UPDATE;
 IF r.locked_until IS NOT NULL AND r.locked_until>now() THEN
   RETURN jsonb_build_object('allowed',false,'hits',r.hits,'just_locked',false,
     'retry_after',ceil(extract(epoch FROM r.locked_until-now()))::int);
 END IF;
 IF r.window_start < now()-make_interval(secs=>p_window_seconds) OR r.locked_until IS NOT NULL THEN
   r.hits := 0; r.window_start := now(); r.locked_until := NULL;
 END IF;
 r.hits := r.hits+1;
 IF r.hits>=p_limit AND p_lock_seconds>0 THEN
   r.locked_until := now()+make_interval(secs=>p_lock_seconds); just_locked := true;
 END IF;
 UPDATE security_rate_limits SET hits=r.hits,window_start=r.window_start,locked_until=r.locked_until,updated_at=now()
 WHERE bucket=p_bucket;
 RETURN jsonb_build_object('allowed',r.hits<=p_limit,'hits',r.hits,'just_locked',just_locked,
   'retry_after',CASE WHEN r.locked_until IS NULL THEN 0 ELSE p_lock_seconds END);
END $$;

CREATE FUNCTION public.security_rate_clear(p_bucket text) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 DELETE FROM security_rate_limits WHERE bucket=p_bucket;
 -- Housekeeping: drop idle counters.
 DELETE FROM security_rate_limits WHERE updated_at<now()-interval '2 days' AND (locked_until IS NULL OR locked_until<now());
 RETURN jsonb_build_object('cleared',true);
END $$;

REVOKE ALL ON FUNCTION public.auth_account_get(text),public.auth_password_set(text,text),
 public.auth_sessions_revoke_all(text),public.auth_token_revoke(text,text,timestamptz),public.auth_session_check(text,text,bigint),
 public.security_lock_remaining(text),public.security_rate_hit(text,int,int,int),public.security_rate_clear(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.auth_account_get(text),public.auth_password_set(text,text),
 public.auth_sessions_revoke_all(text),public.auth_token_revoke(text,text,timestamptz),public.auth_session_check(text,text,bigint),
 public.security_lock_remaining(text),public.security_rate_hit(text,int,int,int),public.security_rate_clear(text)
 TO service_role;

COMMIT;
