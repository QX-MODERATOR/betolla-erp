"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Settings, UserCog, Languages, Clock, Wallet, Users, Activity, CheckCircle2, XCircle, RefreshCw, ExternalLink, KeyRound,
  LayoutGrid, Smartphone, ShieldAlert, BriefcaseBusiness, Receipt, BarChart3, Package, Truck, UserSearch,
} from "lucide-react";
import { loadBusiness } from "@/lib/business-client";
import { getCurrentUser } from "@/lib/client-api";
import { useLanguage } from "@/lib/i18n";
import { useProfile } from "@/lib/profile-context";
import { Panel, InfoRow, LoadError } from "@/components/hr/hr-ui";
import { attendanceSettingsOf } from "@/components/hr/use-my-hr";
import { cn, formatCurrency } from "@/lib/utils";
import {
  DEFAULT_PAYROLL_SETTINGS, WEEKDAY_LABELS,
  type HrEmployee, type HrHoliday, type PayrollSettings,
} from "@/lib/hr";
import type { UserRole } from "@/lib/auth";
import { ammanToday } from "@/lib/dates";

interface Account { id: string; username: string; name: string; role: UserRole }
interface SystemStatus {
  db: { ok: boolean; latency_ms: number; today?: string; error?: string };
  server_time: string; revision: string; service: string; node: string;
  config: Record<string, boolean>;
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "مسؤول النظام", general_manager: "المدير العام", sales_manager: "مدير/ة مبيعات", sales_rep: "مندوب/ة مبيعات",
  marketing_manager: "مدير التسويق", marketing: "تسويق", finance: "المالية", hr_operations: "الموارد البشرية والعمليات",
  driver_manager: "مدير السائقين", driver: "سائق توصيل",
};
// Mirrors android/app (MainActivity APP_URL, build.gradle versionName).
const ANDROID_APP = { version: "2.6.0", versionCode: 8, url: "https://betolla-erp--betolla-erp.us-east4.hosted.app" };

const ADMIN_LINKS = [
  { href: "/hr", label: "لوحة الموارد البشرية", icon: BriefcaseBusiness },
  { href: "/hr/payroll", label: "الرواتب", icon: Wallet },
  { href: "/hr/recruitment", label: "التوظيف", icon: UserSearch },
  { href: "/finance", label: "المالية والفواتير", icon: Receipt },
  { href: "/analytics", label: "تقارير الأداء", icon: BarChart3 },
  { href: "/inventory", label: "المنتجات والمخزون", icon: Package },
  { href: "/drivers", label: "إدارة السائقين", icon: Truck },
  { href: "/hr/employees", label: "ملفات الموظفين والأقسام", icon: Users },
];

const CONFIG_LABELS: Record<string, string> = {
  supabase_url: "رابط قاعدة البيانات", supabase_server_key: "مفتاح خادم قاعدة البيانات",
  jwt_secret: "مفتاح توقيع الجلسات", telegram: "إشعارات تيليجرام",
};

function OkBadge({ ok, label }: { ok: boolean; label?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full",
      ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>
      {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {label ?? (ok ? "يعمل" : "غير مهيأ")}
    </span>
  );
}

export default function SettingsPage() {
  const { language, setLanguage } = useLanguage();
  const { openProfileModal } = useProfile();
  const [role, setRole] = useState<UserRole | null>(null);
  const [hr, setHr] = useState<{ attendance: ReturnType<typeof attendanceSettingsOf>; holidays: HrHoliday[]; payroll: PayrollSettings } | null>(null);
  const [accounts, setAccounts] = useState<{ accounts: Account[]; employees: HrEmployee[] } | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const isManagement = role === "admin" || role === "general_manager";

  const loadStatus = useCallback(async () => {
    setChecking(true);
    try { setStatus(await loadBusiness<SystemStatus>("/api/system/status")); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setChecking(false); }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(async () => {
      const r = (getCurrentUser()?.role ?? null) as UserRole | null;
      setRole(r);
      if (r !== "admin" && r !== "general_manager") return;
      try {
        const year = new Date().getFullYear();
        const [settings, payroll, directory] = await Promise.all([
          loadBusiness<{ settings: Record<string, unknown>; holidays: HrHoliday[] }>(`/api/hr/settings?year=${year}`),
          loadBusiness<{ settings: { payroll?: Partial<PayrollSettings> } }>("/api/hr/payroll"),
          loadBusiness<{ accounts: Account[]; employees: HrEmployee[] }>("/api/hr/employees"),
        ]);
        setHr({
          attendance: attendanceSettingsOf(settings.settings),
          holidays: settings.holidays,
          payroll: { ...DEFAULT_PAYROLL_SETTINGS, ...(payroll.settings.payroll || {}) },
        });
        setAccounts(directory);
      } catch (e) {
        setError(e instanceof Error ? e.message : "تعذر تحميل الإعدادات.");
      }
      await loadStatus();
    });
  }, [loadStatus]);

  const today = ammanToday();
  const upcomingHolidays = (hr?.holidays || []).filter((h) => h.date >= today);
  const linkedIds = new Set((accounts?.employees || []).map((e) => e.account_id).filter(Boolean));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5">
          <Settings className="w-6 h-6 text-amber-500" /> الإعدادات والنظام
        </h2>
        <p className="text-xs sm:text-sm text-stone-500 mt-1">الحساب، اللغة، إعدادات الموارد البشرية والرواتب، وحالة النظام</p>
      </div>

      {role !== null && !isManagement && (
        <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center">
          <ShieldAlert className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <p className="font-bold text-stone-800">هذه الصفحة متاحة للمدير العام ومسؤولي النظام فقط.</p>
        </div>
      )}

      {error && <LoadError message={error} onRetry={() => window.location.reload()} />}

      {isManagement && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="حسابي" icon={<UserCog className="w-4 h-4 text-amber-500" />}>
          <p className="text-sm text-stone-600 mb-3">تعديل بياناتك الشخصية ورقم الهاتف، وتغيير كلمة المرور.</p>
          <button onClick={() => openProfileModal()} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 text-sm font-black">
            <KeyRound className="w-4 h-4" /> فتح إعدادات الحساب
          </button>
        </Panel>

        <Panel title="اللغة والواجهة" icon={<Languages className="w-4 h-4 text-amber-500" />}>
          <p className="text-sm text-stone-600 mb-3">لغة عرض النظام على هذا الجهاز.</p>
          <div className="inline-flex rounded-xl border border-stone-200 overflow-hidden">
            {([["ar", "العربية"], ["en", "English"]] as const).map(([code, label]) => (
              <button key={code} onClick={() => setLanguage(code)}
                className={cn("px-5 py-2 text-sm font-bold", language === code ? "bg-stone-900 text-amber-400" : "bg-white text-stone-600 hover:bg-stone-50")}>
                {label}
              </button>
            ))}
          </div>
        </Panel>

        {isManagement && (
          <Panel title="الدوام والعطل" icon={<Clock className="w-4 h-4 text-amber-500" />}
            action={<Link href="/hr/attendance" className="inline-flex items-center gap-1 text-xs font-bold text-amber-700">تعديل <ExternalLink className="w-3 h-3" /></Link>}>
            {!hr ? <p className="text-sm text-stone-400">جاري التحميل...</p> : (
              <dl>
                <InfoRow label="ساعات الدوام" value={<span dir="ltr">{hr.attendance.work_start} – {hr.attendance.work_end}</span>} />
                <InfoRow label="فترة السماح للتأخير" value={`${hr.attendance.grace_minutes} دقيقة`} />
                <InfoRow label="العطلة الأسبوعية" value={hr.attendance.weekend.map((d) => WEEKDAY_LABELS[d]).join(" و ") || "—"} />
                <InfoRow label="المنطقة الزمنية" value={hr.attendance.timezone} ltr />
                <InfoRow label={`العطل الرسمية ${new Date().getFullYear()}`}
                  value={hr.holidays.length ? `${hr.holidays.length} عطلة${upcomingHolidays[0] ? ` · القادمة: ${upcomingHolidays[0].name_ar} (${upcomingHolidays[0].date})` : ""}` : "لم تُضف بعد"} />
              </dl>
            )}
            <p className="text-[11px] text-stone-400 mt-2">أنواع الإجازات وأرصدتها من <Link href="/hr/leave" className="text-amber-700 font-bold">إدارة الإجازات</Link>، والأقسام من <Link href="/hr/employees" className="text-amber-700 font-bold">ملفات الموظفين</Link>.</p>
          </Panel>
        )}

        {isManagement && (
          <Panel title="الرواتب والضمان الاجتماعي" icon={<Wallet className="w-4 h-4 text-amber-500" />}
            action={<Link href="/hr/payroll" className="inline-flex items-center gap-1 text-xs font-bold text-amber-700">تعديل <ExternalLink className="w-3 h-3" /></Link>}>
            {!hr ? <p className="text-sm text-stone-400">جاري التحميل...</p> : (
              <dl>
                <InfoRow label="اقتطاع الضمان من الموظف" value={`${hr.payroll.ssc_employee_rate}%`} />
                <InfoRow label="مساهمة الشركة في الضمان" value={`${hr.payroll.ssc_employer_rate}%`} />
                <InfoRow label="الحد الأعلى للأجر الخاضع" value={hr.payroll.ssc_max_wage ? formatCurrency(hr.payroll.ssc_max_wage) : "بلا حد — يُنصح بإدخال الحد الرسمي الحالي"} />
                <InfoRow label="أساس احتساب أجر اليوم" value={`${hr.payroll.daily_basis} يومًا`} />
                <InfoRow label="خصم الغياب تلقائيًا" value={hr.payroll.deduct_absences ? "مفعّل" : "غير مفعّل"} />
              </dl>
            )}
          </Panel>
        )}

        <Panel title="اختصارات الإدارة" icon={<LayoutGrid className="w-4 h-4 text-amber-500" />}>
          <div className="grid grid-cols-2 gap-2">
            {ADMIN_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="flex items-center gap-2 p-2.5 rounded-xl border border-stone-200 hover:border-amber-400 hover:bg-amber-50/40 text-sm font-bold text-stone-700">
                <l.icon className="w-4 h-4 text-amber-500 shrink-0" /> {l.label}
              </Link>
            ))}
          </div>
        </Panel>

        <Panel title="تطبيق أندرويد" icon={<Smartphone className="w-4 h-4 text-amber-500" />}>
          <dl>
            <InfoRow label="الإصدار الحالي" value={`${ANDROID_APP.version} (${ANDROID_APP.versionCode})`} ltr />
            <InfoRow label="الخادم" value={<span className="font-mono text-xs">{ANDROID_APP.url.replace("https://", "")}</span>} ltr />
            <InfoRow label="الاتصال" value="HTTPS فقط — خادم الإنتاج على Firebase" />
          </dl>
          <p className="text-[11px] text-stone-400 mt-2">
            يُبنى ملف APK الموقّع تلقائيًا عبر GitHub Actions (Build Android APK). تحديثات الموقع تصل للتطبيق مباشرة دون إعادة تثبيت.
          </p>
        </Panel>
      </div>
      )}

      {isManagement && (
        <Panel title={`حسابات الدخول (${accounts?.accounts.length ?? "…"})`} icon={<Users className="w-4 h-4 text-amber-500" />}>
          {!accounts ? <p className="text-sm text-stone-400">جاري التحميل...</p> : (
            <>
              <div className="overflow-x-auto -mx-4">
                <table className="w-full text-sm">
                  <thead className="bg-stone-50 text-[11px] text-stone-500">
                    <tr>{["الاسم", "اسم المستخدم", "الدور", "ملف وظيفي"].map((h) => <th key={h} className="text-start px-4 py-2">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {accounts.accounts.map((a) => (
                      <tr key={a.id}>
                        <td className="px-4 py-2 font-bold">{a.name}</td>
                        <td className="px-4 py-2 font-mono text-xs" dir="ltr">@{a.username}</td>
                        <td className="px-4 py-2 text-xs">{ROLE_LABELS[a.role] || a.role}</td>
                        <td className="px-4 py-2">{linkedIds.has(a.id) ? <OkBadge ok label="مرتبط" /> : <OkBadge ok={false} label="غير مرتبط" />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-stone-400 mt-3">
                إضافة الحسابات وتعيين كلمات مرورها الأولية تتم من إعدادات الخادم (Firebase) ضمن التحديثات البرمجية. يغيّر كل مستخدم كلمة مروره من «إعدادات الحساب».
                لربط الحسابات بملفات الموظفين استخدم «ملفات لحسابات النظام» في <Link href="/hr/employees" className="text-amber-700 font-bold">ملفات الموظفين</Link>.
              </p>
            </>
          )}
        </Panel>
      )}

      {isManagement && (
        <Panel title="حالة النظام" icon={<Activity className="w-4 h-4 text-amber-500" />}
          action={<button onClick={loadStatus} disabled={checking} className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 disabled:opacity-50"><RefreshCw className={cn("w-3 h-3", checking && "animate-spin")} /> فحص الآن</button>}>
          {!status ? <p className="text-sm text-stone-400">{checking ? "جاري الفحص..." : "—"}</p> : (
            <dl>
              <InfoRow label="قاعدة البيانات" value={<span className="inline-flex items-center gap-2"><OkBadge ok={status.db.ok} label={status.db.ok ? "متصلة" : "خطأ في الاتصال"} /><span className="text-xs text-stone-500">{status.db.latency_ms} ms</span></span>} />
              {status.db.error && <InfoRow label="تفاصيل الخطأ" value={status.db.error} />}
              {Object.entries(status.config).map(([k, ok]) => <InfoRow key={k} label={CONFIG_LABELS[k] || k} value={<OkBadge ok={ok} label={ok ? "مهيأ" : "غير مهيأ"} />} />)}
              <InfoRow label="الإصدار المنشور" value={status.revision} ltr />
              <InfoRow label="وقت الخادم" value={new Date(status.server_time).toLocaleString("en-GB")} ltr />
              <InfoRow label="تاريخ اليوم (عمّان)" value={status.db.today || "—"} ltr />
              <InfoRow label="Node.js" value={status.node} ltr />
            </dl>
          )}
        </Panel>
      )}
    </div>
  );
}
