"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
import { useLoading } from "@/lib/loading-context";

import {loadBusiness,saveBusiness,pendingBusiness} from '@/lib/business-client';
import {financeSummary,type BusinessInvoice} from '@/lib/business';
export default function FinancePage() {
  const { startLoading, stopLoading } = useLoading();
  const [invoices, setInvoices] = useState<BusinessInvoice[]>([]);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [loaded,setLoaded]=useState(false);
  const [saving,setSaving]=useState(false);
  const [retrying,setRetrying]=useState(false);
  const busy=useRef(false);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Payment Modal State
  const [paymentModal, setPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<BusinessInvoice | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState("cliq");
  const [payRef, setPayRef] = useState("");
  const [reversingId, setReversingId] = useState<string | null>(null);

  // Printable Official Invoice Modal State
  const [printableInvoice, setPrintableInvoice] = useState<BusinessInvoice | null>(null);

  const reload=useCallback(async()=>{
    try{
      const data=await loadBusiness<{invoices:BusinessInvoice[]}>('/api/finance');setInvoices(data.invoices);setError('');setLoaded(true);
      const pending=pendingBusiness('collection');
      if(pending){const invoice=data.invoices.find(i=>i.id===pending.invoice_id);
        if(invoice){setSelectedInvoice(invoice);setPayAmount(pending.amount);setPayMethod(pending.payment_method);setPayRef(pending.reference_number);setRetrying(true);setPaymentModal(true);}}
    }catch(e){setError(e instanceof Error?e.message:'تعذر تحميل الفواتير.');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void Promise.resolve().then(reload);},[reload]);

  // Financial aggregates
  const totals=financeSummary(invoices);
  const totalInvoiced=totals.total_invoiced_jd,totalCollected=totals.total_collected_jd;
  const totalReceivables=totals.total_receivables_jd,collectionRate=totals.collection_rate_percent;

  const filteredInvoices = invoices.filter(inv => {
    const matchesTab = activeTab === "all" || inv.status === activeTab;
    const matchesSearch =
      inv.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.customer_name.includes(searchTerm) ||
      inv.customer_phone.includes(searchTerm) ||
      inv.rep_name.includes(searchTerm);
    return matchesTab && matchesSearch;
  });

  const handleRecordPayment=async(e:React.FormEvent)=>{
    e.preventDefault();if(busy.current||!selectedInvoice||payAmount<=0)return;
    busy.current=true;setSaving(true);setError('');startLoading({ar:'جاري حفظ سند القبض...',en:'Saving collection...'});
    try{
      const {invoice}=await saveBusiness<{invoice:BusinessInvoice}>('collection','/api/finance',
        {invoice_id:selectedInvoice.id,amount:payAmount,payment_method:payMethod,reference_number:payRef});
      setInvoices(prev=>prev.map(i=>i.id===invoice.id?invoice:i));setSelectedInvoice(invoice);
      setPaymentModal(false);setRetrying(false);setPayRef('');alert('تم تأكيد حفظ سند القبض.');
    }catch(e){setError(e instanceof Error?e.message:'تعذر تأكيد الحفظ. أعد المحاولة بنفس البيانات.');}
    finally{busy.current=false;setSaving(false);stopLoading();}
  };

  const handleReversePayment=async(paymentId:string)=>{
    if(!selectedInvoice||reversingId)return;
    if(!confirm('هل أنت متأكد من عكس/إلغاء هذه الدفعة؟ سيتم تسجيل قيد عكسي في السجل المحاسبي.'))return;
    setReversingId(paymentId);setError('');startLoading({ar:'جاري عكس الدفعة...',en:'Reversing payment...'});
    try{
      const {invoice}=await saveBusiness<{invoice:BusinessInvoice}>('reversal-'+paymentId,'/api/finance',
        {payment_id:paymentId},'PATCH');
      setInvoices(prev=>prev.map(i=>i.id===invoice.id?invoice:i));setSelectedInvoice(invoice);
      alert('تم عكس الدفعة وتحديث رصيد الفاتورة.');
    }catch(e){setError(e instanceof Error?e.message:'تعذر عكس الدفعة. أعد المحاولة.');}
    finally{setReversingId(null);stopLoading();}
  };


  if(!loaded)return <div role="status">{loading?'جاري تحميل البيانات المحفوظة...':error}<button onClick={()=>void reload()}>إعادة المحاولة</button></div>;

  return (
    <div className="space-y-6">
      {loading&&<p role="status">جاري تحميل الفواتير المحفوظة...</p>}
      {error&&<p role="alert" className="text-red-700">{error}</p>}
      <button onClick={()=>void reload()} disabled={saving}>تحديث الفواتير</button>
      {totals.credit_balance_jd>0&&<p>رصيد للعملاء يتطلب مراجعة المرتجعات: {formatCurrency(totals.credit_balance_jd)}</p>}
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
              const pendingInv = invoices.find(i => i.outstanding_amount > 0);
              if (pendingInv) {
                setSelectedInvoice(pendingInv);
                setPayAmount(pendingInv.outstanding_amount);
                setPaymentModal(true);
              } else {
                alert("لا توجد ذمم قابلة للتحصيل في البيانات المحملة.");
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
            onClick={() => setActiveTab(tab.id)}
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
                const remaining = inv.outstanding_amount;

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
                          <span>{inv.collectible?'مستحقة':'غير قابلة للتحصيل: '+inv.order_status}</span>
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
                disabled={saving}
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
                  {formatCurrency(selectedInvoice.outstanding_amount)}
                </span>
              </div>
            </div>

            {selectedInvoice.payments && selectedInvoice.payments.length > 0 && (
              <div className="space-y-1.5">
                <label className="font-bold text-stone-700 block text-xs">سجل الدفعات:</label>
                <div className="max-h-32 overflow-y-auto space-y-1.5">
                  {selectedInvoice.payments.map((p) => (
                    <div key={p.id} className={(p.is_reversal ? "bg-rose-50 border-rose-200" : "bg-stone-50 border-stone-200") + " p-2 rounded-xl border flex items-center justify-between gap-2 text-[11px]"}>
                      <div className="flex flex-col">
                        <span className={"font-mono font-bold " + (p.amount < 0 ? "text-rose-600" : "text-emerald-700")}>
                          {formatCurrency(p.amount)}
                        </span>
                        <span className="text-stone-400">{formatDate(p.received_at)} {p.reference_number ? "• " + p.reference_number : ""}{p.is_reversal ? " • دفعة عكسية" : ""}</span>
                      </div>
                      {!p.is_reversal && !selectedInvoice.payments.some((r) => r.reversed_payment_id === p.id) && (
                        <button
                          type="button"
                          onClick={() => handleReversePayment(p.id)}
                          disabled={reversingId === p.id}
                          className="px-2 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 disabled:opacity-60 text-rose-700 font-bold whitespace-nowrap"
                        >
                          {reversingId === p.id ? "..." : "عكس / إلغاء"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-stone-700 block mb-1">المبلغ المحصل الآن (د.أ):</label>
                <input
                  type="number"
                  step="0.001"
                  max={retrying ? undefined : selectedInvoice.outstanding_amount}
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
                  <option value="zain_cash">Zain Cash</option>
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

            {error&&<p role="alert" className="text-red-700">{error}</p>}
            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={saving}
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
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-stone-200 space-y-5 max-h-[90dvh] overflow-y-auto">
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
                        <td className="py-2.5 px-3 font-mono">{item.price===null?'—':formatCurrency(item.price)}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-stone-900">{item.total===null?'—':formatCurrency(item.total)}</td>
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
