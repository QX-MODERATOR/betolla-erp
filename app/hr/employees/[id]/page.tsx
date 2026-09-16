"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowRight, Pencil, Briefcase, UserRound, Phone, Landmark, History, CalendarClock, KeyRound, AlertTriangle,
} from "lucide-react";
import { loadBusiness } from "@/lib/business-client";
import { EmployeeFormModal, type LinkableAccount } from "@/components/hr/employee-form-modal";
import { StatusBadge, Avatar, InfoRow, Panel, LoadError } from "@/components/hr/hr-ui";
import { formatCurrency, cn } from "@/lib/utils";
import {
  EMPLOYMENT_TYPE_LABELS, GENDER_LABELS, MARITAL_LABELS, HR_FIELD_LABELS, EMPLOYEE_STATUS_LABELS,
  daysUntil, formatServiceLength,
  type HrEmployee, type HrDepartment, type HrAuditEntry, type EmployeeStatus,
} from "@/lib/hr";

type Detail = { employee: HrEmployee; history: HrAuditEntry[]; accounts: LinkableAccount[] };
type Directory = { employees: HrEmployee[]; departments: HrDepartment[] };

const TABS = [
  { id: "overview", label: "نظرة عامة", icon: UserRound },
  { id: "job", label: "الوظيفة", icon: Briefcase },
  { id: "pay", label: "الراتب والبنك", icon: Landmark },
  { id: "history", label: "سجل التغييرات", icon: History },
] as const;

const ACTION_LABELS: Record<string, string> = { create: "إنشاء الملف", update: "تعديل بيانات", status_change: "تغيير الحالة" };

function describeValue(field: string, value: unknown, directory: Directory): string {
  if (value === null || value === undefined || value === "") return "—";
  const v = String(value);
  if (field === "status") return EMPLOYEE_STATUS_LABELS[v as EmployeeStatus]?.label || v;
  if (field === "employment_type") return EMPLOYMENT_TYPE_LABELS[v as keyof typeof EMPLOYMENT_TYPE_LABELS] || v;
  if (field === "department_id") return directory.departments.find((d) => d.id === v)?.name_ar || v;
  if (field === "manager_id") return directory.employees.find((e) => e.id === v)?.full_name_ar || v;
  if (field === "gender") return GENDER_LABELS[v as keyof typeof GENDER_LABELS] || v;
  return v;
}

function DateAlert({ label, date }: { label: string; date: string | null }) {
  const days = daysUntil(date);
  if (days === null || days > 60) return null;
  const past = days < 0;
  return (
    <div className={cn("flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold",
      past ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-amber-50 border-amber-200 text-amber-800")}>
      <AlertTriangle className="w-4 h-4 shrink-0" />
      {past ? `${label} انتهى منذ ${-days} يوم (${date})` : days === 0 ? `${label} ينتهي اليوم` : `${label} ينتهي خلال ${days} يوم (${date})`}
    </div>
  );
}

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [directory, setDirectory] = useState<Directory>({ employees: [], departments: [] });
  const [error, setError] = useState("");
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("overview");
  const [editing, setEditing] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [d, dir] = await Promise.all([
        loadBusiness<Detail>(`/api/hr/employees?id=${encodeURIComponent(id)}`),
        loadBusiness<Directory>("/api/hr/employees"),
      ]);
      setDetail(d);
      setDirectory(dir);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل ملف الموظف.");
    }
  }, [id]);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);

  const backLink = (
    <Link href="/hr/employees" className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-500 hover:text-amber-700">
      <ArrowRight className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" /> العودة إلى ملفات الموظفين
    </Link>
  );

  if (!detail) {
    return (
      <div className="space-y-4">
        {backLink}
        {error ? <LoadError message={error} onRetry={() => void reload()} /> :
          <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center text-sm text-stone-400">جاري تحميل ملف الموظف...</div>}
      </div>
    );
  }

  const e = detail.employee;
  const account = detail.accounts.find((a) => a.id === e.account_id);
  const reports = directory.employees.filter((x) => x.manager_id === e.id && x.status !== "terminated");

  return (
    <div className="space-y-5">
      {backLink}
      {error && <LoadError message={error} onRetry={() => void reload()} />}

      <div className="bg-white rounded-3xl border border-stone-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Avatar name={e.full_name_ar} className="w-16 h-16 text-2xl rounded-2xl" />
          <div className="min-w-0">
            <h2 className="text-xl font-black text-stone-900 truncate">{e.full_name_ar}</h2>
            {e.full_name_en && <p dir="ltr" className="text-xs text-stone-500 text-end sm:text-start">{e.full_name_en}</p>}
            <p className="text-sm text-stone-600 mt-0.5">{[e.job_title, e.department_name].filter(Boolean).join(" · ") || "بدون مسمى / قسم"}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <StatusBadge status={e.status} />
              <span dir="ltr" className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">{e.employee_no}</span>
              {account
                ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1"><KeyRound className="w-3 h-3" />@{account.username}</span>
                : <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">غير مرتبط بحساب دخول</span>}
            </div>
          </div>
        </div>
        <button onClick={() => setEditing(true)} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-sm rounded-xl">
          <Pencil className="w-4 h-4" /> تعديل الملف
        </button>
      </div>

      {e.status !== "terminated" && (
        <div className="space-y-2">
          <DateAlert label="العقد" date={e.contract_end_date} />
          {e.status === "probation" && <DateAlert label="فترة التجربة" date={e.probation_end_date} />}
        </div>
      )}

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition",
              tab === t.id ? "bg-stone-900 text-white" : "bg-white text-stone-600 hover:bg-stone-50 border border-stone-200")}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel title="البيانات الشخصية" icon={<UserRound className="w-4 h-4 text-amber-500" />}>
            <dl>
              <InfoRow label="الرقم الوطني" value={e.national_id} ltr />
              <InfoRow label="الجنسية" value={e.nationality} />
              <InfoRow label="الجنس" value={e.gender ? GENDER_LABELS[e.gender] : ""} />
              <InfoRow label="تاريخ الميلاد" value={e.birth_date} ltr />
              <InfoRow label="الحالة الاجتماعية" value={e.marital_status ? MARITAL_LABELS[e.marital_status] : ""} />
            </dl>
          </Panel>
          <Panel title="التواصل والطوارئ" icon={<Phone className="w-4 h-4 text-amber-500" />}>
            <dl>
              <InfoRow label="الهاتف" value={e.phone && <a href={`tel:${e.phone}`} className="text-amber-700 font-mono">{e.phone}</a>} />
              <InfoRow label="البريد" value={e.email && <a href={`mailto:${e.email}`} className="text-amber-700">{e.email}</a>} />
              <InfoRow label="العنوان" value={[e.city, e.address].filter(Boolean).join(" - ")} />
              <InfoRow label="جهة الطوارئ" value={[e.emergency_name, e.emergency_relation].filter(Boolean).join(" · ")} />
              <InfoRow label="هاتف الطوارئ" value={e.emergency_phone} ltr />
            </dl>
          </Panel>
          {e.notes && (
            <div className="lg:col-span-2">
              <Panel title="ملاحظات HR الداخلية">
                <p className="text-sm text-stone-700 whitespace-pre-wrap">{e.notes}</p>
              </Panel>
            </div>
          )}
        </div>
      )}

      {tab === "job" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel title="بيانات التوظيف" icon={<Briefcase className="w-4 h-4 text-amber-500" />}>
            <dl>
              <InfoRow label="القسم" value={e.department_name} />
              <InfoRow label="المسمى الوظيفي" value={e.job_title} />
              <InfoRow label="المدير المباشر" value={e.manager_id && <Link className="text-amber-700 font-bold" href={`/hr/employees/${e.manager_id}`}>{e.manager_name}</Link>} />
              <InfoRow label="نوع التوظيف" value={EMPLOYMENT_TYPE_LABELS[e.employment_type]} />
              <InfoRow label="تاريخ التعيين" value={e.hire_date} ltr />
              <InfoRow label="مدة الخدمة" value={formatServiceLength(e.hire_date, e.termination_date)} />
            </dl>
          </Panel>
          <Panel title="العقد والتواريخ" icon={<CalendarClock className="w-4 h-4 text-amber-500" />}>
            <dl>
              <InfoRow label="نهاية فترة التجربة" value={e.probation_end_date} ltr />
              <InfoRow label="نهاية العقد" value={e.contract_end_date} ltr />
              {e.status === "terminated" && <InfoRow label="تاريخ انتهاء الخدمة" value={e.termination_date} ltr />}
              {e.status === "terminated" && <InfoRow label="سبب انتهاء الخدمة" value={e.termination_reason} />}
            </dl>
          </Panel>
          <div className="lg:col-span-2">
            <Panel title={`المرؤوسون المباشرون (${reports.length})`} icon={<UserRound className="w-4 h-4 text-amber-500" />}>
              {reports.length ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {reports.map((r) => (
                    <Link key={r.id} href={`/hr/employees/${r.id}`} className="flex items-center gap-2 p-2 rounded-xl border border-stone-100 hover:bg-amber-50/50">
                      <Avatar name={r.full_name_ar} className="w-8 h-8 text-xs" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-stone-900 truncate">{r.full_name_ar}</p>
                        <p className="text-[11px] text-stone-500 truncate">{r.job_title || "—"}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : <p className="text-sm text-stone-400">لا يوجد مرؤوسون مباشرون.</p>}
            </Panel>
          </div>
        </div>
      )}

      {tab === "pay" && (
        <Panel title="الراتب والبنك (سري)" icon={<Landmark className="w-4 h-4 text-amber-500" />}>
          <dl className="max-w-xl">
            <InfoRow label="الراتب الأساسي الشهري" value={formatCurrency(e.basic_salary)} />
            <InfoRow label="رقم الضمان الاجتماعي" value={e.ssc_number} ltr />
            <InfoRow label="البنك" value={e.bank_name} />
            <InfoRow label="IBAN" value={e.iban && <span className="font-mono text-xs">{e.iban}</span>} ltr />
          </dl>
          <p className="text-[11px] text-stone-400 mt-3">البدلات والاقتطاعات والسلف ومسيرات الرواتب ستتوفر في مرحلة الرواتب.</p>
        </Panel>
      )}

      {tab === "history" && (
        <Panel title="سجل التغييرات (Audit Log)" icon={<History className="w-4 h-4 text-amber-500" />}>
          {!detail.history.length ? <p className="text-sm text-stone-400">لا توجد تغييرات مسجلة.</p> : (
            <ol className="space-y-3">
              {detail.history.map((h) => (
                <li key={h.id} className="border border-stone-100 rounded-xl p-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-black text-stone-800">{ACTION_LABELS[h.action] || h.action}</span>
                    <span dir="ltr" className="text-stone-400 font-mono">{new Date(h.created_at).toLocaleString("en-GB")} · {h.actor_id}</span>
                  </div>
                  {h.action !== "create" && (
                    <ul className="mt-2 space-y-1">
                      {Object.entries(h.changes as Record<string, { from: unknown; to: unknown }>).map(([field, c]) => (
                        <li key={field} className="text-xs text-stone-600">
                          <span className="font-bold">{HR_FIELD_LABELS[field] || field}:</span>{" "}
                          <span className="line-through text-stone-400">{describeValue(field, c.from, directory)}</span>{" ← "}
                          <span className="text-stone-900">{describeValue(field, c.to, directory)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Panel>
      )}

      {editing && (
        <EmployeeFormModal employee={e} departments={directory.departments} employees={directory.employees} accounts={detail.accounts}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); void reload(); }} />
      )}
    </div>
  );
}
