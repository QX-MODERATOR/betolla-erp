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
  notes: "ملاحظات HR",
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
