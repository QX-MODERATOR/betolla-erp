"use client";

import { useCallback, useEffect, useState } from "react";
import { IdCard, Briefcase, UserRound, Landmark, Info } from "lucide-react";
import { loadBusiness } from "@/lib/business-client";
import { StatusBadge, Avatar, InfoRow, Panel, LoadError, StatCard } from "@/components/hr/hr-ui";
import { formatCurrency } from "@/lib/utils";
import { EMPLOYMENT_TYPE_LABELS, GENDER_LABELS, MARITAL_LABELS, daysUntil, formatServiceLength, type HrEmployee } from "@/lib/hr";

export default function MyHrPage() {
  const [employee, setEmployee] = useState<HrEmployee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      setEmployee((await loadBusiness<{ employee: HrEmployee | null }>("/api/hr/me")).employee);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل ملفك الوظيفي.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);

  const header = (
    <div>
      <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5">
        <IdCard className="w-6 h-6 text-amber-500" /> ملفي الوظيفي
      </h2>
      <p className="text-xs sm:text-sm text-stone-500 mt-1">بياناتك لدى الموارد البشرية</p>
    </div>
  );

  if (loading) {
    return <div className="space-y-6">{header}<div className="bg-white rounded-2xl border border-stone-200 p-10 text-center text-sm text-stone-400">جاري التحميل...</div></div>;
  }

  if (error || !employee) {
    return (
      <div className="space-y-6">
        {header}
        {error ? <LoadError message={error} onRetry={() => { setLoading(true); void reload(); }} /> : (
          <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center">
            <Info className="w-10 h-10 text-amber-400 mx-auto mb-3" />
            <p className="font-bold text-stone-800">لم يتم ربط حسابك بملف وظيفي بعد</p>
            <p className="text-sm text-stone-500 mt-1">يرجى التواصل مع قسم الموارد البشرية لربط حسابك بملفك.</p>
          </div>
        )}
      </div>
    );
  }

  const e = employee;
  const contractDays = daysUntil(e.contract_end_date);

  return (
    <div className="space-y-6">
      {header}

      <div className="bg-white rounded-3xl border border-stone-200 p-5 flex items-center gap-4">
        <Avatar name={e.full_name_ar} className="w-16 h-16 text-2xl rounded-2xl" />
        <div className="min-w-0">
          <p className="text-xl font-black text-stone-900 truncate">{e.full_name_ar}</p>
          <p className="text-sm text-stone-600">{[e.job_title, e.department_name].filter(Boolean).join(" · ")}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <StatusBadge status={e.status} />
            <span dir="ltr" className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">{e.employee_no}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="مدة الخدمة" value={formatServiceLength(e.hire_date)} />
        <StatCard label="الراتب الأساسي" value={formatCurrency(e.basic_salary)} />
        <StatCard label="رصيد الإجازات" value="—" hint="قريبًا" />
        <StatCard label="نهاية العقد" value={e.contract_end_date ? <span dir="ltr">{e.contract_end_date}</span> : "مفتوح"}
          hint={contractDays !== null && contractDays >= 0 ? `بعد ${contractDays} يوم` : undefined} tone="text-stone-900 text-lg" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="الوظيفة" icon={<Briefcase className="w-4 h-4 text-amber-500" />}>
          <dl>
            <InfoRow label="القسم" value={e.department_name} />
            <InfoRow label="المسمى الوظيفي" value={e.job_title} />
            <InfoRow label="المدير المباشر" value={e.manager_name} />
            <InfoRow label="نوع التوظيف" value={EMPLOYMENT_TYPE_LABELS[e.employment_type]} />
            <InfoRow label="تاريخ التعيين" value={e.hire_date} ltr />
            {e.status === "probation" && <InfoRow label="نهاية فترة التجربة" value={e.probation_end_date} ltr />}
          </dl>
        </Panel>
        <Panel title="البيانات الشخصية" icon={<UserRound className="w-4 h-4 text-amber-500" />}>
          <dl>
            <InfoRow label="الرقم الوطني" value={e.national_id} ltr />
            <InfoRow label="الجنس" value={e.gender ? GENDER_LABELS[e.gender] : ""} />
            <InfoRow label="تاريخ الميلاد" value={e.birth_date} ltr />
            <InfoRow label="الحالة الاجتماعية" value={e.marital_status ? MARITAL_LABELS[e.marital_status] : ""} />
            <InfoRow label="الهاتف" value={e.phone} ltr />
            <InfoRow label="جهة الطوارئ" value={[e.emergency_name, e.emergency_phone].filter(Boolean).join(" · ")} />
          </dl>
        </Panel>
        <Panel title="الراتب والبنك" icon={<Landmark className="w-4 h-4 text-amber-500" />}>
          <dl>
            <InfoRow label="الراتب الأساسي" value={formatCurrency(e.basic_salary)} />
            <InfoRow label="رقم الضمان الاجتماعي" value={e.ssc_number} ltr />
            <InfoRow label="البنك" value={e.bank_name} />
            <InfoRow label="IBAN" value={e.iban && <span className="font-mono text-xs">{e.iban}</span>} ltr />
          </dl>
        </Panel>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900 flex gap-2 items-start h-fit">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <p>إذا كانت أي من بياناتك غير صحيحة، يرجى التواصل مع قسم الموارد البشرية لتحديثها. طلبات الإجازة وكشوف الرواتب ستتوفر هنا قريبًا.</p>
        </div>
      </div>
    </div>
  );
}
