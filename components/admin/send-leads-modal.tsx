"use client";

import React, { useState, useMemo } from "react";
import { 
  Send, 
  Phone, 
  User, 
  UserCheck, 
  X, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Eye, 
  MapPin, 
  Tag, 
  Copy 
} from "lucide-react";
import { useNotifications } from "@/lib/notification-context";
import { useToast } from "@/components/common/toast";
import { useLoading } from "@/lib/loading-context";

export interface SentLeadItem {
  id: string;
  name: string;
  phone: string;
  city: string;
  address?: string;
  notes?: string;
  source?: string;
  repName?: string;
}

interface SendLeadsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (leads: SentLeadItem[]) => void;
}

export function SendLeadsModal({ isOpen, onClose, onSuccess }: SendLeadsModalProps) {
  const { sendNotification } = useNotifications();
  const { showToast } = useToast();
  const { startLoading, stopLoading } = useLoading();

  const [selectedRep, setSelectedRep] = useState("حنان");
  const [notificationTitle, setNotificationTitle] = useState("بيانات جديدة 🔔 New Data");
  const [rawCustomerNames, setRawCustomerNames] = useState("");
  const [rawPhoneNumbers, setRawPhoneNumbers] = useState("");
  const [leadSource, setLeadSource] = useState("admin_dispatch");
  const [city, setCity] = useState("عمان");
  const [customNotes, setCustomNotes] = useState("");

  // Split inputs line by line
  const nameLines = useMemo(() => {
    return rawCustomerNames
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  }, [rawCustomerNames]);

  const phoneLines = useMemo(() => {
    return rawPhoneNumbers
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  }, [rawPhoneNumbers]);

  // Compute paired leads dynamically with smart auto-detection
  const pairedLeads = useMemo(() => {
    const maxCount = Math.max(phoneLines.length, nameLines.length);
    const result: {
      id: string;
      index: number;
      name: string;
      phone: string;
      isValidPhone: boolean;
    }[] = [];

    for (let i = 0; i < maxCount; i++) {
      let p = phoneLines[i] || "";
      let n = nameLines[i] || "";

      // If user pasted "Name - Phone" or "Name, Phone" in either field
      if (p && !n) {
        const parts = p.split(/[-,\t;]+/);
        if (parts.length >= 2) {
          const part1 = parts[0].trim();
          const part2 = parts[1].trim();
          const isP1Digit = /^\+?\d{7,15}$/.test(part1.replace(/\s+/g, ""));
          if (isP1Digit) {
            p = part1;
            n = part2;
          } else {
            n = part1;
            p = part2;
          }
        }
      }

      const cleanPhone = p.replace(/[^\d+]/g, "").trim();
      const name = n.trim() || (cleanPhone ? `عميل محول (${i + 1})` : `عميل جديد (${i + 1})`);
      const isValidPhone = cleanPhone.length >= 7;

      if (cleanPhone || n) {
        result.push({
          id: `pair_${i + 1}`,
          index: i + 1,
          name,
          phone: cleanPhone,
          isValidPhone,
        });
      }
    }

    return result;
  }, [phoneLines, nameLines]);

  const validLeads = useMemo(() => {
    return pairedLeads.filter((item) => item.isValidPhone);
  }, [pairedLeads]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (validLeads.length === 0) {
      showToast("يرجى إدخال رقم هاتف واحد صالح على الأقل.", "warning");
      return;
    }

    startLoading({
      ar: `جاري إرسال ${validLeads.length} عميل بالأسماء والأرقام إلى (${selectedRep}) وإطلاق إشعار New Data...`,
      en: `Dispatching ${validLeads.length} leads to (${selectedRep}) and sending New Data notification...`,
    });

    try {
      const createdLeadsList: SentLeadItem[] = [];

      // 1. Create leads for each paired item
      for (const item of validLeads) {
        await fetch("/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: item.name,
            phone: item.phone,
            city,
            notes: customNotes || "أرقام جديدة محولة من قبل المسؤول",
            source: leadSource,
            rep_name: selectedRep,
          }),
        }).catch(() => {});

        createdLeadsList.push({
          id: `lead_${Date.now()}_${item.index}`,
          name: item.name,
          phone: item.phone,
          city,
          notes: customNotes,
          source: leadSource,
          repName: selectedRep,
        });
      }

      // 2. Dispatch real-time "New Data" notification to the sales employee
      const notifMessage =
        validLeads.length === 1
          ? `قام المسؤول بإرسال رقم جديد لحسابك (${validLeads[0].name} - ${validLeads[0].phone}). يرجى المتابعة والاتصال فوراً.`
          : `قام المسؤول بإرسال ${validLeads.length} أرقام وأسماء جديدة لحسابك. تم تحديث سجل عملائك وجاهز للاتصال.`;

      await sendNotification({
        repName: selectedRep,
        repId: selectedRep === "حنان" ? "hanan" : undefined,
        title: notificationTitle || "بيانات جديدة 🔔 New Data",
        message: notifMessage,
        phones: validLeads.map((l) => l.phone),
        link: "/customers",
      });

      stopLoading();
      showToast(
        `تم إرسال ${validLeads.length} عملاء بنجاح بالاسم والرقم إلى ${selectedRep} وإشعارها بتنبيه "New Data" 🔔!`,
        "success",
        5000
      );

      setRawCustomerNames("");
      setRawPhoneNumbers("");
      setCustomNotes("");
      onClose();
      if (onSuccess) onSuccess(createdLeadsList);
    } catch (err: any) {
      stopLoading();
      showToast("حدث خطأ أثناء إرسال البيانات: " + err.message, "error");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-5 animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-stone-200 space-y-4 max-h-[92vh] overflow-y-auto text-stone-900 animate-in zoom-in-95">
        
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-stone-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 text-stone-950 flex items-center justify-center font-black shrink-0 shadow-md shadow-amber-500/20">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-stone-900">
                إرسال أرقام هواتف للموظفين (New Data)
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                إسناد أرقام وأسماء العملاء للمندوبة مع معاينة ديناميكية حية وتنبيه New Data فوري
              </p>
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
          
          {/* Target Rep & Notification Title */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Employee Target */}
            <div>
              <label className="font-bold text-stone-800 block mb-1">
                الموظفة / المندوب المستلم:
              </label>
              <select
                value={selectedRep}
                onChange={(e) => setSelectedRep(e.target.value)}
                className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl font-bold text-stone-800 focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value="حنان">حنان (مبيعات) - @hanan</option>
                <option value="صابرين">صابرين (مبيعات) - @sabreen</option>
                <option value="حمزة">حمزة (مبيعات) - @hamza</option>
              </select>
            </div>

            {/* Notification Title Input */}
            <div>
              <label className="font-bold text-stone-800 block mb-1">
                عنوان الإشعار (Notification Title):
              </label>
              <input
                type="text"
                value={notificationTitle}
                onChange={(e) => setNotificationTitle(e.target.value)}
                placeholder="مثال: بيانات جديدة 🔔 New Data"
                className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl font-bold text-amber-900 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Side-by-side Textareas for Names in Order and Phone Numbers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Customer Names in Order */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-stone-800 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-amber-600" />
                  <span>أسماء العملاء بالترتيب (Names):</span>
                </label>
                <span className="text-[10px] font-mono text-stone-600 bg-stone-100 px-2 py-0.5 rounded-md font-bold">
                  {nameLines.length} اسم
                </span>
              </div>
              <textarea
                rows={5}
                value={rawCustomerNames}
                onChange={(e) => setRawCustomerNames(e.target.value)}
                placeholder={`اسم العميل في كل سطر:\nسدين غنايم\nألاء كوكش\nصالون لمسة حرير\nالهام القلاب`}
                className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs focus:outline-none focus:border-amber-500 leading-relaxed font-semibold text-stone-900"
              />
              <p className="text-[10px] text-stone-400 mt-0.5">
                اكتب اسماً في كل سطر بالترتيب المطابق للأرقام المقابلة.
              </p>
            </div>

            {/* Phone Numbers in Order */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-stone-800 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-amber-600" />
                  <span>أرقام الهواتف بالترتيب (Phones):</span>
                </label>
                <span className="text-[10px] font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                  {phoneLines.length} رقم
                </span>
              </div>
              <textarea
                rows={5}
                required
                value={rawPhoneNumbers}
                onChange={(e) => setRawPhoneNumbers(e.target.value)}
                placeholder={`رقم الهاتف في كل سطر:\n0793937385\n0776812355\n0788765432\n+962799731812`}
                className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl font-mono text-xs focus:outline-none focus:border-amber-500 leading-relaxed font-bold text-stone-900"
                dir="ltr"
              />
              <p className="text-[10px] text-stone-400 mt-0.5">
                رقم في كل سطر، يدعم كافة صيغ الهواتف المحلية والدولية.
              </p>
            </div>
          </div>

          {/* Live Matching Status Indicator Banner */}
          {phoneLines.length > 0 && (
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] font-bold text-amber-950">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                {nameLines.length > 0 && phoneLines.length === nameLines.length ? (
                  <span className="text-emerald-800 font-bold">
                    ✓ تطابق تام: تم ربط {phoneLines.length} أسماء مع {phoneLines.length} أرقام هواتف بالترتيب!
                  </span>
                ) : nameLines.length === 0 ? (
                  <span>
                    سيتم ترقيم {phoneLines.length} عميل آلياً (عميل محول 1, 2...)
                  </span>
                ) : (
                  <span>
                    تم ربط {Math.min(phoneLines.length, nameLines.length)} اسم، وسيتم إسناد الباقي تلقائياً.
                  </span>
                )}
              </span>
              <span className="font-mono bg-white px-2 py-0.5 rounded-md border border-amber-200 text-amber-900 shrink-0">
                {validLeads.length} أرقام صالحة
              </span>
            </div>
          )}

          {/* Automatic Dynamic Live Preview Section (معاينة ديناميكية حية وتلقائية) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-bold text-stone-800 flex items-center gap-1.5 text-xs">
                <Eye className="w-4 h-4 text-amber-600" />
                <span>المعاينة التلقائية الحية (Dynamic Live Preview):</span>
              </label>
              {pairedLeads.length > 0 && (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  تحديث تلقائي فوري
                </span>
              )}
            </div>

            {pairedLeads.length === 0 ? (
              <div className="p-4 text-center border border-dashed border-stone-200 rounded-2xl bg-stone-50/70 text-stone-400 text-xs">
                أدخل الأسماء والأرقام بالأعلى لتظهر المعاينة الحية فوراً هنا بشكل أنيق قبل الإرسال...
              </div>
            ) : (
              <div className="bg-stone-50 rounded-2xl border border-stone-200 p-2 max-h-48 overflow-y-auto space-y-1.5 divide-y divide-stone-200/60">
                {pairedLeads.map((item) => (
                  <div
                    key={item.id}
                    className="pt-1.5 first:pt-0 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-5 h-5 rounded-md bg-stone-200 text-stone-700 font-mono font-bold text-[10px] flex items-center justify-center shrink-0">
                        {item.index}
                      </span>
                      <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-[#9e8959] to-[#c28a40] text-[#160f02] font-black text-xs flex items-center justify-center shrink-0 shadow-2xs">
                        {item.name.charAt(0) || "ع"}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-stone-900 truncate">{item.name}</p>
                        <span className="text-[10px] text-stone-500">{city} • {selectedRep}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`font-mono text-xs px-2.5 py-0.5 rounded-lg font-bold ${
                          item.isValidPhone
                            ? "bg-amber-100/90 text-amber-950 border border-amber-300/80"
                            : "bg-rose-100 text-rose-800 border border-rose-300"
                        }`}
                        dir="ltr"
                      >
                        {item.phone || "بدون رقم"}
                      </span>
                      {item.isValidPhone ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <span className="text-[10px] text-rose-600 font-bold shrink-0">ناقص</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* City and Source */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="font-bold text-stone-700 block mb-1">المدينة / المحافظة:</label>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500 cursor-pointer font-medium"
              >
                <option value="عمان">عمان</option>
                <option value="الزرقاء">الزرقاء</option>
                <option value="إربد">إربد</option>
                <option value="طبربور">طبربور</option>
                <option value="العقبة">العقبة</option>
                <option value="مادبا">مادبا</option>
                <option value="السلط">السلط</option>
                <option value="كافة المحافظات">كافة المحافظات</option>
              </select>
            </div>

            <div>
              <label className="font-bold text-stone-700 block mb-1">مصدر الليد:</label>
              <select
                value={leadSource}
                onChange={(e) => setLeadSource(e.target.value)}
                className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500 cursor-pointer font-medium"
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
          <div className="p-3 bg-[#160f02] rounded-2xl border border-[#554625]/80 text-[#f4e5d0] space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#bda66d]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>معاينة إشعار الموظفة الفوري:</span>
            </div>
            <p className="text-xs font-semibold text-white">
              {notificationTitle || "بيانات جديدة 🔔 New Data"}
            </p>
            <p className="text-[11px] text-[#f4e5d0]/80">
              {validLeads.length > 0
                ? `سيتم إرسال ${validLeads.length} عميل بالاسم والرقم إلى ${selectedRep} مع نغمة صوتية وتنبيه منبثق.`
                : "أدخل أرقام الهواتف لمعاينة تفاصيل الإرسال."}
            </p>
          </div>

          {/* Submit Button */}
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={validLeads.length === 0}
              className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-stone-950 font-black text-xs sm:text-sm rounded-xl shadow-md transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              <Send className="w-4 h-4" />
              <span>إرسال وتوزيع البيانات إلى {selectedRep} الآن ({validLeads.length})</span>
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
