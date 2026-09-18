-- Readable order and invoice numbers: BET-2026-00042 and INV-2026-00042.
--
-- 001_initial_schema.sql always said this was the intent — the columns are commented
-- "-- BET-2026-00001" and "-- INV-2026-00001" — but 006 filled them with 'BET-'||uuid and
-- 'INV-'||uuid and every later revision copied that line forward. The result is a 40-character
-- number nobody can read down a phone line:
--
--   BET-3f2a9c1e-4b5d-4c7a-9e12-ab34cd56ef78   ->   BET-2026-00042
--   INV-3f2a9c1e-4b5d-4c7a-9e12-ab34cd56ef78   ->   INV-2026-00042
--
-- An order and its invoice share one counter value, so BET-2026-00042 always carries
-- INV-2026-00042 and a rep reading one number aloud has given you both.
--
-- WHY A TRIGGER AND NOT ANOTHER business_create_order REPLACEMENT
-- The number is minted in four places already (006/010/032/034/037/038 for business_create_order,
-- 027 and 035 for the driver's fallback invoice, and the whatsapp-order edge function), and
-- business_create_order is CREATE OR REPLACE'd by half the migrations in this directory. Putting
-- the numbering in a BEFORE INSERT trigger means no function body is rewritten here at all: there
-- is nothing for a later migration to silently drop by carrying an older body forward, and any
-- future insert path gets correct numbers without knowing this file exists.
--
-- The trigger ASSIGNS UNCONDITIONALLY. Whatever a caller passes for order_number/invoice_number
-- is discarded, which is what makes the old 'BET-'||uuid lines still sitting in those functions
-- harmless. (A bulk restore that must preserve its own numbers should
-- ALTER TABLE orders DISABLE TRIGGER trg_orders_number; and likewise for invoices.)
--
-- EXISTING ROWS ARE NOT RENUMBERED. Their numbers are printed on invoices and are the lookup key
-- for business_status and business_payment; rewriting them would break live references for the
-- sake of tidiness. Old orders keep their long numbers, new ones are short, and both resolve.
--
-- ORDERING: apply after 039. Nothing here depends on 034-039 and nothing replaces their work.
BEGIN;

-- One row per (scope, year). The counter is bumped inside the caller's transaction, so a rolled
-- back order gives its number back and the books have no gaps — at the cost of serialising order
-- creation on this row for the length of the transaction, which at a few dozen orders a day is
-- nothing. If volume ever makes that a bottleneck, a SEQUENCE is the trade: no lock, but gaps.
CREATE TABLE public.document_counters (
  scope TEXT NOT NULL CHECK (scope = trim(scope) AND length(scope) BETWEEN 1 AND 32),
  year INT NOT NULL CHECK (year BETWEEN 2020 AND 2200),
  next_value INT NOT NULL CHECK (next_value > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, year)
);
ALTER TABLE public.document_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.document_counters FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.document_counters TO service_role;

-- The next number for this year, in Amman time — the counter restarts every January, which is
-- what makes the year in the number worth printing.
CREATE FUNCTION public.business_next_doc_seq(p_scope text, OUT doc_year int, OUT doc_seq int)
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 doc_year := EXTRACT(year FROM (now() AT TIME ZONE 'Asia/Amman'))::int;
 INSERT INTO document_counters(scope, year, next_value) VALUES (p_scope, doc_year, 1)
 ON CONFLICT (scope, year) DO UPDATE SET next_value = document_counters.next_value + 1, updated_at = now()
 RETURNING next_value INTO doc_seq;
END $$;

-- BET-2026-00042. Five digits covers 99,999 orders a year and grows past that rather than
-- wrapping, so the number stays unique whatever happens. The greatest() matters: lpad TRUNCATES
-- when the string is already longer than the width, so a plain lpad(...,5,'0') would turn order
-- 100,000 into 10000 and collide with order 10,000.
CREATE FUNCTION public.business_doc_number(p_prefix text, p_year int, p_seq int) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
 SELECT p_prefix || '-' || p_year::text || '-' || lpad(p_seq::text, greatest(5, length(p_seq::text)), '0')
$$;

CREATE FUNCTION public.business_number_order() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE y int; n int;
BEGIN
 SELECT doc_year, doc_seq INTO y, n FROM business_next_doc_seq('order');
 NEW.order_number := business_doc_number('BET', y, n);
 RETURN NEW;
END $$;

-- The invoice takes its number from its order, so the pair always reads the same. Only an invoice
-- for an order that predates this migration (the driver's fallback path in 035, for orders created
-- outside business_create_order) has to draw a number of its own.
CREATE FUNCTION public.business_number_invoice() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE ord_num text; y int; n int;
BEGIN
 SELECT order_number INTO ord_num FROM orders WHERE id = NEW.order_id;
 IF ord_num ~ '^BET-[0-9]{4}-[0-9]{5,}$' THEN
   NEW.invoice_number := 'INV-' || substring(ord_num from 5);
 ELSE
   SELECT doc_year, doc_seq INTO y, n FROM business_next_doc_seq('order');
   NEW.invoice_number := business_doc_number('INV', y, n);
 END IF;
 RETURN NEW;
END $$;

-- BEFORE INSERT runs ahead of the NOT NULL and UNIQUE checks on these columns, so a caller may
-- also omit the number entirely and let the database name the document. The whatsapp-order edge
-- function now does exactly that.
CREATE TRIGGER trg_orders_number BEFORE INSERT ON public.orders
 FOR EACH ROW EXECUTE FUNCTION public.business_number_order();
CREATE TRIGGER trg_invoices_number BEFORE INSERT ON public.invoices
 FOR EACH ROW EXECUTE FUNCTION public.business_number_invoice();

REVOKE ALL ON FUNCTION public.business_next_doc_seq(text), public.business_doc_number(text,int,int),
  public.business_number_order(), public.business_number_invoice() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_next_doc_seq(text), public.business_doc_number(text,int,int),
  public.business_number_order(), public.business_number_invoice() TO service_role;

COMMIT;
