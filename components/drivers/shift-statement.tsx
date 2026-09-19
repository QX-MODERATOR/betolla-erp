"use client";

// كشف الوردية — the sheet a driver and the office sign at the end of a run.
//
// "طباعة كشف الوردية" used to call window.print() on the whole page: the sidebar, the header, the
// day picker, the buttons and the cash-counting form all went through the printer, and the numbers
// that matter were scattered among them. What gets signed has to be a document, not a screenshot of
// an app.
//
// So this is the same shape as the order statement: real paginated HTML that the browser's own
// print dialog turns into a PDF ("Save as PDF"). No PDF library in the bundle, correct Arabic
// shaping and RTL for free, and whoever prints keeps the choice of paper and destination.
import { Printer, X } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { printArea } from "@/lib/print";
import { splitPackageName } from "@/lib/package-items";
import type { DriverOrderRecord, DriverShiftSummary } from "@/lib/driver-ops";

const money = (n: number | null | undefined) => formatCurrency(n);

const STATUS_LABEL: Record<string, string> = {
  delivered: "تم التسليم",
  returned: "مرتجع",
  postponed: "مؤجل",
  remaining: "متبقي",
  pending: "مع السائق",
};

export function ShiftStatementDocument({
  shift,
  orders,
  countedCash,
}: {
  shift: DriverShiftSummary;
  orders: DriverOrderRecord[];
  countedCash?: number | null;
}) {
  const delivered = orders.filter((o) => o.status === "delivered");
  const returned = orders.filter((o) => o.status === "returned");
  const open = orders.filter((o) => !["delivered", "returned"].includes(o.status));
  // What the driver actually handed over, against what the day says he should have.
  const collected = delivered.reduce((s, o) => s + (o.cash_collected ?? 0), 0);
  const expected = shift.expected_cash ?? 0;
  const counted = countedCash ?? shift.closure?.counted_cash ?? null;
  const difference = counted === null ? null : Math.round((counted - collected) * 1000) / 1000;

  const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
    <tr className={strong ? "font-black" : ""}>
      <td className="py-1.5 text-stone-600">{label}</td>
      <td className="py-1.5 text-end font-mono whitespace-nowrap">{value}</td>
    </tr>
  );

  return (
    <div className="bg-white text-stone-900 text-sm" dir="rtl">
      {/* Letterhead */}
      <div className="flex items-start justify-between gap-4 border-b-2 border-[#160f02] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-12 h-12 rounded-xl bg-[#160f02] flex items-center justify-center p-2 shrink-0">
            <img src="/brand/betolla-logo-clean.png" alt="" className="w-full h-full object-contain brightness-0 invert" />
          </div>
          <div>
            <p className="font-black text-base leading-tight">شركة بيتولا لمستحضرات التجميل</p>
            <p className="text-[11px] text-stone-500">Betolla Cosmetics — عمّان، الأردن</p>
          </div>
        </div>
        <div className="text-end shrink-0">
          <p className="font-black text-base leading-tight">كشف وردية</p>
          <p className="text-[11px] text-stone-500">Driver Shift Statement</p>
          <p className="mt-1 text-[11px]">
            <span className="text-stone-500">الحالة: </span>
            <b>{shift.closure?.is_closed ? "مغلقة" : "مفتوحة"}</b>
          </p>
        </div>
      </div>

      {/* Identifiers */}
      <div className="grid grid-cols-3 gap-2 py-2.5 text-[11px] border-b border-stone-200">
        <p><span className="text-stone-500">السائق:</span> <b>{shift.driver}</b></p>
        <p><span className="text-stone-500">تاريخ الوردية:</span> {formatDate(shift.date)}</p>
        <p><span className="text-stone-500">تاريخ الطباعة:</span> {formatDate(new Date().toISOString().slice(0, 10))}</p>
        {shift.closure?.closed_at && (
          <p><span className="text-stone-500">وقت الإغلاق:</span> {new Date(shift.closure.closed_at).toLocaleString("ar-JO")}</p>
        )}
        {shift.closure?.closed_by && <p><span className="text-stone-500">أغلقها:</span> {shift.closure.closed_by}</p>}
        {shift.closure?.reopened_by && (
          <p><span className="text-stone-500">أُعيد فتحها:</span> {shift.closure.reopened_by}</p>
        )}
      </div>

      {/* The day at a glance */}
      <div className="grid grid-cols-4 gap-2 py-3 break-inside-avoid">
        {[
          ["تم التسليم", delivered.length, "bg-emerald-50 border-emerald-300 text-emerald-900"],
          ["مرتجع", returned.length, "bg-rose-50 border-rose-300 text-rose-900"],
          ["ما زال مفتوحاً", open.length, "bg-amber-50 border-amber-300 text-amber-900"],
          ["إجمالي الطلبات", orders.length, "bg-stone-50 border-stone-300 text-stone-900"],
        ].map(([label, value, cls]) => (
          <div key={String(label)} className={`rounded-xl border px-3 py-2 ${cls}`}>
            <p className="text-[10px] font-bold opacity-80">{String(label)}</p>
            <p className="font-mono font-black text-lg">{String(value)}</p>
          </div>
        ))}
      </div>

      {/* Every order on the run */}
      <table className="w-full text-xs border border-stone-200">
        <thead>
          <tr className="bg-[#160f02] text-white text-[11px]">
            <th className="px-2 py-2 text-center w-8">#</th>
            <th className="px-3 py-2 text-start">الطلب / العميلة</th>
            <th className="px-3 py-2 text-start">المنطقة</th>
            <th className="px-2 py-2 text-center w-20">الحالة</th>
            <th className="px-3 py-2 text-end w-24">المطلوب</th>
            <th className="px-3 py-2 text-end w-24">المُحصّل</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {orders.length ? orders.map((o, i) => (
            <tr key={o.id} className="break-inside-avoid align-top">
              <td className="px-2 py-1.5 text-center text-stone-400 font-mono">{i + 1}</td>
              <td className="px-3 py-1.5">
                <span className="font-mono text-[10px] text-stone-500 block" dir="ltr">{o.id}</span>
                <span className="font-semibold">{o.customer_name}</span>
                {/* What is in the car for this order, with a package shown as one thing. */}
                {o.products && (
                  <span className="block text-[10px] text-stone-500">
                    {splitPackageName(o.products).title}
                  </span>
                )}
              </td>
              <td className="px-3 py-1.5">{o.area || "—"}</td>
              <td className="px-2 py-1.5 text-center">{STATUS_LABEL[o.status] || o.status}</td>
              <td className="px-3 py-1.5 text-end font-mono whitespace-nowrap">{money(o.cash_to_collect)}</td>
              <td className="px-3 py-1.5 text-end font-mono whitespace-nowrap">
                {o.status === "delivered" ? money(o.cash_collected ?? 0) : "—"}
              </td>
            </tr>
          )) : (
            <tr><td colSpan={6} className="px-3 py-4 text-center text-stone-400">لا توجد طلبات في هذه الوردية</td></tr>
          )}
        </tbody>
      </table>

      {/* The cash */}
      <div className="grid grid-cols-2 gap-3 pt-3 break-inside-avoid">
        <div className="space-y-2">
          <div className={`rounded-2xl border px-4 py-3 ${
            difference === null ? "bg-stone-50 border-stone-300"
              : difference === 0 ? "bg-emerald-50 border-emerald-300"
                : "bg-rose-50 border-rose-300"}`}>
            <p className="text-[11px] font-bold opacity-80">
              {difference === null ? "لم يُجرد الكاش بعد" : difference === 0 ? "الكاش مطابق" : difference > 0 ? "زيادة في الكاش" : "عجز في الكاش"}
            </p>
            <p className="font-mono font-black text-xl">
              {difference === null ? "—" : money(Math.abs(difference))}
            </p>
          </div>
          {shift.closure?.notes && (
            <div className="rounded-xl border border-stone-200 px-3 py-2 text-[11px]">
              <span className="text-stone-500 block mb-0.5">ملاحظات:</span>
              {shift.closure.notes}
            </div>
          )}
        </div>
        <table className="w-full text-xs self-start">
          <tbody className="divide-y divide-stone-100">
            <Row label="المتوقع من الطلبات" value={money(expected)} />
            <Row label="المُحصّل فعلياً" value={money(collected)} />
            <Row label="المجرود (المسلَّم للمكتب)" value={counted === null ? "—" : money(counted)} />
            <Row label="الفرق" value={difference === null ? "—" : money(difference)} strong />
          </tbody>
        </table>
      </div>

      {/* Signatures — the reason this is printed at all */}
      <div className="grid grid-cols-2 gap-6 pt-8 break-inside-avoid">
        {["توقيع السائق", "توقيع المستلم / المحاسبة"].map((label) => (
          <div key={label}>
            <div className="border-b border-dashed border-stone-400 h-10" />
            <p className="text-[11px] text-stone-500 pt-1">{label}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-stone-400 pt-4 text-center">
        كشف وردية {shift.driver} — {formatDate(shift.date)} · بيتولا كوزمتكس
      </p>
    </div>
  );
}

export function ShiftStatementModal({
  shift, orders, countedCash, onClose,
}: {
  shift: DriverShiftSummary;
  orders: DriverOrderRecord[];
  countedCash?: number | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-xs z-50 flex items-start justify-center p-4 overflow-y-auto no-print"
      onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-3xl my-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-stone-200 no-print">
          <h3 className="text-sm font-black text-stone-900">كشف الوردية</h3>
          <div className="flex items-center gap-2">
            <button type="button" onClick={printArea}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold cursor-pointer">
              <Printer className="w-4 h-4" />
              <span>طباعة / حفظ PDF</span>
            </button>
            <button type="button" onClick={onClose} aria-label="إغلاق"
              className="w-9 h-9 rounded-xl bg-stone-100 hover:bg-stone-200 grid place-items-center cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="print-area p-5">
          <ShiftStatementDocument shift={shift} orders={orders} countedCash={countedCash} />
        </div>
      </div>
    </div>
  );
}
