-- =============================================================================
-- Migration 004: Driver Management Schema
-- Adds driver roles, delivery status tracking, dispatch manifests, and
-- inventory withdrawal logging for the driver management workflow.
-- =============================================================================

-- 1. Add new role values to user_role_enum
ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'driver_manager';
ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'driver';

-- 2. Create driver delivery status enum
CREATE TYPE driver_delivery_status_enum AS ENUM (
  'unassigned',         -- Order not yet assigned to a driver
  'assigned',           -- Assigned to a driver by the driver manager (Diya)
  'picked_up',          -- Driver picked items from warehouse
  'out_for_delivery',   -- Driver on route delivering
  'delivered',          -- Successfully delivered & cash collected (مكتمل)
  'left_with_driver',   -- Kept with driver for next day (متبقي)
  'returned',           -- Rejected/returned by customer (مرتجع/راجع)
  'postponed'           -- Customer requested postponement (مؤجل)
);

-- 3. Add driver-related columns to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_driver_id UUID REFERENCES profiles(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_status driver_delivery_status_enum DEFAULT 'unassigned';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_notes TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_detailed_address TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_completed_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cash_collected NUMERIC(10,3) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS receivables NUMERIC(10,3) DEFAULT 0;

-- 4. Daily dispatch manifests (replaces daily MD&ZAID.xlsx sheets)
CREATE TABLE IF NOT EXISTS daily_dispatches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispatch_date DATE NOT NULL DEFAULT CURRENT_DATE,
  manager_id UUID REFERENCES profiles(id),
  total_orders INTEGER DEFAULT 0,
  total_cash_expected NUMERIC(10,3) DEFAULT 0,
  total_cash_collected NUMERIC(10,3) DEFAULT 0,
  total_receivables NUMERIC(10,3) DEFAULT 0,
  total_returns INTEGER DEFAULT 0,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'dispatched', 'reconciled', 'closed')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger for auto-updating updated_at on daily_dispatches
CREATE TRIGGER set_daily_dispatches_updated_at
  BEFORE UPDATE ON daily_dispatches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 5. Inventory withdrawal log (what Diya takes from warehouse for drivers each morning)
CREATE TABLE IF NOT EXISTS inventory_withdrawals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispatch_id UUID REFERENCES daily_dispatches(id) ON DELETE SET NULL,
  product_id UUID REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  withdrawn_by UUID REFERENCES profiles(id),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Indexes for performance on frequently queried columns
CREATE INDEX IF NOT EXISTS idx_orders_assigned_driver ON orders(assigned_driver_id);
CREATE INDEX IF NOT EXISTS idx_orders_driver_status ON orders(driver_status);
CREATE INDEX IF NOT EXISTS idx_orders_dispatched_at ON orders(dispatched_at);
CREATE INDEX IF NOT EXISTS idx_daily_dispatches_date ON daily_dispatches(dispatch_date);
CREATE INDEX IF NOT EXISTS idx_inventory_withdrawals_dispatch ON inventory_withdrawals(dispatch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_withdrawals_product ON inventory_withdrawals(product_id);

-- 7. Seed driver profiles
INSERT INTO profiles (id, full_name_ar, full_name_en, phone, email, role, is_active)
VALUES
  ('mgr-diya-01', 'ضياء', 'Diya', '', 'diya@betolla.com', 'driver_manager', true),
  ('drv-khalid-01', 'خالد', 'Khalid', '', 'khalid@betolla.com', 'driver', true),
  ('drv-ali-01', 'علي', 'Ali', '', 'ali@betolla.com', 'driver', true),
  ('fin-zaid-01', 'زيد', 'Zaid', '', 'zaid@betolla.com', 'finance', true)
ON CONFLICT (id) DO NOTHING;
