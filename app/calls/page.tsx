"use client";

import { useState } from "react";
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
  AlertCircle
} from "lucide-react";
import { formatDate } from "@/lib/utils";

const SCHEDULED_CALLS = [
  {
    id: "1",
    customer_name: "سدين غنايم",
    phone: "0793937385",
    city: "طبربور",
    rep_name: "رحمه",
    due_date: "2026-09-08",
    due_time: "11:30 ص",
    purpose: "تأكيد موعد استلام شامبو وتريتمنت البلازما",
    status: "pending",
  },
  {
    id: "2",
    customer_name: "صالون لمسة حرير",
    phone: "0788812345",
    city: "إربد",
    rep_name: "حنان",
    due_date: "2026-09-08",
    due_time: "02:00 م",
    purpose: "متابعة عرض سعر بروتين ماراكوجا لتر",
    status: "pending",
  },
  {
    id: "3",
    customer_name: "صيدلية المقاصد",
    phone: "0770005000",
    city: "عمان",
    rep_name: "حمزة",
    due_date: "2026-09-09",
    due_time: "10:00 ص",
    purpose: "تحديث قائمة أسعار بكجات مورفوزيس ريبير",
    status: "upcoming",
  },
  {
    id: "4",
    customer_name: "ربى صبيح",
    phone: "0799193505",
    city: "الزرقاء",
    rep_name: "صابرين",
    due_date: "2026-10-10",
    due_time: "12:00 م",
    purpose: "تجديد حجز شهر بكجات مورفوزيس 250",
    status: "upcoming",
  },
];

export default function CallsPage() {
  const [calls, setCalls] = useState(SCHEDULED_CALLS);
  const [selectedCall, setSelectedCall] = useState<typeof SCHEDULED_CALLS[0] | null>(null);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [callOutcome, setCallOutcome] = useState("answered");
  const [callNotes, setCallNotes] = useState("");
  const [nextDate, setNextDate] = useState("");

  const handleCompleteCall = () => {
    if (!selectedCall) return;
    setCalls(calls.filter(c => c.id !== selectedCall.id));
    setLogModalOpen(false);
    alert(`تم تسجيل المكالمة بنجاح وتحديث موعد المتابعة في Google Calendar.`);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5">
            <PhoneCall className="w-6 h-6 text-amber-500" />
            <span>جدول متابعة المكالمات وتاريخ التواصل القادم</span>
          </h2>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            مزامنة آلية مع Google Calendar لتذكير المندوبين قبل الموعد بـ 30 دقيقة
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4" />
            <span>Google Calendar متصل</span>
          </div>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-stone-500">مكالمات اليوم المستحقة</p>
            <p className="text-2xl font-extrabold text-amber-600 mt-1">2</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-stone-500">المكالمات القادمة هذا الأسبوع</p>
            <p className="text-2xl font-extrabold text-stone-900 mt-1">18</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <CalendarDays className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-stone-500">تم إنجازها اليوم</p>
            <p className="text-2xl font-extrabold text-emerald-600 mt-1">24</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Calls Queue Table */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-stone-100 flex items-center justify-between">
          <h3 className="font-bold text-sm text-stone-900">قائمة الاتصالات والمتابعات النشطة</h3>
          <span className="text-xs text-stone-500 font-medium">مرتبة حسب موعد الاستحقاق</span>
        </div>

        <div className="divide-y divide-stone-100">
          {calls.map((item) => (
            <div 
              key={item.id}
              className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-stone-50/70 transition"
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
                </div>
                <p className="text-xs text-stone-600 leading-relaxed">
                  📌 {item.purpose}
                </p>
              </div>

              <div className="flex items-center justify-between md:justify-end gap-3 shrink-0">
                <div className="text-right">
                  <div className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200/50">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatDate(item.due_date)} • {item.due_time}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`tel:${item.phone}`}
                    className="p-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition"
                    title="اتصال الآن"
                  >
                    <PhoneCall className="w-4 h-4" />
                  </a>
                  <a
                    href={`https://wa.me/${item.phone.replace(/^0/, '962')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition"
                    title="محادثة واتساب"
                  >
                    <MessageSquare className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() => {
                      setSelectedCall(item);
                      setLogModalOpen(true);
                    }}
                    className="px-3.5 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-semibold shadow-xs transition"
                  >
                    تسجيل النتيجة
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Log Call Modal */}
      {logModalOpen && selectedCall && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-lg text-stone-900">تسجيل نتيجة التواصل</h3>
                <p className="text-xs text-stone-500">{selectedCall.customer_name} ({selectedCall.phone})</p>
              </div>
              <button 
                onClick={() => setLogModalOpen(false)}
                className="p-1 rounded-lg bg-stone-100 text-stone-500"
              >
                ✕
              </button>
            </div>

            {/* Quick Result Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-700 block">نتيجة المكالمة:</label>
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
                        ? "bg-amber-50 border-amber-500 text-amber-900 font-bold"
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
              <label className="text-xs font-bold text-stone-700 block">الملاحظات والتفاصيل:</label>
              <textarea
                rows={2}
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
                placeholder="أدخل ما دار في المكالمة أو استفسارات العميل..."
                className="w-full p-3 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Next Call Date (Google Calendar Sync) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                <CalendarIcon className="w-3.5 h-3.5 text-amber-600" />
                <span>تاريخ التواصل القادم (المزامنة مع Google Calendar):</span>
              </label>
              <input
                type="date"
                value={nextDate}
                onChange={(e) => setNextDate(e.target.value)}
                className="w-full p-2.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>

            {/* Submit Buttons */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleCompleteCall}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-stone-950 rounded-xl font-bold text-xs shadow-xs transition"
              >
                حفظ وإغلاق المكالمة
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
