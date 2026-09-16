-- Additive only: no backfill, deletion, or changes to existing RLS/policies.
-- Real, durable per-user notifications (not an in-memory mock). Targeted by
-- username (the login-account identity from lib/auth.ts SYSTEM_ACCOUNTS),
-- since that's the only identity a viewer can actually authenticate as.
BEGIN;

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_username_created ON public.notifications(username, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_username_unread ON public.notifications(username) WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notifications FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.notifications TO service_role;

CREATE FUNCTION public.business_notification_create(p_username text, p_type text, p_title text, p_body text, p_link text) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE new_id uuid;
BEGIN
  IF coalesce(length(trim(p_username)),0)=0 OR coalesce(length(trim(p_title)),0)=0 THEN
    RAISE EXCEPTION 'INVALID_NOTIFICATION';
  END IF;
  INSERT INTO notifications(username,type,title,body,link)
  VALUES(lower(trim(p_username)),p_type,p_title,nullif(trim(p_body),''),nullif(trim(p_link),''))
  RETURNING id INTO new_id;
  RETURN jsonb_build_object('id',new_id);
END $$;

CREATE FUNCTION public.business_notifications_list(p_username text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT jsonb_build_object(
    'notifications', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', n.id, 'type', n.type, 'title', n.title, 'body', coalesce(n.body,''),
        'link', n.link, 'read', n.read_at IS NOT NULL, 'created_at', n.created_at
      ) ORDER BY n.created_at DESC)
      FROM (
        SELECT * FROM notifications WHERE username = lower(trim(p_username))
        ORDER BY created_at DESC LIMIT 30
      ) n
    ), '[]'::jsonb),
    'unread_count', (SELECT count(*)::int FROM notifications WHERE username = lower(trim(p_username)) AND read_at IS NULL)
  )
$$;

CREATE FUNCTION public.business_notification_mark_read(p_username text, p_id uuid) RETURNS jsonb
LANGUAGE sql SET search_path = public AS $$
  UPDATE notifications SET read_at = now()
  WHERE id = p_id AND username = lower(trim(p_username)) AND read_at IS NULL;
  SELECT jsonb_build_object('success', true);
$$;

CREATE FUNCTION public.business_notifications_mark_all_read(p_username text) RETURNS jsonb
LANGUAGE sql SET search_path = public AS $$
  UPDATE notifications SET read_at = now()
  WHERE username = lower(trim(p_username)) AND read_at IS NULL;
  SELECT jsonb_build_object('success', true);
$$;

REVOKE ALL ON FUNCTION public.business_notification_create(text,text,text,text,text),
  public.business_notifications_list(text), public.business_notification_mark_read(text,uuid),
  public.business_notifications_mark_all_read(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_notification_create(text,text,text,text,text),
  public.business_notifications_list(text), public.business_notification_mark_read(text,uuid),
  public.business_notifications_mark_all_read(text) TO service_role;

COMMIT;
