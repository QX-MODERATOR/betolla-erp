"use client";

import { useState } from "react";
import { X, Save, UserPlus, Pencil } from "lucide-react";
import { saveBusiness } from "@/lib/business-client";
import { useToast } from "@/components/common/toast";
import { ammanToday } from "@/lib/dates";
import { useRole } from "@/lib/use-permission";
import {
  EMPLOYMENT_TYPE_LABELS, EMPLOYEE_STATUS_LABELS, GENDER_LABELS, MARITAL_LABELS, canSetEmployeeNo,
  type HrEmployee, type HrDepartment,
} from "@/lib/hr";

export interface LinkableAccount { id: string; username: string; name: string; role: string }

type FormState = Record<string, string>;

// Every editable field, with the value it should show for an existing record.
const FIELDS = [
  "employee_no", "full_name_ar", "full_name_en", "national_id", "nationality", "gender", "birth_date", "marital_status",
  "phone", "email", "city", "address", "emergency_name", "emergency_phone", "emergency_relation",
  "department_id", "job_title", "manager_id", "employment_type", "hire_date", "probation_end_date",
  "contract_end_date", "status", "termination_date", "termination_reason", "account_id",
  "basic_salary", "commission_rate", "bank_name", "iban", "ssc_number", "notes",
] as const;

function initialState(employee?: HrEmployee | null): FormState {
  const today = ammanToday();
  const state: FormState = {};
  for (const key of FIELDS) {
    const value = employee ? (employee as unknown as Record<string, unknown>)[key] : undefined;
    state[key] = value === null || value === undefined ? "" : String(value);
  }
  if (!employee) {
    state.hire_date = today;
    state.employment_type = "full_time";
    state.status = "probation";
    state.nationality = "أردني";
  }
  return state;
}

const inputCls = "w-full px-3 py-2 rounded-xl border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/60 focus:border-amber-400";
const labelCls = "block text-[11px] font-bold text-stone-500 mb-1";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border border-stone-200 rounded-2xl p-4">
      <legend className="px-2 text-xs font-black text-amber-700">{title}</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </fieldset>
  );
}

export function EmployeeFormModal({
  employee, departments, employees, accounts, onClose, onSaved,
}: {
  employee?: HrEmployee | null;
  departments: HrDepartment[];
  employees: HrEmployee[];
  accounts: LinkableAccount[];
  onClose: () => void;
  onSaved: (saved: HrEmployee) => void;
}) {
  const { showToast } = useToast();
  const isEdit = !!employee;
  // Only the HR account assigns the employee ID; everyone else sees it and cannot change it.
  const setsEmployeeNo = canSetEmployeeNo(useRole());
  const [original] = useState(() => initialState(employee));
  const [form, setForm] = useState<FormState>(original);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const linkedIds = new Set(employees.filter((e) => e.account_id && e.id !== employee?.id).map((e) => e.account_id));
  const managerOptions = employees.filter((e) => e.id !== employee?.id && e.status !== "terminated");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    // Edit sends only what changed, so a concurrent edit to another field is never clobbered.
    const fields: FormState = {};
    for (const key of FIELDS) {
      if (!isEdit || form[key] !== original[key]) fields[key] = form[key];
    }
    if (!setsEmployeeNo) delete fields.employee_no;
    else if (!isEdit && !form.employee_no.trim()) delete fields.employee_no; // empty: the next EMP-xxxx
    // Reinstating a terminated employee clears the (now hidden) termination details.
    if (isEdit && original.status === "terminated" && form.status !== "terminated") {
      fields.termination_date = "";
      fields.termination_reason = "";
    }
    if (isEdit && !Object.keys(fields).length) { onClose(); return; }
    setSaving(true);
    setError("");
    try {
      const result = isEdit
        ? await saveBusiness<{ employee: HrEmployee }>(`hr-employee-update-${employee!.id}`, "/api/hr/employees",
            { id: employee!.id, expected_updated_at: employee!.updated_at, fields }, "PATCH")
        : await saveBusiness<{ employee: HrEmployee }>("hr-employee-create", "/api/hr/employees", { fields });
      showToast(isEdit ? "تم حفظ تعديلات ملف الموظف." : `تمت إضافة الموظف (${result.employee.employee_no}).`, "success");
      onSaved(result.employee);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-dialog="" className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-start sm:items-center justify-center p-3 overflow-y-auto" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-[#faf7f2] w-full max-w-3xl rounded-3xl shadow-2xl border border-stone-200 my-4 flex flex-col max-h-[calc(100vh-2rem)]"
      >
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-stone-200">
          <h3 className="font-black text-lg text-stone-900 flex items-center gap-2">
            {isEdit ? <Pencil className="w-5 h-5 text-amber-500" /> : <UserPlus className="w-5 h-5 text-amber-500" />}
            {isEdit ? `تعديل ملف: ${employee!.full_name_ar}` : "إضافة موظف جديد"}
          </h3>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="p-2 rounded-xl hover:bg-stone-200/60">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          <Section title="البيانات الشخصية">
            <div>
              <label htmlFor="employee-no" className={labelCls}>الرقم الوظيفي (Employee ID){setsEmployeeNo && isEdit ? " *" : ""}</label>
              <input id="employee-no" dir="ltr" className={`${inputCls} font-mono ${setsEmployeeNo ? "" : "bg-stone-100 text-stone-500 cursor-not-allowed"}`}
                value={form.employee_no} onChange={set("employee_no")} readOnly={!setsEmployeeNo} required={setsEmployeeNo && isEdit}
                maxLength={30} pattern="[A-Za-z0-9._/\-]{1,30}" placeholder={isEdit ? "" : "يُولَّد تلقائياً إذا تُرك فارغاً"} />
              <p className="text-[10px] text-stone-400 mt-0.5">{setsEmployeeNo ? "أحرف إنجليزية وأرقام و . _ / - — فريد لكل موظف" : "يحدده قسم الموارد البشرية فقط"}</p>
            </div>
            <div><label className={labelCls}>الاسم الكامل بالعربية *</label><input required className={inputCls} value={form.full_name_ar} onChange={set("full_name_ar")} /></div>
            <div><label className={labelCls}>الاسم بالإنجليزية</label><input dir="ltr" className={inputCls} value={form.full_name_en} onChange={set("full_name_en")} /></div>
            <div><label className={labelCls}>الرقم الوطني / رقم الإقامة</label><input dir="ltr" className={inputCls} value={form.national_id} onChange={set("national_id")} /></div>
            <div><label className={labelCls}>الجنسية</label><input className={inputCls} value={form.nationality} onChange={set("nationality")} /></div>
            <div><label className={labelCls}>الجنس</label>
              <select className={inputCls} value={form.gender} onChange={set("gender")}>
                <option value="">—</option>
                {Object.entries(GENDER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div><label className={labelCls}>تاريخ الميلاد</label><input type="date" className={inputCls} value={form.birth_date} onChange={set("birth_date")} /></div>
            <div><label className={labelCls}>الحالة الاجتماعية</label>
              <select className={inputCls} value={form.marital_status} onChange={set("marital_status")}>
                <option value="">—</option>
                {Object.entries(MARITAL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </Section>

          <Section title="التواصل والطوارئ">
            <div><label className={labelCls}>الهاتف</label><input dir="ltr" className={inputCls} value={form.phone} onChange={set("phone")} /></div>
            <div><label className={labelCls}>البريد الإلكتروني</label><input dir="ltr" type="email" className={inputCls} value={form.email} onChange={set("email")} /></div>
            <div><label className={labelCls}>المدينة</label><input className={inputCls} value={form.city} onChange={set("city")} /></div>
            <div><label className={labelCls}>العنوان</label><input className={inputCls} value={form.address} onChange={set("address")} /></div>
            <div><label className={labelCls}>جهة اتصال الطوارئ</label><input className={inputCls} value={form.emergency_name} onChange={set("emergency_name")} /></div>
            <div><label className={labelCls}>هاتف الطوارئ</label><input dir="ltr" className={inputCls} value={form.emergency_phone} onChange={set("emergency_phone")} /></div>
            <div><label className={labelCls}>صلة القرابة</label><input className={inputCls} value={form.emergency_relation} onChange={set("emergency_relation")} /></div>
          </Section>

          <Section title="بيانات الوظيفة">
            <div><label className={labelCls}>القسم</label>
              <select className={inputCls} value={form.department_id} onChange={set("department_id")}>
                <option value="">— بدون قسم —</option>
                {departments.filter((d) => d.is_active || d.id === form.department_id).map((d) => <option key={d.id} value={d.id}>{d.name_ar}</option>)}
              </select>
            </div>
            <div><label className={labelCls}>المسمى الوظيفي</label><input className={inputCls} value={form.job_title} onChange={set("job_title")} /></div>
            <div><label className={labelCls}>المدير المباشر</label>
              <select className={inputCls} value={form.manager_id} onChange={set("manager_id")}>
                <option value="">— لا يوجد —</option>
                {managerOptions.map((m) => <option key={m.id} value={m.id}>{m.full_name_ar}{m.job_title ? ` — ${m.job_title}` : ""}</option>)}
              </select>
            </div>
            <div><label className={labelCls}>نوع التوظيف</label>
              <select className={inputCls} value={form.employment_type} onChange={set("employment_type")}>
                {Object.entries(EMPLOYMENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div><label className={labelCls}>تاريخ التعيين *</label><input required type="date" className={inputCls} value={form.hire_date} onChange={set("hire_date")} /></div>
            <div><label className={labelCls}>نهاية فترة التجربة</label><input type="date" className={inputCls} value={form.probation_end_date} onChange={set("probation_end_date")} /></div>
            <div><label className={labelCls}>تاريخ انتهاء العقد</label><input type="date" className={inputCls} value={form.contract_end_date} onChange={set("contract_end_date")} /></div>
            <div><label className={labelCls}>الحالة الوظيفية</label>
              <select className={inputCls} value={form.status} onChange={set("status")}>
                {Object.entries(EMPLOYEE_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            {form.status === "terminated" && (
              <>
                <div><label className={labelCls}>تاريخ انتهاء الخدمة *</label><input required type="date" className={inputCls} value={form.termination_date} onChange={set("termination_date")} /></div>
                <div><label className={labelCls}>سبب انتهاء الخدمة</label><input className={inputCls} value={form.termination_reason} onChange={set("termination_reason")} /></div>
              </>
            )}
            <div className="sm:col-span-2"><label className={labelCls}>حساب الدخول للنظام (للخدمة الذاتية)</label>
              <select className={inputCls} value={form.account_id} onChange={set("account_id")}>
                <option value="">— غير مرتبط بحساب —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id} disabled={linkedIds.has(a.id)}>
                    {a.name} (@{a.username}){linkedIds.has(a.id) ? " — مرتبط بموظف آخر" : ""}
                  </option>
                ))}
              </select>
            </div>
          </Section>

          <Section title="الراتب والبنك (سري)">
            <div><label className={labelCls}>الراتب الأساسي (د.أ)</label><input dir="ltr" inputMode="decimal" className={inputCls} value={form.basic_salary} onChange={set("basic_salary")} placeholder="0.000" /></div>
            <div><label className={labelCls}>نسبة عمولة المبيعات % (من الطلبات المسلّمة)</label><input dir="ltr" inputMode="decimal" className={inputCls} value={form.commission_rate} onChange={set("commission_rate")} placeholder="0" /></div>
            <div><label className={labelCls}>رقم الضمان الاجتماعي</label><input dir="ltr" className={inputCls} value={form.ssc_number} onChange={set("ssc_number")} /></div>
            <div><label className={labelCls}>البنك</label><input className={inputCls} value={form.bank_name} onChange={set("bank_name")} /></div>
            <div><label className={labelCls}>IBAN</label><input dir="ltr" className={inputCls} value={form.iban} onChange={set("iban")} placeholder="JO.." /></div>
            <div className="sm:col-span-2"><label className={labelCls}>ملاحظات HR الداخلية (لا تظهر للموظف)</label>
              <textarea rows={2} className={inputCls} value={form.notes} onChange={set("notes")} />
            </div>
          </Section>
        </div>

        <div className="p-4 sm:p-5 border-t border-stone-200 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
          {error ? <p role="alert" className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p> : <span />}
          <div className="flex items-center gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-sm font-bold text-stone-600 hover:bg-stone-50">إلغاء</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 text-sm font-black">
              <Save className="w-4 h-4" />
              {saving ? "جاري الحفظ..." : isEdit ? "حفظ التعديلات" : "إضافة الموظف"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
