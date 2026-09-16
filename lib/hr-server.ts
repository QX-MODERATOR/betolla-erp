// Server-only HR input validation. Everything is normalized here before it
// reaches the business_hr_* RPCs (which re-check the invariants that matter).
import { BusinessError, text, money, date } from '@/lib/business-server';
import { SYSTEM_ACCOUNTS } from '@/lib/auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'intern', 'freelance'];
const STATUSES = ['active', 'probation', 'on_leave', 'suspended', 'terminated'];
const GENDERS = ['male', 'female'];
const MARITAL = ['single', 'married', 'divorced', 'widowed'];

export function uuid(value: unknown, label = 'المعرّف'): string {
  const v = text(value, 36);
  if (!UUID_RE.test(v)) throw new BusinessError(`${label} غير صالح.`);
  return v;
}

function optionalUuid(value: unknown, label: string): string {
  const v = text(value, 36);
  if (v && !UUID_RE.test(v)) throw new BusinessError(`${label} غير صالح.`);
  return v;
}

function oneOf(value: unknown, allowed: string[], label: string, allowEmpty = true): string {
  const v = text(value, 40);
  if ((!v && allowEmpty) || allowed.includes(v)) return v;
  throw new BusinessError(`${label} غير صالح.`);
}

function phone(value: unknown): string {
  let v = text(value, 40).replace(/[^\d+]/g, '');
  if (!v) return '';
  if (v.startsWith('+962')) v = '0' + v.slice(4);
  else if (v.startsWith('962')) v = '0' + v.slice(3);
  if (!/^\+?\d{7,15}$/.test(v)) throw new BusinessError('رقم الهاتف غير صالح.');
  return v;
}

function email(value: unknown): string {
  const v = text(value, 200).toLowerCase();
  if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new BusinessError('البريد الإلكتروني غير صالح.');
  return v;
}

function accountId(value: unknown): string {
  const v = text(value, 100);
  if (v && !SYSTEM_ACCOUNTS.some((a) => a.profile.id === v)) throw new BusinessError('حساب الدخول المحدد غير موجود.');
  return v;
}

function iban(value: unknown): string {
  const v = text(value, 60).replace(/\s+/g, '').toUpperCase();
  if (v && !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v)) throw new BusinessError('رقم IBAN غير صالح.');
  return v;
}

// Each field: how to normalize it. Unknown keys in the request are ignored.
const FIELD_PARSERS: Record<string, (v: unknown) => string | number> = {
  account_id: accountId,
  full_name_ar: (v) => text(v, 200),
  full_name_en: (v) => text(v, 200),
  national_id: (v) => text(v, 40),
  nationality: (v) => text(v, 80),
  gender: (v) => oneOf(v, GENDERS, 'الجنس'),
  birth_date: (v) => date(v) || '',
  marital_status: (v) => oneOf(v, MARITAL, 'الحالة الاجتماعية'),
  phone,
  email,
  city: (v) => text(v, 200),
  address: (v) => text(v, 1000),
  emergency_name: (v) => text(v, 200),
  emergency_phone: phone,
  emergency_relation: (v) => text(v, 80),
  department_id: (v) => optionalUuid(v, 'القسم'),
  job_title: (v) => text(v, 200),
  manager_id: (v) => optionalUuid(v, 'المدير المباشر'),
  employment_type: (v) => oneOf(v, EMPLOYMENT_TYPES, 'نوع التوظيف', false),
  hire_date: (v) => date(v) || '',
  probation_end_date: (v) => date(v) || '',
  contract_end_date: (v) => date(v) || '',
  status: (v) => oneOf(v, STATUSES, 'حالة الموظف', false),
  termination_date: (v) => date(v) || '',
  termination_reason: (v) => text(v, 1000),
  basic_salary: (v) => (v === '' || v === null || v === undefined ? 0 : money(v)),
  bank_name: (v) => text(v, 200),
  iban,
  ssc_number: (v) => text(v, 40),
  notes: (v) => text(v, 4000),
};

function parseFields(raw: unknown): Record<string, string | number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BusinessError('بيانات الموظف غير صالحة.');
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const parse = FIELD_PARSERS[key];
    if (parse && value !== undefined) out[key] = parse(value);
  }
  return out;
}

function checkDates(f: Record<string, string | number>) {
  const hire = f.hire_date as string | undefined;
  for (const key of ['probation_end_date', 'contract_end_date', 'termination_date']) {
    const v = f[key] as string | undefined;
    if (hire && v && v < hire) throw new BusinessError(`${key === 'termination_date' ? 'تاريخ انتهاء الخدمة' : key === 'contract_end_date' ? 'نهاية العقد' : 'نهاية التجربة'} يجب أن يكون بعد تاريخ التعيين.`);
  }
  if (f.birth_date && hire && (f.birth_date as string) >= hire) throw new BusinessError('تاريخ الميلاد يجب أن يسبق تاريخ التعيين.');
  if (f.status === 'terminated' && f.termination_date === '') throw new BusinessError('تاريخ انتهاء الخدمة مطلوب عند إنهاء الخدمة.');
}

export function prepareEmployeeCreate(body: Record<string, unknown>) {
  const fields = parseFields(body.fields);
  if (!fields.full_name_ar) throw new BusinessError('اسم الموظف بالعربية مطلوب.');
  if (!fields.hire_date) throw new BusinessError('تاريخ التعيين مطلوب.');
  if (fields.status === 'terminated' && !fields.termination_date) throw new BusinessError('تاريخ انتهاء الخدمة مطلوب عند إنهاء الخدمة.');
  checkDates(fields);
  return { fields };
}

export function prepareEmployeeUpdate(body: Record<string, unknown>) {
  const id = uuid(body.id, 'معرّف الموظف');
  const fields = parseFields(body.fields);
  if (!Object.keys(fields).length) throw new BusinessError('لا توجد تغييرات للحفظ.');
  if ('full_name_ar' in fields && !fields.full_name_ar) throw new BusinessError('اسم الموظف بالعربية مطلوب.');
  if ('hire_date' in fields && !fields.hire_date) throw new BusinessError('تاريخ التعيين مطلوب.');
  checkDates(fields);
  const expected = text(body.expected_updated_at, 60);
  if (expected && !Number.isFinite(Date.parse(expected))) throw new BusinessError('نسخة السجل غير صالحة.');
  return { id, fields, ...(expected ? { expected_updated_at: expected } : {}) };
}

export function prepareDepartment(body: Record<string, unknown>) {
  const id = optionalUuid(body.id, 'القسم');
  const name_ar = text(body.name_ar, 120);
  if (!name_ar) throw new BusinessError('اسم القسم مطلوب.');
  const code = text(body.code, 40).toLowerCase();
  if (!id && !/^[a-z][a-z0-9_]{1,39}$/.test(code)) throw new BusinessError('رمز القسم يجب أن يكون أحرفًا إنجليزية صغيرة/أرقامًا (مثل: customer_care).');
  const data: Record<string, unknown> = {
    name_ar, name_en: text(body.name_en, 120), head_employee_id: optionalUuid(body.head_employee_id, 'رئيس القسم'),
  };
  if (id) {
    data.id = id;
    if (body.is_active !== undefined) {
      if (typeof body.is_active !== 'boolean') throw new BusinessError('حالة القسم غير صالحة.');
      data.is_active = body.is_active;
    }
  } else data.code = code;
  return data;
}

// Login accounts that can be linked to an employee record (id + display name only).
export function linkableAccounts() {
  return SYSTEM_ACCOUNTS.map((a) => ({ id: a.profile.id, username: a.profile.username, name: a.profile.name, role: a.profile.role }));
}
