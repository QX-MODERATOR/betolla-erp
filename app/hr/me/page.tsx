"use client";

import Link from "next/link";
import { IdCard, Briefcase, UserRound, Landmark, Info, Fingerprint, CalendarCheck, FileText, FileBadge, TrendingUp } from "lucide-react";
import { ExpiryBadge } from "@/components/hr/document-components";
import { useMyHr } from "@/components/hr/use-my-hr";
import { StatusBadge, Avatar, InfoRow, Panel, LoadError, StatCard } from "@/components/hr/hr-ui";
import { formatCurrency } from "@/lib/utils";
import { DOCUMENT_TYPE_LABELS, EMPLOYMENT_TYPE_LABELS, GENDER_LABELS, MARITAL_LABELS, daysUntil, formatServiceLength } from "@/lib/hr";

export default function MyHrPage() {
  const { data, loading, error, reload, setLoading } = useMyHr();
  const employee = data?.employee ?? null;

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
  const annual = data!.balances.find((b) => data!.types.find((t) => t.id === b.leave_type_id)?.code === "annual");
  const todayRecord = data!.todayRecord;
  const pendingMine = data!.requests.filter((r) => r.status === "pending").length;

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
        <StatCard label="رصيد الإجازة السنوية" value={annual ? `${annual.available} يوم` : "—"} hint={annual ? `من ${annual.entitled + annual.adjustments} لسنة ${data!.balanceYear}` : undefined} />
        <StatCard label="نهاية العقد" value={e.contract_end_date ? <span dir="ltr">{e.contract_end_date}</span> : "مفتوح"}
          hint={contractDays !== null && contractDays >= 0 ? `بعد ${contractDays} يوم` : undefined} tone="text-stone-900 text-lg" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Link href="/hr/me/attendance" className="bg-white rounded-2xl border border-stone-200 p-4 flex items-center gap-3 hover:border-amber-400 transition">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0"><Fingerprint className="w-6 h-6" /></div>
          <div className="min-w-0">
            <p className="font-black text-stone-900">حضوري وانصرافي</p>
            <p className="text-xs text-stone-500">
              {!todayRecord?.check_in ? "لم تسجل حضورك اليوم بعد" : !todayRecord.check_out ? `حاضر منذ ${todayRecord.check_in}` : `دخول ${todayRecord.check_in} · خروج ${todayRecord.check_out}`}
            </p>
          </div>
        </Link>
        <Link href="/hr/me/leave" className="bg-white rounded-2xl border border-stone-200 p-4 flex items-center gap-3 hover:border-amber-400 transition">
          <div className="w-11 h-11 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0"><CalendarCheck className="w-6 h-6" /></div>
          <div className="min-w-0">
            <p className="font-black text-stone-900">إجازاتي</p>
            <p className="text-xs text-stone-500">
              {pendingMine ? `${pendingMine} طلب بانتظار الموافقة` : "اطلب إجازة وتابع أرصدتك"}
              {data!.teamRequests.length ? ` · ${data!.teamRequests.length} طلب من فريقك بانتظارك` : ""}
            </p>
          </div>
        </Link>
        <Link href="/hr/me/payslips" className="bg-white rounded-2xl border border-stone-200 p-4 flex items-center gap-3 hover:border-amber-400 transition">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0"><FileText className="w-6 h-6" /></div>
          <div className="min-w-0">
            <p className="font-black text-stone-900">كشوف رواتبي</p>
            <p className="text-xs text-stone-500">كشوف الأشهر المعتمدة والسلف</p>
          </div>
        </Link>
        <Link href="/hr/me/reviews" className="bg-white rounded-2xl border border-stone-200 p-4 flex items-center gap-3 hover:border-amber-400 transition">
          <div className="w-11 h-11 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0"><TrendingUp className="w-6 h-6" /></div>
          <div className="min-w-0">
            <p className="font-black text-stone-900">تقييماتي</p>
            <p className="text-xs text-stone-500">تقييمات الأداء وتقييم فريقك</p>
          </div>
        </Link>
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
        <Panel title="وثائقي" icon={<FileBadge className="w-4 h-4 text-amber-500" />}>
          {!data!.documents.length ? <p className="text-sm text-stone-400">لا توجد وثائق مسجلة لدى الموارد البشرية.</p> : (
            <ul className="-my-2 divide-y divide-stone-100">
              {data!.documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-bold">{DOCUMENT_TYPE_LABELS[d.doc_type]}{d.title ? ` — ${d.title}` : ""}</p>
                    <p className="text-[11px] text-stone-500" dir="ltr">{d.doc_number || ""}{d.expiry_date ? `  ·  ${d.expiry_date}` : ""}</p>
                  </div>
                  <ExpiryBadge days={d.days_left} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900 flex gap-2 items-start h-fit">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <p>إذا كانت أي من بياناتك غير صحيحة، يرجى التواصل مع قسم الموارد البشرية لتحديثها.</p>
        </div>
      </div>
    </div>
  );
}
