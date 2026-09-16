-- Additive only: no backfill, deletion, or changes to existing RLS/policies.
--
-- Bug: business_customer_create (007) inserted every new lead with
-- last_contact_date = current_date, i.e. as if the rep had already contacted
-- them the moment the lead was created. app/sales/page.tsx's isUntouchedLead()
-- helper ("!next_call_date && !last_contact_date") relies on last_contact_date
-- staying NULL until a real call is logged (business_call_log_create already
-- sets it correctly at that point) to surface brand-new leads in the rep's
-- daily queue -- the only place in the app with a "Create Order" button. With
-- last_contact_date pre-set at creation, a lead never qualified as untouched
-- and so never appeared in that queue, leaving no way to create an order for
-- it right after adding it. Fix: leave last_contact_date NULL at creation.

BEGIN;

CREATE OR REPLACE FUNCTION public.business_customer_create(p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE phone_in text := p_data->>'phone'; existing_id uuid; new_id uuid;
BEGIN
 IF coalesce(length(trim(phone_in)),0)=0 THEN RAISE EXCEPTION 'INVALID_PHONE'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('customer-phone:'||phone_in,0));
 SELECT id INTO existing_id FROM customers WHERE phone=phone_in LIMIT 1;
 IF FOUND THEN
   RETURN jsonb_build_object('customer',business_customer_document(existing_id),'is_duplicate',true);
 END IF;
 INSERT INTO customers(name,phone,city,address,notes,lead_source,rep_name_raw,customer_type,classification)
 VALUES(nullif(trim(p_data->>'name'),''),phone_in,nullif(trim(p_data->>'city'),''),nullif(trim(p_data->>'address'),''),
   nullif(trim(p_data->>'notes'),''),(p_data->>'lead_source')::lead_source_enum,nullif(trim(p_data->>'rep_name'),''),
   'end_user','customer')
 RETURNING id INTO new_id;
 RETURN jsonb_build_object('customer',business_customer_document(new_id),'is_duplicate',false);
END $$;

COMMIT;
