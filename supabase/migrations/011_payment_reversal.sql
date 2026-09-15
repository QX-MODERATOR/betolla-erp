-- Additive only: no backfill, deletion, or changes to existing RLS/policies.
-- Payment corrections: a reversal is never an edit or delete of the original
-- payment row (same audit-trail principle as inventory_movements' reversal) —
-- it posts a new, equal-and-opposite payment row that references the original,
-- so paid_amount (a plain SUM over payments) nets out correctly automatically.
BEGIN;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS is_reversal boolean NOT NULL DEFAULT false;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS reversed_payment_id uuid REFERENCES public.payments(id);

-- Adds the per-payment breakdown (needed so the UI can offer "reverse" on a
-- specific payment) to the existing order document. Purely additive to the
-- JSON shape: every existing key is untouched, so no other caller can break.
CREATE OR REPLACE FUNCTION public.business_order_document(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT jsonb_build_object(
   'id',o.order_number,'db_id',o.id,'status',o.status,'order_date',o.order_date,
   'customer_name',coalesce(o.business_details->>'customer_name',c.name),
   'customer_phone',coalesce(o.business_details->>'customer_phone',c.phone),
   'city',coalesce(o.delivery_city,c.city,''),'address',coalesce(o.delivery_address,c.address,''),
   'rep_name',coalesce(o.business_details->>'rep_name',c.rep_name_raw,''),
   'source',o.source,'payment_method',o.payment_method,'total_amount',o.total_amount,
   'items_summary',coalesce(o.business_details->>'items_summary',
      (SELECT string_agg(quantity::text || ' × ' || product_name_raw, ' + ') FROM order_items WHERE order_id=o.id),''),
   'installment_notes',o.notes,
   'items',coalesce((SELECT jsonb_agg(jsonb_build_object('name',product_name_raw,'qty',quantity,
      'price',CASE WHEN price_is_known THEN unit_price ELSE NULL END,
      'total',CASE WHEN price_is_known THEN total_price ELSE NULL END) ORDER BY created_at,id)
      FROM order_items WHERE order_id=o.id),'[]'::jsonb),
   'invoice_number',i.invoice_number,'invoice_total',i.total_amount,'invoice_subtotal',i.subtotal,
   'invoice_discount',i.discount_amount,'issued_date',i.issued_at::date,'due_date',i.due_date,
   'paid_amount',coalesce((SELECT sum(amount) FROM payments WHERE invoice_id=i.id),0),
   'payments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'amount',p.amount,'payment_method',p.payment_method,
      'reference_number',coalesce(p.reference_number,''),'notes',coalesce(p.notes,''),'is_reversal',p.is_reversal,
      'reversed_payment_id',p.reversed_payment_id,'received_at',p.received_at) ORDER BY p.received_at,p.id)
      FROM payments p WHERE p.invoice_id=i.id),'[]'::jsonb),
   'collectible',o.status NOT IN ('draft','cancelled','returned'),
   'updated_at',o.updated_at
 ) FROM orders o JOIN customers c ON c.id=o.customer_id
 LEFT JOIN invoices i ON i.order_id=o.id WHERE o.id=p_id
$$;

CREATE FUNCTION public.business_payment_reverse(p_actor text,p_key uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE old_request business_requests; orig payments; inv invoices; ord orders; reversal_id uuid := gen_random_uuid(); paid numeric;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('payment-reverse:'||p_actor||':'||p_key::text,0));
 SELECT * INTO old_request FROM business_requests WHERE operation='payment_reverse' AND actor_id=p_actor AND request_key=p_key;
 IF FOUND THEN
   IF old_request.payload<>p_data THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   SELECT i.* INTO inv FROM invoices i JOIN payments p ON p.invoice_id=i.id WHERE p.id=old_request.result_id;
   RETURN jsonb_build_object('order',business_order_document(inv.order_id),'reversal_id',old_request.result_id,'replayed',true);
 END IF;
 BEGIN orig.id := (p_data->>'payment_id')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND'; END;
 SELECT * INTO orig FROM payments WHERE id=orig.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND'; END IF;
 IF orig.is_reversal THEN RAISE EXCEPTION 'PAYMENT_NOT_REVERSIBLE'; END IF;
 IF EXISTS(SELECT 1 FROM payments WHERE reversed_payment_id=orig.id) THEN RAISE EXCEPTION 'PAYMENT_ALREADY_REVERSED'; END IF;
 SELECT * INTO inv FROM invoices WHERE id=orig.invoice_id;
 -- Lock order then invoice everywhere: collections, status changes and reversals all serialize.
 SELECT * INTO ord FROM orders WHERE id=inv.order_id FOR UPDATE;
 SELECT * INTO inv FROM invoices WHERE id=inv.id FOR UPDATE;
 INSERT INTO payments(id,invoice_id,amount,payment_method,reference_number,notes,is_reversal,reversed_payment_id)
 VALUES(reversal_id,inv.id,-orig.amount,orig.payment_method,NULL,nullif(trim(p_data->>'notes'),''),true,orig.id);
 SELECT coalesce(sum(amount),0) INTO paid FROM payments WHERE invoice_id=inv.id;
 UPDATE invoices SET status=CASE WHEN paid<=0 THEN 'pending'::payment_status_enum
   WHEN paid>=total_amount THEN 'paid'::payment_status_enum ELSE 'partial'::payment_status_enum END WHERE id=inv.id;
 UPDATE orders SET payment_status=CASE WHEN paid<=0 THEN 'pending'::payment_status_enum
   WHEN paid>=inv.total_amount THEN 'paid'::payment_status_enum ELSE 'partial'::payment_status_enum END WHERE id=ord.id;
 INSERT INTO business_requests(operation,actor_id,request_key,payload,result_id) VALUES('payment_reverse',p_actor,p_key,p_data,reversal_id);
 RETURN jsonb_build_object('order',business_order_document(ord.id),'reversal_id',reversal_id,'replayed',false);
END $$;

-- Only the existing server identity can call these RPCs; never expose the service key.
REVOKE ALL ON FUNCTION public.business_payment_reverse(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_payment_reverse(text,uuid,jsonb) TO service_role;
COMMIT;
