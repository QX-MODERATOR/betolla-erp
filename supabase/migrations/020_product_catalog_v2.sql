-- Betolla Cosmetics ERP
-- 020_product_catalog_v2.sql
--
-- Full product catalog replacement, sourced from an updated price list (products.txt).
-- Additive only, matching the convention of every migration since 006: no backfill,
-- deletion, or changes to existing RLS/policies. inventory_movements.product_id is
-- ON DELETE RESTRICT, so old products with movement history cannot be hard-deleted
-- without destroying the audit trail anyway -- instead the old catalog is soft-retired
-- via is_active = false (the flag business_inventory_catalog/business_resolve_product
-- already filter on), and the new catalog is inserted as fresh active products.
--
-- cost_price is left at the column default (0.000) for every new row: the source list
-- only gave retail prices, and no real cost data should be fabricated. Initial
-- quantity_on_hand is 0 for the same reason -- real stock should be entered via actual
-- purchase_in movements, not guessed.

BEGIN;

-- 1. Retire the previous catalog. Order/invoice history is untouched (order_items keeps
--    product_name_raw regardless of product_id), this only stops these products from
--    showing up as sellable going forward.
UPDATE public.products SET is_active = false WHERE is_active = true;

-- 2. Insert the new catalog, reusing existing category rows.
DO $$
DECLARE
    cat_electrical UUID;
    cat_lenses UUID;
    cat_plasma UUID;
    cat_argan UUID;
    cat_morphosis UUID;
    cat_proteins UUID;
BEGIN
    SELECT id INTO cat_electrical FROM public.categories WHERE slug = 'electrical-styling';
    SELECT id INTO cat_lenses FROM public.categories WHERE slug = 'beto-lenses';
    SELECT id INTO cat_plasma FROM public.categories WHERE slug = 'plasma-hair-care';
    SELECT id INTO cat_argan FROM public.categories WHERE slug = 'argan-hair-care';
    SELECT id INTO cat_morphosis FROM public.categories WHERE slug = 'morphosis-professional';
    SELECT id INTO cat_proteins FROM public.categories WHERE slug = 'professional-proteins';

    -- Electrical Styling
    INSERT INTO public.products (sku, name_ar, name_en, category_id, retail_price, slug, description_ar)
    VALUES
        ('EL-MC-V2-01', 'مكبس شعر MC (صيني نخب أول)', 'MC Hair Press (Chinese Premium)', cat_electrical, 35.000, 'mc-hair-press-chinese-premium', 'مكبس شعر صيني نخب أول'),
        ('EL-TURBO-V2-02', 'سشوار تيربو ستار (ايطالي)', 'Turbo Star Hair Dryer (Italian)', cat_electrical, 40.000, 'turbo-star-hair-dryer-italian', 'سشوار تيربو ستار إيطالي')
    ON CONFLICT (sku) DO UPDATE SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en, retail_price = EXCLUDED.retail_price, is_active = true;

    -- Beto Lenses (4 variants, one product line in source)
    INSERT INTO public.products (sku, name_ar, name_en, category_id, retail_price, slug, description_ar)
    VALUES
        ('LENS-MED-V2-01', 'عدسات بيتو - طبي (كوري)', 'Beto Lenses - Medical (Korean)', cat_lenses, 25.000, 'beto-lenses-medical-korean', 'عدسات بيتو طبي كوري'),
        ('LENS-BOOR-V2-02', 'عدسات بيتو - بور (كوري)', 'Beto Lenses - Boor (Korean)', cat_lenses, 25.000, 'beto-lenses-boor-korean', 'عدسات بيتو بور كوري'),
        ('LENS-COLOR-V2-03', 'عدسات بيتو - ملون (كوري)', 'Beto Lenses - Colored (Korean)', cat_lenses, 25.000, 'beto-lenses-colored-korean', 'عدسات بيتو ملون كوري'),
        ('LENS-COSM-V2-04', 'عدسات بيتو - تجميلي (كوري)', 'Beto Lenses - Cosmetic (Korean)', cat_lenses, 25.000, 'beto-lenses-cosmetic-korean', 'عدسات بيتو تجميلي كوري')
    ON CONFLICT (sku) DO UPDATE SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en, retail_price = EXCLUDED.retail_price, is_active = true;

    -- Plasma Hair Care
    INSERT INTO public.products (sku, name_ar, name_en, category_id, retail_price, slug, description_ar)
    VALUES
        ('PL-SHMP-500-V2-01', 'شامبو بلازما 500 مل (محلي / أردني)', 'Plasma Shampoo 500ml (Local / Jordanian)', cat_plasma, 13.000, 'plasma-shampoo-500ml-v2', 'شامبو بلازما محلي أردني'),
        ('PL-COND-500-V2-02', 'بلسم بلازما 500 مل (محلي / أردني)', 'Plasma Conditioner 500ml (Local / Jordanian)', cat_plasma, 13.000, 'plasma-conditioner-500ml-v2', 'بلسم بلازما محلي أردني'),
        ('PL-TREAT-500-V2-03', 'تريتمنت بلازما 500 مل (محلي / أردني)', 'Plasma Treatment 500ml (Local / Jordanian)', cat_plasma, 15.000, 'plasma-treatment-500ml-v2', 'تريتمنت بلازما محلي أردني'),
        ('PL-SERUM-100-V2-04', 'سيروم بلازما 100 مل (محلي / أردني)', 'Plasma Serum 100ml (Local / Jordanian)', cat_plasma, 15.000, 'plasma-serum-100ml-v2', 'سيروم بلازما محلي أردني'),
        ('PL-TREAT-100-GIFT-V2-05', 'تريتمنت بلازما 100 مل - هدية (غير مدفوع)', 'Plasma Treatment 100ml - Gift (Unpaid)', cat_plasma, 0.000, 'plasma-treatment-100ml-gift', 'تريتمنت بلازما 100 مل يوزع كهدية ترويجية غير مدفوعة')
    ON CONFLICT (sku) DO UPDATE SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en, retail_price = EXCLUDED.retail_price, is_active = true;

    -- Argan Hair Care
    INSERT INTO public.products (sku, name_ar, name_en, category_id, retail_price, slug, description_ar)
    VALUES
        ('ARG-PKG-HYDRO-REP-500-V2-01', 'بكج الارغان [شامبو + بلسم] 500 مل - هيدرو/ريبير (الماني)', 'Argan Package [Shampoo + Conditioner] 500ml - Hydro/Repair (German)', cat_argan, 32.000, 'argan-package-hydro-repair-500ml', 'بكج الارغان الألماني هيدرو ريبير شامبو وبلسم 500 مل')
    ON CONFLICT (sku) DO UPDATE SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en, retail_price = EXCLUDED.retail_price, is_active = true;

    -- Morphosis Professional (Italian)
    INSERT INTO public.products (sku, name_ar, name_en, category_id, retail_price, slug, description_ar)
    VALUES
        ('MOR-REPAIR-SET-1L-V2-01', 'مورفوسيس ريبير [شامبو + بلسم] 1 لتر', 'Morphosis Repair Set [Shampoo + Conditioner] 1L', cat_morphosis, 52.000, 'morphosis-repair-set-1l-v2', 'مورفوسيس ريبير شامبو وبلسم لتر'),
        ('MOR-SUBLIMES-SET-1L-V2-02', 'مورفوسيس سبليمز [شامبو + بلسم] 1 لتر', 'Morphosis Sublimes Set [Shampoo + Conditioner] 1L', cat_morphosis, 52.000, 'morphosis-sublimes-set-1l-v2', 'مورفوسيس سبليمز شامبو وبلسم لتر'),
        ('MOR-RESTRUCT-SET-250-V2-03', 'مورفوسيس ريستركشر [شامبو + بلسم] 250 مل', 'Morphosis Restructure Set [Shampoo + Conditioner] 250ml', cat_morphosis, 23.000, 'morphosis-restructure-set-250ml-v2', 'مورفوسيس ريستركشر شامبو وبلسم 250 مل'),
        ('MOR-RESTRUCT-SET-1L-V2-04', 'مورفوسيس ريستركشر [شامبو + بلسم] 1 لتر', 'Morphosis Restructure Set [Shampoo + Conditioner] 1L', cat_morphosis, 52.000, 'morphosis-restructure-set-1l-v2', 'مورفوسيس ريستركشر شامبو وبلسم لتر'),
        ('MOR-LEAVEIN-150-V2-05', 'مورفوسيس ليف آن 150 مل', 'Morphosis Leave-In 150ml', cat_morphosis, 23.000, 'morphosis-leave-in-150ml-v2', 'مورفوسيس ليف آن 150 مل'),
        ('MOR-SERUM-150-V2-06', 'مورفوسيس سيروم 150 مل', 'Morphosis Serum 150ml', cat_morphosis, 25.000, 'morphosis-serum-150ml-v2', 'مورفوسيس سيروم 150 مل'),
        ('MOR-FILLER-1L-V2-07', 'مورفوسيس فيلر 1 لتر', 'Morphosis Filler 1L', cat_morphosis, 125.000, 'morphosis-filler-1l-v2', 'مورفوسيس فيلر لتر'),
        ('MOR-FILLER-150-V2-08', 'مورفوسيس فيلر 150 مل', 'Morphosis Filler 150ml', cat_morphosis, 43.000, 'morphosis-filler-150ml-v2', 'مورفوسيس فيلر 150 مل'),
        ('MOR-FALLKIT-NAHDI-V2-09', 'كت التساقط (بكج 2 / امبولة) - لون نهدي', 'Hair-Loss Kit (Pack of 2 / Ampoule) - Nahdi Color', cat_morphosis, 56.000, 'fall-kit-nahdi-v2', 'كت التساقط لون نهدي بكج 2 امبولة'),
        ('MOR-FALLKIT-BLUE-V2-10', 'كت التساقط (بكج 2 / امبولة) - لون أزرق', 'Hair-Loss Kit (Pack of 2 / Ampoule) - Blue Color', cat_morphosis, 56.000, 'fall-kit-blue-v2', 'كت التساقط لون أزرق بكج 2 امبولة')
    ON CONFLICT (sku) DO UPDATE SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en, retail_price = EXCLUDED.retail_price, is_active = true;

    -- Professional Proteins (Brazilian line)
    INSERT INTO public.products (sku, name_ar, name_en, category_id, retail_price, slug, description_ar)
    VALUES
        ('PROT-SP-SILVER-1L-V2-01', 'بروتين SP فضي (Violet) 1 لتر', 'SP Protein Silver (Violet) 1L', cat_proteins, 125.000, 'sp-protein-silver-1l', 'بروتين SP فضي فايوليت لتر'),
        ('PROT-SP-SILVER-150-V2-02', 'بروتين SP فضي (Violet) 150 مل', 'SP Protein Silver (Violet) 150ml', cat_proteins, 35.000, 'sp-protein-silver-150ml', 'بروتين SP فضي فايوليت 150 مل'),
        ('PROT-SP-GOLD-1L-V2-03', 'بروتين SP ذهبي (Gold) 1 لتر', 'SP Protein Gold 1L', cat_proteins, 115.000, 'sp-protein-gold-1l', 'بروتين SP ذهبي لتر'),
        ('PROT-SP-GOLD-150-V2-04', 'بروتين SP ذهبي (Gold) 150 مل', 'SP Protein Gold 150ml', cat_proteins, 30.000, 'sp-protein-gold-150ml', 'بروتين SP ذهبي 150 مل'),
        ('PROT-MARACUJA-HONEY-1L-V2-05', 'بروتين ماركوجا العسل (بلس) 1 لتر', 'Maracuja Honey Protein (Plus) 1L', cat_proteins, 115.000, 'maracuja-honey-protein-1l', 'بروتين ماركوجا العسل بلس لتر'),
        ('PROT-MARACUJA-HONEY-100-V2-06', 'بروتين ماركوجا العسل (بلس) 100 مل', 'Maracuja Honey Protein (Plus) 100ml', cat_proteins, 25.000, 'maracuja-honey-protein-100ml', 'بروتين ماركوجا العسل بلس 100 مل'),
        ('PROT-MARACUJA-BLACK-1L-V2-07', 'بروتين ماركوجا المطور (الاسود) 1 لتر', 'Maracuja Advanced Protein (Black) 1L', cat_proteins, 85.000, 'maracuja-advanced-protein-1l', 'بروتين ماركوجا المطور الاسود لتر'),
        ('PROT-MARACUJA-BLACK-100-V2-08', 'بروتين ماركوجا المطور (الاسود) 100 مل', 'Maracuja Advanced Protein (Black) 100ml', cat_proteins, 25.000, 'maracuja-advanced-protein-100ml', 'بروتين ماركوجا المطور الاسود 100 مل'),
        ('PROT-DEVAY-PINK-1L-V2-09', 'بروتين ديفاي بلكس (الزهري) 1 لتر', 'Devay Plex Protein (Pink) 1L', cat_proteins, 85.000, 'devay-plex-protein-pink-1l', 'بروتين ديفاي بلكس الزهري لتر'),
        ('PROT-DEVAY-PINK-100-V2-10', 'بروتين ديفاي بلكس (الزهري) 100 مل', 'Devay Plex Protein (Pink) 100ml', cat_proteins, 25.000, 'devay-plex-protein-pink-100ml', 'بروتين ديفاي بلكس الزهري 100 مل'),
        ('PROT-DEVAY-BLUE-1L-V2-11', 'بروتين ديفاي بلو (الأزرق) 1 لتر', 'Devay Blue Protein 1L', cat_proteins, 90.000, 'devay-blue-protein-1l', 'بروتين ديفاي بلو الأزرق لتر'),
        ('PROT-DEVAY-BLUE-100-V2-12', 'بروتين ديفاي بلو (الأزرق) 100 مل', 'Devay Blue Protein 100ml', cat_proteins, 30.000, 'devay-blue-protein-100ml', 'بروتين ديفاي بلو الأزرق 100 مل'),
        ('PROT-THERAPY-1L-V2-13', 'بروتين الثيرابي (6×1) 1 لتر', 'Therapy Protein (6x1) 1L', cat_proteins, 85.000, 'therapy-protein-1l', 'بروتين الثيرابي 6x1 لتر'),
        ('PROT-THERAPY-100-V2-14', 'بروتين الثيرابي (6×1) 100 مل', 'Therapy Protein (6x1) 100ml', cat_proteins, 25.000, 'therapy-protein-100ml', 'بروتين الثيرابي 6x1 100 مل')
    ON CONFLICT (sku) DO UPDATE SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en, retail_price = EXCLUDED.retail_price, is_active = true;

    -- Initialize inventory rows for every new product (real stock to be entered via actual purchase_in movements)
    INSERT INTO public.inventory (product_id, quantity_on_hand, quantity_reserved, reorder_level)
    SELECT id, 0, 0, 10 FROM public.products WHERE sku LIKE '%-V2-%'
    ON CONFLICT (product_id) DO NOTHING;

END $$;

COMMIT;
