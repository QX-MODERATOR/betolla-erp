// Shared (client + server) HR types, labels and pure helpers.
import type { UserRole } from "@/lib/auth";

export interface HrEmployee {
  id: string; employee_no: string; account_id: string | null;
  full_name_ar: string; full_name_en: string; nationality: string;
  gender: "male" | "female" | null; birth_date: string | null;
  marital_status: "single" | "married" | "divorced" | "widowed" | null;
  phone: string; email: string; city: string; address: string;
  emergency_name: string; emergency_phone: string; emergency_relation: string;
  department_id: string | null; department_name: string; job_title: string;
  manager_id: string | null; manager_name: string;
  employment_type: EmploymentType; hire_date: string;
  probation_end_date: string | null; contract_end_date: string | null;
  status: EmployeeStatus; termination_date: string | null; termination_reason: string;
  direct_reports: number; updated_at: string; created_at: string;
  // Present only in sensitive projections (HR/management, or the employee's own record).
  national_id?: string; basic_salary?: number; bank_name?: string; iban?: string; ssc_number?: string; notes?: string;
  commission_rate?: number;
}
export interface HrDepartment {
  id: string; code: string; name_ar: string; name_en: string;
  head_employee_id: string | null; head_name: string; is_active: boolean; headcount: number;
}
export interface HrAuditEntry {
  id: string; actor_id: string; action: string;
  changes: Record<string, unknown>; created_at: string;
}

export type EmploymentType = "full_time" | "part_time" | "contract" | "intern" | "freelance";
export type EmployeeStatus = "active" | "probation" | "on_leave" | "suspended" | "terminated";

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: "دوام كامل",
  part_time: "دوام جزئي",
  contract: "عقد محدد المدة",
  intern: "تدريب",
  freelance: "عمل حر",
};

export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, { label: string; color: string }> = {
  active: { label: "على رأس عمله", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  probation: { label: "فترة تجربة", color: "bg-blue-50 text-blue-700 border-blue-200" },
  on_leave: { label: "في إجازة", color: "bg-amber-50 text-amber-700 border-amber-200" },
  suspended: { label: "موقوف", color: "bg-orange-50 text-orange-700 border-orange-200" },
  terminated: { label: "منتهية خدمته", color: "bg-stone-100 text-stone-600 border-stone-300" },
};

export const GENDER_LABELS = { male: "ذكر", female: "أنثى" } as const;
export const MARITAL_LABELS = { single: "أعزب/عزباء", married: "متزوج/ة", divorced: "مطلق/ة", widowed: "أرمل/ة" } as const;

export const HR_FIELD_LABELS: Record<string, string> = {
  account_id: "حساب الدخول", full_name_ar: "الاسم بالعربية", full_name_en: "الاسم بالإنجليزية",
  national_id: "الرقم الوطني", nationality: "الجنسية", gender: "الجنس", birth_date: "تاريخ الميلاد",
  marital_status: "الحالة الاجتماعية", phone: "الهاتف", email: "البريد الإلكتروني", city: "المدينة",
  address: "العنوان", emergency_name: "جهة اتصال الطوارئ", emergency_phone: "هاتف الطوارئ",
  emergency_relation: "صلة القرابة", department_id: "القسم", job_title: "المسمى الوظيفي",
  manager_id: "المدير المباشر", employment_type: "نوع التوظيف", hire_date: "تاريخ التعيين",
  probation_end_date: "نهاية فترة التجربة", contract_end_date: "نهاية العقد", status: "الحالة",
  termination_date: "تاريخ انتهاء الخدمة", termination_reason: "سبب انتهاء الخدمة",
  basic_salary: "الراتب الأساسي", bank_name: "البنك", iban: "IBAN", ssc_number: "رقم الضمان الاجتماعي",
  notes: "ملاحظات HR", check_in: "وقت الدخول", check_out: "وقت الخروج", commission_rate: "نسبة العمولة %", amount: "المبلغ", is_active: "فعّال",
};

// Roles that manage HR records and may see salary/bank/national-ID data.
export const HR_ADMIN_ROLES: UserRole[] = ["admin", "general_manager", "hr_operations"];
export const canManageHr = (role: UserRole | undefined | null) => !!role && HR_ADMIN_ROLES.includes(role);

// Whole days from today (local) until an ISO date; negative when already past.
export function daysUntil(isoDate: string | null | undefined, today = new Date()): number | null {
  if (!isoDate) return null;
  const target = new Date(isoDate + "T00:00:00");
  if (isNaN(target.getTime())) return null;
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - base.getTime()) / 86400000);
}

// Completed years/months of service, e.g. { years: 2, months: 3 }.
export function serviceLength(hireDate: string, until: string | null = null, today = new Date()) {
  const start = new Date(hireDate + "T00:00:00");
  const end = until ? new Date(until + "T00:00:00") : today;
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  months = Math.max(0, months);
  return { years: Math.floor(months / 12), months: months % 12 };
}

export function formatServiceLength(hireDate: string, until: string | null = null): string {
  const { years, months } = serviceLength(hireDate, until);
  if (!years && !months) return "أقل من شهر";
  return [years ? `${years} سنة` : "", months ? `${months} شهر` : ""].filter(Boolean).join(" و ");
}

// ---------------------------------------------------------------- phase 2: attendance & leave

export interface AttendanceSettings {
  timezone: string; work_start: string; work_end: string; grace_minutes: number;
  weekend: number[]; // 0 = Sunday ... 6 = Saturday
}
export const DEFAULT_ATTENDANCE_SETTINGS: AttendanceSettings = {
  timezone: "Asia/Amman", work_start: "09:00", work_end: "17:00", grace_minutes: 15, weekend: [5],
};
export interface HrHoliday { id: string; date: string; name_ar: string }
export interface HrAttendance {
  id: string; employee_id: string; work_date: string; check_in: string | null; check_out: string | null;
  worked_minutes: number | null; source: "self" | "hr"; note: string; updated_at: string;
}
export interface HrLeaveType {
  id: string; code: string; name_ar: string; annual_days: number; paid: boolean;
  requires_balance: boolean; gender: "male" | "female" | null; is_active: boolean;
}
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
export interface HrLeaveRequest {
  id: string; employee_id: string; employee_name: string; employee_no: string; employee_account_id: string | null;
  department_name: string; manager_id: string | null; manager_account_id: string | null;
  leave_type_id: string; type_code: string; type_name: string; paid: boolean;
  start_date: string; end_date: string; half_day: boolean; days: number; reason: string; status: LeaveStatus;
  requested_by: string; decided_by: string | null; decided_at: string | null; decision_note: string;
  created_at: string; updated_at: string;
}
export interface HrLeaveBalance {
  employee_id: string; leave_type_id: string; entitled: number; adjustments: number;
  used: number; pending: number; available: number;
}
export interface HrLeaveAdjustment {
  id: string; employee_id: string; leave_type_id: string; year: number; days: number;
  reason: string; actor_id: string; created_at: string;
}

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, { label: string; color: string }> = {
  pending: { label: "بانتظار الموافقة", color: "bg-amber-50 text-amber-700 border-amber-200" },
  approved: { label: "موافق عليها", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected: { label: "مرفوضة", color: "bg-rose-50 text-rose-700 border-rose-200" },
  cancelled: { label: "ملغاة", color: "bg-stone-100 text-stone-500 border-stone-300" },
};

export const WEEKDAY_LABELS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export type DayStatus = "present" | "late" | "incomplete" | "absent" | "leave" | "holiday" | "weekend" | "future" | "pending" | "none";
export const DAY_STATUS_META: Record<DayStatus, { label: string; short: string; color: string }> = {
  present: { label: "حاضر", short: "ح", color: "bg-emerald-100 text-emerald-800" },
  late: { label: "متأخر", short: "ت", color: "bg-amber-100 text-amber-800" },
  incomplete: { label: "بدون تسجيل خروج", short: "خ", color: "bg-sky-100 text-sky-800" },
  absent: { label: "غائب", short: "غ", color: "bg-rose-100 text-rose-700" },
  leave: { label: "إجازة", short: "إ", color: "bg-violet-100 text-violet-800" },
  holiday: { label: "عطلة رسمية", short: "ع", color: "bg-stone-200 text-stone-600" },
  weekend: { label: "عطلة أسبوعية", short: "·", color: "bg-stone-100 text-stone-400" },
  future: { label: "", short: "", color: "bg-white text-stone-300" },
  pending: { label: "لم يسجل بعد", short: "…", color: "bg-white text-stone-400" },
  none: { label: "خارج فترة الخدمة", short: "", color: "bg-stone-50 text-stone-200" },
};

export const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export function formatMinutes(total: number | null | undefined): string {
  if (!total || total <= 0) return "—";
  const h = Math.floor(total / 60), m = total % 60;
  return [h ? `${h}س` : "", m ? `${m}د` : ""].filter(Boolean).join(" ");
}

// Day-of-week of an ISO date without local-timezone drift.
export const dowOf = (iso: string) => new Date(iso + "T00:00:00Z").getUTCDay();

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function monthDays(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

// Mirrors SQL business_hr_working_days (+ half-day rule) for form previews.
export function leaveWorkingDays(start: string, end: string, halfDay: boolean, weekend: number[], holidays: Set<string>): number {
  if (!start || !end || end < start) return 0;
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) if (!weekend.includes(dowOf(d)) && !holidays.has(d)) n++;
  return halfDay ? Math.min(n, 0.5) : n;
}

export function isLate(checkIn: string | null, s: AttendanceSettings): boolean {
  return !!checkIn && minutesOf(checkIn) > minutesOf(s.work_start) + s.grace_minutes;
}

export function dayStatus(args: {
  date: string; today: string; settings: AttendanceSettings; holidays: Set<string>;
  record?: HrAttendance; onLeave?: boolean; hireDate: string; terminationDate?: string | null;
}): DayStatus {
  const { date, today, settings, holidays, record, onLeave, hireDate, terminationDate } = args;
  if (date < hireDate || (terminationDate && date > terminationDate)) return "none";
  if (record?.check_in) {
    if (isLate(record.check_in, settings)) return "late";
    if (!record.check_out && date < today) return "incomplete";
    return "present";
  }
  if (onLeave) return "leave";
  if (holidays.has(date)) return "holiday";
  if (settings.weekend.includes(dowOf(date))) return "weekend";
  if (date > today) return "future";
  if (date === today) return "pending";
  return "absent";
}

// Approved leave dates for one employee inside [from, to].
export function leaveDateSet(requests: HrLeaveRequest[], employeeId: string, from: string, to: string): Set<string> {
  const out = new Set<string>();
  for (const r of requests) {
    if (r.employee_id !== employeeId || r.status !== "approved" || r.end_date < from || r.start_date > to) continue;
    for (let d = r.start_date > from ? r.start_date : from; d <= r.end_date && d <= to; d = addDays(d, 1)) out.add(d);
  }
  return out;
}

// ---------------------------------------------------------------- phase 3: payroll

export interface PayrollSettings {
  ssc_employee_rate: number; ssc_employer_rate: number; ssc_max_wage: number;
  daily_basis: number; deduct_absences: boolean;
}
export const DEFAULT_PAYROLL_SETTINGS: PayrollSettings = {
  ssc_employee_rate: 7.5, ssc_employer_rate: 14.25, ssc_max_wage: 0, daily_basis: 30, deduct_absences: false,
};
export type PayrollStatus = "draft" | "approved" | "paid";
export interface PayslipLine { type: string; label: string; amount: number; ref?: string }
export interface HrPayslip {
  id: string; run_id: string; employee_id: string; employee_account_id: string | null; employee_no: string; employee_name: string;
  department_name: string | null; job_title: string | null; bank_name: string | null; iban: string | null; ssc_number: string | null;
  employed_days: number; month_days: number; basic: number; allowances: number; commission: number; commission_sales: number;
  overtime: number; bonuses: number; gross: number; ssc_base: number; ssc_employee: number; ssc_employer: number;
  absent_days: number; absence_deduction: number; unpaid_leave_days: number; unpaid_leave_deduction: number;
  advance_deduction: number; other_deductions: number; income_tax: number; total_deductions: number; net: number;
  lines: PayslipLine[]; warnings: string[]; month: string; run_status: PayrollStatus; paid_at: string | null;
}
export interface HrPayrollTotals {
  count: number; gross: number; net: number; ssc_employee: number; ssc_employer: number;
  deductions: number; commission: number; employer_cost: number; warnings: number;
}
export interface HrPayrollRun {
  id: string; month: string; status: PayrollStatus; settings: Partial<PayrollSettings>;
  created_by: string; calculated_at: string; approved_by: string | null; approved_at: string | null;
  paid_by: string | null; paid_at: string | null; payment_ref: string; notes: string;
  updated_at: string; created_at: string; totals: HrPayrollTotals; payslips?: HrPayslip[];
}
export interface HrSalaryComponent {
  id: string; employee_id: string; kind: "allowance" | "deduction"; name_ar: string;
  amount: number; ssc_subject: boolean; is_active: boolean; updated_at: string;
}
export type PayrollAdjustmentKind = "bonus" | "overtime" | "deduction" | "income_tax";
export interface HrPayrollAdjustment {
  id: string; employee_id: string; employee_name: string; month: string; kind: PayrollAdjustmentKind;
  amount: number; note: string; actor_id: string; voided: boolean; created_at: string;
}
export interface HrAdvance {
  id: string; employee_id: string; employee_name: string; amount: number; monthly_amount: number;
  start_month: string; reason: string; status: "active" | "settled" | "cancelled";
  repaid: number; remaining: number; created_at: string;
}

export const PAYROLL_STATUS_LABELS: Record<PayrollStatus, { label: string; color: string }> = {
  draft: { label: "مسودة", color: "bg-amber-50 text-amber-700 border-amber-200" },
  approved: { label: "معتمد من HR — بانتظار الصرف", color: "bg-blue-50 text-blue-700 border-blue-200" },
  paid: { label: "مصروف", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};
export const ADJUSTMENT_KIND_LABELS: Record<PayrollAdjustmentKind, string> = {
  bonus: "مكافأة", overtime: "عمل إضافي", deduction: "خصم", income_tax: "ضريبة دخل",
};
export const ADVANCE_STATUS_LABELS: Record<HrAdvance["status"], string> = {
  active: "قيد السداد", settled: "مسددة", cancelled: "ملغاة",
};
export const PAYSLIP_WARNING_LABELS: Record<string, string> = {
  NEGATIVE_NET: "صافي الراتب سالب — راجع الخصومات",
  NO_SALARY: "لا يوجد راتب أساسي في الملف",
  NO_IBAN: "لا يوجد IBAN للتحويل",
  NO_SSC_NUMBER: "لا يوجد رقم ضمان اجتماعي",
  FINAL_SETTLEMENT: "انتهت خدمته — راتب جزئي/تسوية نهائية",
  SUSPENDED: "الموظف موقوف — تحقق قبل الصرف",
};
// Earnings on the payslip; every other line type is a deduction.
export const EARNING_LINE_TYPES = ["basic", "allowance", "commission", "overtime", "bonus"];

export const canViewPayroll = (role: UserRole | undefined | null) =>
  !!role && (HR_ADMIN_ROLES.includes(role) || role === "finance");
export const canPayPayroll = (role: UserRole | undefined | null) =>
  role === "finance" || role === "admin" || role === "general_manager";

const MONTH_NAMES = ["كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران", "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول"];
export const monthLabel = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
};
