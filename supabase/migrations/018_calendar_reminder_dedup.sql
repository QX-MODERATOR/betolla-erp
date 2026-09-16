-- Additive only: no backfill, deletion, or changes to existing RLS/policies.
-- calendar-reminder is deployed with --no-verify-jwt (intentionally public,
-- so an external cron trigger needs no Supabase auth) — which also means
-- anyone who calls the URL, or a misconfigured cron firing twice, would spam
-- the same Telegram chat with duplicate "due today" messages. This table
-- makes "already notified today" a real, atomic check instead of relying on
-- the caller only ever firing once.
BEGIN;

CREATE TABLE IF NOT EXISTS public.calendar_reminder_log (
  reminder_date DATE PRIMARY KEY,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_count INT NOT NULL
);

ALTER TABLE public.calendar_reminder_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.calendar_reminder_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.calendar_reminder_log TO service_role;

COMMIT;
