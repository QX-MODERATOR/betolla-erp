"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Search,
  Filter,
  PhoneCall,
  MessageSquare,
  Calendar as CalendarIcon,
  MapPin,
  Tag,
  UserCheck,
  Sparkles,
  Plus,
  Clock,
  CheckCircle2,
  ExternalLink,
  ShoppingCart
} from "lucide-react";
import { CUSTOMER_TYPE_LABELS, CLASSIFICATION_LABELS, formatDate } from "@/lib/utils";
import { useLoading } from "@/lib/loading-context";
import { loadBusiness, saveBusiness } from "@/lib/business-client";
import type { BusinessCustomer } from "@/lib/business";
import { useCan } from "@/lib/use-permission";
import { ASSIGNABLE_REPS } from "@/lib/reps";
import { useToast } from "@/components/common/toast";

const PAGE_SIZE = 50;

export default function CustomersPage() {
  const { showToast } = useToast();
  const canReassign = useCan("customers.reassign");
  const router = useRouter();
  const { startLoading, stopLoading } = useLoading();
  const [customers, setCustomers] = useState<BusinessCustomer[]>([]);
  const [totals, setTotals] = useState({ total: 0, all: 0 });
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRep, setSelectedRep] = useState("all");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedCustomer, setSelectedCustomer] = useState<BusinessCustomer | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", phone: "", city: "", address: "", notes: "", rep_name: "", customer_type: "end_user", classification: "customer", next_call_date: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [callOutcome, setCallOutcome] = useState("answered");
  const [callNotes, setCallNotes] = useState("");
  const [callNextDate, setCallNextDate] = useState("");
  const [callNextTime, setCallNextTime] = useState("11:00");
  const [loggingCall, setLoggingCall] = useState(false);

  // The server returns one filtered page (the list has 45k+ customers). A request id discards
  // answers that arrive after the filters changed again.
  const requestId = useRef(0);
  const reload = useCallback(async () => {
    const id = ++requestId.current;
    const params = new URLSearchParams({
      view: "page", q: searchTerm.trim(), rep: selectedRep === "all" ? "" : selectedRep,
      type: selectedType === "all" ? "" : selectedType,
      offset: String(pageIndex * PAGE_SIZE), limit: String(PAGE_SIZE),
    });
    try {
      const data = await loadBusiness<{ customers: BusinessCustomer[]; total: number; all_total: number }>(`/api/customers?${params}`);
      if (id !== requestId.current) return;
      setCustomers(data.customers);
      setTotals({ total: data.total, all: data.all_total });
      setLoadError("");
    } catch (err) {
      if (id !== requestId.current) return;
      setLoadError(err instanceof Error ? err.message : "تعذر تحميل قائمة العملاء.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [searchTerm, selectedRep, selectedType, pageIndex]);
  useEffect(() => {
    const t = setTimeout(() => { void reload(); }, searchTerm ? 300 : 0);
    return () => clearTimeout(t);
  }, [reload, searchTerm]);
  const pageCount = Math.max(1, Math.ceil(totals.total / PAGE_SIZE));

  const openCustomer = (cust: BusinessCustomer) => {
    setSelectedCustomer(cust);
    // List rows carry no call history; load the full record for the drawer.
    void loadBusiness<{ customer: BusinessCustomer }>(`/api/customers?id=${cust.id}`)
      .then((d) => setSelectedCustomer((cur) => (cur && cur.id === d.customer.id ? d.customer : cur)))
      .catch(() => {});
    setEditMode(false);
    setEditForm({
      name: cust.name, phone: cust.phone, city: cust.city || "", address: cust.address || "",
      notes: cust.notes || "", rep_name: cust.rep_name_raw || "",
      customer_type: cust.customer_type, classification: cust.classification,
      next_call_date: cust.next_call_date || "",
    });
    setCallOutcome("answered"); setCallNotes(""); setCallNextDate("");
  };

  const handleSaveEdit = async () => {
    if (!selectedCustomer) return;
    setSavingEdit(true);
    try {
      const res = await fetch("/api/customers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedCustomer.id, ...editForm }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "فشل حفظ التعديلات.");
      setSelectedCustomer(data.customer);
      setCustomers((prev) => prev.map((c) => (c.id === data.customer.id ? data.customer : c)));
      setEditMode(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل حفظ التعديلات.", "error", 6000);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleLogCall = async () => {
    if (!selectedCustomer) return;
    setLoggingCall(true);
    try {
      const data = await saveBusiness<{ customer: BusinessCustomer; log_id: string }>(
        `call-log:${selectedCustomer.id}`, "/api/calls",
        { customer_id: selectedCustomer.id, outcome: callOutcome, notes: callNotes,
          next_call_date: callNextDate || undefined, next_call_time: callNextDate && callNextTime ? callNextTime : undefined }
      );
      setSelectedCustomer(data.customer);
      setCustomers((prev) => prev.map((c) => (c.id === data.customer.id ? data.customer : c)));
      setCallNotes(""); setCallNextDate(""); setCallOutcome("answered");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل تسجيل المكالمة.", "error", 6000);
    } finally {
      setLoggingCall(false);
    }
  };

  // New Lead Modal
  const [newLeadModal, setNewLeadModal] = useState(false);
  const [newLeadName, setNewLeadName] = useState("");
  const [newLeadPhone, setNewLeadPhone] = useState("");
  const [newLeadCity, setNewLeadCity] = useState("عمان");
  const [newLeadAddress, setNewLeadAddress] = useState("");
  const [newLeadNotes, setNewLeadNotes] = useState("");
  const [newLeadSource, setNewLeadSource] = useState("social_media");
  const [newLeadRep, setNewLeadRep] = useState("auto");

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeadPhone) return;

    startLoading({
      ar: "جاري حفظ وتوثيق بيانات العميل في قاعدة البيانات...",
      en: "Registering customer lead in CRM database...",
    });

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newLeadName || "عميل جديد",
          phone: newLeadPhone,
          city: newLeadCity,
          address: newLeadAddress,
          notes: newLeadNotes,
          source: newLeadSource,
          rep_name: newLeadRep,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "فشل إنشاء الليد.");
      }
      await reload();
      setNewLeadModal(false);
      setNewLeadName("");
      setNewLeadPhone("");
      setNewLeadAddress("");
      setNewLeadNotes("");
      showToast(data.message, "success", 6000);
    } catch (err) {
      showToast("فشل إنشاء الليد: " + (err instanceof Error ? err.message : String(err)), "error", 6000);
    } finally {
      stopLoading();
    }
  };


  const filteredCustomers = customers;

  return (
    <div className="space-y-6">
      {/* Header Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5">
            <Users className="w-6 h-6 text-amber-500" />
            <span>إدارة العملاء والليدات (CRM)</span>
          </h2>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            قاعدة بيانات عملاء بيتولا كوزمتكس ({totals.all.toLocaleString("ar")} سجل محفوظ مع سجل الاتصالات والتوزيع الآلي)
          </p>
        </div>

        <button
          onClick={() => setNewLeadModal(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-sm rounded-xl shadow-xs transition"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة رقم / ليد جديد (توزيع آلي)</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            placeholder="بحث بالاسم، رقم الهاتف، أو المدينة..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPageIndex(0); }}
            className="w-full pr-10 pl-4 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-stone-800"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={selectedRep}
            onChange={(e) => { setSelectedRep(e.target.value); setPageIndex(0); }}
            className="px-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-xl text-stone-700 focus:outline-none focus:border-amber-500 font-medium"
          >
            <option value="all">جميع المندوبين</option>
            {ASSIGNABLE_REPS.map((rep) => <option key={rep} value={rep}>{rep}</option>)}
          </select>

          <select
            value={selectedType}
            onChange={(e) => { setSelectedType(e.target.value); setPageIndex(0); }}
            className="px-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-xl text-stone-700 focus:outline-none focus:border-amber-500 font-medium"
          >
            <option value="all">كافة أنواع العملاء</option>
            <option value="end_user">مستهلك مباشر</option>
            <option value="salon">صالون</option>
            <option value="pharmacy">صيدلية</option>
            <option value="wholesale">جملة</option>
            <option value="sale">بيع / حجز</option>
          </select>
        </div>
      </div>

      {loadError && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center justify-between gap-3">
          <span>{loadError}</span>
          <button onClick={() => { setLoading(true); void reload(); }} className="px-3 py-1 rounded-lg bg-red-600 text-white font-bold">إعادة المحاولة</button>
        </div>
      )}

      {/* Customer Data Table */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-stone-400">جاري تحميل بيانات العملاء...</div>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-stone-50 text-stone-500 font-bold border-b border-stone-200">
              <tr>
                <th className="py-3 px-4"># الرقم</th>
                <th className="py-3 px-4">اسم العميل</th>
                <th className="py-3 px-4">رقم الهاتف</th>
                <th className="py-3 px-4">النوع والتصنيف</th>
                <th className="py-3 px-4">المندوب</th>
                <th className="py-3 px-4">المدينة / العنوان</th>
                <th className="py-3 px-4">الموعد القادم</th>
                <th className="py-3 px-4 text-center">إجراءات سريعة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredCustomers.map((customer) => (
                <tr
                  key={customer.id}
                  className="hover:bg-amber-50/40 transition cursor-pointer"
                  onClick={() => openCustomer(customer)}
                >
                  <td className="py-3.5 px-4 font-mono text-stone-400">
                    {customer.legacy_id}
                  </td>
                  <td className="py-3.5 px-4 font-bold text-stone-900">
                    {customer.name}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-stone-700" dir="ltr">
                    {customer.phone}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-stone-100 text-stone-700 border border-stone-200">
                      {CUSTOMER_TYPE_LABELS[customer.customer_type] || customer.customer_type}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 font-semibold border border-amber-200/60">
                      {customer.rep_name_raw}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-stone-600 max-w-xs truncate">
                    {customer.address || customer.city || "—"}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-xs">
                    {customer.next_call_date ? (
                      <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium border border-blue-200">
                        {formatDate(customer.next_call_date)}
                      </span>
                    ) : (
                      <span className="text-stone-400">—</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1.5">
                      <a
                        href={`tel:${customer.phone}`}
                        className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                        title="اتصال هاتف"
                      >
                        <PhoneCall className="w-3.5 h-3.5" />
                      </a>
                      <a
                        href={`https://wa.me/${customer.phone.replace(/^0/, '962')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                        title="محادثة واتساب"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}

        {/* Table Footer */}
        {!loading && (
          <div className="p-4 border-t border-stone-100 text-xs text-stone-500 flex flex-wrap items-center justify-between gap-3">
            <span>
              {totals.total === 0
                ? "لا توجد نتائج مطابقة"
                : `عرض ${(pageIndex * PAGE_SIZE + 1).toLocaleString("ar")}–${(pageIndex * PAGE_SIZE + customers.length).toLocaleString("ar")} من ${totals.total.toLocaleString("ar")} عميل`}
            </span>
            <div className="flex items-center gap-2">
              <button type="button" disabled={pageIndex === 0} onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
                className="px-3 py-1.5 rounded-lg border border-stone-200 bg-white font-bold disabled:opacity-40">السابق</button>
              <span className="font-mono">{(pageIndex + 1).toLocaleString("ar")} / {pageCount.toLocaleString("ar")}</span>
              <button type="button" disabled={pageIndex + 1 >= pageCount} onClick={() => setPageIndex((i) => i + 1)}
                className="px-3 py-1.5 rounded-lg border border-stone-200 bg-white font-bold disabled:opacity-40">التالي</button>
            </div>
          </div>
        )}
      </div>

      {/* Customer Detail Drawer with History */}
      {selectedCustomer && (
        <div data-dialog="" className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-stone-200 space-y-5 animate-in fade-in zoom-in duration-150 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-bold text-stone-900">{selectedCustomer.name}</h3>
                <p className="text-sm font-mono text-stone-500" dir="ltr">{selectedCustomer.phone}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setEditMode((v) => !v)}
                  className={(editMode ? "bg-stone-900 text-white border-stone-900" : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100") + " px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition"}
                >
                  {editMode ? "إلغاء التعديل" : "تعديل / إسناد"}
                </button>
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="p-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-500"
                >
                  ✕
                </button>
              </div>
            </div>

            {editMode ? (
              <div className="space-y-2.5 text-xs bg-stone-50 p-4 rounded-2xl border border-stone-200">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-stone-700 block mb-1">الاسم:</label>
                    <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full p-2 bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="font-bold text-stone-700 block mb-1">الهاتف:</label>
                    <input value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                      dir="ltr" className="w-full p-2 bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-amber-500 font-mono" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-stone-700 block mb-1">المندوب المسؤول (إسناد):</label>
                    <select value={editForm.rep_name} onChange={(e) => setEditForm((f) => ({ ...f, rep_name: e.target.value }))}
                      disabled={!canReassign}
                      className="w-full p-2 bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-amber-500 font-semibold text-amber-900 disabled:opacity-60">
                      {/* Names must match customers.rep_name_raw exactly, or the rep never sees the lead. */}
                      {[...ASSIGNABLE_REPS, ...(editForm.rep_name && !ASSIGNABLE_REPS.includes(editForm.rep_name) ? [editForm.rep_name] : [])].map((rep) => (
                        <option key={rep} value={rep}>{rep}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-stone-700 block mb-1">نوع العميل:</label>
                    <select value={editForm.customer_type} onChange={(e) => setEditForm((f) => ({ ...f, customer_type: e.target.value }))}
                      className="w-full p-2 bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-amber-500">
                      {Object.entries(CUSTOMER_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-stone-700 block mb-1">التصنيف:</label>
                    <select value={editForm.classification} onChange={(e) => setEditForm((f) => ({ ...f, classification: e.target.value }))}
                      className="w-full p-2 bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-amber-500">
                      {Object.entries(CLASSIFICATION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-stone-700 block mb-1">موعد المتابعة القادم:</label>
                    <input type="date" value={editForm.next_call_date} onChange={(e) => setEditForm((f) => ({ ...f, next_call_date: e.target.value }))}
                      className="w-full p-2 bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-amber-500 font-mono" />
                  </div>
                </div>
                <div>
                  <label className="font-bold text-stone-700 block mb-1">المدينة:</label>
                  <input value={editForm.city} onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))}
                    className="w-full p-2 bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-amber-500" />
                </div>
                <div>
                  <label className="font-bold text-stone-700 block mb-1">العنوان التفصيلي:</label>
                  <input value={editForm.address} onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                    className="w-full p-2 bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-amber-500" />
                </div>
                <div>
                  <label className="font-bold text-stone-700 block mb-1">ملاحظات:</label>
                  <textarea rows={2} value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                    className="w-full p-2 bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-amber-500" />
                </div>
                <button onClick={handleSaveEdit} disabled={savingEdit}
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-stone-950 rounded-xl font-bold text-xs shadow-xs transition">
                  {savingEdit ? "جاري الحفظ..." : "حفظ التعديلات"}
                </button>
              </div>
            ) : (
            <div className="space-y-2 text-xs bg-stone-50 p-4 rounded-2xl border border-stone-200">
              <div className="flex justify-between">
                <span className="text-stone-500">المندوب المسؤول:</span>
                <span className="font-bold text-stone-800">{selectedCustomer.rep_name_raw}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">نوع العميل:</span>
                <span className="font-semibold text-stone-800">{CUSTOMER_TYPE_LABELS[selectedCustomer.customer_type]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">العنوان:</span>
                <span className="font-medium text-stone-800">{selectedCustomer.address}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">تاريخ التواصل القادم:</span>
                <span className="font-mono font-bold text-amber-600">
                  {formatDate(selectedCustomer.next_call_date)}
                  {selectedCustomer.next_call_at ? ` · ${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Amman", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(selectedCustomer.next_call_at))}` : ""}
                </span>
              </div>
            </div>
            )}


            {/* Call Logs Timeline */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>سجل الاتصالات والملاحظات السابقة:</span>
              </h4>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {selectedCustomer.history && selectedCustomer.history.length > 0 ? (
                  selectedCustomer.history.map((h, idx: number) => (
                    <div key={idx} className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs space-y-1">
                      <div className="flex justify-between text-stone-500 text-[10px]">
                        <span>{h.date} • بواسطة: {h.rep}</span>
                        <span className="font-bold text-amber-700">{h.outcome}</span>
                      </div>
                      <p className="text-stone-700">{h.notes}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-stone-400 italic">لا توجد مكالمات سابقة مسجلة لهذا العميل حتى الآن.</p>
                )}
              </div>
            </div>

            {/* Log a new call */}
            <div className="space-y-2 p-3 bg-amber-50/60 rounded-2xl border border-amber-200/80">
              <label className="text-xs font-bold text-amber-950 block">تسجيل مكالمة جديدة:</label>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                {[
                  { id: "answered", label: "تم الرد" },
                  { id: "no_answer", label: "لا يوجد رد" },
                  { id: "whatsapp_sent", label: "واتساب" },
                  { id: "order_placed", label: "تم تثبيت طلب" },
                  { id: "callback_requested", label: "معاودة لاحقاً" },
                  { id: "not_interested", label: "غير مهتم" },
                ].map((o) => (
                  <button key={o.id} type="button" onClick={() => setCallOutcome(o.id)}
                    className={(callOutcome === o.id ? "bg-amber-500 border-amber-500 text-stone-950 font-bold" : "bg-white border-amber-200 text-stone-700") + " p-1.5 rounded-lg text-right font-medium border transition"}>
                    {o.label}
                  </button>
                ))}
              </div>
              <textarea rows={2} value={callNotes} onChange={(e) => setCallNotes(e.target.value)}
                placeholder="ملاحظات المكالمة..."
                className="w-full p-2 text-xs bg-white border border-amber-200 rounded-lg focus:outline-none focus:border-amber-500" />
              <div className="flex items-center gap-2">
                <input type="date" value={callNextDate} onChange={(e) => setCallNextDate(e.target.value)} aria-label="تاريخ الاتصال القادم"
                  className="flex-1 min-w-0 p-2 text-xs bg-white border border-amber-200 rounded-lg focus:outline-none focus:border-amber-500 font-mono" />
                <input type="time" value={callNextTime} onChange={(e) => setCallNextTime(e.target.value)} aria-label="وقت الاتصال القادم"
                  disabled={!callNextDate}
                  className="w-24 p-2 text-xs bg-white border border-amber-200 rounded-lg focus:outline-none focus:border-amber-500 font-mono disabled:opacity-50" />
                <button onClick={handleLogCall} disabled={loggingCall}
                  className="px-3.5 py-2 bg-stone-900 hover:bg-stone-800 disabled:opacity-60 text-white rounded-xl text-xs font-bold shadow-xs transition whitespace-nowrap">
                  {loggingCall ? "جاري الحفظ..." : "حفظ المكالمة"}
                </button>
              </div>
            </div>

            <button
              onClick={() => router.push(`/sales?openOrderFor=${encodeURIComponent(selectedCustomer.phone)}&rep=${encodeURIComponent(selectedCustomer.rep_name_raw || "")}`)}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>إنشاء طلب لهذا العميل</span>
            </button>

            <div className="flex gap-2 pt-2">
              <a
                href={`tel:${selectedCustomer.phone}`}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition"
              >
                <PhoneCall className="w-4 h-4" />
                <span>اتصال فوري</span>
              </a>
              <a
                href={`https://wa.me/${selectedCustomer.phone.replace(/^0/, '962')}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-stone-950 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition"
              >
                <MessageSquare className="w-4 h-4" />
                <span>محادثة واتساب</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Add New Lead Modal */}
      {newLeadModal && (
        <div data-dialog="" className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateLead}
            className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-lg text-stone-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  <span>إضافة رقم / ليد جديد (تلقائي)</span>
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  يتم توجيه الرقم آلياً للمندوب النشط دون الحاجة لطباعة أوراق
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNewLeadModal(false)}
                className="p-1 rounded-lg bg-stone-100 text-stone-500 hover:bg-stone-200"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-stone-700 block mb-1">اسم العميل (اختياري):</label>
                <input
                  type="text"
                  value={newLeadName}
                  onChange={(e) => setNewLeadName(e.target.value)}
                  placeholder="مثال: دانا خليل"
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">رقم الهاتف (مطلوب):</label>
                <input
                  type="text"
                  required
                  value={newLeadPhone}
                  onChange={(e) => setNewLeadPhone(e.target.value)}
                  placeholder="07xxxxxxxx"
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500 font-mono"
                  dir="ltr"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">المدينة:</label>
                  <select
                    value={newLeadCity}
                    onChange={(e) => setNewLeadCity(e.target.value)}
                    className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500"
                  >
                    <option value="عمان">عمان</option>
                    <option value="الزرقاء">الزرقاء</option>
                    <option value="إربد">إربد</option>
                    <option value="طبربور">طبربور</option>
                    <option value="العقبة">العقبة</option>
                    <option value="مادبا">مادبا</option>
                    <option value="السلط">السلط</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-stone-700 block mb-1">توجيه المندوب:</label>
                  <select
                    value={newLeadRep}
                    onChange={(e) => setNewLeadRep(e.target.value)}
                    className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500 font-semibold text-amber-900"
                  >
                    <option value="auto">توزيع آلي (مداورة)</option>
                    <option value="حمزة">حمزة</option>
                    <option value="رحمه">رحمه</option>
                    <option value="صابرين">صابرين</option>
                    <option value="حنان">حنان</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">العنوان التفصيلي:</label>
                <input
                  type="text"
                  value={newLeadAddress}
                  onChange={(e) => setNewLeadAddress(e.target.value)}
                  placeholder="المنطقة، الشارع، أو اسم الصالون"
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">ملاحظات الطلب أو الاستفسار:</label>
                <textarea
                  rows={2}
                  value={newLeadNotes}
                  onChange={(e) => setNewLeadNotes(e.target.value)}
                  placeholder="سجل المنتجات التي سأل عنها العميل..."
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-stone-950 rounded-xl font-bold text-xs shadow-xs transition"
              >
                حفظ وإسناد للمندوب فوراً
              </button>
              <button
                type="button"
                onClick={() => setNewLeadModal(false)}
                className="px-4 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-medium"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
