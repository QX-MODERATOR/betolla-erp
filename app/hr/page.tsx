"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BriefcaseBusiness, UserPlus, Contact, CalendarClock, Cake, Building2, AlertTriangle } from "lucide-react";
import { loadBusiness } from "@/lib/business-client";
import { StatCard, Panel, Avatar, LoadError } from "@/components/hr/hr-ui";
import { formatCurrency } from "@/lib/utils";
import { daysUntil, type HrEmployee, type HrDepartment } from "@/lib/hr";

type Data = { employees: HrEmployee[]; departments: HrDepartment[] };

// Next birthday as days from today (0 = today).
function daysToBirthday(birth: string | null, today = new Date()): number | null {
  if (!birth) return null;
  const [, m, d] = birth.split("-").map(Number);
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let next = new Date(today.getFullYear(), m - 1, d);
  if (next < base) next = new Date(today.getFullYear() + 1, m - 1, d);
  return Math.round((next.getTime() - base.getTime()) / 86400000);
}

export default function HrDashboardPage() {
  const [data, setData] = useState<Data>({ employees: [], departments: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      setData(await loadBusiness<Data>("/api/hr/employees"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل بيانات الموارد البشرية.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);

  const current = data.employees.filter((e) => e.status !== "terminated");
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const newThisMonth = current.filter((e) => e.hire_date >= monthStart);
  const payroll = current.reduce((sum, e) => sum + Math.round((e.basic_salary || 0) * 1000), 0) / 1000;

  // Upcoming contract / probation ends within 60 days (including already-lapsed ones still active).
  const expiries = current.flatMap((e) => {
    const items: { e: HrEmployee; label: string; date: string; days: number }[] = [];
    const c = daysUntil(e.contract_end_date);
    if (c !== null && c <= 60) items.push({ e, label: "انتهاء العقد", date: e.contract_end_date!, days: c });
    const p = daysUntil(e.probation_end_date);
    if (e.status === "probation" && p !== null && p <= 60) items.push({ e, label: "انتهاء التجربة", date: e.probation_end_date!, days: p });
    return items;
  }).sort((a, b) => a.days - b.days);

  const birthdays = current
    .map((e) => ({ e, days: daysToBirthday(e.birth_date) }))
    .filter((x): x is { e: HrEmployee; days: number } => x.days !== null && x.days <= 30)
    .sort((a, b) => a.days - b.days);

  const maxHeadcount = Math.max(1, ...data.departments.map((d) => d.headcount));
  const unassigned = current.filter((e) => !e.department_id).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5">
            <BriefcaseBusiness className="w-6 h-6 text-amber-500" /> لوحة الموارد البشرية
          </h2>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">نظرة شاملة على القوى العاملة والتنبيهات الوظيفية</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/hr/employees" className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 font-bold text-sm rounded-xl">
            <Contact className="w-4 h-4" /> ملفات الموظفين
          </Link>
        </div>
      </div>

      {error && <LoadError message={error} onRetry={() => { setLoading(true); void reload(); }} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="إجمالي القوى العاملة" value={loading ? "…" : current.length} hint={`${data.departments.filter((d) => d.is_active).length} أقسام فعّالة`} />
        <StatCard label="تعيينات هذا الشهر" value={loading ? "…" : newThisMonth.length} tone="text-emerald-600" />
        <StatCard label="تنبيهات العقود والتجربة" value={loading ? "…" : expiries.length} tone={expiries.length ? "text-amber-600" : "text-stone-900"} hint="خلال 60 يومًا" />
        <StatCard label="الرواتب الأساسية الشهرية" value={loading ? "…" : formatCurrency(payroll)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Panel title="تنبيهات العقود وفترات التجربة" icon={<CalendarClock className="w-4 h-4 text-amber-500" />}>
            {!expiries.length ? <p className="text-sm text-stone-400">لا توجد عقود أو فترات تجربة تنتهي خلال 60 يومًا.</p> : (
              <ul className="divide-y divide-stone-100">
                {expiries.map(({ e, label, date, days }) => (
                  <li key={e.id + label}>
                    <Link href={`/hr/employees/${e.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-amber-50/40 rounded-lg px-1">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar name={e.full_name_ar} className="w-8 h-8 text-xs" />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-stone-900 truncate">{e.full_name_ar}</p>
                          <p className="text-[11px] text-stone-500">{label} · <span dir="ltr" className="font-mono">{date}</span></p>
                        </div>
                      </div>
                      <span className={`text-[11px] font-black px-2 py-0.5 rounded-full shrink-0 ${days < 0 ? "bg-rose-100 text-rose-700" : days <= 14 ? "bg-amber-100 text-amber-800" : "bg-stone-100 text-stone-600"}`}>
                        {days < 0 ? `متأخر ${-days} يوم` : days === 0 ? "اليوم" : `${days} يوم`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel title="أعياد ميلاد قادمة" icon={<Cake className="w-4 h-4 text-amber-500" />}>
          {!birthdays.length ? <p className="text-sm text-stone-400">لا توجد أعياد ميلاد خلال 30 يومًا.</p> : (
            <ul className="space-y-2">
              {birthdays.map(({ e, days }) => (
                <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-bold text-stone-800 truncate">{e.full_name_ar}</span>
                  <span className="text-[11px] text-stone-500 shrink-0">{days === 0 ? "🎉 اليوم" : `بعد ${days} يوم`}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="lg:col-span-2">
          <Panel title="توزيع الموظفين على الأقسام" icon={<Building2 className="w-4 h-4 text-amber-500" />}>
            <ul className="space-y-2.5">
              {data.departments.filter((d) => d.is_active).map((d) => (
                <li key={d.id}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-bold text-stone-800">{d.name_ar}{d.head_name ? <span className="text-stone-400 font-normal"> · {d.head_name}</span> : null}</span>
                    <span className="font-black text-stone-900">{d.headcount}</span>
                  </div>
                  <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-l from-[#9e8959] to-[#c28a40]" style={{ width: `${(d.headcount / maxHeadcount) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            {unassigned > 0 && (
              <p className="mt-3 text-xs font-bold text-amber-700 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> {unassigned} موظف بدون قسم
              </p>
            )}
          </Panel>
        </div>

        <Panel title="أحدث التعيينات" icon={<UserPlus className="w-4 h-4 text-amber-500" />}>
          {!current.length ? (
            <p className="text-sm text-stone-400">
              لا يوجد موظفون بعد. <Link href="/hr/employees" className="text-amber-700 font-bold">أضف أول موظف</Link>
            </p>
          ) : (
            <ul className="space-y-2">
              {[...current].sort((a, b) => b.hire_date.localeCompare(a.hire_date)).slice(0, 6).map((e) => (
                <li key={e.id}>
                  <Link href={`/hr/employees/${e.id}`} className="flex items-center justify-between gap-2 text-sm hover:text-amber-700">
                    <span className="font-bold truncate">{e.full_name_ar}</span>
                    <span dir="ltr" className="text-[11px] text-stone-500 font-mono shrink-0">{e.hire_date}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
