-- Additive only: no backfill, deletion, or changes to existing RLS/policies.
-- Connects the CRM customer list/lead intake to durable storage in `customers`/`call_logs`.
BEGIN;

CREATE FUNCTION public.business_customer_document(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT jsonb_build_object(
   'id',c.id,'legacy_id',c.legacy_id,'name',c.name,'phone',c.phone,
   'customer_type',c.customer_type,'classification',c.classification,'lead_source',c.lead_source,
   'address',coalesce(c.address,''),'city',coalesce(c.city,''),'rep_name_raw',coalesce(c.rep_name_raw,''),
   'notes',coalesce(c.notes,''),'last_contact_date',c.last_contact_date,'next_call_date',c.next_call_date,
   'created_at',c.created_at,'updated_at',c.updated_at,
   'history',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'date',l.called_at::date,'rep',coalesce(p.full_name_ar,''),'outcome',l.outcome,'notes',coalesce(l.notes,''))
      ORDER BY l.called_at DESC)
      FROM call_logs l LEFT JOIN profiles p ON p.id=l.rep_id WHERE l.customer_id=c.id),'[]'::jsonb)
 ) FROM customers c WHERE c.id=p_id
$$;

CREATE FUNCTION public.business_customer_list() RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(business_customer_document(id) ORDER BY created_at DESC,id),'[]'::jsonb) FROM customers
$$;

-- Idempotency is the phone number itself: a retried/duplicate lead never creates a second row.
CREATE FUNCTION public.business_customer_create(p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE phone_in text := p_data->>'phone'; existing_id uuid; new_id uuid;
BEGIN
 IF coalesce(length(trim(phone_in)),0)=0 THEN RAISE EXCEPTION 'INVALID_PHONE'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('customer-phone:'||phone_in,0));
 SELECT id INTO existing_id FROM customers WHERE phone=phone_in LIMIT 1;
 IF FOUND THEN
   RETURN jsonb_build_object('customer',business_customer_document(existing_id),'is_duplicate',true);
 END IF;
 INSERT INTO customers(name,phone,city,address,notes,lead_source,rep_name_raw,customer_type,classification,last_contact_date)
 VALUES(nullif(trim(p_data->>'name'),''),phone_in,nullif(trim(p_data->>'city'),''),nullif(trim(p_data->>'address'),''),
   nullif(trim(p_data->>'notes'),''),(p_data->>'lead_source')::lead_source_enum,nullif(trim(p_data->>'rep_name'),''),
   'end_user','customer',current_date)
 RETURNING id INTO new_id;
 RETURN jsonb_build_object('customer',business_customer_document(new_id),'is_duplicate',false);
END $$;

-- Only the existing server identity can call these RPCs; never expose the service key.
REVOKE ALL ON FUNCTION public.business_customer_document(uuid),public.business_customer_list(),
 public.business_customer_create(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_customer_document(uuid),public.business_customer_list(),
 public.business_customer_create(jsonb) TO service_role;
COMMIT;
