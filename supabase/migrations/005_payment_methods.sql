-- Commit this migration before 006 (PostgreSQL enum additions need a commit).
ALTER TYPE public.payment_method_enum ADD VALUE IF NOT EXISTS 'cash';
ALTER TYPE public.payment_method_enum ADD VALUE IF NOT EXISTS 'zain_cash';
