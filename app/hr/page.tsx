"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BriefcaseBusiness, UserPlus, Contact, CalendarClock, Cake, Building2, AlertTriangle, Fingerprint, CalendarDays, Wallet, UserSearch, TrendingUp, Users } from "lucide-react";
import { loadBusiness } from "@/lib/business-client";
import { StatCard, Panel, Avatar, LoadError } from "@/components/hr/hr-ui";
import { formatCurrency } from "@/lib/utils";
import { attendanceSettingsOf } from "@/components/hr/use-my-hr";
import {
  expiryLabel, isLate, monthLabel, reviewPeriods, serviceLength, PAYROLL_STATUS_LABELS,
  type HrEmployee, type HrDepartment, type HrAttendance, type HrLeaveRequest, type HrPayrollRun,
  type HrExpiry, type HrOpening, type HrCandidate, type HrReview,
} from "@/lib/hr";

type Data = { employees: HrEmployee[]; departments: HrDepartment[] };
type Today = { today: string; records: HrAttendance[]; pending: HrLeaveRequest[]; onLeave: HrLeaveRequest[]; late: number; payroll: HrPayrollRun | null };
type Talent = { expiries: HrExpiry[]; openings: HrOpening[]; candidates: HrCandidate[]; reviews: HrReview[] };

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
  const [todayInfo, setTodayInfo] = useState<Today | null>(null);
  const [talent, setTalent] = useState<Talent>({ expiries: [], openings: [], candidates: [], reviews: [] });

  const reload = useCallback(async () => {
    try {
      const [directory, attendance, leave, payroll, alerts, recruitment, reviews] = await Promise.all([
        loadBusiness<Data>("/api/hr/employees"),
        loadBusiness<{ today: string; records: HrAttendance[]; settings: Record<string, unknown> }>("/api/hr/attendance"),
        loadBusiness<{ requests: HrLeaveRequest[] }>("/api/hr/leave"),
        loadBusiness<{ runs: HrPayrollRun[] }>("/api/hr/payroll"),
        // Also dispatches any newly-due expiry reminders.
        loadBusiness<{ expiries: HrExpiry[] }>("/api/hr/alerts?days=60"),
        loadBusiness<{ openings: HrOpening[]; candidates: HrCandidate[] }>("/api/hr/recruitment"),
        loadBusiness<{ reviews: HrReview[] }>("/api/hr/reviews"),
      ]);
      setTalent({ expiries: alerts.expiries, openings: recruitment.openings, candidates: recruitment.candidates, reviews: reviews.reviews });
      setData(directory);
      const settings = attendanceSettingsOf(attendance.settings);
      const records = attendance.records.filter((r) => r.work_date === attendance.today && r.check_in);
      setTodayInfo({
        today: attendance.today, records,
        late: records.filter((r) => isLate(r.check_in, settings)).length,
        pending: leave.requests.filter((r) => r.status === "pending"),
        onLeave: leave.requests.filter((r) => r.status === "approved" && r.start_date <= attendance.today && r.end_date >= attendance.today),
        payroll: payroll.runs[0] ?? null,
      });
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

  // Documents, contracts and probation periods ending within 60 days (server-computed, includes lapsed ones).
  const expiries = talent.expiries;

  // Workforce indicators over the last 12 months.
  const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().slice(0, 10);
  const leavers = data.employees.filter((e) => e.status === "terminated" && e.termination_date && e.termination_date >= yearAgo).length;
  const headcountYearAgo = data.employees.filter((e) => e.hire_date <= yearAgo && (!e.termination_date || e.termination_date > yearAgo)).length;
  const turnover = current.length + headcountYearAgo ? Math.round((leavers / ((current.length + headcountYearAgo) / 2 || 1)) * 100) : 0;
  const avgTenureMonths = current.length
    ? Math.round(current.reduce((s, e) => { const t = serviceLength(e.hire_date); return s + t.years * 12 + t.months; }, 0) / current.length) : 0;
  const women = current.filter((e) => e.gender === "female").length, men = current.filter((e) => e.gender === "male").length;

  const openRoles = talent.openings.filter((o) => o.status === "open");
  const activeCandidates = talent.candidates.filter((c) => !["hired", "rejected", "withdrawn"].includes(c.stage));
  const nextInterview = activeCandidates.filter((c) => c.interview_at && c.interview_at >= now.toISOString())
    .sort((a, b) => a.interview_at!.localeCompare(b.interview_at!))[0];
  const lastQuarter = todayInfo ? reviewPeriods(todayInfo.today)[1].label : "";
  const reviewedLastQuarter = new Set(talent.reviews.filter((r) => r.period_label === lastQuarter && r.status !== "draft").map((r) => r.employee_id));
  const awaitingAck = talent.reviews.filter((r) => r.status === "submitted").length;

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
        <StatCard label="تنبيهات الوثائق والعقود" value={loading ? "…" : expiries.length} tone={expiries.length ? "text-amber-600" : "text-stone-900"} hint="منتهية أو تنتهي خلال 60 يومًا" />
        <StatCard label="الرواتب الأساسية الشهرية" value={loading ? "…" : formatCurrency(payroll)} />
      </div>

      {todayInfo && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/hr/attendance" className="bg-white rounded-2xl border border-stone-200 p-4 hover:border-amber-400 transition">
            <p className="font-black text-sm text-stone-900 flex items-center gap-2"><Fingerprint className="w-4 h-4 text-amber-500" /> حضور اليوم</p>
            <p className="text-3xl font-black text-emerald-600 mt-2">{todayInfo.records.length} <span className="text-sm text-stone-400">/ {current.length}</span></p>
            <p className="text-xs text-stone-500 mt-1">
              {todayInfo.late ? `${todayInfo.late} متأخر · ` : ""}{Math.max(0, current.length - todayInfo.records.length - todayInfo.onLeave.length)} لم يسجلوا بعد
            </p>
          </Link>
          <Link href="/hr/leave" className="bg-white rounded-2xl border border-stone-200 p-4 hover:border-amber-400 transition">
            <p className="font-black text-sm text-stone-900 flex items-center gap-2"><CalendarDays className="w-4 h-4 text-amber-500" /> طلبات إجازة بانتظار الموافقة</p>
            <p className={`text-3xl font-black mt-2 ${todayInfo.pending.length ? "text-amber-600" : "text-stone-900"}`}>{todayInfo.pending.length}</p>
            <p className="text-xs text-stone-500 mt-1 truncate">{todayInfo.pending.slice(0, 3).map((r) => `${r.employee_name} (${r.type_name})`).join("، ") || "لا توجد طلبات معلّقة"}</p>
          </Link>
          <Link href="/hr/leave" className="bg-white rounded-2xl border border-stone-200 p-4 hover:border-amber-400 transition">
            <p className="font-black text-sm text-stone-900 flex items-center gap-2"><CalendarDays className="w-4 h-4 text-violet-500" /> في إجازة اليوم</p>
            <p className="text-3xl font-black text-violet-600 mt-2">{todayInfo.onLeave.length}</p>
            <p className="text-xs text-stone-500 mt-1 truncate">{todayInfo.onLeave.map((r) => r.employee_name).join("، ") || "لا أحد"}</p>
          </Link>
          <Link href="/hr/payroll" className="bg-white rounded-2xl border border-stone-200 p-4 hover:border-amber-400 transition">
            <p className="font-black text-sm text-stone-900 flex items-center gap-2"><Wallet className="w-4 h-4 text-amber-500" /> آخر مسير رواتب</p>
            {todayInfo.payroll ? (
              <>
                <p className="text-xl font-black text-stone-900 mt-2">{monthLabel(todayInfo.payroll.month)}</p>
                <p className="text-xs text-stone-500 mt-1">{PAYROLL_STATUS_LABELS[todayInfo.payroll.status].label} · صافي {formatCurrency(todayInfo.payroll.totals.net)}</p>
              </>
            ) : <p className="text-sm text-stone-400 mt-2">لم يُحتسب أي مسير بعد</p>}
          </Link>
        </div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Panel title="مؤشرات القوى العاملة" icon={<Users className="w-4 h-4 text-amber-500" />}>
            <dl className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl bg-stone-50 p-2"><dt className="text-[11px] text-stone-500">معدل الدوران (12 شهر)</dt><dd className="text-xl font-black">{turnover}%</dd></div>
              <div className="rounded-xl bg-stone-50 p-2"><dt className="text-[11px] text-stone-500">متوسط مدة الخدمة</dt><dd className="text-xl font-black">{Math.floor(avgTenureMonths / 12)}س {avgTenureMonths % 12}ش</dd></div>
              <div className="rounded-xl bg-stone-50 p-2"><dt className="text-[11px] text-stone-500">مغادرون (12 شهر)</dt><dd className="text-xl font-black">{leavers}</dd></div>
              <div className="rounded-xl bg-stone-50 p-2"><dt className="text-[11px] text-stone-500">إناث / ذكور</dt><dd className="text-xl font-black">{women} / {men}</dd>
                {current.length - women - men > 0 && <p className="text-[10px] text-amber-700">{current.length - women - men} بدون تحديد</p>}</div>
            </dl>
          </Panel>
          <Link href="/hr/recruitment" className="block">
            <Panel title="التوظيف" icon={<UserSearch className="w-4 h-4 text-amber-500" />}>
              <p className="text-3xl font-black text-stone-900">{openRoles.length} <span className="text-sm text-stone-500">وظيفة مفتوحة</span></p>
              <p className="text-xs text-stone-500 mt-1">{activeCandidates.length} مرشح نشط · {activeCandidates.filter((c) => c.stage === "offer").length} بمرحلة العرض</p>
              <p className="text-xs text-violet-700 mt-1">{nextInterview ? `المقابلة القادمة: ${nextInterview.full_name} — ${new Date(nextInterview.interview_at!).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}` : "لا توجد مقابلات مجدولة"}</p>
            </Panel>
          </Link>
          <Link href="/hr/performance" className="block">
            <Panel title="تقييم الأداء" icon={<TrendingUp className="w-4 h-4 text-amber-500" />}>
              <p className="text-3xl font-black text-stone-900">{reviewedLastQuarter.size} <span className="text-sm text-stone-500">/ {current.length} مُقيَّم في {lastQuarter}</span></p>
              <p className="text-xs text-stone-500 mt-1">{awaitingAck} تقييم بانتظار اطلاع الموظف · {talent.reviews.filter((r) => r.status === "draft").length} مسودة</p>
            </Panel>
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Panel title="تنبيهات الوثائق والعقود وفترات التجربة" icon={<CalendarClock className="w-4 h-4 text-amber-500" />}
            action={<Link href="/hr/documents" className="text-xs font-bold text-amber-700">سجل المستندات</Link>}>
            {!expiries.length ? <p className="text-sm text-stone-400">لا توجد وثائق أو عقود أو فترات تجربة تنتهي خلال 60 يومًا.</p> : (
              <ul className="divide-y divide-stone-100">
                {expiries.map((x) => ({ x, days: x.days_left })).map(({ x, days }) => (
                  <li key={x.kind + x.ref_id}>
                    <Link href={`/hr/employees/${x.employee_id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-amber-50/40 rounded-lg px-1">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar name={x.employee_name} className="w-8 h-8 text-xs" />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-stone-900 truncate">{x.employee_name}</p>
                          <p className="text-[11px] text-stone-500">{expiryLabel(x)} · <span dir="ltr" className="font-mono">{x.expiry_date}</span></p>
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
