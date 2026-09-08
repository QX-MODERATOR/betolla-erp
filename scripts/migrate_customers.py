"""
Betolla Cosmetics ERP - Customer Data Migration & Normalization Script
Reads 'customers_cleaned.xlsx' and prepares normalized customer and call log records.
Generates batch SQL files and can push directly to PostgreSQL.
"""

import os
import re
import sys
from datetime import datetime
import openpyxl

# Set UTF-8 encoding
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

EXCEL_PATH = os.path.abspath(r"c:\Users\QX\Desktop\Betolla System\customers_cleaned.xlsx")
OUTPUT_SQL_DIR = os.path.abspath(r"c:\Users\QX\Desktop\Betolla System\betolla-erp\migration_data")
os.makedirs(OUTPUT_SQL_DIR, exist_ok=True)

# Normalization Mappings
TYPE_MAPPING = {
    'end user': 'end_user',
    'end users': 'end_user',
    'شخصي': 'end_user',
    'زبونة': 'end_user',
    'صالون': 'salon',
    'صالونات': 'salon',
    'salon': 'salon',
    'صيدلية': 'pharmacy',
    'صيدليات': 'pharmacy',
    'عيادة': 'clinic',
    'دكتور': 'clinic',
    'جملة': 'wholesale',
    'بيع': 'sale',
    'حجز': 'sale',
    'بيتي': 'salon',
    'home': 'salon',
    'هدية': 'gift',
    'فري': 'gift',
    'عينات': 'gift',
    'عينه': 'gift',
}

SOURCE_MAPPING = {
    'sales': 'sales',
    'مبيعات': 'sales',
    'sales 2024': 'sales',
    'social media': 'social_media',
    'السوشال ميديا': 'social_media',
    'سوشيال': 'social_media',
    'سوشال': 'social_media',
    'الدكتور': 'doctor',
    'doctor phone': 'doctor',
    'محول من الدكتور': 'doctor',
    'جوجل ماب': 'google_maps',
    'whatsapp gm data': 'whatsapp',
    'crm old data': 'crm_legacy',
    'crm data': 'crm_legacy',
    'crm': 'crm_legacy',
    'الهاتف': 'phone',
    'phone data': 'phone',
    'commercial': 'commercial',
    'non-commercial': 'commercial',
    'عميل محتمل التأكد من اريج': 'unverified'
}

CLASSIFICATION_MAPPING = {
    'زبونة': 'customer',
    'تم': 'customer',
    'end user': 'customer',
    'social_media_cold': 'cold_lead',
    'شخصي': 'personal',
    'صالون': 'salon',
    'صالونات': 'salon',
    'بيتي': 'home_based',
    'صيدليات': 'pharmacy',
    'صيدلية': 'pharmacy',
    'لا يوجد رد': 'no_response',
    'المكالمات موقوفة': 'no_response',
    'غير مهتم': 'not_interested',
    'مفصول': 'not_interested',
    'ليد من الدكتور': 'doctor_lead',
    'sales_call_repeat': 'repeat_caller',
    'social media': 'social_media',
    'غير معروف': 'unclassified',
    'غير مستعمل': 'unclassified'
}

KNOWN_REPS = {
    'حمزة', 'رحمه', 'صابرين', 'حنان', 'سارة', 'حنين', 
    'شهد', 'رشا', 'كريمة', 'حليمة', 'عرين', 'لارا', 'رهف', 'مسلم'
}

def clean_phone(phone_val):
    if not phone_val:
        return ""
    phone_str = str(phone_val).strip()
    digits = re.sub(r'[^\d+]', '', phone_str)
    if digits.startswith('+962'):
        digits = '0' + digits[4:]
    elif digits.startswith('962'):
        digits = '0' + digits[3:]
    return digits

def parse_date(date_val):
    if not date_val:
        return None
    if isinstance(date_val, datetime):
        return date_val.strftime('%Y-%m-%d')
    date_str = str(date_val).strip()
    if any(word in date_str for word in ['واتساب', 'رد', 'غير', 'خط', 'لا', 'مفصول']):
        return None
    for fmt in ('%d-%m-%Y', '%Y-%m-%d', '%d/%m/%Y', '%Y/%m/%d', '%y-%m-%d'):
        try:
            dt = datetime.strptime(date_str, fmt)
            if 2020 <= dt.year <= 2030:
                return dt.strftime('%Y-%m-%d')
        except ValueError:
            continue
    return None

def normalize_type(val):
    if not val:
        return 'end_user'
    k = str(val).strip().lower()
    return TYPE_MAPPING.get(k, 'other')

def normalize_source(val):
    if not val:
        return 'sales'
    k = str(val).strip().lower()
    return SOURCE_MAPPING.get(k, 'sales')

def normalize_classification(val):
    if not val:
        return 'customer'
    k = str(val).strip().lower()
    return CLASSIFICATION_MAPPING.get(k, 'other')

def escape_sql(val):
    if val is None:
        return "NULL"
    s = str(val).replace("'", "''")
    return f"'{s}'"

def main():
    print(f"Opening Excel file: {EXCEL_PATH}...")
    wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True, data_only=True)
    ws = wb.active
    print(f"Reading rows...")

    total_rows = 0
    valid_customers = 0
    chunk_size = 5000
    chunk_num = 1
    sql_statements = []

    for row in ws.iter_rows(min_row=2, values_only=True):
        total_rows += 1
        legacy_id = row[0]
        name = row[1] or "عميل غير محدد"
        phone = clean_phone(row[2])
        c_type = normalize_type(row[3])
        rep_raw = str(row[4]).strip() if row[4] else None
        order_date = parse_date(row[5])
        contact_date = parse_date(row[6])
        next_call_date = parse_date(row[7])
        address = str(row[8]).strip() if row[8] else None
        product_text = str(row[9]).strip() if row[9] else None
        lead_source = normalize_source(row[10])
        notes = str(row[11]).strip() if row[11] else None
        classification = normalize_classification(row[12])

        if not phone and not name:
            continue

        valid_customers += 1
        stmt = f"""({legacy_id or 'NULL'}, {escape_sql(name)}, {escape_sql(phone)}, '{c_type}', '{classification}', '{lead_source}', {escape_sql(address)}, {escape_sql(rep_raw)}, {escape_sql(notes)}, {escape_sql(contact_date)}, {escape_sql(next_call_date)}, {escape_sql(order_date)}, {escape_sql(product_text)})"""
        sql_statements.append(stmt)

        if len(sql_statements) >= chunk_size:
            chunk_file = os.path.join(OUTPUT_SQL_DIR, f"customers_chunk_{chunk_num}.sql")
            with open(chunk_file, "w", encoding="utf-8") as f:
                f.write("INSERT INTO public.customers (legacy_id, name, phone, customer_type, classification, lead_source, address, rep_name_raw, notes, last_contact_date, next_call_date, order_date, legacy_product_text)\nVALUES\n")
                f.write(",\n".join(sql_statements))
                f.write("\nON CONFLICT (legacy_id) DO NOTHING;\n")
            print(f"Wrote chunk {chunk_num}: {len(sql_statements)} records -> {chunk_file}")
            sql_statements = []
            chunk_num += 1

    if sql_statements:
        chunk_file = os.path.join(OUTPUT_SQL_DIR, f"customers_chunk_{chunk_num}.sql")
        with open(chunk_file, "w", encoding="utf-8") as f:
            f.write("INSERT INTO public.customers (legacy_id, name, phone, customer_type, classification, lead_source, address, rep_name_raw, notes, last_contact_date, next_call_date, order_date, legacy_product_text)\nVALUES\n")
            f.write(",\n".join(sql_statements))
            f.write("\nON CONFLICT (legacy_id) DO NOTHING;\n")
        print(f"Wrote final chunk {chunk_num}: {len(sql_statements)} records -> {chunk_file}")

    print(f"\nCompleted! Total rows processed: {total_rows}, Valid customers generated: {valid_customers} in {chunk_num} chunks.")

if __name__ == "__main__":
    main()
