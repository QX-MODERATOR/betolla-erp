-- مصدر البيانات and B2B/B2C on the order document.
--
-- Every order taken on /sales now records where its customer came from (Data Center — locked for
-- a customer from our CRM list — social media, or the rep's personal number) and whether it is B2B
-- or B2C (lib/order-meta.ts). They are saved in orders.business_details, which business_create_order
-- already stores as sent, so saving them needed no migration; this one only reads them back, so
-- /orders, the order details and the finance export can show them.
--
-- The body is 045's (the newest), carried forward verbatim apart from the one added line. Orders
-- placed before this carry null for both.
--
-- ORDERING: apply after 045. A later migration replacing business_order_document must start from
-- this body, or the two fields disappear from every screen again.
BEGIN;

CREATE OR REPLACE FUNCTION public.business_order_document(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT jsonb_build_object(
   'id',o.order_number,'db_id',o.id,'status',o.status,'order_date',o.order_date,
   'customer_name',coalesce(o.business_details->>'customer_name',c.name),
   'customer_phone',coalesce(o.business_details->>'customer_phone',c.phone),
   'city',coalesce(o.delivery_city,c.city,''),'address',coalesce(o.delivery_address,c.address,''),
   'rep_name',coalesce(o.business_details->>'rep_name',c.rep_name_raw,''),
   'source',o.source,
   'data_source',o.business_details->>'data_source','customer_segment',o.business_details->>'customer_segment','payment_method',o.payment_method,'total_amount',o.total_amount,
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
   -- The order's own history, for the shipment timeline. created_at is when the order was taken.
   'created_at',o.created_at,'confirmed_at',o.confirmed_at,'shipped_at',o.shipped_at,
   'delivered_at',o.delivered_at,'cancelled_at',o.cancelled_at,
   'driver',business_driver_of(o.business_details,o.notes),
   'dispatched_at',o.business_details->'delivery'->>'dispatched_at',
   'updated_at',o.updated_at,
   -- 045: the driver's on-the-way / arrived stamps, and the state that can make them stale.
   'delivery_progress',o.business_details->'delivery'->'progress',
   'delivery_state',o.business_details->'delivery'->>'state',
   'delivery_state_at',o.business_details->'delivery'->>'state_at'
 ) FROM orders o JOIN customers c ON c.id=o.customer_id
 LEFT JOIN invoices i ON i.order_id=o.id WHERE o.id=p_id
$$;

COMMIT;
