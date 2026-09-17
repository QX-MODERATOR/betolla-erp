"use client";

import { useState, useEffect, useCallback } from "react";
import {
  PhoneCall,
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  MessageSquare,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useLoading } from "@/lib/loading-context";
import { getCurrentUser } from "@/lib/client-api";
import { loadBusiness, saveBusiness } from "@/lib/business-client";
import type { BusinessCustomer } from "@/lib/business";
import { ammanToday } from "@/lib/dates";
import { useToast } from "@/components/common/toast";

const callTime = (iso?: string | null) =>
  iso ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Amman", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)) : "";

type CallStatus = "today" | "upcoming" | "overdue";

interface CallQueueItem {
  customer: BusinessCustomer;
  due_date: string;
  status: CallStatus;
  purpose: string;
}

function computeStatus(dueDate: string, todayStr: string): CallStatus {
  if (dueDate < todayStr) return "overdue";
  if (dueDate === todayStr) return "today";
  return "upcoming";
}

export default function CallsPage() {
  const { showToast } = useToast();
  const { startLoading, stopLoading } = useLoading();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [customers, setCustomers] = useState<BusinessCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "today" | "upcoming" | "overdue">("today");
  const [selectedItem, setSelectedItem] = useState<CallQueueItem | null>(null);
  const [logModalOpen, setLogModalOpen] = useState(false);

  const reload = useCallback(async () => {
    try {
      const data = await loadBusiness<{ customers: BusinessCustomer[] }>("/api/customers?view=calls");
      setCustomers(data.customers);
      setLoadError("");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "تعذر تحميل جدول الاتصالات.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);

  useEffect(() => {
    setCurrentUser(getCurrentUser());
  }, []);

  const isSalesRep = currentUser?.role === "sales_rep";
  const repName = currentUser?.name?.replace(/\s*\(مبيعات\)/, "")?.trim() || currentUser?.username || "";

  // Call form state
  const [callOutcome, setCallOutcome] = useState("answered");
  const [callNotes, setCallNotes] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [nextTime, setNextTime] = useState("11:00");
  const [submitting, setSubmitting] = useState(false);


  const todayStr = ammanToday();

  const allCalls: CallQueueItem[] = customers
    .filter((c) => !!c.next_call_date)
    .map((c) => ({
      customer: c,
      due_date: c.next_call_date as string,
      status: computeStatus(c.next_call_date as string, todayStr),
      purpose: c.history && c.history.length > 0 ? c.history[0].notes || "متابعة مجدولة" : (c.notes || "متابعة مجدولة"),
    }))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  const userCalls = isSalesRep
    ? allCalls.filter((c) => c.customer.rep_name_raw === repName || c.customer.rep_name_raw === currentUser?.username)
    : allCalls;

  const filteredCalls = userCalls.filter(c => {
    if (activeTab === "all") return true;
    return c.status === activeTab;
  });

  const openLogModal = (item: CallQueueItem) => {
    setSelectedItem(item);
    setCallOutcome("answered");
    setCallNotes("");
    setNextDate("");
    setNextTime("11:00");
    setLogModalOpen(true);
  };

  const handleLogCall = async () => {
    if (!selectedItem) return;
    setSubmitting(true);
    startLoading({
      ar: "جاري توثيق المكالمة وجدولة التذكير...",
      en: "Logging the call and scheduling the reminder...",
    });

    try {
      const data = await saveBusiness<{ customer: BusinessCustomer }>(
        `call-log:${selectedItem.customer.id}`, "/api/calls",
        { customer_id: selectedItem.customer.id, outcome: callOutcome, notes: callNotes,
          next_call_date: nextDate || undefined, next_call_time: nextDate && nextTime ? nextTime : undefined }
      );

      setCustomers((prev) => prev.map((c) => (c.id === data.customer.id ? data.customer : c)));

      setLogModalOpen(false);
      showToast(nextDate
        ? `تم حفظ المكالمة وجدولة الاتصال القادم ${nextDate}${nextTime ? " الساعة " + nextTime : ""}. سيصلك تذكير على التطبيق والهاتف قبل الموعد بـ 10 دقائق.`
        : "تم حفظ المكالمة.", "success", 6000);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل حفظ المكالمة.", "error", 6000);
    } finally {
      setSubmitting(false);
      stopLoading();
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5">
            <PhoneCall className="w-6 h-6 text-amber-500" />
            <span>{isSalesRep ? "جدول اتصالات المتابعة اليومية" : "إدارة اتصالات المتابعة والتذكيرات"}</span>
          </h2>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            {isSalesRep
              ? `جدول المواعيد والاتصالات المخصصة لحسابك (${userCalls.length} اتصال مجدول)`
              : "مواعيد المتابعة القادمة مبنية مباشرة على next_call_date لكل عميل في قاعدة البيانات"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold">
            <CalendarIcon className="w-4 h-4 text-amber-600" />
            <span>التذكير تلقائي قبل كل اتصال بـ 10 دقائق</span>
          </div>
        </div>
      </div>

      {loadError && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center justify-between gap-3">
          <span>{loadError}</span>
          <button onClick={() => { setLoading(true); void reload(); }} className="px-3 py-1 rounded-lg bg-red-600 text-white font-bold">إعادة المحاولة</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-stone-200 pb-2 overflow-x-auto">
        {[
          { id: "today", label: "مكالمات اليوم", count: userCalls.filter(c => c.status === 'today').length },
          { id: "upcoming", label: "المكالمات القادمة", count: userCalls.filter(c => c.status === 'upcoming').length },
          { id: "overdue", label: "مكالمات فائتة (بحاجة لمتابعة)", count: userCalls.filter(c => c.status === 'overdue').length },
          { id: "all", label: "كافة المكالمات", count: userCalls.length },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={(activeTab === tab.id ? "bg-stone-900 text-white shadow-xs" : "bg-white text-stone-600 hover:bg-stone-50 border border-stone-200") + " flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer"}
          >
            <span>{tab.label}</span>
            <span className={(activeTab === tab.id ? "bg-amber-500 text-stone-950 font-black" : "bg-stone-100 text-stone-600") + " px-1.5 py-0.5 rounded-full text-[10px]"}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Calls Queue List */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-stone-100 flex items-center justify-between">
          <h3 className="font-bold text-sm text-stone-900">
            {activeTab === 'today' ? 'قائمة مكالمات اليوم' : activeTab === 'overdue' ? 'مكالمات متأخرة' : 'جدول الاتصالات'}
          </h3>
          <span className="text-xs text-stone-400">إجمالي {filteredCalls.length} اتصال</span>
        </div>

        <div className="divide-y divide-stone-100">
          {loading ? (
            <div className="p-10 text-center text-sm text-stone-400">جاري تحميل جدول الاتصالات...</div>
          ) : filteredCalls.length === 0 ? (
            <div className="p-14 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center mx-auto">
                <PhoneCall className="w-6 h-6" />
              </div>
              <p className="font-bold text-sm text-stone-900">
                {isSalesRep ? "لا توجد اتصالات مجدولة لحسابك في هذا القسم" : "لا توجد اتصالات في هذا التبويب"}
              </p>
              <p className="text-xs text-stone-500 max-w-sm mx-auto leading-relaxed">
                سيظهر جدول الاتصالات فور تحديد "موعد المتابعة القادم" لأحد العملاء من صفحة إدارة العملاء (CRM).
              </p>
            </div>
          ) : (
            filteredCalls.map((item) => {

              return (
                <div
                  key={item.customer.id}
                  className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-amber-50/30 transition"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-stone-900">{item.customer.name}</span>
                      <span className="font-mono text-xs text-stone-500" dir="ltr">{item.customer.phone}</span>
                      <span className="text-xs px-2 py-0.5 rounded-md bg-stone-100 text-stone-600">
                        {item.customer.city}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold border border-amber-200/60">
                        المندوب: {item.customer.rep_name_raw}
                      </span>
                      {item.status === 'overdue' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 font-bold border border-rose-200">
                          متأخر
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-stone-600 leading-relaxed">
                      📌 {item.purpose}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between md:justify-end gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-stone-100">
                    <div className="text-left sm:text-right">
                      <div className="inline-flex items-center gap-1 text-xs font-bold text-stone-700 bg-stone-50 px-2.5 py-1 rounded-lg border border-stone-200">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>{formatDate(item.due_date)}{item.customer.next_call_at ? ` · ${callTime(item.customer.next_call_at)}` : ""}</span>
                      </div>
                    </div>


                    <a
                      href={`tel:${item.customer.phone}`}
                      className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition"
                      title="اتصال الآن"
                    >
                      <PhoneCall className="w-4 h-4" />
                    </a>

                    <a
                      href={`https://wa.me/${item.customer.phone.replace(/^0/, '962')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition text-xs font-semibold"
                      title="محادثة واتساب"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </a>

                    <button
                      onClick={() => openLogModal(item)}
                      className="px-3.5 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-semibold shadow-xs transition"
                    >
                      تسجيل النتيجة
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Log Call Modal */}
      {logModalOpen && selectedItem && (
        <div data-dialog="" className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-lg text-stone-900">تسجيل نتيجة التواصل والمتابعة</h3>
                <p className="text-xs text-stone-500">{selectedItem.customer.name} ({selectedItem.customer.phone})</p>
              </div>
              <button
                onClick={() => setLogModalOpen(false)}
                className="p-1.5 rounded-lg bg-stone-100 text-stone-500 hover:bg-stone-200"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-700 block">نتيجة المكالمة الحالية:</label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { id: "answered", label: "تم الرد بنجاح" },
                  { id: "no_answer", label: "لا يوجد رد" },
                  { id: "whatsapp_sent", label: "تم إرسال واتساب" },
                  { id: "order_placed", label: "تم تثبيت طلبية" },
                  { id: "callback_requested", label: "طلب موعد آخر" },
                  { id: "not_interested", label: "غير مهتم حالياً" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setCallOutcome(item.id)}
                    className={(callOutcome === item.id
                      ? "bg-amber-50 border-amber-500 text-amber-900 font-bold shadow-2xs"
                      : "bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100") + " p-2 rounded-xl text-right font-medium border transition"}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-700 block">ملاحظات المكالمة:</label>
              <textarea
                rows={2}
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
                placeholder="سجل ما تم الاتفاق عليه مع العميل..."
                className="w-full p-2.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="p-3 bg-amber-50/60 rounded-2xl border border-amber-200/80 space-y-2">
              <label className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                <CalendarIcon className="w-4 h-4 text-amber-600" />
                <span>موعد الاتصال القادم (يصلك تذكير تلقائي):</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-amber-800 font-medium block mb-0.5">التاريخ:</span>
                  <input
                    type="date"
                    value={nextDate}
                    onChange={(e) => setNextDate(e.target.value)}
                    className="w-full p-2 text-xs bg-white border border-amber-300 rounded-xl focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-amber-800 font-medium block mb-0.5">الوقت:</span>
                  <input
                    type="time"
                    value={nextTime}
                    onChange={(e) => setNextTime(e.target.value)}
                    className="w-full p-2 text-xs bg-white border border-amber-300 rounded-xl focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>
            </div>


            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleLogCall}
                disabled={submitting}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-stone-950 rounded-xl font-bold text-xs shadow-xs transition"
              >
                {submitting ? "جاري الحفظ..." : "حفظ المكالمة"}
              </button>
              <button
                type="button"
                onClick={() => setLogModalOpen(false)}
                className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-medium"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
