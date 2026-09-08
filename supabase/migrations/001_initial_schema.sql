-- Betolla Cosmetics ERP Database Schema
-- Initial Migration: 001_initial_schema.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. ENUMS
-- ==============================================================================

DO $$ BEGIN
    CREATE TYPE user_role_enum AS ENUM ('admin', 'manager', 'sales_rep', 'inventory_manager', 'finance');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE customer_type_enum AS ENUM (
        'end_user',    -- زبونة / شخصي
        'salon',       -- صالون / صالونات
        'pharmacy',    -- صيدلية / صيدليات
        'clinic',      -- عيادة / دكتور
        'wholesale',   -- جملة
        'sale',        -- بيع / حجز
        'gift',        -- هدية / عينة / فري
        'other'        -- غير ذلك
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE customer_classification_enum AS ENUM (
        'customer',          -- زبونة / تم
        'cold_lead',         -- ليد بارد / SOCIAL_MEDIA_COLD
        'personal',          -- شخصي
        'salon',             -- صالون
        'home_based',        -- بيتي
        'pharmacy',          -- صيدلية
        'no_response',       -- لا يوجد رد / المكالمات موقوفة
        'not_interested',    -- غير مهتم / مفصول
        'doctor_lead',       -- ليد من الدكتور
        'repeat_caller',     -- تكرار اتصال
        'social_media',      -- سوشال ميديا
        'unclassified',      -- غير معروف / غير مستعمل
        'needs_review',      -- يحتاج تدقيق
        'other'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE lead_source_enum AS ENUM (
        'sales',             -- مبيعات داخلية
        'social_media',      -- فيسبوك / انستغرام
        'doctor',            -- تحويل دكتور
        'google_maps',       -- خرائط جوجل
        'whatsapp',          -- واتساب مباشر
        'crm_legacy',        -- قاعدة بيانات قديمة
        'phone',             -- هاتف
        'commercial',        -- تجاري
        'unverified',        -- قيد التحقق
        'unknown'            -- غير محدد
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE call_outcome_enum AS ENUM (
        'answered',          -- تم الرد
        'no_answer',         -- لا يوجد رد
        'busy',              -- مشغول
        'wrong_number',      -- رقم خاطئ / مفصول
        'not_interested',    -- غير مهتم
        'callback_requested',-- طلب معاودة الاتصال
        'order_placed',      -- تم تثبيت طلب
        'whatsapp_sent'      -- تم إرسال واتساب
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE order_status_enum AS ENUM (
        'draft',             -- مسودة (من الواتساب أو النظام)
        'confirmed',         -- مؤكد
        'processing',        -- قيد التجهيز
        'shipped',           -- قيد التوصيل
        'delivered',         -- تم التسليم
        'cancelled',         -- ملغي
        'returned'           -- راجع / مرتجع
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_status_enum AS ENUM (
        'pending',           -- معلق
        'partial',           -- جزئي
        'paid',              -- مدفوع بالكامل
        'refunded'           -- مسترجع
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_method_enum AS ENUM (
        'cash_on_delivery',  -- دفع عند الاستلام
        'bank_transfer',     -- تحويل بنكي
        'cliq',              -- كليك CliQ
        'installment'        -- أقساط / شهر
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE inventory_movement_type_enum AS ENUM (
        'purchase_in',       -- توريد جديد
        'sale_out',          -- صرف طلب مبيعات
        'return_in',         -- مرتجع من عميل
        'adjustment',        -- جرد وتسوية
        'damaged'            -- تالف / هالك
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ==============================================================================
-- 2. CORE USERS & PROFILES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    full_name_ar TEXT NOT NULL,
    full_name_en TEXT,
    phone TEXT,
    email TEXT UNIQUE,
    role user_role_enum NOT NULL DEFAULT 'sales_rep',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 3. PRODUCTS & INVENTORY
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name_ar TEXT NOT NULL,
    name_en TEXT NOT NULL,
    description_ar TEXT,
    description_en TEXT,
    display_order INT DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    sku TEXT UNIQUE NOT NULL,
    name_ar TEXT NOT NULL,
    name_en TEXT NOT NULL,
    description_ar TEXT,
    description_en TEXT,
    retail_price NUMERIC(10, 3) NOT NULL DEFAULT 0.000, -- Selling price in JD
    sale_price NUMERIC(10, 3),                          -- Discounted price in JD
    cost_price NUMERIC(10, 3) DEFAULT 0.000,            -- Cost price in JD
    image_url TEXT,
    slug TEXT UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID UNIQUE NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity_on_hand INT NOT NULL DEFAULT 0,
    quantity_reserved INT NOT NULL DEFAULT 0,
    reorder_level INT NOT NULL DEFAULT 10,
    warehouse_location TEXT DEFAULT 'Main Warehouse - Amman',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    movement_type inventory_movement_type_enum NOT NULL,
    quantity INT NOT NULL, -- positive for increase, negative for decrease
    reference_type TEXT,   -- 'order', 'purchase', 'manual'
    reference_id UUID,
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 4. CUSTOMERS & CRM
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_id BIGINT UNIQUE,                           -- Excel الرقم
    name TEXT NOT NULL,                                -- اسم العميل
    phone TEXT NOT NULL,                               -- رقم الهاتف
    customer_type customer_type_enum NOT NULL DEFAULT 'end_user',
    classification customer_classification_enum NOT NULL DEFAULT 'customer',
    lead_source lead_source_enum NOT NULL DEFAULT 'sales',
    address TEXT,                                      -- العنوان التفصيلي
    city TEXT,                                         -- المدينة / المنطقة (عمان، الزرقاء، إربد، ...)
    assigned_rep_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    rep_name_raw TEXT,                                 -- اسم المندوب من ملف الإكسل الأصلي
    notes TEXT,                                        -- ملاحظات عامة
    last_contact_date DATE,                            -- تاريخ التواصل الأخير
    next_call_date DATE,                               -- تاريخ التواصل القادم (Google Calendar)
    order_date DATE,                                   -- أول تاريخ طلب من الإكسل
    legacy_product_text TEXT,                          -- نص المنتجات من الإكسل الأصلي
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices for CRM performance
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_city ON public.customers(city);
CREATE INDEX IF NOT EXISTS idx_customers_assigned_rep ON public.customers(assigned_rep_id);
CREATE INDEX IF NOT EXISTS idx_customers_next_call ON public.customers(next_call_date);
CREATE INDEX IF NOT EXISTS idx_customers_type ON public.customers(customer_type);
CREATE INDEX IF NOT EXISTS idx_customers_classification ON public.customers(classification);

-- ==============================================================================
-- 5. CALL LOGS & REMINDERS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    rep_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    called_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    outcome call_outcome_enum NOT NULL DEFAULT 'answered',
    notes TEXT,
    next_call_date DATE,
    google_calendar_event_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_logs_customer ON public.call_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_next_call ON public.call_logs(next_call_date);
CREATE INDEX IF NOT EXISTS idx_call_logs_rep ON public.call_logs(rep_id);

-- ==============================================================================
-- 6. ORDERS & LINE ITEMS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT UNIQUE NOT NULL,                 -- BET-2026-00001
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    rep_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    source TEXT NOT NULL DEFAULT 'sales',              -- 'whatsapp', 'marketing', 'sales', 'storefront'
    status order_status_enum NOT NULL DEFAULT 'draft',
    subtotal NUMERIC(10, 3) NOT NULL DEFAULT 0.000,
    discount_amount NUMERIC(10, 3) NOT NULL DEFAULT 0.000,
    delivery_fee NUMERIC(10, 3) NOT NULL DEFAULT 0.000,
    total_amount NUMERIC(10, 3) NOT NULL DEFAULT 0.000,
    payment_method payment_method_enum NOT NULL DEFAULT 'cash_on_delivery',
    payment_status payment_status_enum NOT NULL DEFAULT 'pending',
    delivery_address TEXT,
    delivery_city TEXT,
    notes TEXT,
    raw_whatsapp_text TEXT,                            -- النص الخام من رسالة الواتساب للطلب
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    confirmed_at TIMESTAMPTZ,
    shipped_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_name_raw TEXT NOT NULL,                    -- اسم المنتج كما ورد
    quantity INT NOT NULL DEFAULT 1,
    unit_price NUMERIC(10, 3) NOT NULL DEFAULT 0.000,
    total_price NUMERIC(10, 3) NOT NULL DEFAULT 0.000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_rep ON public.orders(rep_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_date ON public.orders(order_date);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);

-- ==============================================================================
-- 7. INVOICES & PAYMENTS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number TEXT UNIQUE NOT NULL,               -- INV-2026-00001
    order_id UUID UNIQUE NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    subtotal NUMERIC(10, 3) NOT NULL DEFAULT 0.000,
    discount_amount NUMERIC(10, 3) NOT NULL DEFAULT 0.000,
    total_amount NUMERIC(10, 3) NOT NULL DEFAULT 0.000,
    status payment_status_enum NOT NULL DEFAULT 'pending',
    due_date DATE,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
    amount NUMERIC(10, 3) NOT NULL,
    payment_method payment_method_enum NOT NULL DEFAULT 'cash_on_delivery',
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reference_number TEXT,
    notes TEXT,
    recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 8. AUTOMATION & TRIGGERS (Updated_at)
-- ==============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_customers_updated_at ON public.customers;
CREATE TRIGGER trg_customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
