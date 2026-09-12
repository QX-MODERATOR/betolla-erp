"use client";

import { useState, useEffect } from "react";
import {
  PhoneCall,
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  MessageSquare,
  ExternalLink,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { generateGoogleCalendarUrl } from "@/lib/calendar";
import { useLoading } from "@/lib/loading-context";

interface CallQueueItem {
  id: string; // customer id
  customer_name: string;
  phone: string;
  city: string;
  address: string;
  rep_name: string;
  due_date: string;
  due_time: string;
  purpose: string;
  status: "today" | "upcoming" | "overdue";
}

export default function CallsPage() {
  const { startLoading, stopLoading } = useLoading();
  const [calls, setCalls] = useState<CallQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "today" | "upcoming" | "overdue">("today");
  const [selectedCall, setSelectedCall] = useState<CallQueueItem | null>(null);
  const [logModalOpen, setLogModalOpen] = useState(false);

  const [callOutcome, setCallOutcome] = useState("answered");
  const [callNotes, setCallNotes] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [nextTime, setNextTime] = useState("11:00");
  const [generatedCalUrl, setGeneratedCalUrl] = useState<string | null>(null);
  const [isSubmittingCall, setIsSubmittingCall] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);

  const [calApiStatus, setCalApiStatus] = useState<string>("جاري التحقق...");

  async function loadCalls() {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/calls", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "تعذر تحميل قائمة المكالمات.");
      setCalls(data.calls || []);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : "تعذر تحميل قائمة المكالمات.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/calls", { cache: "no-store" })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok || !data.success) {
          setLoadError(data.error || "تعذر تحميل قائمة المكالمات.");
          return;
        }
        setCalls(data.calls || []);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "تعذر تحميل قائمة المكالمات.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const filteredCalls = calls.filter(c => {
    if (activeTab === "all") return true;
    return c.status === activeTab;
  });

  const handleLogCall = async () => {
    if (!selectedCall) return;

    // Once a calendar link has already been generated for this submission,
    // the button just closes the modal — it must never re-submit the same
    // call log a second time.
    if (generatedCalUrl) {
      setLogModalOpen(false);
      return;
    }

    if (isSubmittingCall) return;
    setIsSubmittingCall(true);
    setCallError(null);
    startLoading({
      ar: "جاري توثيق المكالمة ومزامنة تقويم Google...",
      en: "Logging call notes & syncing Google Calendar...",
    });

    try {
      const res = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: selectedCall.id,
          customerName: selectedCall.customer_name,
          phone: selectedCall.phone,
          address: selectedCall.address,
          repName: selectedCall.rep_name,
          outcome: callOutcome,
          notes: callNotes,
          nextCallDate: nextDate || undefined,
          nextCallTime: nextDate ? nextTime : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "فشل حفظ سجل المكالمة.");
      }

      // Refetch — logging a call can move this customer in/out of the due
      // queue entirely (e.g. next_call_date pushed a month out), so a
      // locally-patched row would drift from what the server now has.
      await loadCalls();

      if (data.log?.googleCalendarUrl) {
        setGeneratedCalUrl(data.log.googleCalendarUrl);
      } else {
        setLogModalOpen(false);
      }
    } catch (err: unknown) {
      setCallError(err instanceof Error ? err.message : "فشل حفظ سجل المكالمة.");
    } finally {
      setIsSubmittingCall(false);
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
            <span>إدارة اتصالات المتابعة وجدولة تقويم Google</span>
          </h2>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            تسجيل نتائج الاتصالات ومزامنة مواعيد التواصل القادمة مباشرة في Google Calendar لهواتف المندوبين
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
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">{loadError}</div>
          <button onClick={loadCalls} className="font-bold underline shrink-0">إعادة المحاولة</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-stone-200 pb-2 overflow-x-auto">
        {[
          { id: "today", label: "مكالمات اليوم", count: calls.filter(c => c.status === 'today').length },
          { id: "upcoming", label: "المكالمات القادمة", count: calls.filter(c => c.status === 'upcoming').length },
          { id: "overdue", label: "مكالمات فائتة (بحاجة لمتابعة)", count: calls.filter(c => c.status === 'overdue').length },
          { id: "all", label: "كافة المكالمات", count: calls.length },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as "all" | "today" | "upcoming" | "overdue")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-stone-900 text-white shadow-xs"
                : "bg-white text-stone-600 hover:bg-stone-50 border border-stone-200"
            }`}
          >
            <span>{tab.label}</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
              activeTab === tab.id ? "bg-amber-500 text-stone-950 font-black" : "bg-stone-100 text-stone-600"
            }`}>
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

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-stone-400 text-xs">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>جاري تحميل قائمة المكالمات من قاعدة البيانات...</span>
          </div>
        ) : filteredCalls.length === 0 ? (
          <div className="py-16 text-center text-stone-400 text-xs">لا توجد مكالمات في هذا التصنيف.</div>
        ) : (
        <div className="divide-y divide-stone-100">
          {filteredCalls.map((item) => {
            const calUrl = generateGoogleCalendarUrl({
              customerName: item.customer_name,
              customerPhone: item.phone,
              startDate: item.due_date,
              startTime: item.due_time,
              notes: item.purpose,
              address: item.address,
              repName: item.rep_name,
            });

            return (
              <div
                key={item.id}
                className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-amber-50/30 transition"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sm text-stone-900">{item.customer_name}</span>
                    <span className="font-mono text-xs text-stone-500" dir="ltr">{item.phone}</span>
                    <span className="text-xs px-2 py-0.5 rounded-md bg-stone-100 text-stone-600">
                      {item.city}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold border border-amber-200/60">
                      المندوب: {item.rep_name}
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

                <div className="flex items-center justify-between md:justify-end gap-2.5 shrink-0">
                  <div className="text-left sm:text-right">
                    <div className="inline-flex items-center gap-1 text-xs font-bold text-stone-700 bg-stone-50 px-2.5 py-1 rounded-lg border border-stone-200">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      <span>{formatDate(item.due_date)} • {item.due_time}</span>
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
                    href={`tel:${item.phone}`}
                    className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition"
                    title="اتصال الآن"
                  >
                    <PhoneCall className="w-4 h-4" />
                  </a>

                  <a
                    href={`https://wa.me/${item.phone.replace(/^0/, '962')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition text-xs font-semibold"
                    title="محادثة واتساب"
                  >
                    <MessageSquare className="w-4 h-4" />
                  </a>

                  <button
                    onClick={() => {
                      setSelectedCall(item);
                      setGeneratedCalUrl(null);
                      setCallError(null);
                      setCallNotes("");
                      setNextDate("");
                      setLogModalOpen(true);
                    }}
                    className="px-3.5 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-semibold shadow-xs transition"
                  >
                    تسجيل النتيجة
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>

      {/* Log Call Modal */}
      {logModalOpen && selectedCall && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-lg text-stone-900">تسجيل نتيجة التواصل والمتابعة</h3>
                <p className="text-xs text-stone-500">{selectedCall.customer_name} ({selectedCall.phone})</p>
              </div>
              <button
                onClick={() => setLogModalOpen(false)}
                disabled={isSubmittingCall}
                className="p-1.5 rounded-lg bg-stone-100 text-stone-500 hover:bg-stone-200 disabled:opacity-50"
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
                    className={`p-2 rounded-xl text-right font-medium border transition ${
                      callOutcome === item.id
                        ? "bg-amber-50 border-amber-500 text-amber-900 font-bold shadow-2xs"
                        : "bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100"
                    }`}
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
                <span>تحديد موعد الاتصال القادم (تذكير Google Calendar):</span>
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

            {generatedCalUrl && (
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 space-y-2">
                <p className="text-xs text-blue-900 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-blue-600" />
                  <span>تم حفظ سجل المكالمة! اضغط أدناه لإضافة الموعد إلى Google Calendar:</span>
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

            {callError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{callError}</span>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleLogCall}
                disabled={isSubmittingCall}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 rounded-xl font-bold text-xs shadow-xs transition flex items-center justify-center gap-2"
              >
                {isSubmittingCall && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>
                  {isSubmittingCall ? "جاري الحفظ..." : generatedCalUrl ? "إغلاق وإنهاء" : "حفظ الموعد وتوليد تذكير التقويم"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setLogModalOpen(false)}
                disabled={isSubmittingCall}
                className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 disabled:opacity-50 text-stone-700 rounded-xl text-xs font-medium"
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
