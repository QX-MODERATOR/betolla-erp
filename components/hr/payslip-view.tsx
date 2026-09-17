"use client";

import { Printer, X, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { EARNING_LINE_TYPES, PAYSLIP_WARNING_LABELS, monthLabel, type HrPayslip } from "@/lib/hr";

import { printArea } from "@/lib/print";
export { printArea };

const amount = (n: number) => formatCurrency(n);

export function PayslipDocument({ slip, showEmployer }: { slip: HrPayslip; showEmployer?: boolean }) {
  const earnings = slip.lines.filter((l) => EARNING_LINE_TYPES.includes(l.type));
  const deductions = slip.lines.filter((l) => !EARNING_LINE_TYPES.includes(l.type));
  return (
    <div className="bg-white text-stone-900 text-sm space-y-4">
      <div className="flex items-start justify-between gap-3 border-b border-stone-200 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-[#160f02] flex items-center justify-center p-1.5">
            <img src="/brand/betolla-logo-clean.png" alt="" className="w-full h-full object-contain brightness-0 invert" />
          </div>
          <div>
            <p className="font-black">شركة بيتولا لمستحضرات التجميل</p>
            <p className="text-[11px] text-stone-500">كشف راتب — {monthLabel(slip.month)}</p>
          </div>
        </div>
        <div className="text-end text-[11px] text-stone-500">
          <p dir="ltr" className="font-mono">{slip.month}</p>
          <p>{slip.run_status === "paid" ? `مصروف${slip.paid_at ? ` ${slip.paid_at.slice(0, 10)}` : ""}` : slip.run_status === "approved" ? "معتمد" : "مسودة"}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
        <p><span className="text-stone-500">الموظف:</span> <b>{slip.employee_name}</b></p>
        <p><span className="text-stone-500">الرقم الوظيفي:</span> <span dir="ltr" className="font-mono">{slip.employee_no}</span></p>
        <p><span className="text-stone-500">القسم:</span> {slip.department_name || "—"}</p>
        <p><span className="text-stone-500">المسمى:</span> {slip.job_title || "—"}</p>
        <p><span className="text-stone-500">البنك:</span> {slip.bank_name || "—"}</p>
        <p><span className="text-stone-500">IBAN:</span> <span dir="ltr" className="font-mono">{slip.iban || "—"}</span></p>
        <p><span className="text-stone-500">رقم الضمان:</span> <span dir="ltr">{slip.ssc_number || "—"}</span></p>
        <p><span className="text-stone-500">أيام الخدمة في الشهر:</span> {slip.employed_days} / {slip.month_days}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="border border-emerald-200 rounded-xl overflow-hidden">
          <p className="bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-800">المستحقات</p>
          <table className="w-full text-xs">
            <tbody className="divide-y divide-stone-100">
              {earnings.map((l, i) => (
                <tr key={i}><td className="px-3 py-1.5">{l.label}</td><td className="px-3 py-1.5 text-end whitespace-nowrap">{amount(l.amount)}</td></tr>
              ))}
            </tbody>
            <tfoot><tr className="bg-emerald-50 font-black"><td className="px-3 py-1.5">إجمالي المستحقات</td><td className="px-3 py-1.5 text-end whitespace-nowrap">{amount(slip.gross)}</td></tr></tfoot>
          </table>
        </div>
        <div className="border border-rose-200 rounded-xl overflow-hidden">
          <p className="bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-800">الاقتطاعات</p>
          <table className="w-full text-xs">
            <tbody className="divide-y divide-stone-100">
              {deductions.length ? deductions.map((l, i) => (
                <tr key={i}><td className="px-3 py-1.5">{l.label}</td><td className="px-3 py-1.5 text-end whitespace-nowrap">{amount(l.amount)}</td></tr>
              )) : <tr><td className="px-3 py-1.5 text-stone-400" colSpan={2}>لا توجد اقتطاعات</td></tr>}
            </tbody>
            <tfoot><tr className="bg-rose-50 font-black"><td className="px-3 py-1.5">إجمالي الاقتطاعات</td><td className="px-3 py-1.5 text-end whitespace-nowrap">{amount(slip.total_deductions)}</td></tr></tfoot>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-2xl bg-[#160f02] text-white px-4 py-3">
        <span className="font-bold">صافي الراتب</span>
        <span className="text-2xl font-black text-[#e5d0a1]">{amount(slip.net)}</span>
      </div>

      <div className="text-[11px] text-stone-500 space-y-0.5">
        {slip.absent_days > 0 && <p>أيام غياب مسجلة: {slip.absent_days}{slip.absence_deduction ? "" : " (بدون خصم)"}</p>}
        {slip.commission_sales > 0 && <p>مبيعات مسلّمة محتسبة للعمولة: {amount(slip.commission_sales)}</p>}
        {showEmployer && <p>مساهمة الشركة في الضمان: {amount(slip.ssc_employer)} · الأجر الخاضع: {amount(slip.ssc_base)}</p>}
      </div>
    </div>
  );
}

export function PayslipModal({ slip, onClose, showEmployer }: { slip: HrPayslip; onClose: () => void; showEmployer?: boolean }) {
  return (
    <div data-dialog="" className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-start sm:items-center justify-center p-3 overflow-y-auto" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="print-area bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-stone-200 my-4 p-5">
        <div className="no-print flex items-center justify-end gap-2 mb-3">
          <button onClick={printArea} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-900 text-white text-xs font-bold">
            <Printer className="w-3.5 h-3.5" /> طباعة / PDF
          </button>
          <button onClick={onClose} aria-label="إغلاق" className="p-1.5 rounded-xl bg-stone-100 hover:bg-stone-200"><X className="w-4 h-4" /></button>
        </div>
        {slip.warnings.length > 0 && showEmployer && (
          <div className="no-print mb-3 rounded-xl bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800 space-y-0.5">
            {slip.warnings.map((w) => <p key={w} className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{PAYSLIP_WARNING_LABELS[w] || w}</p>)}
          </div>
        )}
        <PayslipDocument slip={slip} showEmployer={showEmployer} />
      </div>
    </div>
  );
}
