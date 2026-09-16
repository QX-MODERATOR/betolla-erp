// Server-only HR input validation. Everything is normalized here before it
// reaches the business_hr_* RPCs (which re-check the invariants that matter).
import { BusinessError, businessRpc, text, money, date } from '@/lib/business-server';
import { SYSTEM_ACCOUNTS, type AuthUser } from '@/lib/auth';
import { canManageHr } from '@/lib/hr';

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

// ---------------------------------------------------------------- phase 2: attendance & leave

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function bool(value: unknown, label: string, fallback = false): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'boolean') throw new BusinessError(`${label} غير صالح.`);
  return value;
}

function time(value: unknown, label: string, allowEmpty = true): string {
  const v = text(value, 5);
  if ((!v && allowEmpty) || TIME_RE.test(v)) return v;
  throw new BusinessError(`${label} يجب أن يكون بصيغة HH:MM.`);
}

function halfSteps(value: unknown, label: string, min: number, max: number): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max || Math.round(n * 2) !== n * 2)
    throw new BusinessError(`${label} يجب أن يكون رقمًا بين ${min} و ${max} (بخطوات نصف يوم).`);
  return n;
}

function requiredDate(value: unknown, label: string): string {
  const v = date(value);
  if (!v) throw new BusinessError(`${label} مطلوب.`);
  return v;
}

// Server-derived identity for HR RPCs: never trust the client for either value.
export async function hrActor(user: AuthUser) {
  const employeeId = await businessRpc<string | null>('business_hr_employee_id_for_account', { p_account: user.id });
  return { is_hr: canManageHr(user.role), actor_employee_id: employeeId || '' };
}

export function prepareAttendanceSettings(body: Record<string, unknown>) {
  const timezone = text(body.timezone, 60) || 'Asia/Amman';
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }); }
  catch { throw new BusinessError('المنطقة الزمنية غير صالحة.'); }
  const work_start = time(body.work_start, 'بداية الدوام', false);
  const work_end = time(body.work_end, 'نهاية الدوام', false);
  if (work_end <= work_start) throw new BusinessError('نهاية الدوام يجب أن تكون بعد بدايته.');
  const grace = Number(body.grace_minutes);
  if (!Number.isInteger(grace) || grace < 0 || grace > 180) throw new BusinessError('فترة السماح يجب أن تكون بين 0 و 180 دقيقة.');
  const weekendRaw = body.weekend;
  if (!Array.isArray(weekendRaw) || weekendRaw.length > 3 ||
      weekendRaw.some((d) => !Number.isInteger(d) || d < 0 || d > 6) || new Set(weekendRaw).size !== weekendRaw.length)
    throw new BusinessError('أيام العطلة الأسبوعية غير صالحة (حتى 3 أيام).');
  const weekend = [...(weekendRaw as number[])].sort((a, b) => a - b);
  return { key: 'attendance', value: { timezone, work_start, work_end, grace_minutes: grace, weekend } };
}

export function prepareHoliday(body: Record<string, unknown>) {
  const action = text(body.action, 10);
  if (action === 'add') {
    const name_ar = text(body.name_ar, 120);
    if (!name_ar) throw new BusinessError('اسم العطلة مطلوب.');
    return { action, date: requiredDate(body.date, 'تاريخ العطلة'), name_ar };
  }
  if (action === 'remove') return { action, id: uuid(body.id, 'معرّف العطلة') };
  throw new BusinessError('إجراء العطلة غير صالح.');
}

export function preparePunch(body: Record<string, unknown>, employeeId: string) {
  const action = text(body.action, 20);
  if (action !== 'check_in' && action !== 'check_out') throw new BusinessError('إجراء الحضور غير صالح.');
  return { employee_id: employeeId, action };
}

export function prepareAttendanceCorrection(body: Record<string, unknown>) {
  const check_in = time(body.check_in, 'وقت الدخول'), check_out = time(body.check_out, 'وقت الخروج');
  if (check_out && (!check_in || check_out <= check_in)) throw new BusinessError('وقت الخروج يجب أن يكون بعد وقت الدخول.');
  const reason = text(body.reason, 500);
  if (!reason) throw new BusinessError('سبب التعديل مطلوب.');
  return {
    employee_id: uuid(body.employee_id, 'معرّف الموظف'), work_date: requiredDate(body.work_date, 'التاريخ'),
    check_in, check_out, reason, note: text(body.note, 500),
  };
}

export function prepareLeaveRequest(body: Record<string, unknown>, employeeId?: string) {
  const start_date = requiredDate(body.start_date, 'تاريخ بداية الإجازة');
  const end_date = requiredDate(body.end_date, 'تاريخ نهاية الإجازة');
  if (end_date < start_date) throw new BusinessError('نهاية الإجازة يجب ألا تسبق بدايتها.');
  if (start_date.slice(0, 4) !== end_date.slice(0, 4)) throw new BusinessError('قسّم الإجازة التي تمتد لسنتين إلى طلبين.');
  const half_day = bool(body.half_day, 'نصف يوم');
  if (half_day && start_date !== end_date) throw new BusinessError('نصف اليوم متاح لطلب يوم واحد فقط.');
  return {
    employee_id: employeeId ?? uuid(body.employee_id, 'معرّف الموظف'),
    leave_type_id: uuid(body.leave_type_id, 'نوع الإجازة'),
    start_date, end_date, half_day, reason: text(body.reason, 1000),
    auto_approve: employeeId ? false : bool(body.auto_approve, 'الاعتماد المباشر'),
  };
}

export function prepareLeaveDecision(body: Record<string, unknown>) {
  const action = text(body.action, 10);
  if (!['approve', 'reject', 'cancel'].includes(action)) throw new BusinessError('الإجراء غير صالح.');
  const note = text(body.note, 1000);
  if (action === 'reject' && !note) throw new BusinessError('سبب الرفض مطلوب.');
  return { id: uuid(body.id, 'معرّف الطلب'), action, note };
}

export function prepareLeaveType(body: Record<string, unknown>) {
  const id = text(body.id, 36);
  const name_ar = text(body.name_ar, 120);
  if (!name_ar) throw new BusinessError('اسم نوع الإجازة مطلوب.');
  const data: Record<string, unknown> = {
    name_ar, annual_days: halfSteps(body.annual_days ?? 0, 'عدد الأيام السنوية', 0, 365),
    paid: bool(body.paid, 'مدفوعة', true), requires_balance: bool(body.requires_balance, 'يتطلب رصيدًا', true),
    gender: oneOf(body.gender, GENDERS, 'الجنس المستحق'),
  };
  if (id) {
    data.id = uuid(id, 'نوع الإجازة');
    if (body.is_active !== undefined) data.is_active = bool(body.is_active, 'حالة النوع');
  } else {
    const code = text(body.code, 40).toLowerCase();
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(code)) throw new BusinessError('رمز نوع الإجازة يجب أن يكون أحرفًا إنجليزية صغيرة/أرقامًا.');
    data.code = code;
  }
  return data;
}

export function prepareLeaveAdjustment(body: Record<string, unknown>) {
  const year = Number(body.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new BusinessError('السنة غير صالحة.');
  const days = halfSteps(body.days, 'عدد الأيام', -365, 365);
  if (days === 0) throw new BusinessError('عدد أيام التعديل لا يمكن أن يكون صفرًا.');
  const reason = text(body.reason, 500);
  if (!reason) throw new BusinessError('سبب تعديل الرصيد مطلوب.');
  return { employee_id: uuid(body.employee_id, 'معرّف الموظف'), leave_type_id: uuid(body.leave_type_id, 'نوع الإجازة'), year, days, reason };
}

export function parseYear(value: string | null): number {
  const year = value ? Number(value) : new Date().getFullYear();
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new BusinessError('السنة غير صالحة.');
  return year;
}

export function parseMonth(value: string | null): string {
  const now = new Date();
  const month = value || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (!/^20\d\d-(0[1-9]|1[0-2])$/.test(month)) throw new BusinessError('الشهر غير صالح.');
  return month;
}

export function accountUsername(accountId: string | null | undefined): string | null {
  return accountId ? SYSTEM_ACCOUNTS.find((a) => a.profile.id === accountId)?.profile.username ?? null : null;
}

export function hrUsernames(): string[] {
  return SYSTEM_ACCOUNTS.filter((a) => a.profile.role === 'hr_operations').map((a) => a.profile.username);
}

// Role -> default department code / job title for one-step account onboarding.
const ROLE_DEFAULTS: Record<string, { department: string; title: string }> = {
  admin: { department: 'it', title: 'مسؤول النظام التقني' },
  general_manager: { department: 'management', title: 'المدير العام' },
  sales_manager: { department: 'sales', title: 'مديرة المبيعات' },
  sales_rep: { department: 'sales', title: 'مندوبة مبيعات' },
  marketing_manager: { department: 'marketing', title: 'مدير التسويق' },
  marketing: { department: 'marketing', title: 'أخصائي تسويق' },
  finance: { department: 'finance', title: 'المدير المالي' },
  hr_operations: { department: 'hr_operations', title: 'مديرة الموارد البشرية والعمليات' },
  driver_manager: { department: 'delivery', title: 'مدير سائقي التوصيل' },
  driver: { department: 'delivery', title: 'سائق توصيل' },
};

export function prepareBulkAccounts(body: Record<string, unknown>) {
  const hire_date = date(body.hire_date);
  if (!hire_date) throw new BusinessError('تاريخ التعيين الافتراضي مطلوب.');
  if (!Array.isArray(body.account_ids) || !body.account_ids.length || body.account_ids.length > 200)
    throw new BusinessError('اختر حسابًا واحدًا على الأقل.');
  const ids = new Set(body.account_ids.map((v) => text(v, 100)));
  const accounts = SYSTEM_ACCOUNTS.filter((a) => ids.has(a.profile.id)).map((a) => {
    const defaults = ROLE_DEFAULTS[a.profile.role];
    return {
      account_id: a.profile.id,
      full_name_ar: a.profile.name.replace(/\s*\([^)]*\)\s*$/, '').trim() || a.profile.username,
      department_code: defaults?.department ?? '',
      job_title: defaults?.title ?? '',
    };
  });
  if (accounts.length !== ids.size) throw new BusinessError('أحد الحسابات المحددة غير موجود.');
  return { hire_date, accounts };
}
