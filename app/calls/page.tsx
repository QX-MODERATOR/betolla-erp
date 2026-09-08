"use client";

import { useState, useEffect } from "react";
import { 
  PhoneCall, 
  Calendar as CalendarIcon, 
  Clock, 
  CheckCircle2, 
  CalendarDays,
  PlusCircle, 
  Check, 
  X, 
  MessageSquare,
  Sparkles,
  ExternalLink,
  MapPin,
  RefreshCw
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { generateGoogleCalendarUrl } from "@/lib/calendar";

const INITIAL_CALLS = [
  {
    id: "1",
    customer_name: "سدين غنايم",
    phone: "0793937385",
    city: "طبربور",
    address: "طبربور / شارع الامير حسين عماره 101",
    rep_name: "رحمه",
    due_date: "2026-09-08",
    due_time: "11:30",
    purpose: "تأكيد موعد استلام شامبو وتريتمنت البلازما",
    status: "today",
  },
  {
    id: "2",
    customer_name: "صالون لمسة حرير",
    phone: "0788812345",
    city: "إربد",
    address: "إربد - شارع الجامعة",
    rep_name: "حنان",
    due_date: "2026-09-08",
    due_time: "14:00",
    purpose: "متابعة عرض سعر بروتين ماراكوجا لتر",
    status: "today",
  },
  {
    id: "3",
    customer_name: "صيدلية المقاصد",
    phone: "0770005000",
    city: "عمان",
    address: "عمان - الدوار السابع",
    rep_name: "حمزة",
    due_date: "2026-09-09",
    due_time: "10:00",
    purpose: "تحديث قائمة أسعار بكجات مورفوزيس ريبير",
    status: "upcoming",
  },
  {
    id: "4",
    customer_name: "ربى صبيح",
    phone: "0799193505",
    city: "الزرقاء",
    address: "الزرقا - الجبل الشمالي",
    rep_name: "صابرين",
    due_date: "2026-10-10",
    due_time: "12:00",
    purpose: "تجديد حجز شهر بكجات مورفوزيس 250",
    status: "upcoming",
  },
  {
    id: "5",
    customer_name: "بيان عادل",
    phone: "0770000088",
    city: "الطفيلة",
    address: "الطفيلة",
    rep_name: "رحمه",
    due_date: "2026-09-06",
    due_time: "15:30",
    purpose: "معاودة الاتصال: لم يتم الرد في الموعد السابق",
    status: "overdue",
  },
];

export default function CallsPage() {
  const [calls, setCalls] = useState(INITIAL_CALLS);
  const [activeTab, setActiveTab] = useState<"all" | "today" | "upcoming" | "overdue">("today");
  const [selectedCall, setSelectedCall] = useState<typeof INITIAL_CALLS[0] | null>(null);
  const [logModalOpen, setLogModalOpen] = useState(false);
  
  // Call form state
  const [callOutcome, setCallOutcome] = useState("answered");
  const [callNotes, setCallNotes] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [nextTime, setNextTime] = useState("11:00");
  const [generatedCalUrl, setGeneratedCalUrl] = useState<string | null>(null);
  
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

  const filteredCalls = calls.filter(c => {
    if (activeTab === "all") return true;
    return c.status === activeTab;
  });

  const handleLogCall = () => {
    if (!selectedCall) return;

    let calUrl = null;
    if (nextDate) {
      calUrl = generateGoogleCalendarUrl({
        customerName: selectedCall.customer_name,
        customerPhone: selectedCall.phone,
        startDate: nextDate,
        startTime: nextTime,
        notes: `${callOutcome} - ${callNotes}`,
        address: selectedCall.address,
        repName: selectedCall.rep_name,
      });
      setGeneratedCalUrl(calUrl);
    }

    // Save call log locally
    setCalls(prev => prev.map(c => {
      if (c.id === selectedCall.id) {
        return {
          ...c,
          due_date: nextDate || c.due_date,
          due_time: nextTime || c.due_time,
          status: "upcoming",
          purpose: `متابعة جديدة: ${callNotes || 'تم الاتصال مسبقاً'}`
        };
      }
      return c;
    }));

    if (!calUrl) {
      setLogModalOpen(false);
      alert("تم تسجيل المكالمة بنجاح في سجل العميل.");
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

        {/* Google Calendar Status Badge */}
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold">
            <CalendarIcon className="w-4 h-4 text-amber-600" />
            <span>{calApiStatus}</span>
          </div>
        </div>
      </div>

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
            onClick={() => setActiveTab(tab.id as any)}
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

                  {/* Google Calendar Direct Add Button */}
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

                  {/* Direct Phone Call */}
                  <a
                    href={`tel:${item.phone}`}
                    className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition"
                    title="اتصال الآن"
                  >
                    <PhoneCall className="w-4 h-4" />
                  </a>

                  {/* Direct WhatsApp */}
                  <a
                    href={`https://wa.me/${item.phone.replace(/^0/, '962')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition text-xs font-semibold"
                    title="محادثة واتساب"
                  >
                    <MessageSquare className="w-4 h-4" />
                  </a>

                  {/* Log Call Button */}
                  <button
                    onClick={() => {
                      setSelectedCall(item);
                      setGeneratedCalUrl(null);
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
                className="p-1.5 rounded-lg bg-stone-100 text-stone-500 hover:bg-stone-200"
              >
                ✕
              </button>
            </div>

            {/* Quick Result Selector */}
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

            {/* Notes */}
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

            {/* Next Call Date (Google Calendar Sync) */}
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

            {/* Calendar Success Alert & One-Click Link */}
            {generatedCalUrl && (
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 space-y-2">
                <p className="text-xs text-blue-900 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-blue-600" />
                  <span>تم تجهيز الموعد! اضغط أدناه لفتحه في Google Calendar:</span>
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

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleLogCall}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-stone-950 rounded-xl font-bold text-xs shadow-xs transition"
              >
                {generatedCalUrl ? "إغلاق وإنهاء" : "حفظ الموعد وتوليد تذكير التقويم"}
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
