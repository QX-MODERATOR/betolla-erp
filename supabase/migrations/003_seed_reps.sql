-- Betolla Cosmetics ERP Seed Data
-- 003_seed_reps.sql

INSERT INTO public.profiles (full_name_ar, full_name_en, role)
VALUES
    ('حمزة', 'Hamza', 'sales_rep'),
    ('رحمه', 'Rahma', 'sales_rep'),
    ('صابرين', 'Sabreen', 'sales_rep'),
    ('حنان', 'Hanan', 'sales_rep'),
    ('سارة', 'Sara', 'sales_rep'),
    ('حنين', 'Haneen', 'sales_rep'),
    ('شهد', 'Shahd', 'sales_rep'),
    ('رشا', 'Rasha', 'sales_rep'),
    ('كريمة', 'Kareema', 'sales_rep'),
    ('حليمة', 'Haleema', 'sales_rep'),
    ('عرين', 'Areen', 'sales_rep'),
    ('لارا', 'Lara', 'sales_rep'),
    ('رهف', 'Rahaf', 'sales_rep'),
    ('مسلم', 'Moslem', 'sales_rep'),
    ('المدير العام', 'General Manager', 'admin')
ON CONFLICT (id) DO NOTHING;
