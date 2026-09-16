"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Contact, Search, UserPlus, Building2, Download, Phone, KeyRound, Users } from "lucide-react";
import { loadBusiness } from "@/lib/business-client";
import { EmptyState } from "@/components/common/empty-state";
import { EmployeeFormModal, type LinkableAccount } from "@/components/hr/employee-form-modal";
import { DepartmentsModal } from "@/components/hr/departments-modal";
import { BulkAccountsModal } from "@/components/hr/bulk-accounts-modal";
import { StatusBadge, Avatar, StatCard, LoadError } from "@/components/hr/hr-ui";
import { formatCurrency } from "@/lib/utils";
import {
  EMPLOYMENT_TYPE_LABELS, EMPLOYEE_STATUS_LABELS, formatServiceLength,
  type HrEmployee, type HrDepartment, type EmployeeStatus,
} from "@/lib/hr";

type Data = { employees: HrEmployee[]; departments: HrDepartment[]; accounts: LinkableAccount[] };

export default function EmployeesPage() {
  const [data, setData] = useState<Data>({ employees: [], departments: [], accounts: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [status, setStatus] = useState<"current" | "all" | EmployeeStatus>("current");
  const [showForm, setShowForm] = useState(false);
  const [showDepartments, setShowDepartments] = useState(false);
  const [showBulk, setShowBulk] = useState(false);

  const reload = useCallback(async () => {
    try {
      setData(await loadBusiness<Data>("/api/hr/employees"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل ملفات الموظفين.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);

  const { employees, departments, accounts } = data;
  const current = employees.filter((e) => e.status !== "terminated");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (status === "current" ? e.status === "terminated" : status !== "all" && e.status !== status) return false;
      if (department !== "all" && (e.department_id || "none") !== department) return false;
      if (!q) return true;
      return [e.full_name_ar, e.full_name_en, e.employee_no, e.phone, e.job_title, e.email, e.national_id]
        .some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [employees, search, department, status]);

  const payroll = current.reduce((sum, e) => sum + Math.round((e.basic_salary || 0) * 1000), 0) / 1000;
  const unlinked = current.filter((e) => !e.account_id).length;

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const rows = filtered.map((e) => ({
      "الرقم الوظيفي": e.employee_no, "الاسم": e.full_name_ar, "Name": e.full_name_en,
      "القسم": e.department_name, "المسمى": e.job_title, "المدير المباشر": e.manager_name,
      "نوع التوظيف": EMPLOYMENT_TYPE_LABELS[e.employment_type], "الحالة": EMPLOYEE_STATUS_LABELS[e.status].label,
      "تاريخ التعيين": e.hire_date, "نهاية العقد": e.contract_end_date || "", "الهاتف": e.phone, "البريد": e.email,
      "الرقم الوطني": e.national_id || "", "الراتب الأساسي": e.basic_salary ?? "", "الضمان": e.ssc_number || "",
      "البنك": e.bank_name || "", "IBAN": e.iban || "",
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet["!views"] = [{ RTL: true }];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Employees");
    XLSX.writeFile(book, `betolla-employees-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5">
            <Contact className="w-6 h-6 text-amber-500" /> ملفات الموظفين
          </h2>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">السجل الوظيفي الكامل، الأقسام، والتسلسل الإداري</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setShowDepartments(true)} disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 font-bold text-sm rounded-xl disabled:opacity-50">
            <Building2 className="w-4 h-4" /> الأقسام
          </button>
          <button onClick={() => setShowBulk(true)} disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 font-bold text-sm rounded-xl disabled:opacity-50">
            <Users className="w-4 h-4" /> ملفات لحسابات النظام
          </button>
          <button onClick={exportExcel} disabled={!filtered.length}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 font-bold text-sm rounded-xl disabled:opacity-50">
            <Download className="w-4 h-4" /> Excel
          </button>
          <button onClick={() => setShowForm(true)} disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 font-bold text-sm rounded-xl">
            <UserPlus className="w-4 h-4" /> موظف جديد
          </button>
        </div>
      </div>

      {error && <LoadError message={error} onRetry={() => { setLoading(true); void reload(); }} />}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="الموظفون الحاليون" value={current.length} hint={`${employees.length - current.length} منتهية خدمتهم`} />
        <StatCard label="في فترة التجربة" value={current.filter((e) => e.status === "probation").length} tone="text-blue-600" />
        <StatCard label="إجمالي الرواتب الأساسية" value={formatCurrency(payroll)} hint="شهريًا، قبل البدلات والاقتطاعات" />
        <StatCard label="حسابات بدون ملف وظيفي" value={accounts.filter((a) => !employees.some((e) => e.account_id === a.id)).length}
          tone={unlinked ? "text-amber-600" : "text-emerald-600"} hint={`${unlinked} موظف بدون حساب دخول`} />
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 p-3 flex flex-col md:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-stone-400 absolute top-1/2 -translate-y-1/2 start-3" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم، الرقم الوظيفي، الهاتف، المسمى..."
            className="w-full ps-9 pe-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/60" />
        </div>
        <select value={department} onChange={(e) => setDepartment(e.target.value)} className="px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white">
          <option value="all">كل الأقسام</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name_ar} ({d.headcount})</option>)}
          <option value="none">بدون قسم</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white">
          <option value="current">الموظفون الحاليون</option>
          <option value="all">الكل (مع المنتهية خدمتهم)</option>
          {Object.entries(EMPLOYEE_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center text-sm text-stone-400">جاري تحميل ملفات الموظفين...</div>
      ) : !filtered.length ? (
        <div className="bg-white rounded-2xl border border-stone-200">
          <EmptyState icon={employees.length ? "search" : "inbox"}
            title={employees.length ? "لا توجد نتائج مطابقة" : "لم يُضف أي موظف بعد"}
            subtitle={employees.length ? "جرّب تغيير البحث أو الفلاتر" : "ابدأ بإضافة الموظفين من زر «موظف جديد»"} />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-[11px] text-stone-500 font-bold">
                <tr>
                  <th className="text-start px-4 py-3">الموظف</th>
                  <th className="text-start px-4 py-3 hidden md:table-cell">القسم / المدير</th>
                  <th className="text-start px-4 py-3 hidden lg:table-cell">التعيين</th>
                  <th className="text-start px-4 py-3 hidden sm:table-cell">الراتب</th>
                  <th className="text-start px-4 py-3">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-amber-50/40">
                    <td className="px-4 py-3">
                      <Link href={`/hr/employees/${e.id}`} className="flex items-center gap-3 group">
                        <Avatar name={e.full_name_ar} />
                        <div className="min-w-0">
                          <p className="font-bold text-stone-900 group-hover:text-amber-700 truncate flex items-center gap-1.5">
                            {e.full_name_ar}
                            {e.account_id && <KeyRound className="w-3 h-3 text-emerald-500 shrink-0" aria-label="مرتبط بحساب دخول" />}
                          </p>
                          <p className="text-[11px] text-stone-500 truncate">
                            <span dir="ltr" className="font-mono">{e.employee_no}</span>{e.job_title ? ` · ${e.job_title}` : ""}
                          </p>
                          {e.phone && <p dir="ltr" className="text-[11px] text-stone-400 font-mono flex items-center gap-1 justify-end md:hidden"><Phone className="w-3 h-3" />{e.phone}</p>}
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <p className="text-stone-800">{e.department_name || <span className="text-stone-300">—</span>}</p>
                      {e.manager_name && <p className="text-[11px] text-stone-500">يتبع: {e.manager_name}</p>}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <p className="text-stone-800 font-mono text-xs" dir="ltr">{e.hire_date}</p>
                      <p className="text-[11px] text-stone-500">{formatServiceLength(e.hire_date, e.termination_date)} · {EMPLOYMENT_TYPE_LABELS[e.employment_type]}</p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell font-bold text-stone-800 whitespace-nowrap">{formatCurrency(e.basic_salary)}</td>
                    <td className="px-4 py-3"><StatusBadge status={e.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-[11px] text-stone-400 border-t border-stone-100">{filtered.length} من {employees.length} موظف</p>
        </div>
      )}

      {showForm && (
        <EmployeeFormModal departments={departments} employees={employees} accounts={accounts}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); void reload(); }} />
      )}
      {showBulk && (
        <BulkAccountsModal accounts={accounts} employees={employees}
          onClose={() => setShowBulk(false)} onSaved={() => { setShowBulk(false); void reload(); }} />
      )}
      {showDepartments && (
        <DepartmentsModal departments={departments} employees={employees}
          onClose={() => setShowDepartments(false)} onChanged={reload} />
      )}
    </div>
  );
}
