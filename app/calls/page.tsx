"use client";
import { Modal } from "@/components/common/modal";

import { useState, useEffect, useCallback } from "react";
import {
  PhoneCall,
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  MessageSquare,
  ExternalLink,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { generateGoogleCalendarUrl } from "@/lib/calendar";
import { useLoading } from "@/lib/loading-context";
import { getCurrentUser } from "@/lib/client-api";
import { loadBusiness, saveBusiness } from "@/lib/business-client";
import type { BusinessCustomer } from "@/lib/business";

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
      const data = await loadBusiness<{ customers: BusinessCustomer[] }>("/api/customers");
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
  const [generatedCalUrl, setGeneratedCalUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Google Calendar API status
  const [calApiStatus, setCalApiStatus] = useState<string>("جاري التحقق...");

  useEffect(() => {
    fetch("/api/calendar")
      .then(res => res.json())
      .then(data => {
        setCalApiStatus(data.status === "active" ? "مفتاح تقويم Google نشط ومفعل" : "جاهز للربط عبر الروابط المباشرة");
      })
      .catch(() => {
        setCalApiStatus("التقويم جاهز (الروابط المباشرة نشطة)");
      });
  }, []);

  const todayStr = new Date().toISOString().slice(0, 10);

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
    setGeneratedCalUrl(null);
    setLogModalOpen(true);
  };

  const handleLogCall = async () => {
    if (!selectedItem) return;
    setSubmitting(true);
    startLoading({
      ar: "جاري توثيق المكالمة ومزامنة تقويم Google...",
      en: "Logging call notes & syncing Google Calendar...",
    });

    try {
      const data = await saveBusiness<{ customer: BusinessCustomer }>(
        "call-log", "/api/calls",
        { customer_id: selectedItem.customer.id, outcome: callOutcome, notes: callNotes, next_call_date: nextDate || undefined }
      );

      setCustomers((prev) => prev.map((c) => (c.id === data.customer.id ? data.customer : c)));

      let calUrl = null;
      if (nextDate) {
        calUrl = generateGoogleCalendarUrl({
          customerName: selectedItem.customer.name,
          customerPhone: selectedItem.customer.phone,
          startDate: nextDate,
          startTime: nextTime,
          notes: `${callOutcome} - ${callNotes}`,
          address: selectedItem.customer.address,
          repName: selectedItem.customer.rep_name_raw,
        });
        setGeneratedCalUrl(calUrl);
      } else {
        setLogModalOpen(false);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "فشل حفظ المكالمة.");
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
            <span>{isSalesRep ? "جدول اتصالات المتابعة اليومية" : "إدارة اتصالات المتابعة وجدولة تقويم Google"}</span>
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
            <span>{calApiStatus}</span>
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
              const calUrl = generateGoogleCalendarUrl({
                customerName: item.customer.name,
                customerPhone: item.customer.phone,
                startDate: item.due_date,
                notes: item.purpose,
                address: item.customer.address,
                repName: item.customer.rep_name_raw,
              });

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
                    <div className="text-left sm:text-start">
                      <div className="inline-flex items-center gap-1 text-xs font-bold text-stone-700 bg-stone-50 px-2.5 py-1 rounded-lg border border-stone-200">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>{formatDate(item.due_date)}</span>
                      </div>
                    </div>

                    <a
                      href={calUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition flex items-center gap-1.5 text-xs font-semibold"
                      title="إضافة موعد لتقويم Google لهاتف المندوب"
                    >
                      <CalendarIcon className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">تقويم Google</span>
                    </a>

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
        <Modal label="تسجيل نتيجة التواصل والمتابعة" onClose={() => setLogModalOpen(false)} busy={submitting}>
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-lg text-stone-900">تسجيل نتيجة التواصل والمتابعة</h3>
                <p className="text-xs text-stone-500">{selectedItem.customer.name} ({selectedItem.customer.phone})</p>
              </div>
              <button
                onClick={() => setLogModalOpen(false)}
                aria-label="إغلاق" className="p-1.5 rounded-lg bg-stone-100 text-stone-500 hover:bg-stone-200"
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
                      : "bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100") + " p-2 rounded-xl text-start font-medium border transition"}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="call-notes" className="text-xs font-bold text-stone-700 block">ملاحظات المكالمة:</label>
              <textarea id="call-notes"
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
                <span>تحديد موعد الاتصال القادم (تذكير Google Calendar):</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-amber-800 font-medium block mb-0.5">التاريخ:</span>
                  <input
                    aria-label="تاريخ الاتصال القادم" type="date"
                    value={nextDate}
                    onChange={(e) => setNextDate(e.target.value)}
                    className="w-full p-2 text-xs bg-white border border-amber-300 rounded-xl focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-amber-800 font-medium block mb-0.5">الوقت (لتقويم Google فقط):</span>
                  <input
                    aria-label="وقت الاتصال القادم" type="time"
                    value={nextTime}
                    onChange={(e) => setNextTime(e.target.value)}
                    className="w-full p-2 text-xs bg-white border border-amber-300 rounded-xl focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>
            </div>

            {generatedCalUrl && (
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 space-y-2">
                <p className="text-xs text-blue-900 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-blue-600" />
                  <span>تم حفظ المكالمة! اضغط أدناه لفتح الموعد في Google Calendar:</span>
                </p>
                <a
                  href={generatedCalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition"
                >
                  <span>فتح في تطبيق Google Calendar 📅</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}

            <div className="dialog-actions flex gap-2 pt-2">
              <button
                type="button"
                onClick={generatedCalUrl ? () => setLogModalOpen(false) : handleLogCall}
                disabled={submitting}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-stone-950 rounded-xl font-bold text-xs shadow-xs transition"
              >
                {submitting ? "جاري الحفظ..." : generatedCalUrl ? "إغلاق وإنهاء" : "حفظ المكالمة"}
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
        </Modal>
      )}
    </div>
  );
}
