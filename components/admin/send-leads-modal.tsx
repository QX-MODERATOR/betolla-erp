"use client";

import React, { useState } from "react";
import { Send, Phone, UserCheck, X, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { useNotifications } from "@/lib/notification-context";
import { useToast } from "@/components/common/toast";
import { useLoading } from "@/lib/loading-context";

interface SendLeadsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function SendLeadsModal({ isOpen, onClose, onSuccess }: SendLeadsModalProps) {
  const { sendNotification } = useNotifications();
  const { showToast } = useToast();
  const { startLoading, stopLoading } = useLoading();

  const [selectedRep, setSelectedRep] = useState("حنان");
  const [notificationTitle, setNotificationTitle] = useState("بيانات جديدة 🔔 New Data");
  const [rawPhoneNumbers, setRawPhoneNumbers] = useState("");
  const [leadSource, setLeadSource] = useState("admin_dispatch");
  const [city, setCity] = useState("عمان");
  const [customNotes, setCustomNotes] = useState("");

  if (!isOpen) return null;

  // Parse entered phone numbers (line by line or comma separated)
  const parsedPhones = rawPhoneNumbers
    .split(/[\n,;]+/)
    .map((p) => p.replace(/[^\d+]/g, "").trim())
    .filter((p) => p.length >= 7);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (parsedPhones.length === 0) {
      showToast("يرجى إدخال رقم هاتف واحد على الأقل", "warning");
      return;
    }

    startLoading({
      ar: `جاري إرسال ${parsedPhones.length} أرقام إلى الموظفة وإرسال تنبيه New Data...`,
      en: `Dispatching ${parsedPhones.length} phone numbers and sending notification...`,
    });

    try {
      // 1. Create leads for each phone number
      for (const phone of parsedPhones) {
        await fetch("/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `عميل محول (${selectedRep})`,
            phone,
            city,
            notes: customNotes || "أرقام جديدة محولة من قبل المسؤول",
            source: leadSource,
            rep_name: selectedRep,
          }),
        }).catch(() => {});
      }

      // 2. Dispatch real-time "New Data" notification to the sales employee
      const notifMessage =
        parsedPhones.length === 1
          ? `قام المسؤول بإرسال رقم هاتف جديد لحسابك (${parsedPhones[0]}). يرجى المتابعة والاتصال فوراً.`
          : `قام المسؤول بإرسال ${parsedPhones.length} أرقام هواتف جديدة لحسابك. تم تحديث سجل عملائك وجاهز للاتصال.`;

      await sendNotification({
        repName: selectedRep,
        repId: selectedRep === "حنان" ? "hanan" : undefined,
        title: notificationTitle || "بيانات جديدة 🔔 New Data",
        message: notifMessage,
        phones: parsedPhones,
        link: "/customers",
      });

      stopLoading();
      showToast(`تم إرسال ${parsedPhones.length} أرقام بنجاح إلى ${selectedRep} وإشعارها بتنبيه "New Data" 🔔!`, "success", 5000);
      
      setRawPhoneNumbers("");
      setCustomNotes("");
      onClose();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      stopLoading();
      showToast("حدث خطأ أثناء إرسال البيانات: " + err.message, "error");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-stone-200 space-y-4 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-stone-950 flex items-center justify-center font-bold shrink-0 shadow-xs">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-stone-900">إرسال أرقام هواتف للموظفين (New Data)</h3>
              <p className="text-xs text-stone-500">إسناد أرقام هواتف للمندوبة مع تنبيه صوتي وشعار "New Data" فوري</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-500 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Employee Target */}
          <div>
            <label className="font-bold text-stone-800 block mb-1">الموظفة / المندوب المستلم:</label>
            <select
              value={selectedRep}
              onChange={(e) => setSelectedRep(e.target.value)}
              className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl font-bold text-stone-800 focus:outline-none focus:border-amber-500"
            >
              <option value="حنان">حنان (مبيعات) - @hanan</option>
              <option value="صابرين">صابرين (مبيعات) - @sabreen</option>
              <option value="حمزة">حمزة (مبيعات) - @hamza</option>
            </select>
          </div>

          {/* Notification Title Input */}
          <div>
            <label className="font-bold text-stone-800 block mb-1">عنوان الإشعار (Notification Title):</label>
            <input
              type="text"
              value={notificationTitle}
              onChange={(e) => setNotificationTitle(e.target.value)}
              placeholder="مثال: بيانات جديدة 🔔 New Data"
              className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl font-bold text-amber-900 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Phone Numbers Text Area */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-bold text-stone-800">
                أرقام الهواتف (رقم واحد أو عدة أرقام):
              </label>
              <span className="text-[11px] font-mono font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                {parsedPhones.length} رقم مكتشف
              </span>
            </div>
            <textarea
              rows={4}
              required
              value={rawPhoneNumbers}
              onChange={(e) => setRawPhoneNumbers(e.target.value)}
              placeholder={`الصق الأرقام هنا، رقم في كل سطر:\n0791234567\n0788765432\n+962771122334`}
              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl font-mono text-xs focus:outline-none focus:border-amber-500 leading-relaxed"
              dir="ltr"
            />
            <p className="text-[10px] text-stone-400 mt-0.5">
              يمكنك نسخ ولصق قائمة كاملة من أرقام الهواتف وسيقوم النظام بتوزيعها تلقائياً.
            </p>
          </div>

          {/* City and Source */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-bold text-stone-700 block mb-1">المدينة / المنطقة:</label>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500"
              >
                <option value="عمان">عمان</option>
                <option value="الزرقاء">الزرقاء</option>
                <option value="إربد">إربد</option>
                <option value="طبربور">طبربور</option>
                <option value="العقبة">العقبة</option>
                <option value="كافة المحافظات">كافة المحافظات</option>
              </select>
            </div>

            <div>
              <label className="font-bold text-stone-700 block mb-1">مصدر الليد:</label>
              <select
                value={leadSource}
                onChange={(e) => setLeadSource(e.target.value)}
                className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500"
              >
                <option value="admin_dispatch">إسناد مباشر من الإدارة</option>
                <option value="social_media">سوشال ميديا / واتساب</option>
                <option value="campaign">حملة ترويجية خاصة</option>
              </select>
            </div>
          </div>

          {/* Custom Notes */}
          <div>
            <label className="font-bold text-stone-700 block mb-1">ملاحظات أو توجيهات للموظفة:</label>
            <input
              type="text"
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
              placeholder="مثال: عملاء مهتمين بمنتجات العناية بالبشرة، يرجى الاتصال صباحاً"
              className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Notification Preview Box */}
          <div className="p-3 bg-[#160f02] rounded-xl border border-[#554625]/80 text-[#f4e5d0] space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#bda66d]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>معاينة إشعار الموظفة الفوري:</span>
            </div>
            <p className="text-[11px] font-semibold text-white">
              {notificationTitle || "بيانات جديدة 🔔 New Data"}
            </p>
            <p className="text-[10px] text-[#f4e5d0]/80">
              {parsedPhones.length > 0
                ? `سيتم إرسال ${parsedPhones.length} أرقام إلى ${selectedRep} مع نغمة صوتية وتنبيه منبثق.`
                : "أدخل أرقام الهواتف لمعاينة تفاصيل الإرسال."}
            </p>
          </div>

          {/* Submit Button */}
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={parsedPhones.length === 0}
              className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-stone-950 font-bold text-xs rounded-xl shadow-md transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              <Send className="w-4 h-4" />
              <span>إرسال الأرقام وتنبيه الموظفة الآن ({parsedPhones.length})</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl transition cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
