"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Info, Eye } from "lucide-react";
import { loadBusiness } from "@/lib/business-client";
import { LoadError, Panel, StatCard } from "@/components/hr/hr-ui";
import { PayslipModal } from "@/components/hr/payslip-view";
import { cn, formatCurrency } from "@/lib/utils";
import { ADVANCE_STATUS_LABELS, PAYROLL_STATUS_LABELS, monthLabel, type HrAdvance, type HrPayslip } from "@/lib/hr";

export default function MyPayslipsPage() {
  const [data, setData] = useState<{ linked: boolean; payslips: HrPayslip[]; advances: HrAdvance[] } | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<HrPayslip | null>(null);

  const reload = useCallback(async () => {
    try {
      setData(await loadBusiness("/api/hr/me/payslips"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل كشوف الرواتب.");
    }
  }, []);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);

  const year = new Date().getFullYear();
  const thisYear = (data?.payslips || []).filter((p) => p.month.startsWith(String(year)));
  const activeAdvances = (data?.advances || []).filter((a) => a.status === "active");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5">
          <FileText className="w-6 h-6 text-amber-500" /> كشوف رواتبي
        </h2>
        <p className="text-xs sm:text-sm text-stone-500 mt-1">كشوف الرواتب المعتمدة، قابلة للطباعة، وحالة السلف</p>
      </div>

      {error && <LoadError message={error} onRetry={() => void reload()} />}
      {!data ? (
        !error && <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center text-sm text-stone-400">جاري التحميل...</div>
      ) : !data.linked ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center">
          <Info className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <p className="font-bold text-stone-800">لم يتم ربط حسابك بملف وظيفي بعد</p>
          <p className="text-sm text-stone-500 mt-1">تواصل مع قسم الموارد البشرية.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <StatCard label={`صافي ما قبضته في ${year}`} value={formatCurrency(thisYear.filter((p) => p.run_status === "paid").reduce((s, p) => s + p.net, 0))} tone="text-emerald-700" />
            <StatCard label={`اقتطاعات الضمان ${year}`} value={formatCurrency(thisYear.reduce((s, p) => s + p.ssc_employee, 0))} />
            <StatCard label="المتبقي من السلف" value={formatCurrency(activeAdvances.reduce((s, a) => s + a.remaining, 0))} tone={activeAdvances.length ? "text-amber-700" : "text-stone-900"} />
          </div>

          <Panel title="الكشوف الشهرية">
            {!data.payslips.length ? <p className="text-sm text-stone-400">لا توجد كشوف رواتب معتمدة بعد.</p> : (
              <ul className="-m-4 divide-y divide-stone-100">
                {data.payslips.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="font-black text-stone-900">{monthLabel(p.month)}</p>
                      <span className={cn("inline-block mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full border", PAYROLL_STATUS_LABELS[p.run_status].color)}>
                        {p.run_status === "paid" ? "مصروف" : "معتمد — قيد الصرف"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-end">
                        <p className="text-lg font-black text-emerald-700">{formatCurrency(p.net)}</p>
                        <p className="text-[10px] text-stone-400">إجمالي {formatCurrency(p.gross)}</p>
                      </div>
                      <button onClick={() => setOpen(p)} className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-stone-200 text-xs font-bold hover:bg-stone-50">
                        <Eye className="w-3.5 h-3.5" /> عرض
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {data.advances.length > 0 && (
            <Panel title="سلفي">
              <ul className="-m-4 divide-y divide-stone-100">
                {data.advances.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div>
                      <p className="font-bold">{formatCurrency(a.amount)} <span className="text-xs text-stone-500">· قسط {formatCurrency(a.monthly_amount)}</span></p>
                      <p className="text-[11px] text-stone-500">{a.reason} · {ADVANCE_STATUS_LABELS[a.status]}</p>
                    </div>
                    <div className="text-end text-xs">
                      <p>المسدد {formatCurrency(a.repaid)}</p>
                      <p className="font-black">المتبقي {formatCurrency(a.remaining)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}
      {open && <PayslipModal slip={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
