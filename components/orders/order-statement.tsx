"use client";

import { Printer, X } from "lucide-react";
import { formatCurrency, formatDate, ORDER_STATUS_LABELS } from "@/lib/utils";
import { ammanToday } from "@/lib/dates";
import { printArea } from "@/lib/print";
import { toInvoice, type BusinessOrder } from "@/lib/business";

// A formal, self-contained order statement: the document a customer, a driver or an auditor can
// read on its own. The old print put the on-screen delivery card through the printer — an order
// number, a name, an address and one summary line — with no itemisation, no prices, no company
// identity and nothing to sign. This carries the whole order: every line with its unit price, the
// totals and what is still owed, who sold it, and the receipt block at the bottom.
//
// PDF comes from the browser's own print dialog ("Save as PDF"), which is why this is real
// paginated HTML with @page rules in globals.css rather than a generated file: no PDF library in
// the bundle, correct Arabic shaping and RTL for free, and the person printing keeps the choice of
// paper, scale and destination.

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash_on_delivery: "دفع عند الاستلام (COD)",
  cliq: "تحويل كليك (CliQ)",
  installment: "حجز شهر / أقساط",
  cash: "نقداً",
  bank_transfer: "تحويل بنكي",
};

const money = (n: number | null | undefined) => formatCurrency(n);

export function OrderStatementDocument({ order }: { order: BusinessOrder }) {
  const status = ORDER_STATUS_LABELS[order.status] || { label: order.status, color: "" };
  // Read through toInvoice, the same function /api/finance uses, so this document and the finance
  // page can never state different money. It knows what this used to get wrong: a cancelled or
  // returned order is not collectible, so nothing is owed on it, and anything already paid is a
  // credit back to the customer rather than a balance to chase.
  const invoice = toInvoice(order);
  const subtotal = invoice.subtotal;
  const discount = invoice.discount || 0;
  const total = invoice.total_amount;
  const paid = invoice.paid_amount || 0;
  const outstanding = invoice.outstanding_amount;
  const credit = invoice.credit_amount;
  const realPayments = (order.payments || []).filter((p) => !p.is_reversal);

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
          <p className="font-black text-base leading-tight">كشف طلبية</p>
          <p className="text-[11px] text-stone-500">Order Statement</p>
          <p className="mt-1 text-[11px]">
            <span className="text-stone-500">الحالة: </span>
            <b>{status.label}</b>
          </p>
        </div>
      </div>

      {/* Identifiers */}
      <div className="grid grid-cols-3 gap-2 py-2.5 text-[11px] border-b border-stone-200">
        <p><span className="text-stone-500">رقم الطلب:</span> <span dir="ltr" className="font-mono font-bold">{order.id}</span></p>
        <p><span className="text-stone-500">رقم الفاتورة:</span> <span dir="ltr" className="font-mono">{order.invoice_number || "—"}</span></p>
        <p><span className="text-stone-500">تاريخ الطلب:</span> {formatDate(order.order_date)}</p>
        <p><span className="text-stone-500">تاريخ الاستحقاق:</span> {formatDate(order.due_date)}</p>
        <p><span className="text-stone-500">تاريخ الإصدار:</span> {formatDate(order.issued_date)}</p>
        <p><span className="text-stone-500">تاريخ الطباعة:</span> {formatDate(ammanToday())}</p>
      </div>

      {/* Customer + order */}
      <div className="grid grid-cols-2 gap-3 py-3">
        <div className="border border-stone-200 rounded-xl overflow-hidden">
          <p className="bg-stone-50 px-3 py-1.5 text-xs font-black">بيانات العميل</p>
          <div className="px-3 py-2 space-y-1 text-xs">
            <p><span className="text-stone-500">الاسم:</span> <b>{order.customer_name}</b></p>
            <p><span className="text-stone-500">الهاتف:</span> <span dir="ltr" className="font-mono">{order.customer_phone}</span></p>
            <p><span className="text-stone-500">المحافظة:</span> {order.city || "—"}</p>
            <p><span className="text-stone-500">العنوان:</span> {order.address || "—"}</p>
          </div>
        </div>
        <div className="border border-stone-200 rounded-xl overflow-hidden">
          <p className="bg-stone-50 px-3 py-1.5 text-xs font-black">بيانات الطلب</p>
          <div className="px-3 py-2 space-y-1 text-xs">
            <p><span className="text-stone-500">مندوب المبيعات:</span> <b>{order.rep_name || "—"}</b></p>
            <p><span className="text-stone-500">طريقة السداد:</span> {PAYMENT_METHOD_LABELS[order.payment_method] || order.payment_method || "—"}</p>
            <p><span className="text-stone-500">مصدر الطلب:</span> {order.source || "—"}</p>
            <p><span className="text-stone-500">قابل للتحصيل:</span> {order.collectible ? "نعم" : "لا"}</p>
          </div>
        </div>
      </div>

      {/* Items */}
      <table className="w-full text-xs border border-stone-200 rounded-xl overflow-hidden">
        <thead>
          <tr className="bg-[#160f02] text-white text-[11px]">
            <th className="px-2 py-2 text-center w-8">#</th>
            <th className="px-3 py-2 text-start">الصنف</th>
            <th className="px-2 py-2 text-center w-16">الكمية</th>
            <th className="px-3 py-2 text-end w-28">سعر الوحدة</th>
            <th className="px-3 py-2 text-end w-28">الإجمالي</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {order.items.length ? (
            order.items.map((item, i) => (
              <tr key={i} className="break-inside-avoid">
                <td className="px-2 py-1.5 text-center text-stone-400 font-mono">{i + 1}</td>
                <td className="px-3 py-1.5 font-semibold">{item.name}</td>
                <td className="px-2 py-1.5 text-center font-mono">{item.qty}</td>
                <td className="px-3 py-1.5 text-end font-mono whitespace-nowrap">
                  {item.price === null ? "—" : money(item.price)}
                </td>
                <td className="px-3 py-1.5 text-end font-mono whitespace-nowrap">
                  {item.total === null ? "—" : money(item.total)}
                </td>
              </tr>
            ))
          ) : (
            <tr><td colSpan={5} className="px-3 py-4 text-center text-stone-400">{order.items_summary || "لا توجد أصناف مسجلة"}</td></tr>
          )}
        </tbody>
      </table>

      {/* Totals + the amount to collect */}
      <div className="grid grid-cols-2 gap-3 pt-3 break-inside-avoid">
        <div className="space-y-2">
          {credit > 0 ? (
            /* Cancelled or returned with money already taken: the business owes her, not the
               other way round. Printing "المبلغ المطلوب تحصيله 0.000" here would be true but
               useless — the number that matters is what has to go back. */
            <div className="rounded-2xl bg-sky-50 border border-sky-300 px-4 py-3">
              <p className="text-[11px] text-sky-900/80 font-bold">رصيد دائن للعميلة (يُرد)</p>
              <p className="font-mono font-black text-xl text-sky-900">{money(credit)}</p>
            </div>
          ) : (
            <div className="rounded-2xl bg-amber-50 border border-amber-300 px-4 py-3">
              <p className="text-[11px] text-amber-900/80 font-bold">المبلغ المطلوب تحصيله</p>
              <p className="font-mono font-black text-xl text-amber-900">{money(outstanding)}</p>
              {!order.collectible && (
                <p className="text-[10px] text-amber-900/70 mt-0.5">هذه الطلبية غير مستحقة للتحصيل ({status.label})</p>
              )}
            </div>
          )}
          {order.installment_notes && (
            <div className="rounded-xl border border-stone-200 px-3 py-2 text-[11px]">
              <span className="text-stone-500 block mb-0.5">ملاحظات:</span>
              {order.installment_notes}
            </div>
          )}
        </div>
        <table className="w-full text-xs self-start">
          <tbody className="divide-y divide-stone-100">
            <tr><td className="py-1.5 text-stone-500">المجموع الفرعي</td><td className="py-1.5 text-end font-mono">{money(subtotal)}</td></tr>
            {discount > 0 && (
              <tr><td className="py-1.5 text-stone-500">الخصم</td><td className="py-1.5 text-end font-mono text-rose-700">- {money(discount)}</td></tr>
            )}
            <tr className="font-black"><td className="py-1.5">إجمالي الفاتورة</td><td className="py-1.5 text-end font-mono">{money(total)}</td></tr>
            <tr><td className="py-1.5 text-stone-500">المدفوع</td><td className="py-1.5 text-end font-mono text-emerald-700">{money(paid)}</td></tr>
            <tr className="font-black"><td className="py-1.5">المتبقي</td><td className="py-1.5 text-end font-mono">{money(outstanding)}</td></tr>
          </tbody>
        </table>
      </div>

      {/* Payments already received */}
      {realPayments.length > 0 && (
        <div className="pt-3 break-inside-avoid">
          <p className="text-xs font-black mb-1.5">الدفعات المستلمة</p>
          <table className="w-full text-[11px] border border-stone-200">
            <thead>
              <tr className="bg-stone-50 text-stone-600">
                <th className="px-2 py-1.5 text-start">التاريخ</th>
                <th className="px-2 py-1.5 text-start">الطريقة</th>
                <th className="px-2 py-1.5 text-start">المرجع</th>
                <th className="px-2 py-1.5 text-end">المبلغ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {realPayments.map((p) => (
                <tr key={p.id}>
                  <td className="px-2 py-1.5">{formatDate(p.received_at)}</td>
                  <td className="px-2 py-1.5">{PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method}</td>
                  <td className="px-2 py-1.5 font-mono" dir="ltr">{p.reference_number || "—"}</td>
                  <td className="px-2 py-1.5 text-end font-mono">{money(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Receipt block — the part that gets signed on delivery */}
      <div className="pt-4 mt-3 border-t border-stone-200 break-inside-avoid">
        <p className="text-[10px] leading-relaxed text-stone-600">
          أقرّ بأنني استلمت الأصناف المذكورة أعلاه بالكمية والحالة الموضحة، وأن المبلغ المطلوب تحصيله
          مستحق الدفع عند الاستلام ما لم يُذكر خلاف ذلك. الاستبدال أو الإرجاع خلال المدة المتفق عليها
          ووفق سياسة الشركة، وبشرط أن تكون العبوة سليمة وغير مستخدمة.
        </p>
        <div className="grid grid-cols-3 gap-4 pt-6 text-[11px] text-stone-500">
          <div className="border-t border-stone-400 pt-1 text-center">توقيع المستلم</div>
          <div className="border-t border-stone-400 pt-1 text-center">توقيع السائق / المندوب</div>
          <div className="border-t border-stone-400 pt-1 text-center">التاريخ</div>
        </div>
      </div>

      <p className="pt-3 text-center text-[9px] text-stone-400">
        كشف صادر آلياً من نظام بيتولا ERP — <span dir="ltr" className="font-mono">{order.id}</span>
      </p>
    </div>
  );
}

export function OrderStatementModal({ order, onClose }: { order: BusinessOrder; onClose: () => void }) {
  return (
    <div
      data-dialog=""
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-start sm:items-center justify-center p-3 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="print-area bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-stone-200 my-4 p-5 sm:p-7"
      >
        <div className="no-print flex items-center justify-between gap-2 mb-4">
          <button
            type="button"
            onClick={printArea}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>طباعة / حفظ PDF</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="p-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <OrderStatementDocument order={order} />
      </div>
    </div>
  );
}
