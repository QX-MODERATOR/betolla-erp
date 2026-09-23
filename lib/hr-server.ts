// Server-only HR input validation. Everything is normalized here before it
// reaches the business_hr_* RPCs (which re-check the invariants that matter).
import { BusinessError, businessRpc, text, money, date } from '@/lib/business-server';
import { SYSTEM_ACCOUNTS, type AuthUser } from '@/lib/auth';
import { canManageHr, EMPLOYEE_NO_PATTERN } from '@/lib/hr';

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
  employee_no: (v) => {
    const no = text(v, 30);
    if (no && !EMPLOYEE_NO_PATTERN.test(no)) throw new BusinessError('الرقم الوظيفي: أحرف إنجليزية وأرقام و . _ / - فقط، حتى 30 خانة.');
    return no;
  },
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
  commission_rate: (v) => (v === '' || v === null || v === undefined ? 0 : percent(v, 'نسبة العمولة')),
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
  if ('employee_no' in fields && !fields.employee_no) throw new BusinessError('الرقم الوظيفي لا يمكن أن يكون فارغاً.');
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

// ---------------------------------------------------------------- phase 3: payroll

const MONTH_RE = /^20\d\d-(0[1-9]|1[0-2])$/;

function month(value: unknown, label = 'الشهر'): string {
  const v = text(value, 7);
  if (!MONTH_RE.test(v)) throw new BusinessError(`${label} غير صالح.`);
  return v;
}

function positiveMoney(value: unknown, label: string): number {
  const n = money(value);
  if (n <= 0) throw new BusinessError(`${label} يجب أن يكون أكبر من صفر.`);
  return n;
}

export function percent(value: unknown, label: string): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100 || Math.abs(Math.round(n * 100) - n * 100) > 1e-9)
    throw new BusinessError(`${label} يجب أن تكون نسبة بين 0 و 100.`);
  return n;
}

export function preparePayrollSettings(body: Record<string, unknown>) {
  const daily = Number(body.daily_basis);
  if (!Number.isInteger(daily) || daily < 20 || daily > 31) throw new BusinessError('أساس احتساب اليوم يجب أن يكون بين 20 و 31.');
  const max = body.ssc_max_wage === '' || body.ssc_max_wage === undefined || body.ssc_max_wage === null ? 0 : money(body.ssc_max_wage);
  return {
    key: 'payroll',
    value: {
      ssc_employee_rate: percent(body.ssc_employee_rate, 'نسبة اقتطاع الموظف'),
      ssc_employer_rate: percent(body.ssc_employer_rate, 'نسبة مساهمة الشركة'),
      ssc_max_wage: max, daily_basis: daily, deduct_absences: bool(body.deduct_absences, 'خصم الغياب'),
    },
  };
}

export function preparePayrollGenerate(body: Record<string, unknown>) {
  return { month: month(body.month) };
}

export function preparePayrollTransition(body: Record<string, unknown>, role: AuthUser['role']) {
  const action = text(body.action, 10);
  if (!['approve', 'reopen', 'pay'].includes(action)) throw new BusinessError('إجراء المسير غير صالح.');
  const note = text(body.note, 1000);
  if (action === 'reopen' && !note) throw new BusinessError('سبب إعادة الفتح مطلوب.');
  const data: Record<string, unknown> = {
    id: uuid(body.id, 'مسير الرواتب'), action, note, payment_ref: text(body.payment_ref, 200),
    is_hr: canManageHr(role), is_finance: role === 'finance' || role === 'admin' || role === 'general_manager',
  };
  if (action === 'approve') {
    const net = Number(body.expected_net), count = Number(body.expected_count);
    if (body.expected_net === undefined || !Number.isFinite(net) || !Number.isInteger(count) || count < 0)
      throw new BusinessError('بيانات المراجعة مفقودة. حدّث الصفحة.');
    data.expected_net = net;
    data.expected_count = count;
  }
  return data;
}

export function prepareComponent(body: Record<string, unknown>) {
  const name_ar = text(body.name_ar, 120);
  if (!name_ar) throw new BusinessError('اسم البند مطلوب.');
  const data: Record<string, unknown> = {
    name_ar, amount: positiveMoney(body.amount, 'قيمة البند'), ssc_subject: bool(body.ssc_subject, 'خاضع للضمان'),
  };
  const id = text(body.id, 36);
  if (id) {
    data.id = uuid(id, 'بند الراتب');
    if (body.is_active !== undefined) data.is_active = bool(body.is_active, 'حالة البند');
  } else {
    data.employee_id = uuid(body.employee_id, 'معرّف الموظف');
    data.kind = oneOf(body.component_kind, ['allowance', 'deduction'], 'نوع البند', false);
  }
  return data;
}

export function preparePayrollAdjustment(body: Record<string, unknown>) {
  const action = text(body.action, 10);
  if (action === 'void') return { action, id: uuid(body.id, 'الحركة') };
  if (action !== 'add') throw new BusinessError('إجراء غير صالح.');
  const note = text(body.note, 500);
  if (!note) throw new BusinessError('وصف الحركة مطلوب.');
  return {
    action, employee_id: uuid(body.employee_id, 'معرّف الموظف'), month: month(body.month),
    kind: oneOf(body.adjustment_kind, ['bonus', 'overtime', 'deduction', 'income_tax'], 'نوع الحركة', false),
    amount: positiveMoney(body.amount, 'المبلغ'), note,
  };
}

export function prepareAdvance(body: Record<string, unknown>) {
  const action = text(body.action, 10);
  if (action === 'cancel') return { action, id: uuid(body.id, 'السلفة'), reason: text(body.reason, 500) };
  if (action !== 'create') throw new BusinessError('إجراء غير صالح.');
  const amount = positiveMoney(body.amount, 'مبلغ السلفة');
  const monthly_amount = positiveMoney(body.monthly_amount, 'القسط الشهري');
  if (monthly_amount > amount) throw new BusinessError('القسط الشهري لا يمكن أن يتجاوز مبلغ السلفة.');
  const reason = text(body.reason, 500);
  if (!reason) throw new BusinessError('سبب السلفة مطلوب.');
  return { action, employee_id: uuid(body.employee_id, 'معرّف الموظف'), amount, monthly_amount, start_month: month(body.start_month, 'شهر بدء السداد'), reason };
}

export function financeUsernames(): string[] {
  return SYSTEM_ACCOUNTS.filter((a) => a.profile.role === 'finance').map((a) => a.profile.username);
}

// ---------------------------------------------------------------- phase 4: recruitment, performance, documents

const CANDIDATE_SOURCES = ['referral', 'website', 'social_media', 'linkedin', 'walk_in', 'agency', 'job_board', 'other'];
const DOCUMENT_TYPES = ['national_id', 'passport', 'residency', 'work_permit', 'contract', 'health_certificate',
  'driving_license', 'vehicle_license', 'certificate', 'other'];

function optionalMoney(value: unknown): number | '' {
  return value === '' || value === null || value === undefined ? '' : money(value);
}

function dateTime(value: unknown, label: string): string {
  const v = text(value, 40);
  if (!v) return '';
  const t = Date.parse(v);
  if (!Number.isFinite(t) || !/[zZ]|[+-]\d\d:?\d\d$/.test(v)) throw new BusinessError(`${label} غير صالح.`);
  return new Date(t).toISOString();
}

export function prepareOpening(body: Record<string, unknown>) {
  const title = text(body.title, 200);
  if (!title) throw new BusinessError('المسمى الوظيفي مطلوب.');
  const positions = Number(body.positions ?? 1);
  if (!Number.isInteger(positions) || positions < 1 || positions > 100) throw new BusinessError('عدد الشواغر يجب أن يكون بين 1 و 100.');
  const salary_min = optionalMoney(body.salary_min), salary_max = optionalMoney(body.salary_max);
  if (salary_min !== '' && salary_max !== '' && salary_max < salary_min) throw new BusinessError('الحد الأعلى للراتب أقل من الحد الأدنى.');
  const data: Record<string, unknown> = {
    title, department_id: optionalUuid(body.department_id, 'القسم'),
    employment_type: oneOf(body.employment_type || 'full_time', EMPLOYMENT_TYPES, 'نوع التوظيف', false),
    positions, location: text(body.location, 200), description: text(body.description, 4000),
    requirements: text(body.requirements, 4000), salary_min, salary_max,
    status: oneOf(body.status || 'open', ['open', 'on_hold', 'closed'], 'حالة الوظيفة', false),
  };
  const id = text(body.id, 36);
  if (id) data.id = uuid(id, 'الوظيفة');
  return data;
}

export function prepareCandidate(body: Record<string, unknown>) {
  const action = text(body.action, 10);
  if (action === 'move') {
    const stage = oneOf(body.stage, ['applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'], 'المرحلة', false);
    const rejection_reason = text(body.rejection_reason, 1000);
    if (stage === 'rejected' && !rejection_reason) throw new BusinessError('سبب الرفض مطلوب.');
    return { action, id: uuid(body.id, 'المرشح'), stage, note: text(body.note, 1000), rejection_reason };
  }
  if (action !== 'create' && action !== 'update') throw new BusinessError('إجراء غير صالح.');
  const full_name = text(body.full_name, 200);
  if (!full_name) throw new BusinessError('اسم المرشح مطلوب.');
  const mobile = phone(body.phone);
  if (!mobile) throw new BusinessError('رقم هاتف المرشح مطلوب.');
  const data: Record<string, unknown> = {
    action, full_name, phone: mobile, email: email(body.email),
    source: oneOf(body.source || 'other', CANDIDATE_SOURCES, 'مصدر المرشح', false),
    expected_salary: optionalMoney(body.expected_salary), notes: text(body.notes, 4000),
  };
  if (action === 'create') data.opening_id = uuid(body.opening_id, 'الوظيفة');
  else {
    data.id = uuid(body.id, 'المرشح');
    const rating = body.rating === '' || body.rating === null || body.rating === undefined ? '' : Number(body.rating);
    if (rating !== '' && (!Number.isInteger(rating) || rating < 1 || rating > 5)) throw new BusinessError('التقييم يجب أن يكون من 1 إلى 5.');
    data.rating = rating;
    data.interview_at = dateTime(body.interview_at, 'موعد المقابلة');
  }
  return data;
}

export function prepareHire(body: Record<string, unknown>) {
  const hire_date = date(body.hire_date);
  if (!hire_date) throw new BusinessError('تاريخ التعيين مطلوب.');
  const probation_end_date = date(body.probation_end_date) || '';
  if (probation_end_date && probation_end_date < hire_date) throw new BusinessError('نهاية التجربة يجب أن تكون بعد تاريخ التعيين.');
  return {
    candidate_id: uuid(body.candidate_id, 'المرشح'), hire_date, probation_end_date,
    basic_salary: body.basic_salary === '' || body.basic_salary === undefined ? 0 : money(body.basic_salary),
    job_title: text(body.job_title, 200), department_id: optionalUuid(body.department_id, 'القسم'),
    employment_type: oneOf(body.employment_type, EMPLOYMENT_TYPES, 'نوع التوظيف'),
  };
}

const CRITERIA_KEYS = ['quality', 'productivity', 'teamwork', 'communication', 'punctuality', 'initiative'];

export function prepareReview(body: Record<string, unknown>) {
  const period_label = text(body.period_label, 40);
  if (!period_label) throw new BusinessError('فترة التقييم مطلوبة.');
  const period_start = date(body.period_start), period_end = date(body.period_end);
  if (!period_start || !period_end || period_end < period_start) throw new BusinessError('تواريخ فترة التقييم غير صالحة.');
  const raw = body.scores;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BusinessError('الدرجات غير صالحة.');
  const scores: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!CRITERIA_KEYS.includes(k) || v === null || v === '' || v === undefined) continue;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 5) throw new BusinessError('كل درجة يجب أن تكون من 1 إلى 5.');
    scores[k] = n;
  }
  const submit = bool(body.submit, 'الإرسال');
  if (submit && Object.keys(scores).length !== CRITERIA_KEYS.length) throw new BusinessError('قيّم جميع المعايير قبل الإرسال.');
  const values = Object.values(scores);
  const data: Record<string, unknown> = {
    period_label, period_start, period_end, scores,
    overall: values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : '',
    strengths: text(body.strengths, 2000), improvements: text(body.improvements, 2000), goals: text(body.goals, 2000), submit,
  };
  const id = text(body.id, 36);
  if (id) data.id = uuid(id, 'التقييم');
  else data.employee_id = uuid(body.employee_id, 'معرّف الموظف');
  return data;
}

export function prepareAcknowledge(body: Record<string, unknown>) {
  return { id: uuid(body.id, 'التقييم'), comment: text(body.comment, 2000) };
}

export function prepareDocument(body: Record<string, unknown>) {
  const issue_date = date(body.issue_date) || '', expiry_date = date(body.expiry_date) || '';
  if (issue_date && expiry_date && expiry_date < issue_date) throw new BusinessError('تاريخ الانتهاء يسبق تاريخ الإصدار.');
  const data: Record<string, unknown> = {
    doc_type: oneOf(body.doc_type, DOCUMENT_TYPES, 'نوع المستند', false), title: text(body.title, 200),
    doc_number: text(body.doc_number, 100), issue_date, expiry_date, notes: text(body.notes, 2000),
  };
  const id = text(body.id, 36);
  if (id) {
    data.id = uuid(id, 'المستند');
    if (body.archived !== undefined) data.archived = bool(body.archived, 'الأرشفة');
  } else data.employee_id = uuid(body.employee_id, 'معرّف الموظف');
  return data;
}

// Display name as written on call_logs.rep_name (role suffix stripped).
export function repNameForAccount(accountId: string | null | undefined): string {
  const account = accountId ? SYSTEM_ACCOUNTS.find((a) => a.profile.id === accountId) : undefined;
  return account ? account.profile.name.replace(/\s*\([^)]*\)\s*$/, '').trim() : '';
}

export function kpiRange(params: URLSearchParams) {
  const from = date(params.get('from') || undefined), to = date(params.get('to') || undefined);
  if (!from || !to || to < from) throw new BusinessError('فترة المؤشرات غير صالحة.');
  return { from, to };
}

// account id -> call-log display name, for every login account (constant, so safe inside idempotent payloads).
export function repNames(): Record<string, string> {
  return Object.fromEntries(SYSTEM_ACCOUNTS.map((a) => [a.profile.id, repNameForAccount(a.profile.id)]));
}

export async function employeeKpis(employee: { id: string; account_id: string | null }, from: string, to: string) {
  return businessRpc<Record<string, number>>('business_hr_employee_kpis',
    { p_employee: employee.id, p_rep_name: repNameForAccount(employee.account_id), p_from: from, p_to: to });
}
