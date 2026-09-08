-- Betolla Cosmetics ERP Seed Data
-- 002_seed_products.sql

-- 1. Insert Categories
INSERT INTO public.categories (slug, name_ar, name_en, display_order)
VALUES
    ('hair-care', 'العناية بالشعر', 'Hair Care', 1),
    ('morphosis-professional', 'مورفوزيس بروفيشنال الإيطالي', 'Morphosis Professional', 2),
    ('plasma-hair-care', 'بلازما العناية بالشعر', 'Plasma Hair Care', 3),
    ('argan-hair-care', 'العناية بالشعر بالأرجان', 'Argan Hair Care', 4),
    ('professional-proteins', 'بروتينات الشعر الاحترافية', 'Professional Hair Proteins', 5),
    ('beto-lenses', 'عدسات بيتو ومستلزماتها', 'Beto Contact Lenses', 6),
    ('electrical-styling', 'أجهزة التصفيف الكهربائية', 'Electrical Styling Tools', 7)
ON CONFLICT (slug) DO UPDATE 
SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en;

-- 2. Insert Products
DO $$
DECLARE
    cat_electrical UUID;
    cat_lenses UUID;
    cat_plasma UUID;
    cat_morphosis UUID;
    cat_argan UUID;
    cat_proteins UUID;
BEGIN
    SELECT id INTO cat_electrical FROM public.categories WHERE slug = 'electrical-styling';
    SELECT id INTO cat_lenses FROM public.categories WHERE slug = 'beto-lenses';
    SELECT id INTO cat_plasma FROM public.categories WHERE slug = 'plasma-hair-care';
    SELECT id INTO cat_morphosis FROM public.categories WHERE slug = 'morphosis-professional';
    SELECT id INTO cat_argan FROM public.categories WHERE slug = 'argan-hair-care';
    SELECT id INTO cat_proteins FROM public.categories WHERE slug = 'professional-proteins';

    -- Electrical Styling
    INSERT INTO public.products (sku, name_ar, name_en, category_id, retail_price, cost_price, sale_price, slug, description_ar)
    VALUES
        ('EL-GAMMA-01', 'سشوار جاما توربو ستار', 'Gamma Turbo Star Hair Dryer', cat_electrical, 45.000, 25.000, NULL, 'gamma-turbo-star-hair-dryer', 'سشوار احترافي عالي الأداء بقدرة تصل إلى 2500 واط للاستخدام الصالوني والمنزلي'),
        ('EL-MAC-02', 'مملس الشعر الاحترافي ماك', 'MAC Professional Hair Straightener', cat_electrical, 35.000, 18.000, NULL, 'mac-professional-hair-straightener', 'مملس تيتانيوم احترافي بحرارة سريعة وتحكم رقمي دقيق')
    ON CONFLICT (sku) DO NOTHING;

    -- Beto Lenses
    INSERT INTO public.products (sku, name_ar, name_en, category_id, retail_price, cost_price, sale_price, slug, description_ar)
    VALUES
        ('LENS-CARE-01', 'طقم العناية بعدسات بيتو', 'Beto Lens Care Kit', cat_lenses, 25.000, 10.000, 22.500, 'beto-lens-care-kit', 'محلول ومستلزمات متكاملة للعناية بالعدسات اللاصقة'),
        ('LENS-VENUS-02', 'عدسات بيتو فينوس اللاصقة', 'Beto Venus Contact Lenses', cat_lenses, 25.000, 11.000, 22.500, 'beto-venus-contact-lenses', 'عدسات لاصقة تجميلية كورية من السيليكون هيدروجيل مريحة للارتداء اليومي')
    ON CONFLICT (sku) DO NOTHING;

    -- Plasma Hair Care
    INSERT INTO public.products (sku, name_ar, name_en, category_id, retail_price, cost_price, sale_price, slug, description_ar)
    VALUES
        ('PL-SERUM-01', 'سيروم بلازما للشعر', 'Plasma Hair Serum', cat_plasma, 14.000, 6.000, 12.600, 'plasma-hair-serum', 'سيروم مغذي ومجدد لألياف الشعر'),
        ('PL-SHAMP-02', 'شامبو بلازما للشعر', 'Plasma Shampoo', cat_plasma, 13.000, 5.500, 11.700, 'plasma-shampoo', 'شامبو احترافي ينظف ويغذي بعمق'),
        ('PL-MASK-03', 'ماسك بلازما للشعر', 'Plasma Hair Mask', cat_plasma, 14.000, 6.000, 12.600, 'plasma-hair-mask', 'حمام كريم وماسك مركز لترميم الشعر التالف'),
        ('PL-COND-04', 'بلسم بلازما للشعر', 'Plasma Conditioner', cat_plasma, 13.000, 5.500, 11.700, 'plasma-conditioner', 'بلسم مرطب يعيد النعومة واللمعان'),
        ('PL-SET4-05', 'بكج بلازما الرباعي المتكامل', 'Plasma Complete Four-Piece Set', cat_plasma, 37.000, 17.000, 33.300, 'plasma-complete-four-piece-set', 'مجموعة العناية الرباعية المتكاملة من بلازما (شامبو + بلسم + ماسك + سيروم)'),
        ('PL-SET2-06', 'مجموعة شامبو وبلسم بلازما', 'Plasma Shampoo & Conditioner Set', cat_plasma, 25.000, 11.000, 22.500, 'plasma-shampoo-conditioner-set', 'عرض التوفير لشامبو وبلسم بلازما')
    ON CONFLICT (sku) DO NOTHING;

    -- Morphosis Professional (Framesi Italy)
    INSERT INTO public.products (sku, name_ar, name_en, category_id, retail_price, cost_price, sale_price, slug, description_ar)
    VALUES
        ('MOR-REINF-01', 'أمبولات وشامبو مورفوزيس المقوي (رينفورسينج)', 'Morphosis Reinforcing Ampoules & Shampoo', cat_morphosis, 52.000, 26.000, 46.800, 'morphosis-reinforcing-ampoules-shampoo', 'برنامج مكثف بخلاصة الخلايا الجذعية للعنب للشعر الخفيف والفروة الدهنية'),
        ('MOR-DENS-02', 'أمبولات وشامبو مورفوزيس لتكثيف الشعر (دنسيفاينج)', 'Morphosis Densifying Ampoules & Shampoo', cat_morphosis, 52.000, 26.000, 46.800, 'morphosis-densifying-ampoules-shampoo', 'برنامج مركز بخلاصة الخلايا الجذعية للتفاح لتقليل التساقط الموسمي وزيادة الكثافة'),
        ('MOR-REST-100-03', 'مجموعة فيلر ترميم مورفوزيس 100 مل', 'Morphosis Restructure Filler Set 100 ml', cat_morphosis, 40.000, 20.000, 36.000, 'morphosis-restructure-filler-set-100-ml', 'نظام ترميم من 3 خطوات للشعر شديد التلف'),
        ('MOR-LEAV-125-04', 'ليف ان مورفوزيس ريستركتشر 125 مل', 'Morphosis Restructure Leave-In 125 ml', cat_morphosis, 20.000, 9.000, 18.000, 'morphosis-restructure-leave-in-125-ml', 'علاج يترك على الشعر لفك التشابك ومنع التقصف والنفشة'),
        ('MOR-OIL-SER-05', 'سيروم زيت مورفوزيس سوبليميس', 'Morphosis Sublimis Oil Serum', cat_morphosis, 20.000, 9.000, 18.000, 'morphosis-sublimis-oil-serum', 'سيروم خفيف غير دهني بزيت الأرجان وزيت زهرة الآلام وفيتامين C'),
        ('MOR-OIL-COND-1L-06', 'بلسم زيت مورفوزيس سوبليميس 1000 مل', 'Morphosis Sublimis Oil Conditioner 1000 ml', cat_morphosis, 25.000, 12.000, 22.500, 'morphosis-sublimis-oil-conditioner-1000-ml', 'عناية مغذية بالزيوت لترطيب وحماية الشعر من الجفاف بحجم صالوني لتر'),
        ('MOR-OIL-SHMP-1L-07', 'شامبو زيت مورفوزيس سوبليميس 1000 مل', 'Morphosis Sublimis Oil Shampoo 1000 ml', cat_morphosis, 25.000, 12.000, 22.500, 'morphosis-sublimis-oil-shampoo-1000-ml', 'شامبو غني بزيت الأرجان لتغذية الشعر بحجم لتر'),
        ('MOR-OIL-SET-1L-08', 'مجموعة زيت مورفوزيس سوبليميس لتر (شامبو + بلسم)', 'Morphosis Sublimis Oil Set 1000 ml', cat_morphosis, 50.000, 22.000, 45.000, 'morphosis-sublimis-oil-set-1000-ml', 'بكج لتر المتكامل سوبليميس أويل'),
        ('MOR-REST-SET-250-09', 'مجموعة ترميم مورفوزيس ريستركتشر 250 مل', 'Morphosis Restructure Set 250 ml', cat_morphosis, 23.000, 11.000, 20.700, 'morphosis-restructure-set-250-ml', 'مجموعة ترميم للشعر التالف والمعالج كيميائياً بخلاصة الأرز المخمر والكولاجين النباتي'),
        ('MOR-REST-COND-1L-10', 'بلسم ترميم مورفوزيس ريستركتشر 1000 مل', 'Morphosis Restructure Conditioner 1000 ml', cat_morphosis, 25.000, 12.000, 22.500, 'morphosis-restructure-conditioner-1000-ml', 'بلسم ترميم احترافي بحجم لتر للشعر التالف'),
        ('MOR-REST-SHMP-1L-11', 'شامبو ترميم مورفوزيس ريستركتشر 1000 مل', 'Morphosis Restructure Shampoo 1000 ml', cat_morphosis, 25.000, 12.000, 22.500, 'morphosis-restructure-shampoo-1000-ml', 'شامبو ترميم احترافي بحجم لتر'),
        ('MOR-REST-SET-1L-12', 'مجموعة ترميم مورفوزيس ريستركتشر لتر', 'Morphosis Restructure Set 1000 ml', cat_morphosis, 50.000, 22.000, 45.000, 'morphosis-restructure-set-1000-ml', 'بكج لتر ريستركتشر ترميم للشعر المعالج'),
        ('MOR-REP-COND-1L-13', 'بلسم معالجة مورفوزيس ريبير 1000 مل', 'Morphosis Repair Conditioner 1000 ml', cat_morphosis, 25.000, 12.000, 22.500, 'morphosis-repair-conditioner-1000-ml', 'بلسم إصلاح إيطالي احترافي بزيت الكاميليا والميكرو كيراتين'),
        ('MOR-REP-SHMP-1L-14', 'شامبو معالجة مورفوزيس ريبير 1000 مل', 'Morphosis Repair Shampoo 1000 ml', cat_morphosis, 25.000, 12.000, 22.500, 'morphosis-repair-shampoo-1000-ml', 'شامبو إصلاح إيطالي للشعر الجاف والتالف'),
        ('MOR-REP-SET-1L-15', 'مجموعة معالجة مورفوزيس ريبير 1000 مل', 'Morphosis Repair Set 1000 ml', cat_morphosis, 50.000, 22.000, 45.000, 'morphosis-repair-set-1000-ml', 'بكج لتر ريبير المتكامل (شامبو + بلسم)')
    ON CONFLICT (sku) DO NOTHING;

    -- Argan Hair Care
    INSERT INTO public.products (sku, name_ar, name_en, category_id, retail_price, cost_price, sale_price, slug, description_ar)
    VALUES
        ('ARG-REP-COND-500-01', 'بلسم أرجان ريبير 500 مل', 'Argan Repair Conditioner 500 ml', cat_argan, 18.000, 8.000, 16.200, 'argan-repair-conditioner-500-ml', 'بلسم زيت الأرجان والشيا والكيراتين للشعر المعالج كيميائياً'),
        ('ARG-REP-SHMP-500-02', 'شامبو أرجان ريبير 500 مل', 'Argan Repair Shampoo 500 ml', cat_argan, 18.000, 8.000, 16.200, 'argan-repair-shampoo-500-ml', 'شامبو زيت الأرجان لإصلاح الشعر وتقوية الألياف'),
        ('ARG-REP-SET-500-03', 'مجموعة أرجان ريبير (شامبو + بلسم)', 'Argan Repair Shampoo & Conditioner Set', cat_argan, 32.000, 15.000, 28.800, 'argan-repair-shampoo-conditioner-set', 'بكج أرجان ريبير المتكامل للشعر التالف'),
        ('ARG-HYD-COND-500-04', 'بلسم أرجان هايدرو مرطب 500 مل', 'Argan Hydro Conditioner 500 ml', cat_argan, 18.000, 8.000, 16.200, 'argan-hydro-conditioner-500-ml', 'بلسم فائق الترطيب بزيت الأرجان وفيتامين E للشعر الجاف والمتطاير'),
        ('ARG-HYD-SHMP-500-05', 'شامبو أرجان هايدرو مرطب 500 مل', 'Argan Hydro Shampoo 500 ml', cat_argan, 18.000, 8.000, 16.200, 'argan-hydro-shampoo-500-ml', 'شامبو مرطب بزيت الأرجان والكيراتين'),
        ('ARG-HYD-SET-500-06', 'مجموعة أرجان هايدرو المرطبة (شامبو + بلسم)', 'Argan Hydro Shampoo & Conditioner Set', cat_argan, 32.000, 15.000, 28.800, 'argan-hydro-shampoo-conditioner-set', 'بكج الترطيب المتكامل من أرجان هايدرو')
    ON CONFLICT (sku) DO NOTHING;

    -- Professional Proteins
    INSERT INTO public.products (sku, name_ar, name_en, category_id, retail_price, cost_price, sale_price, slug, description_ar)
    VALUES
        ('PROT-MARACUJA-100', 'بروتين ماراكوجا الاحترافي 100 مل', 'Professional Maracuja Protein 100 ml', cat_proteins, 25.000, 12.000, 22.000, 'professional-maracuja-protein-100ml', 'علاج بروتين ماراكوجا البرازيلي لفرد وتغذية الشعر بحجم 100 مل'),
        ('PROT-MARACUJA-250', 'بروتين ماراكوجا الاحترافي 250 مل', 'Professional Maracuja Protein 250 ml', cat_proteins, 45.000, 22.000, 40.000, 'professional-maracuja-protein-250ml', 'علاج بروتين ماراكوجا الاحترافي بحجم 250 مل'),
        ('PROT-MARACUJA-1L', 'بروتين ماراكوجا الاحترافي 1000 مل (لتر)', 'Professional Maracuja Protein 1000 ml', cat_proteins, 120.000, 60.000, 105.000, 'professional-maracuja-protein-1000ml', 'بروتين فرد الشعر الاحترافي للصالونات بحجم لتر')
    ON CONFLICT (sku) DO NOTHING;

    -- Initialize Inventory for all products
    INSERT INTO public.inventory (product_id, quantity_on_hand, quantity_reserved, reorder_level)
    SELECT id, 50, 0, 10 FROM public.products
    ON CONFLICT (product_id) DO NOTHING;

END $$;
