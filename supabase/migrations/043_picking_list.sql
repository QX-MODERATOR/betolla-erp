-- The picking list: everything that has to come off the shelf, as things you can actually pick.
--
-- business_driver_stock_needed (027/037) already answers most of this — it expands a package into
-- the bottles it ships as, sums by product and joins the stock on hand — but it answers it for the
-- whole company at once, and only for orders already in 'processing' with a driver on them.
-- ضياء needs the list for HER drivers (BX belongs to صابرين, see lib/bx.ts), and she needs it before
-- the orders are dispatched, which is the point at which somebody walks to the shelves.
--
-- p_drivers  NULL  -> every driver (management)
--            array -> orders carrying one of those drivers, plus orders nobody has claimed yet:
--                     an unassigned order still has to be picked, and whoever is picking is the
--                     person who will assign it.
--
-- A package never appears. "بكج رباعي بلازما [شامبو + بلسم + تريتمنت + سيروم]" is one thing sold and
-- four things to carry, and the person at the shelves wants the four.
--
-- The answer has three parts:
--   lines     one row per product, summed across every order — what to pull off the shelf
--   orders    each order with its packages already opened — how to sort the pulled bottles into bags
--   unlinked  order lines that never matched a product (product_id NULL). They cannot be expanded or
--             checked against stock, but they still have to be picked, so they are listed rather than
--             dropped by the join.
BEGIN;

CREATE FUNCTION public.business_picking_list(p_drivers text[] DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 WITH scoped AS (
   SELECT o.id, o.order_number, o.status, o.created_at,
     business_driver_of(o.business_details, o.notes) AS driver,
     coalesce(o.business_details->>'customer_name', c.name, '') AS customer,
     coalesce(o.delivery_city, '') AS city
   FROM orders o JOIN customers c ON c.id = o.customer_id
   WHERE o.status IN ('confirmed','processing')
 ), mine AS (
   SELECT * FROM scoped
   WHERE p_drivers IS NULL OR driver IS NULL OR driver = ANY(p_drivers)
 ), parts AS (
   SELECT m.id AS order_id, x.product_id, x.quantity
   FROM mine m
   JOIN order_items oi ON oi.order_id = m.id
   CROSS JOIN LATERAL business_bundle_expand(oi.product_id, oi.quantity) x
   WHERE oi.product_id IS NOT NULL
 ), picked AS (
   SELECT p.id, p.sku, p.name_ar, p.category_id,
     sum(parts.quantity)::int AS needed,
     count(DISTINCT parts.order_id)::int AS orders,
     coalesce(max(inv.quantity_on_hand),0)::int AS available
   FROM parts
   JOIN products p ON p.id = parts.product_id
   LEFT JOIN inventory inv ON inv.product_id = p.id
   GROUP BY p.id, p.sku, p.name_ar, p.category_id
 ), shelf AS (
   -- Category display_order is the order the shelves are in, so the list is walked top to bottom
   -- instead of criss-crossing the room.
   SELECT picked.*, coalesce(c.name_ar, c.slug, '') AS category,
     coalesce(c.display_order, 2147483647) AS cat_order
   FROM picked LEFT JOIN categories c ON c.id = picked.category_id
 ), unlinked AS (
   SELECT m.id AS order_id, m.order_number, oi.product_name_raw AS product, oi.quantity
   FROM mine m JOIN order_items oi ON oi.order_id = m.id
   WHERE oi.product_id IS NULL
 )
 SELECT jsonb_build_object(
   'generated_at', now(),
   'total_units', coalesce((SELECT sum(needed) FROM picked),0),
   'total_products', (SELECT count(*) FROM picked),
   'short_products', (SELECT count(*) FROM picked WHERE available < needed),
   'order_count', (SELECT count(*) FROM mine WHERE EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = mine.id)),
   'lines', coalesce((SELECT jsonb_agg(jsonb_build_object(
       'sku', sku, 'product', name_ar, 'category', category,
       'needed', needed, 'orders', orders, 'available', available,
       'short', greatest(needed - available, 0),
       'status', CASE WHEN available < needed THEN 'Low' ELSE 'OK' END)
     ORDER BY cat_order, category, name_ar) FROM shelf),'[]'::jsonb),
   -- Grouped by driver so the bags end up in one pile per car.
   'orders', coalesce((SELECT jsonb_agg(jsonb_build_object(
       'order_number', m.order_number, 'status', m.status, 'driver', m.driver,
       'customer', m.customer, 'city', m.city,
       'items', (SELECT coalesce(jsonb_agg(jsonb_build_object('product', i.product, 'sku', i.sku, 'quantity', i.quantity)
                   ORDER BY i.product), '[]'::jsonb)
                 FROM (SELECT p.name_ar AS product, p.sku, sum(pt.quantity)::int AS quantity
                       FROM parts pt JOIN products p ON p.id = pt.product_id
                       WHERE pt.order_id = m.id GROUP BY p.name_ar, p.sku
                       UNION ALL
                       SELECT u.product, NULL, u.quantity FROM unlinked u WHERE u.order_id = m.id) i))
     ORDER BY m.driver NULLS LAST, m.created_at, m.order_number)
     FROM mine m WHERE EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = m.id)),'[]'::jsonb),
   'unlinked', coalesce((SELECT jsonb_agg(jsonb_build_object(
       'order_number', order_number, 'product', product, 'quantity', quantity)
     ORDER BY product, order_number) FROM unlinked),'[]'::jsonb)
 )
$$;

REVOKE ALL ON FUNCTION public.business_picking_list(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_picking_list(text[]) TO service_role;

COMMIT;
