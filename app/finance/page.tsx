"use client";

import { useState } from "react";
import { 
  Receipt, 
  Search, 
  Filter, 
  DollarSign, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Printer, 
  Plus, 
  CreditCard, 
  ArrowUpRight,
  Sparkles,
  Calendar,
  Building,
  UserCheck
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

const INITIAL_INVOICES = [
  {
    id: "INV-2026-001",
    order_id: "BET-2026-001",
    customer_name: "سدين غنايم",
    customer_phone: "0793937385",
    city: "طبربور",
    subtotal: 24.000,
    discount: 0.000,
    total_amount: 24.000,
    paid_amount: 24.000,
    status: "paid",
    payment_method: "cash_on_delivery",
    issued_date: "2026-09-08",
    due_date: "2026-09-08",
    rep_name: "رحمه",
    items: [
      { name: "شامبو بلازما للشعر 500 مل", qty: 2, price: 12.000, total: 24.000 },
      { name: "تريتمنت بلازما 100 مل (عينة مجانية)", qty: 1, price: 0.000, total: 0.000 }
    ]
  },
  {
    id: "INV-2026-002",
    order_id: "BET-2026-002",
    customer_name: "ربى صبيح",
    customer_phone: "0799193505",
    city: "الزرقاء",
    subtotal: 98.100,
    discount: 3.100,
    total_amount: 95.000,
    paid_amount: 0.000,
    status: "pending",
    payment_method: "installment",
    issued_date: "2026-09-10",
    due_date: "2026-10-10",
    rep_name: "صابرين",
    items: [
      { name: "بكج مورفوزيس ريستركتشر 250 مل", qty: 3, price: 20.700, total: 62.100 },
      { name: "ليف ان مورفوزيس ريستركتشر 125 مل", qty: 2, price: 18.000, total: 36.000 },
      { name: "عينات سيشتات مورفوزيس هدية", qty: 5, price: 0.000, total: 0.000 }
    ]
  },
  {
    id: "INV-2026-003",
    order_id: "BET-2026-003",
    customer_name: "صالون لمسة حرير",
    customer_phone: "0788812345",
    city: "إربد",
    subtotal: 150.000,
    discount: 0.000,
    total_amount: 150.000,
    paid_amount: 50.000,
    status: "partial",
    payment_method: "cliq",
    issued_date: "2026-09-07",
    due_date: "2026-09-20",
    rep_name: "حنان",
    items: [
      { name: "بروتين ماراكوجا البرازيلي 1000 مل (لتر)", qty: 1, price: 105.000, total: 105.000 },
      { name: "سشوار جاما توربو ستار 2500 واط", qty: 1, price: 45.000, total: 45.000 }
    ]
  },
  {
    id: "INV-2026-004",
    order_id: "BET-2026-004",
    customer_name: "صيدلية المقاصد",
    customer_phone: "0770005000",
    city: "عمان",
    subtotal: 180.000,
    discount: 0.000,
    total_amount: 180.000,
    paid_amount: 180.000,
    status: "paid",
    payment_method: "bank_transfer",
    issued_date: "2026-09-02",
    due_date: "2026-09-05",
    rep_name: "حمزة",
    items: [
      { name: "بكج بلازما الرباعي المتكامل", qty: 5, price: 36.000, total: 180.000 }
    ]
  }
];

export default function FinancePage() {
  const [invoices, setInvoices] = useState(INITIAL_INVOICES);
  const [activeTab, setActiveTab] = useState<"all" | "paid" | "partial" | "pending">("all");
  const [searchTerm, setSearchTerm] = useState("");
  
  // Payment Modal State
  const [paymentModal, setPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<typeof INITIAL_INVOICES[0] | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState("cliq");
  const [payRef, setPayRef] = useState("");

  // Printable Official Invoice Modal State
  const [printableInvoice, setPrintableInvoice] = useState<typeof INITIAL_INVOICES[0] | null>(null);

  // Financial aggregates
  const totalInvoiced = invoices.reduce((acc, inv) => acc + inv.total_amount, 0);
  const totalCollected = invoices.reduce((acc, inv) => acc + inv.paid_amount, 0);
  const totalReceivables = totalInvoiced - totalCollected;
  const collectionRate = Math.round((totalCollected / totalInvoiced) * 100);

  const filteredInvoices = invoices.filter(inv => {
    const matchesTab = activeTab === "all" || inv.status === activeTab;
    const matchesSearch = 
      inv.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.customer_name.includes(searchTerm) ||
      inv.customer_phone.includes(searchTerm) ||
      inv.rep_name.includes(searchTerm);
    return matchesTab && matchesSearch;
  });

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice || payAmount <= 0) return;

    setInvoices(invoices.map(inv => {
      if (inv.id === selectedInvoice.id) {
        const newPaid = inv.paid_amount + payAmount;
        const newStatus = newPaid >= inv.total_amount ? "paid" : "partial";
        return {
          ...inv,
          paid_amount: newPaid,
          status: newStatus as any,
        };
      }
      return inv;
    }));

    setPaymentModal(false);
    setPayRef("");
    alert(`تم تسجيل سند القبض بمبلغ (${formatCurrency(payAmount)}) بنجاح.`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5">
            <Receipt className="w-6 h-6 text-amber-500" />
            <span>المالية والفواتير والتحصيل (Finance & Invoices)</span>
          </h2>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            إصدار الفواتير الرسمية، تتبع ذمم الصالونات، متابعة أقساط شهر، وتحصيل الدفعات
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => {
              const pendingInv = invoices.find(i => i.status !== 'paid');
              if (pendingInv) {
                setSelectedInvoice(pendingInv);
                setPayAmount(pendingInv.total_amount - pendingInv.paid_amount);
                setPaymentModal(true);
              } else {
                alert("جميع الفواتير الحالية مسددة بالكامل.");
              }
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-sm rounded-xl shadow-xs transition"
          >
            <CreditCard className="w-4 h-4" />
            <span>تسجيل سند قبض / دفعة نقدية أو CliQ</span>
          </button>
        </div>
      </div>

      {/* KPI Financial Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs">
          <p className="text-xs font-bold text-stone-500">إجمالي الفواتير الصادرة</p>
          <p className="text-2xl font-black text-stone-900 mt-1">
            {formatCurrency(totalInvoiced)}
          </p>
          <p className="text-[11px] text-stone-400 mt-0.5">قيمة المبيعات الكلية</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs">
          <p className="text-xs font-bold text-stone-500">المبالغ المحصلة فعلياً</p>
          <p className="text-2xl font-black text-emerald-600 mt-1">
            {formatCurrency(totalCollected)}
          </p>
          <p className="text-[11px] text-stone-400 mt-0.5">نقدياً وكليك وحوالات</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs">
          <p className="text-xs font-bold text-stone-500">الذمم المعلقة (أقساط شهر)</p>
          <p className="text-2xl font-black text-amber-600 mt-1">
            {formatCurrency(totalReceivables)}
          </p>
          <p className="text-[11px] text-stone-400 mt-0.5">مستحقة التحصيل</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs">
          <p className="text-xs font-bold text-stone-500">نسبة التحصيل العامة</p>
          <p className="text-2xl font-black text-stone-900 mt-1">
            {collectionRate}%
          </p>
          <div className="w-full bg-stone-100 h-1.5 rounded-full mt-2 overflow-hidden">
            <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${collectionRate}%` }} />
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-stone-200 pb-2 overflow-x-auto">
        {[
          { id: "all", label: "كافة الفواتير", count: invoices.length },
          { id: "paid", label: "مدفوعة بالكامل", count: invoices.filter(i => i.status === 'paid').length },
          { id: "partial", label: "مدفوعة جزئياً", count: invoices.filter(i => i.status === 'partial').length },
          { id: "pending", label: "ذمم وأقساط مستحقة", count: invoices.filter(i => i.status === 'pending').length },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-stone-900 text-white shadow-xs"
                : "bg-white text-stone-600 hover:bg-stone-50 border border-stone-200"
            }`}
          >
            <span>{tab.label}</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === tab.id ? "bg-amber-500 text-stone-950 font-black" : "bg-stone-100 text-stone-600"
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Search Bar */}
      <div className="bg-white p-3 rounded-2xl border border-stone-200 shadow-xs">
        <div className="relative">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            placeholder="بحث برقم الفاتورة، اسم العميل، أو المندوب..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-10 pl-4 py-2 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500 text-stone-800"
          />
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-stone-50 text-stone-500 font-bold border-b border-stone-200">
              <tr>
                <th className="py-3 px-4">رقم الفاتورة</th>
                <th className="py-3 px-4">العميل</th>
                <th className="py-3 px-4">تاريخ الإصدار</th>
                <th className="py-3 px-4">موعد الاستحقاق</th>
                <th className="py-3 px-4">المندوب</th>
                <th className="py-3 px-4">المبلغ الإجمالي</th>
                <th className="py-3 px-4">المسدد</th>
                <th className="py-3 px-4">المتبقي (الذمة)</th>
                <th className="py-3 px-4">الحالة</th>
                <th className="py-3 px-4 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredInvoices.map((inv) => {
                const remaining = inv.total_amount - inv.paid_amount;

                return (
                  <tr key={inv.id} className="hover:bg-stone-50/70 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-amber-600">
                      {inv.id}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-stone-900">{inv.customer_name}</div>
                      <div className="text-[10px] font-mono text-stone-400" dir="ltr">{inv.customer_phone}</div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-stone-600">
                      {formatDate(inv.issued_date)}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-stone-600">
                      {formatDate(inv.due_date)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 font-semibold border border-amber-200/50">
                        {inv.rep_name}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-bold font-mono text-stone-900 text-sm">
                      {formatCurrency(inv.total_amount)}
                    </td>
                    <td className="py-3.5 px-4 font-bold font-mono text-emerald-600">
                      {formatCurrency(inv.paid_amount)}
                    </td>
                    <td className={`py-3.5 px-4 font-bold font-mono ${remaining > 0 ? 'text-rose-600' : 'text-stone-400'}`}>
                      {remaining > 0 ? formatCurrency(remaining) : "—"}
                    </td>
                    <td className="py-3.5 px-4">
                      {inv.status === "paid" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>مدفوعة</span>
                        </span>
                      ) : inv.status === "partial" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          <span>جزئي</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock className="w-3 h-3" />
                          <span>مستحقة (شهر)</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* Print Invoice Button */}
                        <button
                          onClick={() => setPrintableInvoice(inv)}
                          className="p-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 transition"
                          title="طباعة الفاتورة وسند القبض الرسمي"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>

                        {/* Record Payment Button */}
                        {remaining > 0 && (
                          <button
                            onClick={() => {
                              setSelectedInvoice(inv);
                              setPayAmount(remaining);
                              setPaymentModal(true);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-[11px] shadow-2xs transition"
                          >
                            قبض دفعة
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Payment Dialog */}
      {paymentModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <form 
            onSubmit={handleRecordPayment}
            className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-lg text-stone-900">تسجيل سند قبض / دفعة مالية</h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  فاتورة {selectedInvoice.id} • العميل: {selectedInvoice.customer_name}
                </p>
              </div>
              <button 
                type="button"
                onClick={() => setPaymentModal(false)}
                className="p-1 rounded-lg bg-stone-100 text-stone-500"
              >
                ✕
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-stone-50 border border-stone-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-stone-500">إجمالي الفاتورة:</span>
                <span className="font-mono font-bold text-stone-900">{formatCurrency(selectedInvoice.total_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">المبلغ المدفوع سابقاً:</span>
                <span className="font-mono font-bold text-emerald-600">{formatCurrency(selectedInvoice.paid_amount)}</span>
              </div>
              <div className="flex justify-between border-t border-stone-200 pt-1">
                <span className="font-bold text-stone-700">المتبقي المطلوب تحصيله:</span>
                <span className="font-mono font-bold text-rose-600 text-sm">
                  {formatCurrency(selectedInvoice.total_amount - selectedInvoice.paid_amount)}
                </span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-stone-700 block mb-1">المبلغ المحصل الآن (د.أ):</label>
                <input
                  type="number"
                  step="0.001"
                  max={selectedInvoice.total_amount - selectedInvoice.paid_amount}
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500 font-mono font-bold text-lg text-center"
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">طريقة القبض:</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500 font-semibold"
                >
                  <option value="cliq">كليك CliQ فوري</option>
                  <option value="cash">نقداً (مع المندوب أو السائق)</option>
                  <option value="bank_transfer">تحويل بنكي</option>
                  <option value="check">شيك بنكي مؤجل</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">رقم الحوالة / المرجع (CliQ Ref):</label>
                <input
                  type="text"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="أدخل رقم العملية البنكية أو رقم إيصال القبض"
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-stone-950 rounded-xl font-bold text-xs shadow-xs transition"
              >
                تأكيد سند القبض والخصم من الذمة
              </button>
              <button
                type="button"
                onClick={() => setPaymentModal(false)}
                className="px-4 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-medium"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Official Tax / Sales Invoice Print View Modal */}
      {printableInvoice && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-stone-200 space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Header with Print & Close */}
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center text-stone-950 font-black text-sm">
                  B
                </div>
                <div>
                  <h3 className="font-bold text-base text-stone-900">شركة بيتولا لمستحضرات التجميل</h3>
                  <p className="text-[11px] text-stone-500">عمان - الأردن • هاتف: 0790230211</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة الفاتورة</span>
                </button>
                <button 
                  onClick={() => setPrintableInvoice(null)}
                  className="p-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-500"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Official Invoice Sheet */}
            <div className="p-5 border border-stone-300 rounded-2xl bg-stone-50/50 space-y-4 text-xs">
              <div className="flex justify-between items-center pb-3 border-b border-stone-200">
                <div>
                  <p className="font-bold text-lg text-stone-900">فاتورة مبيعات وسند تسليم</p>
                  <p className="font-mono text-stone-500">رقم الفاتورة: {printableInvoice.id}</p>
                </div>
                <div className="text-left">
                  <p className="text-stone-500">تاريخ الفاتورة:</p>
                  <p className="font-mono font-bold text-stone-900">{formatDate(printableInvoice.issued_date)}</p>
                </div>
              </div>

              {/* Customer and Rep Details */}
              <div className="grid grid-cols-2 gap-3 bg-white p-3.5 rounded-xl border border-stone-200">
                <div>
                  <span className="text-stone-400 block text-[10px]">العميل / المستلم:</span>
                  <span className="font-bold text-stone-900 text-sm">{printableInvoice.customer_name}</span>
                  <p className="font-mono text-stone-600 mt-0.5" dir="ltr">{printableInvoice.customer_phone}</p>
                  <p className="text-stone-600 mt-0.5">{printableInvoice.city}</p>
                </div>
                <div>
                  <span className="text-stone-400 block text-[10px]">المندوب المسؤول:</span>
                  <span className="font-bold text-stone-900">{printableInvoice.rep_name}</span>
                  <p className="text-stone-500 mt-1">طريقة الدفع: {printableInvoice.payment_method === 'installment' ? 'أقساط / شهر' : 'دفع عند الاستلام'}</p>
                  <p className="text-stone-500">استحقاق الدفع: {formatDate(printableInvoice.due_date)}</p>
                </div>
              </div>

              {/* Line Items Table */}
              <div className="border border-stone-200 rounded-xl overflow-hidden bg-white">
                <table className="w-full text-right text-xs">
                  <thead className="bg-stone-100 text-stone-600 font-bold border-b border-stone-200">
                    <tr>
                      <th className="py-2.5 px-3">الصنف</th>
                      <th className="py-2.5 px-3 text-center">الكمية</th>
                      <th className="py-2.5 px-3">سعر الوحدة</th>
                      <th className="py-2.5 px-3">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {printableInvoice.items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="py-2.5 px-3 font-semibold text-stone-900">{item.name}</td>
                        <td className="py-2.5 px-3 font-mono text-center">{item.qty}</td>
                        <td className="py-2.5 px-3 font-mono">{formatCurrency(item.price)}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-stone-900">{formatCurrency(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary Totals */}
              <div className="space-y-1.5 pt-2 border-t border-stone-200 text-left">
                <div className="flex justify-between text-stone-600">
                  <span>المجموع الفرعي:</span>
                  <span className="font-mono">{formatCurrency(printableInvoice.subtotal)}</span>
                </div>
                {printableInvoice.discount > 0 && (
                  <div className="flex justify-between text-emerald-600 font-medium">
                    <span>الخصم الممنوح:</span>
                    <span className="font-mono">-{formatCurrency(printableInvoice.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-stone-900 font-bold text-sm border-t border-stone-200 pt-1.5">
                  <span>صافي المبلغ الإجمالي:</span>
                  <span className="font-mono text-base text-amber-700">{formatCurrency(printableInvoice.total_amount)}</span>
                </div>
                <div className="flex justify-between text-emerald-700 font-bold">
                  <span>المبلغ المسدد:</span>
                  <span className="font-mono">{formatCurrency(printableInvoice.paid_amount)}</span>
                </div>
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-2 gap-6 pt-6 border-t border-dashed border-stone-300 text-center text-[11px] text-stone-500">
                <div>
                  <p className="mb-8 font-semibold">توقيع المستلم</p>
                  <p className="border-t border-stone-300 pt-1">........................................</p>
                </div>
                <div>
                  <p className="mb-8 font-semibold">ختم وتوقيع شركة بيتولا</p>
                  <p className="border-t border-stone-300 pt-1">........................................</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
