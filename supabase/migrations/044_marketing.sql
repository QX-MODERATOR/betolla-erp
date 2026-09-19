-- Marketing department: campaigns, what they cost, and what they brought in.
--
--   mkt_campaigns     one campaign per row: channel, dates, budget, targets, optional promo code
--   mkt_spend         what was actually paid, dated. Additive: a wrong entry is voided with a
--                     reason, never edited or deleted, so the spend total is always explainable.
--   mkt_attributions  which campaign brought a lead in. One campaign per customer (last touch):
--                     re-attributing moves the lead and is written to the audit log.
--   mkt_tasks         the team's work, assigned by the manager/coordinator, with
--   mkt_task_updates  every status change and comment, in order — the thread the team syncs on.
--
-- Results are counted, never typed in. A campaign's revenue is the orders placed by its attributed
-- customers on or after the campaign's start date, excluding cancelled and returned ones. That is
-- why attribution sits in its own table: business_create_order is not touched, so this migration
-- cannot fall into the 034-039 replacement trap, and it can go on in any order after 043.
--
-- Same shape as the HR migrations (022-025): service_role only, every write idempotent through
-- business_requests via business_hr_replay (022), named exceptions mapped in lib/business-server.ts.
-- Needs 023 (business_hr_today / business_hr_tz) and 038 (promo_codes).
BEGIN;

CREATE TABLE IF NOT EXISTS public.mkt_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Short and typeable: it is what a landing page or n8n sends to /api/leads as ?campaign=.
  code TEXT NOT NULL CHECK (code ~ '^[A-Za-z0-9_-]{2,24}$'),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 200),
  channel TEXT NOT NULL CHECK (channel IN ('facebook','instagram','tiktok','snapchat','google','whatsapp','influencer','offline','other')),
  objective TEXT NOT NULL DEFAULT 'leads' CHECK (objective IN ('awareness','leads','sales','retention')),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','paused','completed','cancelled')),
  start_date DATE NOT NULL,
  end_date DATE,
  budget NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (budget >= 0),
  target_leads INT CHECK (target_leads IS NULL OR target_leads >= 0),
  target_revenue NUMERIC(12,3) CHECK (target_revenue IS NULL OR target_revenue >= 0),
  owner_account_id TEXT,
  promo_code TEXT REFERENCES public.promo_codes(code) ON DELETE SET NULL,
  audience TEXT,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mkt_campaigns_code ON public.mkt_campaigns(lower(code));

CREATE TABLE IF NOT EXISTS public.mkt_spend (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.mkt_campaigns(id) ON DELETE RESTRICT,
  spend_date DATE NOT NULL,
  amount NUMERIC(12,3) NOT NULL CHECK (amount > 0),
  description TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  voided_at TIMESTAMPTZ,
  voided_by TEXT,
  void_reason TEXT,
  CHECK ((voided_at IS NULL) = (voided_by IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_mkt_spend_campaign ON public.mkt_spend(campaign_id, spend_date DESC);

CREATE TABLE IF NOT EXISTS public.mkt_attributions (
  customer_id UUID PRIMARY KEY REFERENCES public.customers(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.mkt_campaigns(id) ON DELETE RESTRICT,
  attributed_by TEXT NOT NULL,
  attributed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mkt_attributions_campaign ON public.mkt_attributions(campaign_id);

CREATE TABLE IF NOT EXISTS public.mkt_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 200),
  description TEXT,
  campaign_id UUID REFERENCES public.mkt_campaigns(id) ON DELETE SET NULL,
  assignee_account_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  due_date DATE,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','review','done','cancelled')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mkt_tasks_assignee ON public.mkt_tasks(assignee_account_id, status);

CREATE TABLE IF NOT EXISTS public.mkt_task_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.mkt_tasks(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('created','edited','status','comment')),
  status_from TEXT,
  status_to TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_mkt_task_updates_task ON public.mkt_task_updates(task_id, created_at);

CREATE TABLE IF NOT EXISTS public.mkt_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  changes JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mkt_audit_entity ON public.mkt_audit_log(entity_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_mkt_campaigns_updated_at ON public.mkt_campaigns;
CREATE TRIGGER trg_mkt_campaigns_updated_at BEFORE UPDATE ON public.mkt_campaigns
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_mkt_tasks_updated_at ON public.mkt_tasks;
CREATE TRIGGER trg_mkt_tasks_updated_at BEFORE UPDATE ON public.mkt_tasks
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.mkt_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_spend ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_task_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mkt_campaigns, public.mkt_spend, public.mkt_attributions, public.mkt_tasks,
  public.mkt_task_updates, public.mkt_audit_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.mkt_campaigns, public.mkt_spend, public.mkt_attributions, public.mkt_tasks,
  public.mkt_task_updates, public.mkt_audit_log TO service_role;

-- Local calendar date of a timestamp (Amman), the same day boundary HR and the order list use.
CREATE FUNCTION public.business_mkt_day(p_at timestamptz) RETURNS date
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT (p_at AT TIME ZONE business_hr_tz())::date
$$;

-- A campaign with its results. Every number is derived here from spend, attributions and orders.
CREATE FUNCTION public.business_mkt_campaign_document(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 WITH c AS (SELECT * FROM mkt_campaigns WHERE id=p_id),
 today AS (SELECT business_hr_today() AS d),
 spend AS (
   SELECT coalesce(sum(s.amount),0) AS total,
     coalesce(sum(s.amount) FILTER (WHERE date_trunc('month',s.spend_date)=date_trunc('month',(SELECT d FROM today))),0) AS month
   FROM mkt_spend s WHERE s.campaign_id=p_id AND s.voided_at IS NULL),
 leads AS (
   SELECT count(*)::int AS total,
     count(*) FILTER (WHERE date_trunc('month',business_mkt_day(a.attributed_at))=date_trunc('month',(SELECT d FROM today)))::int AS month,
     -- A lead that did not exist before the campaign started: the campaign found them.
     count(*) FILTER (WHERE business_mkt_day(cu.created_at)>=(SELECT start_date FROM c))::int AS new_total
   FROM mkt_attributions a JOIN customers cu ON cu.id=a.customer_id WHERE a.campaign_id=p_id),
 counted AS (
   SELECT o.customer_id, o.status::text AS status, o.total_amount
   FROM orders o JOIN mkt_attributions a ON a.customer_id=o.customer_id AND a.campaign_id=p_id
   WHERE business_mkt_day(o.created_at)>=(SELECT start_date FROM c) AND o.status::text NOT IN ('cancelled','returned')),
 results AS (
   SELECT count(*)::int AS orders, count(DISTINCT customer_id)::int AS converted,
     coalesce(sum(total_amount),0) AS revenue,
     coalesce(sum(total_amount) FILTER (WHERE status='delivered'),0) AS delivered_revenue
   FROM counted),
 promo AS (
   SELECT count(r.*)::int AS n, coalesce(sum(r.amount_saved),0) AS saved
   FROM c LEFT JOIN promo_redemptions r ON r.code=c.promo_code
     AND business_mkt_day(r.redeemed_at)>=c.start_date
     AND (c.end_date IS NULL OR business_mkt_day(r.redeemed_at)<=c.end_date))
 SELECT jsonb_build_object(
   'id',c.id,'code',c.code,'name',c.name,'channel',c.channel,'objective',c.objective,'status',c.status,
   'start_date',c.start_date,'end_date',c.end_date,'budget',c.budget,
   'target_leads',c.target_leads,'target_revenue',c.target_revenue,
   'owner_account_id',c.owner_account_id,'promo_code',c.promo_code,
   'audience',coalesce(c.audience,''),'notes',coalesce(c.notes,''),
   'created_by',c.created_by,'created_at',c.created_at,'updated_at',c.updated_at,
   'spend',spend.total,'spend_this_month',spend.month,
   'leads',leads.total,'leads_this_month',leads.month,'new_leads',leads.new_total,
   'converted',results.converted,'orders',results.orders,
   'revenue',results.revenue,'delivered_revenue',results.delivered_revenue,
   'promo_redemptions',promo.n,'promo_saved',promo.saved,
   'cost_per_lead',CASE WHEN leads.total>0 THEN round(spend.total/leads.total,3) END,
   'cost_per_customer',CASE WHEN results.converted>0 THEN round(spend.total/results.converted,3) END,
   'conversion_rate',CASE WHEN leads.total>0 THEN round(100.0*results.converted/leads.total,1) END,
   'roas',CASE WHEN spend.total>0 THEN round(results.revenue/spend.total,2) END,
   'budget_used',CASE WHEN c.budget>0 THEN round(100.0*spend.total/c.budget,1) END
 )
 FROM c, spend, leads, results, promo
$$;

CREATE FUNCTION public.business_mkt_campaigns() RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(business_mkt_campaign_document(id) ORDER BY
   (status IN ('completed','cancelled')), start_date DESC, name),'[]'::jsonb) FROM mkt_campaigns
$$;

CREATE FUNCTION public.business_mkt_campaign_save(p_actor text, p_key uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE replay uuid; cid uuid; old_row mkt_campaigns; f jsonb := p_data->'fields';
BEGIN
 replay := business_hr_replay('mkt_campaign',p_actor,p_key,p_data);
 IF replay IS NOT NULL THEN RETURN jsonb_build_object('campaign',business_mkt_campaign_document(replay),'replayed',true); END IF;
 IF f IS NULL OR jsonb_typeof(f)<>'object' THEN RAISE EXCEPTION 'INVALID_CAMPAIGN'; END IF;
 IF coalesce(f->>'promo_code','')<>'' AND NOT EXISTS(SELECT 1 FROM promo_codes WHERE code=f->>'promo_code') THEN
   RAISE EXCEPTION 'PROMO_NOT_FOUND'; END IF;
 IF coalesce(f->>'code','')<>'' AND EXISTS(SELECT 1 FROM mkt_campaigns WHERE lower(code)=lower(f->>'code')
    AND id IS DISTINCT FROM nullif(p_data->>'id','')::uuid) THEN RAISE EXCEPTION 'DUPLICATE_CAMPAIGN_CODE'; END IF;
 BEGIN
   IF coalesce(p_data->>'id','')='' THEN
     INSERT INTO mkt_campaigns(code,name,channel,objective,status,start_date,end_date,budget,target_leads,target_revenue,
       owner_account_id,promo_code,audience,notes,created_by)
     VALUES(f->>'code',trim(f->>'name'),f->>'channel',coalesce(nullif(f->>'objective',''),'leads'),
       coalesce(nullif(f->>'status',''),'planned'),(f->>'start_date')::date,nullif(f->>'end_date','')::date,
       coalesce(nullif(f->>'budget','')::numeric,0),nullif(f->>'target_leads','')::int,nullif(f->>'target_revenue','')::numeric,
       nullif(f->>'owner_account_id',''),nullif(f->>'promo_code',''),nullif(f->>'audience',''),nullif(f->>'notes',''),p_actor)
     RETURNING id INTO cid;
     INSERT INTO mkt_audit_log(actor_id,action,entity,entity_id,changes) VALUES(p_actor,'campaign_create','campaign',cid,f);
   ELSE
     SELECT * INTO old_row FROM mkt_campaigns WHERE id=(p_data->>'id')::uuid FOR UPDATE;
     IF NOT FOUND THEN RAISE EXCEPTION 'CAMPAIGN_NOT_FOUND'; END IF;
     UPDATE mkt_campaigns SET
       code=CASE WHEN f ? 'code' THEN f->>'code' ELSE code END,
       name=CASE WHEN f ? 'name' THEN trim(f->>'name') ELSE name END,
       channel=CASE WHEN f ? 'channel' THEN f->>'channel' ELSE channel END,
       objective=CASE WHEN f ? 'objective' THEN f->>'objective' ELSE objective END,
       status=CASE WHEN f ? 'status' THEN f->>'status' ELSE status END,
       start_date=CASE WHEN f ? 'start_date' THEN (f->>'start_date')::date ELSE start_date END,
       end_date=CASE WHEN f ? 'end_date' THEN nullif(f->>'end_date','')::date ELSE end_date END,
       budget=CASE WHEN f ? 'budget' THEN coalesce(nullif(f->>'budget','')::numeric,0) ELSE budget END,
       target_leads=CASE WHEN f ? 'target_leads' THEN nullif(f->>'target_leads','')::int ELSE target_leads END,
       target_revenue=CASE WHEN f ? 'target_revenue' THEN nullif(f->>'target_revenue','')::numeric ELSE target_revenue END,
       owner_account_id=CASE WHEN f ? 'owner_account_id' THEN nullif(f->>'owner_account_id','') ELSE owner_account_id END,
       promo_code=CASE WHEN f ? 'promo_code' THEN nullif(f->>'promo_code','') ELSE promo_code END,
       audience=CASE WHEN f ? 'audience' THEN nullif(f->>'audience','') ELSE audience END,
       notes=CASE WHEN f ? 'notes' THEN nullif(f->>'notes','') ELSE notes END
     WHERE id=old_row.id RETURNING id INTO cid;
     INSERT INTO mkt_audit_log(actor_id,action,entity,entity_id,changes)
     VALUES(p_actor,'campaign_update','campaign',cid,jsonb_build_object('before',to_jsonb(old_row)-'created_at'-'updated_at','fields',f));
   END IF;
 EXCEPTION
   WHEN check_violation OR not_null_violation OR invalid_text_representation OR invalid_datetime_format
     OR datetime_field_overflow OR numeric_value_out_of_range THEN RAISE EXCEPTION 'INVALID_CAMPAIGN';
   WHEN unique_violation THEN RAISE EXCEPTION 'DUPLICATE_CAMPAIGN_CODE';
 END;
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('mkt_campaign',p_actor,p_key,p_data,cid);
 RETURN jsonb_build_object('campaign',business_mkt_campaign_document(cid),'replayed',false);
END $$;

-- The spend ledger of one campaign, newest first, voided entries included (and marked).
CREATE FUNCTION public.business_mkt_spend(p_campaign uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'campaign_id',s.campaign_id,'spend_date',s.spend_date,
   'amount',s.amount,'description',coalesce(s.description,''),'created_by',s.created_by,'created_at',s.created_at,
   'voided_at',s.voided_at,'voided_by',s.voided_by,'void_reason',coalesce(s.void_reason,''))
   ORDER BY s.spend_date DESC,s.created_at DESC),'[]'::jsonb)
 FROM mkt_spend s WHERE s.campaign_id=p_campaign
$$;

CREATE FUNCTION public.business_mkt_spend_record(p_actor text, p_key uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE replay uuid; sid uuid; camp mkt_campaigns;
BEGIN
 replay := business_hr_replay('mkt_spend',p_actor,p_key,p_data);
 IF replay IS NOT NULL THEN RETURN jsonb_build_object('id',replay,'replayed',true); END IF;
 SELECT * INTO camp FROM mkt_campaigns WHERE id=(p_data->>'campaign_id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CAMPAIGN_NOT_FOUND'; END IF;
 BEGIN
   INSERT INTO mkt_spend(campaign_id,spend_date,amount,description,created_by)
   VALUES(camp.id,(p_data->>'spend_date')::date,(p_data->>'amount')::numeric,nullif(trim(coalesce(p_data->>'description','')),''),p_actor)
   RETURNING id INTO sid;
 EXCEPTION WHEN check_violation OR not_null_violation OR invalid_text_representation OR invalid_datetime_format
   OR datetime_field_overflow OR numeric_value_out_of_range THEN RAISE EXCEPTION 'INVALID_SPEND';
 END;
 INSERT INTO mkt_audit_log(actor_id,action,entity,entity_id,changes)
 VALUES(p_actor,'spend_record','campaign',camp.id,p_data || jsonb_build_object('spend_id',sid));
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('mkt_spend',p_actor,p_key,p_data,sid);
 RETURN jsonb_build_object('id',sid,'replayed',false);
END $$;

CREATE FUNCTION public.business_mkt_spend_void(p_actor text, p_key uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE replay uuid; row_ mkt_spend;
BEGIN
 replay := business_hr_replay('mkt_spend_void',p_actor,p_key,p_data);
 IF replay IS NOT NULL THEN RETURN jsonb_build_object('id',replay,'replayed',true); END IF;
 IF length(trim(coalesce(p_data->>'reason','')))<3 THEN RAISE EXCEPTION 'VOID_REASON_REQUIRED'; END IF;
 SELECT * INTO row_ FROM mkt_spend WHERE id=(p_data->>'id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SPEND_NOT_FOUND'; END IF;
 IF row_.voided_at IS NOT NULL THEN RAISE EXCEPTION 'SPEND_ALREADY_VOIDED'; END IF;
 UPDATE mkt_spend SET voided_at=now(),voided_by=p_actor,void_reason=trim(p_data->>'reason') WHERE id=row_.id;
 INSERT INTO mkt_audit_log(actor_id,action,entity,entity_id,changes)
 VALUES(p_actor,'spend_void','campaign',row_.campaign_id,jsonb_build_object('spend_id',row_.id,'amount',row_.amount,'reason',trim(p_data->>'reason')));
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('mkt_spend_void',p_actor,p_key,p_data,row_.id);
 RETURN jsonb_build_object('id',row_.id,'replayed',false);
END $$;

-- Tie leads to a campaign, or take them off it.
--   campaign_id | campaign_code   which campaign (the webhook knows only the code)
--   customer_ids                   the leads
--   mode          'set'            attribute (moving a lead from another campaign — last touch)
--                 'first'          attribute only leads with no campaign yet (the lead webhook)
--                 'clear'          remove these leads from this campaign
--   scope_rep                      set for a rep: every lead must be hers (FORBIDDEN otherwise)
CREATE FUNCTION public.business_mkt_attribute(p_actor text, p_key uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE replay uuid; camp mkt_campaigns; v_mode text := coalesce(nullif(p_data->>'mode',''),'set');
  cust_id uuid; cust customers; prev uuid; changed int := 0; skipped int := 0;
BEGIN
 replay := business_hr_replay('mkt_attribute',p_actor,p_key,p_data);
 IF replay IS NOT NULL THEN RETURN jsonb_build_object('campaign_id',replay,'replayed',true); END IF;
 IF v_mode NOT IN ('set','first','clear') THEN RAISE EXCEPTION 'INVALID_ACTION'; END IF;
 IF coalesce(p_data->>'campaign_id','')<>'' THEN
   SELECT * INTO camp FROM mkt_campaigns WHERE id=(p_data->>'campaign_id')::uuid;
 ELSE
   SELECT * INTO camp FROM mkt_campaigns WHERE lower(code)=lower(coalesce(p_data->>'campaign_code',''));
 END IF;
 IF camp.id IS NULL THEN RAISE EXCEPTION 'CAMPAIGN_NOT_FOUND'; END IF;
 IF v_mode<>'clear' AND camp.status='cancelled' THEN RAISE EXCEPTION 'CAMPAIGN_CLOSED'; END IF;
 IF jsonb_typeof(p_data->'customer_ids')<>'array' OR jsonb_array_length(p_data->'customer_ids') NOT BETWEEN 1 AND 500 THEN
   RAISE EXCEPTION 'INVALID_ATTRIBUTION'; END IF;
 FOR cust_id IN SELECT DISTINCT value::uuid FROM jsonb_array_elements_text(p_data->'customer_ids') LOOP
   SELECT * INTO cust FROM customers WHERE id=cust_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
   IF coalesce(p_data->>'scope_rep','')<>'' AND cust.rep_name_raw IS DISTINCT FROM p_data->>'scope_rep' THEN
     RAISE EXCEPTION 'MKT_FORBIDDEN'; END IF;
   SELECT campaign_id INTO prev FROM mkt_attributions WHERE customer_id=cust_id FOR UPDATE;
   IF v_mode='clear' THEN
     IF prev IS DISTINCT FROM camp.id THEN skipped := skipped+1; CONTINUE; END IF;
     DELETE FROM mkt_attributions WHERE customer_id=cust_id;
   ELSIF prev=camp.id OR (v_mode='first' AND prev IS NOT NULL) THEN
     skipped := skipped+1; CONTINUE;
   ELSE
     INSERT INTO mkt_attributions(customer_id,campaign_id,attributed_by) VALUES(cust_id,camp.id,p_actor)
     ON CONFLICT (customer_id) DO UPDATE SET campaign_id=EXCLUDED.campaign_id,attributed_by=EXCLUDED.attributed_by,attributed_at=now();
   END IF;
   changed := changed+1;
   INSERT INTO mkt_audit_log(actor_id,action,entity,entity_id,changes)
   VALUES(p_actor,CASE WHEN v_mode='clear' THEN 'attribution_clear' ELSE 'attribution_set' END,'customer',cust_id,
     jsonb_build_object('from',prev,'to',CASE WHEN v_mode='clear' THEN NULL ELSE camp.id END));
 END LOOP;
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('mkt_attribute',p_actor,p_key,p_data,camp.id);
 RETURN jsonb_build_object('campaign_id',camp.id,'changed',changed,'skipped',skipped,'replayed',false);
END $$;

-- The leads a campaign brought in, with what each has ordered since the campaign started.
CREATE FUNCTION public.business_mkt_campaign_leads(p_campaign uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('customer_id',cu.id,'name',coalesce(cu.name,''),'phone',cu.phone,
   'city',coalesce(cu.city,''),'rep_name',coalesce(cu.rep_name_raw,''),'lead_source',cu.lead_source,
   'customer_created_at',cu.created_at,'attributed_by',a.attributed_by,'attributed_at',a.attributed_at,
   'orders',o.n,'revenue',o.revenue) ORDER BY a.attributed_at DESC),'[]'::jsonb)
 FROM mkt_attributions a
 JOIN mkt_campaigns c ON c.id=a.campaign_id
 JOIN customers cu ON cu.id=a.customer_id
 LEFT JOIN LATERAL (
   SELECT count(*)::int n, coalesce(sum(total_amount),0) revenue FROM orders
   WHERE customer_id=cu.id AND business_mkt_day(created_at)>=c.start_date AND status::text NOT IN ('cancelled','returned')
 ) o ON true
 WHERE a.campaign_id=p_campaign
$$;

-- Which campaign (if any) each of these customers is attributed to — for tagging leads in lists.
CREATE FUNCTION public.business_mkt_attributions_of(p_customer_ids uuid[]) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_object_agg(a.customer_id::text,jsonb_build_object('campaign_id',c.id,'code',c.code,'name',c.name)),'{}'::jsonb)
 FROM mkt_attributions a JOIN mkt_campaigns c ON c.id=a.campaign_id WHERE a.customer_id=ANY(p_customer_ids)
$$;

CREATE FUNCTION public.business_mkt_task_document(p_id uuid, p_thread boolean) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT jsonb_build_object('id',t.id,'title',t.title,'description',coalesce(t.description,''),
   'campaign_id',t.campaign_id,'campaign_name',coalesce(c.name,''),
   'assignee_account_id',t.assignee_account_id,'created_by',t.created_by,'due_date',t.due_date,
   'priority',t.priority,'status',t.status,'completed_at',t.completed_at,
   'created_at',t.created_at,'updated_at',t.updated_at,
   'comments',(SELECT count(*)::int FROM mkt_task_updates u WHERE u.task_id=t.id AND u.kind='comment'),
   'last_activity',(SELECT max(u.created_at) FROM mkt_task_updates u WHERE u.task_id=t.id))
 || CASE WHEN p_thread THEN jsonb_build_object('thread',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,
      'actor_id',u.actor_id,'kind',u.kind,'status_from',u.status_from,'status_to',u.status_to,'note',coalesce(u.note,''),
      'created_at',u.created_at) ORDER BY u.created_at,u.id),'[]'::jsonb) FROM mkt_task_updates u WHERE u.task_id=t.id))
    ELSE '{}'::jsonb END
 FROM mkt_tasks t LEFT JOIN mkt_campaigns c ON c.id=t.campaign_id WHERE t.id=p_id
$$;

-- p_account NULL -> every task (manager/coordinator); otherwise that person's: assigned or raised by them.
CREATE FUNCTION public.business_mkt_tasks(p_account text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(business_mkt_task_document(id,false) ORDER BY
   (status IN ('done','cancelled')), due_date NULLS LAST, created_at DESC),'[]'::jsonb)
 FROM mkt_tasks WHERE p_account IS NULL OR assignee_account_id=p_account OR created_by=p_account
$$;

-- Create or edit a task. scope_account is set for a team member (not a manager): she may only raise
-- tasks for herself and edit tasks that are hers.
CREATE FUNCTION public.business_mkt_task_save(p_actor text, p_key uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE replay uuid; tid uuid; old_row mkt_tasks; f jsonb := p_data->'fields'; scope text := nullif(p_data->>'scope_account','');
BEGIN
 replay := business_hr_replay('mkt_task',p_actor,p_key,p_data);
 IF replay IS NOT NULL THEN RETURN jsonb_build_object('task',business_mkt_task_document(replay,true),'replayed',true); END IF;
 IF f IS NULL OR jsonb_typeof(f)<>'object' THEN RAISE EXCEPTION 'INVALID_TASK'; END IF;
 IF coalesce(f->>'campaign_id','')<>'' AND NOT EXISTS(SELECT 1 FROM mkt_campaigns WHERE id=(f->>'campaign_id')::uuid) THEN
   RAISE EXCEPTION 'CAMPAIGN_NOT_FOUND'; END IF;
 IF scope IS NOT NULL AND f ? 'assignee_account_id' AND f->>'assignee_account_id'<>scope THEN RAISE EXCEPTION 'MKT_FORBIDDEN'; END IF;
 BEGIN
   IF coalesce(p_data->>'id','')='' THEN
     INSERT INTO mkt_tasks(title,description,campaign_id,assignee_account_id,created_by,due_date,priority)
     VALUES(trim(f->>'title'),nullif(trim(coalesce(f->>'description','')),''),nullif(f->>'campaign_id','')::uuid,
       coalesce(scope,f->>'assignee_account_id'),p_actor,nullif(f->>'due_date','')::date,coalesce(nullif(f->>'priority',''),'normal'))
     RETURNING id INTO tid;
     INSERT INTO mkt_task_updates(task_id,actor_id,kind,status_to) VALUES(tid,p_actor,'created','todo');
   ELSE
     SELECT * INTO old_row FROM mkt_tasks WHERE id=(p_data->>'id')::uuid FOR UPDATE;
     IF NOT FOUND THEN RAISE EXCEPTION 'TASK_NOT_FOUND'; END IF;
     IF scope IS NOT NULL AND old_row.assignee_account_id<>scope AND old_row.created_by<>scope THEN RAISE EXCEPTION 'MKT_FORBIDDEN'; END IF;
     UPDATE mkt_tasks SET
       title=CASE WHEN f ? 'title' THEN trim(f->>'title') ELSE title END,
       description=CASE WHEN f ? 'description' THEN nullif(trim(f->>'description'),'') ELSE description END,
       campaign_id=CASE WHEN f ? 'campaign_id' THEN nullif(f->>'campaign_id','')::uuid ELSE campaign_id END,
       assignee_account_id=CASE WHEN f ? 'assignee_account_id' THEN f->>'assignee_account_id' ELSE assignee_account_id END,
       due_date=CASE WHEN f ? 'due_date' THEN nullif(f->>'due_date','')::date ELSE due_date END,
       priority=CASE WHEN f ? 'priority' THEN f->>'priority' ELSE priority END
     WHERE id=old_row.id RETURNING id INTO tid;
     INSERT INTO mkt_task_updates(task_id,actor_id,kind,note)
     VALUES(tid,p_actor,'edited',CASE WHEN f ? 'assignee_account_id' AND f->>'assignee_account_id'<>old_row.assignee_account_id
       THEN 'assignee:'||old_row.assignee_account_id||'->'||(f->>'assignee_account_id') END);
   END IF;
 EXCEPTION WHEN check_violation OR not_null_violation OR invalid_text_representation OR invalid_datetime_format
   OR datetime_field_overflow THEN RAISE EXCEPTION 'INVALID_TASK';
 END;
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('mkt_task',p_actor,p_key,p_data,tid);
 RETURN jsonb_build_object('task',business_mkt_task_document(tid,true),'previous_assignee',old_row.assignee_account_id,'replayed',false);
END $$;

-- Move a task, or comment on it.
--   {id, status, expected_status, note}  status change. A team member moves her own work between
--                                        todo / in_progress / review; closing (done, cancelled) and
--                                        reopening a closed task need may_close — that is the
--                                        manager's sign-off. Sending work back from review needs a note.
--   {id, note}                           comment (status omitted)
CREATE FUNCTION public.business_mkt_task_update(p_actor text, p_key uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE replay uuid; t mkt_tasks; next_status text := nullif(p_data->>'status','');
  v_note text := nullif(trim(coalesce(p_data->>'note','')),''); scope text := nullif(p_data->>'scope_account','');
  may_close boolean := coalesce((p_data->>'may_close')::boolean,false);
BEGIN
 replay := business_hr_replay('mkt_task_update',p_actor,p_key,p_data);
 IF replay IS NOT NULL THEN RETURN jsonb_build_object('task',business_mkt_task_document(replay,true),'replayed',true); END IF;
 SELECT * INTO t FROM mkt_tasks WHERE id=(p_data->>'id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'TASK_NOT_FOUND'; END IF;
 IF scope IS NOT NULL AND t.assignee_account_id<>scope AND t.created_by<>scope THEN RAISE EXCEPTION 'MKT_FORBIDDEN'; END IF;
 IF next_status IS NULL THEN
   IF v_note IS NULL THEN RAISE EXCEPTION 'INVALID_TASK'; END IF;
   INSERT INTO mkt_task_updates(task_id,actor_id,kind,note) VALUES(t.id,p_actor,'comment',left(v_note,2000));
 ELSE
   IF next_status NOT IN ('todo','in_progress','review','done','cancelled') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
   IF coalesce(p_data->>'expected_status','')<>'' AND p_data->>'expected_status'<>t.status THEN RAISE EXCEPTION 'STALE_TASK'; END IF;
   IF next_status=t.status THEN RAISE EXCEPTION 'STALE_TASK'; END IF;
   IF (next_status IN ('done','cancelled') OR t.status IN ('done','cancelled')) AND NOT may_close THEN
     RAISE EXCEPTION 'TASK_CLOSE_FORBIDDEN'; END IF;
   IF t.status='review' AND next_status IN ('todo','in_progress') AND may_close AND v_note IS NULL THEN
     RAISE EXCEPTION 'TASK_NOTE_REQUIRED'; END IF;
   UPDATE mkt_tasks SET status=next_status,completed_at=CASE WHEN next_status='done' THEN now() END WHERE id=t.id;
   INSERT INTO mkt_task_updates(task_id,actor_id,kind,status_from,status_to,note) VALUES(t.id,p_actor,'status',t.status,next_status,left(v_note,2000));
 END IF;
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('mkt_task_update',p_actor,p_key,p_data,t.id);
 RETURN jsonb_build_object('task',business_mkt_task_document(t.id,true),'status_from',t.status,'replayed',false);
END $$;

DO $$ DECLARE fn text; BEGIN
 FOREACH fn IN ARRAY ARRAY['business_mkt_day(timestamptz)','business_mkt_campaign_document(uuid)','business_mkt_campaigns()',
   'business_mkt_campaign_save(text,uuid,jsonb)','business_mkt_spend(uuid)','business_mkt_spend_record(text,uuid,jsonb)',
   'business_mkt_spend_void(text,uuid,jsonb)','business_mkt_attribute(text,uuid,jsonb)','business_mkt_campaign_leads(uuid)',
   'business_mkt_attributions_of(uuid[])','business_mkt_task_document(uuid,boolean)','business_mkt_tasks(text)',
   'business_mkt_task_save(text,uuid,jsonb)','business_mkt_task_update(text,uuid,jsonb)']
 LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
   EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
 END LOOP;
END $$;

COMMIT;
