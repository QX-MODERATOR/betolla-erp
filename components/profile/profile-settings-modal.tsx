"use client";

import { useState, useEffect } from "react";
import { 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  Lock, 
  Shield, 
  Sparkles, 
  X, 
  Check, 
  AlertCircle, 
  MessageSquare,
  KeyRound,
  FileText,
  BadgePercent,
  Target,
  Globe,
  Eye,
  EyeOff,
  CheckCircle2,
  Truck,
  Briefcase,
  Crown,
  Calculator
} from "lucide-react";
import { useProfile } from "@/lib/profile-context";
import { useLanguage } from "@/lib/i18n";
import { useLoading } from "@/lib/loading-context";
import { useToast } from "@/components/common/toast";

function getRoleBadge(role: string, isArabic: boolean): string {
  switch (role) {
    case "general_manager":
      return isArabic ? "المدير العام" : "General Manager";
    case "admin":
      return isArabic ? "مسؤول النظام والـ IT" : "System Administrator (IT)";
    case "sales_manager":
      return isArabic ? "مديرة المبيعات" : "Sales Manager";
    case "sales_rep":
      return isArabic ? "مبيعات" : "Sales Representative";
    case "marketing_manager":
      return isArabic ? "مدير التسويق" : "Marketing Manager";
    case "marketing":
      return isArabic ? "تسويق" : "Marketing Specialist";
    case "finance":
      return isArabic ? "المدير المالي" : "Finance Director";
    case "hr_operations":
      return isArabic ? "مديرة الموارد البشرية - عمليات" : "HR & Operations Manager";
    case "driver_manager":
      return isArabic ? "مدير سائقين التوصيل" : "Fleet & Dispatch Manager";
    case "driver":
      return isArabic ? "سائق توصيل" : "Delivery Driver";
    default:
      return role;
  }
}

export function ProfileSettingsModal() {
  const { profile, updateProfile, isProfileModalOpen, closeProfileModal, isSalesRep } = useProfile();
  const { language, dir, toggleLanguage, setLanguage } = useLanguage();
  const { startLoading, stopLoading } = useLoading();
  const { showToast } = useToast();
  const isArabic = language === "ar";

  const [activeTab, setActiveTab] = useState<"info" | "security" | "contract">("info");

  // Form states
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("عمان والوسط");
  const [bio, setBio] = useState("");
  const [avatarColor, setAvatarColor] = useState("gold");

  // Security password states
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isProfileModalOpen) {
        closeProfileModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isProfileModalOpen, closeProfileModal]);

  useEffect(() => {
    if (profile) {
      setFullName(profile.name || "");
      setPhone(profile.phone || "");
      setWhatsapp(profile.whatsapp || profile.phone || "");
      setEmail(profile.email || `${profile.username}@betolla.com`);
      setCity(profile.city || (isArabic ? "عمان والوسط" : "Amman & Central"));
      setBio(profile.bio || "");
      setAvatarColor(profile.avatarColor || "gold");
    }
  }, [profile, isProfileModalOpen, language, isArabic]);

  if (!isProfileModalOpen || !profile) return null;

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!fullName.trim()) {
      setFormError(isArabic ? "يرجى إدخال الاسم الكامل." : "Please enter your full name.");
      return;
    }

    if (!phone.trim()) {
      setFormError(isArabic ? "يرجى إدخال رقم الهاتف للتواصل والطلبيات." : "Please enter your phone number.");
      return;
    }

    startLoading({
      ar: "جاري حفظ وتحديث بيانات الملف الشخصي في النظام...",
      en: "Saving profile information to ERP...",
    });

    setTimeout(() => {
      const res = updateProfile({
        name: fullName.trim(),
        phone: phone.trim(),
        whatsapp: whatsapp.trim() || phone.trim(),
        email: email.trim(),
        city: city.trim(),
        bio: bio.trim(),
        avatarColor,
      });

      stopLoading();

      if (res.success) {
        setFormSuccess(isArabic ? "🎉 تم حفظ وتحديث بياناتك بنجاح!" : "Profile updated successfully!");
        showToast(isArabic ? "تم حفظ بيانات الملف الشخصي بنجاح" : "Profile saved successfully", "success");
        setTimeout(() => {
          closeProfileModal();
        }, 900);
      } else {
        setFormError(res.message || "حدث خطأ أثناء الحفظ.");
        showToast(res.message || "حدث خطأ أثناء الحفظ", "error");
      }
    }, 400);
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!currentPassword) {
      setFormError(isArabic ? "يرجى إدخال كلمة المرور الحالية." : "Please enter your current password.");
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setFormError(isArabic ? "كلمة المرور الجديدة يجب أن تكون 6 أحرف أو أرقام على الأقل." : "New password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setFormError(isArabic ? "كلمة المرور وتأكيدها غير متطابقين." : "Passwords do not match.");
      return;
    }

    startLoading({
      ar: "جاري تشفير وتحديث كلمة المرور...",
      en: "Encrypting & updating password...",
    });

    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: profile.username,
          currentPassword,
          newPassword,
        }),
      });

      const data = await res.json();
      stopLoading();

      if (!res.ok || !data.success) {
        const errMsg = data.error || (isArabic ? "فشل تحديث كلمة المرور." : "Password update failed.");
        setFormError(errMsg);
        showToast(errMsg, "error");
        return;
      }

      if (typeof window !== "undefined") {
        localStorage.setItem(`betolla_pwd_${profile.username}`, newPassword);
      }

      setFormSuccess(isArabic ? "🔒 تم تحديث كلمة المرور بنجاح!" : "Password updated successfully!");
      showToast(isArabic ? "تم تحديث كلمة المرور بنجاح" : "Password updated successfully", "success");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      stopLoading();
      const failMsg = isArabic ? "تعذر الاتصال بالخادم لتحديث كلمة المرور." : "Server connection failed.";
      setFormError(failMsg);
      showToast(failMsg, "error");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeProfileModal();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto no-scrollbar hide-scrollbar animate-backdropFadeIn"
      dir={dir}
    >
      <div className="relative w-full max-w-xl bg-gradient-to-b from-[#160f02] via-[#1d1405] to-[#160f02] border border-[#554625] rounded-3xl shadow-2xl shadow-black/90 p-4 sm:p-7 text-[#f4e5d0] ring-1 ring-[#9e8959]/25 my-4 sm:my-8 max-h-[92vh] flex flex-col no-scrollbar hide-scrollbar animate-modalSlideUp">
        
        {/* Ambient Gold Orbs */}
        <div className="absolute w-72 h-72 bg-[#9e8959]/10 rounded-full blur-3xl pointer-events-none -top-10 -right-10" />
        <div className="absolute w-72 h-72 bg-[#c28a40]/10 rounded-full blur-3xl pointer-events-none -bottom-10 -left-10" />

        {/* Top Gold Accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#9e8959] to-transparent rounded-t-3xl" />

        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#3d3016] shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
            <div className="w-11 h-11 sm:w-13 sm:h-13 rounded-2xl bg-gradient-to-br from-[#9e8959] via-[#c28a40] to-[#7d6534] text-[#160f02] flex items-center justify-center font-black text-lg sm:text-xl shadow-lg shadow-black/50 shrink-0 ring-2 ring-[#554625]/60 transition-all">
              {profile.avatar || (fullName ? fullName.charAt(0) : isArabic ? "م" : "U")}
            </div>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-black text-white flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="truncate">{fullName || profile.name}</span>
                <span className="text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full bg-[#241a08] text-[#cbb588] border border-[#554625] font-semibold shrink-0">
                  {getRoleBadge(profile.role, isArabic)}
                </span>
              </h3>
              <p className="text-[11px] sm:text-xs text-[#a3998b] mt-0.5 truncate">
                {isArabic ? "تعديل البيانات الشخصية، أرقام التواصل وكلمة المرور" : "Edit personal contact data, phone, and password"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Direct Language Switcher in Modal Header */}
            <button
              type="button"
              onClick={toggleLanguage}
              title={isArabic ? "Switch to English" : "التحويل إلى العربية"}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border border-[#554625] bg-[#241a08] hover:bg-[#35270e] hover:border-[#9e8959] text-[#f4e5d0] text-xs font-bold transition shadow-xs cursor-pointer active:scale-95"
            >
              <Globe className="w-3.5 h-3.5 text-[#9e8959] shrink-0" />
              <span>{isArabic ? "English" : "العربية"}</span>
            </button>

            <button
              onClick={closeProfileModal}
              className="p-1.5 sm:p-2 text-[#a3998b] hover:text-[#f4e5d0] rounded-xl hover:bg-[#281c08] border border-transparent hover:border-[#3d3016] transition cursor-pointer active:scale-95"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-1 sm:gap-2 mt-4 p-1.5 bg-[#120c02] rounded-2xl border border-[#3d3016] shrink-0">
          <button
            type="button"
            onClick={() => { setActiveTab("info"); setFormError(null); setFormSuccess(null); }}
            className={`flex-1 py-2 px-2 rounded-xl text-[11px] sm:text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 ${
              activeTab === "info"
                ? "bg-gradient-to-r from-[#9e8959] via-[#b39c68] to-[#c28a40] text-[#160f02] font-black shadow-md shadow-[#9e8959]/25"
                : "text-[#a3998b] hover:text-[#f4e5d0] hover:bg-[#1a1204]"
            }`}
          >
            <User className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{isArabic ? "البيانات الشخصية" : "Personal Info"}</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab("security"); setFormError(null); setFormSuccess(null); }}
            className={`flex-1 py-2 px-2 rounded-xl text-[11px] sm:text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 ${
              activeTab === "security"
                ? "bg-gradient-to-r from-[#9e8959] via-[#b39c68] to-[#c28a40] text-[#160f02] font-black shadow-md shadow-[#9e8959]/25"
                : "text-[#a3998b] hover:text-[#f4e5d0] hover:bg-[#1a1204]"
            }`}
          >
            <Lock className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{isArabic ? "الأمان وكلمة المرور" : "Security"}</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab("contract"); setFormError(null); setFormSuccess(null); }}
            className={`flex-1 py-2 px-2 rounded-xl text-[11px] sm:text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 ${
              activeTab === "contract"
                ? "bg-gradient-to-r from-[#9e8959] via-[#b39c68] to-[#c28a40] text-[#160f02] font-black shadow-md shadow-[#9e8959]/25"
                : "text-[#a3998b] hover:text-[#f4e5d0] hover:bg-[#1a1204]"
            }`}
          >
            <Shield className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{isArabic ? "الصلاحيات والمهام" : "Role & Scope"}</span>
          </button>
        </div>

        {/* Notifications / Feedback */}
        {formError && (
          <div className="mt-3 p-3 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2.5 shrink-0 animate-fadeIn">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{formError}</span>
          </div>
        )}

        {formSuccess && (
          <div className="mt-3 p-3 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2.5 shrink-0 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{formSuccess}</span>
          </div>
        )}

        {/* Tab 1: Personal Contact Information */}
        {activeTab === "info" && (
          <form onSubmit={handleSaveProfile} className="mt-4 space-y-4 overflow-y-auto flex-1 no-scrollbar hide-scrollbar">
            <div>
              <label className="block text-xs font-bold text-[#f4e5d0] mb-1.5">
                {isArabic ? "الاسم الكامل (يظهر في فواتير الواتساب والتقارير):" : "Full Name (Shown on invoices & reports):"}
              </label>
              <div className="relative">
                <User className={`absolute ${dir === "rtl" ? "right-3.5" : "left-3.5"} top-1/2 -translate-y-1/2 w-4 h-4 text-[#9e8959]`} />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={isArabic ? "مثال: حنان (مبيعات)" : "e.g. Hanan (Sales)"}
                  className={`w-full bg-[#120c02] border border-[#3d3016] rounded-xl ${dir === "rtl" ? "pr-10 pl-4" : "pl-10 pr-4"} py-2.5 text-sm text-[#f4e5d0] placeholder-[#6b655d] focus:outline-none focus:border-[#9e8959] focus:ring-1 focus:ring-[#9e8959]/30 transition`}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#f4e5d0] mb-1.5">
                  {isArabic ? "رقم الهاتف الشخصي / العمل:" : "Phone Number:"}
                </label>
                <div className="relative">
                  <Phone className={`absolute ${dir === "rtl" ? "right-3.5" : "left-3.5"} top-1/2 -translate-y-1/2 w-4 h-4 text-[#9e8959]`} />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0793937385"
                    className={`w-full bg-[#120c02] border border-[#3d3016] rounded-xl ${dir === "rtl" ? "pr-10 pl-4" : "pl-10 pr-4"} py-2.5 text-sm font-mono text-[#f4e5d0] placeholder-[#6b655d] focus:outline-none focus:border-[#9e8959] focus:ring-1 focus:ring-[#9e8959]/30 transition text-left`}
                    dir="ltr"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#f4e5d0] mb-1.5">
                  {isArabic ? "رقم الواتساب لإرسال الفواتير:" : "WhatsApp Number for Invoices:"}
                </label>
                <div className="relative">
                  <MessageSquare className={`absolute ${dir === "rtl" ? "right-3.5" : "left-3.5"} top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400`} />
                  <input
                    type="tel"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="0793937385"
                    className={`w-full bg-[#120c02] border border-[#3d3016] rounded-xl ${dir === "rtl" ? "pr-10 pl-4" : "pl-10 pr-4"} py-2.5 text-sm font-mono text-[#f4e5d0] placeholder-[#6b655d] focus:outline-none focus:border-[#9e8959] focus:ring-1 focus:ring-[#9e8959]/30 transition text-left`}
                    dir="ltr"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#f4e5d0] mb-1.5">
                  {isArabic ? "البريد الإلكتروني المهني:" : "Work Email:"}
                </label>
                <div className="relative">
                  <Mail className={`absolute ${dir === "rtl" ? "right-3.5" : "left-3.5"} top-1/2 -translate-y-1/2 w-4 h-4 text-[#9e8959]`} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="hanan@betolla.com"
                    className={`w-full bg-[#120c02] border border-[#3d3016] rounded-xl ${dir === "rtl" ? "pr-10 pl-4" : "pl-10 pr-4"} py-2.5 text-sm font-mono text-[#f4e5d0] placeholder-[#6b655d] focus:outline-none focus:border-[#9e8959] focus:ring-1 focus:ring-[#9e8959]/30 transition text-left`}
                    dir="ltr"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#f4e5d0] mb-1.5">
                  {isArabic ? "المحافظة / منطقة العمل:" : "Assigned Territory:"}
                </label>
                <div className="relative">
                  <MapPin className={`absolute ${dir === "rtl" ? "right-3.5" : "left-3.5"} top-1/2 -translate-y-1/2 w-4 h-4 text-[#c28a40]`} />
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder={isArabic ? "عمان والوسط" : "Amman & Central"}
                    className={`w-full bg-[#120c02] border border-[#3d3016] rounded-xl ${dir === "rtl" ? "pr-10 pl-4" : "pl-10 pr-4"} py-2.5 text-sm text-[#f4e5d0] placeholder-[#6b655d] focus:outline-none focus:border-[#9e8959] focus:ring-1 focus:ring-[#9e8959]/30 transition`}
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#f4e5d0] mb-1.5">
                {isArabic ? "ملاحظة تعريفية / رسالة الاتصال المفضلة:" : "Calling Intro & Bio:"}
              </label>
              <textarea
                rows={2}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder={isArabic ? "أدخلي أي تفضيلات شخصية أو ملاحظات عن أسلوب التواصل مع صالوناتك..." : "Enter your personal calling bio..."}
                className="w-full bg-[#120c02] border border-[#3d3016] rounded-xl p-3 text-xs text-[#f4e5d0] placeholder-[#6b655d] focus:outline-none focus:border-[#9e8959] focus:ring-1 focus:ring-[#9e8959]/30 transition resize-none"
              />
            </div>

            {/* Language Preference Card */}
            <div className="p-3.5 bg-[#120c02] rounded-2xl border border-[#3d3016] space-y-2">
              <label className="block text-xs font-bold text-[#f4e5d0] flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-[#9e8959]" />
                  <span>{isArabic ? "لغة واجهة النظام وتفضيل العرض:" : "Preferred System Language:"}</span>
                </span>
                <span className="text-[10px] text-[#a3998b] font-mono">
                  {isArabic ? "تنعكس فوراً على كامل النظام" : "Reflected instantly across ERP"}
                </span>
              </label>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setLanguage("ar")}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer border active:scale-95 ${
                    isArabic
                      ? "bg-gradient-to-r from-[#9e8959] to-[#c28a40] text-[#160f02] border-[#9e8959] shadow-sm font-black"
                      : "bg-[#1a1204] text-[#a3998b] border-[#3d3016] hover:text-[#f4e5d0] hover:border-[#554625]"
                  }`}
                >
                  <span className="text-sm">🇯🇴</span>
                  <span>العربية</span>
                  {isArabic && <Check className="w-3.5 h-3.5" />}
                </button>

                <button
                  type="button"
                  onClick={() => setLanguage("en")}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer border active:scale-95 ${
                    !isArabic
                      ? "bg-gradient-to-r from-[#9e8959] to-[#c28a40] text-[#160f02] border-[#9e8959] shadow-sm font-black"
                      : "bg-[#1a1204] text-[#a3998b] border-[#3d3016] hover:text-[#f4e5d0] hover:border-[#554625]"
                  }`}
                >
                  <span className="text-sm">🇬🇧</span>
                  <span>English</span>
                  {!isArabic && <Check className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="pt-3 flex items-center justify-end gap-2 border-t border-[#3d3016]">
              <button
                type="button"
                onClick={closeProfileModal}
                className="px-4 py-2.5 rounded-xl border border-[#3d3016] bg-[#1a1204] text-[#a3998b] hover:text-white hover:bg-[#251b09] text-xs font-semibold transition cursor-pointer active:scale-95"
              >
                {isArabic ? "إلغاء" : "Cancel"}
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#9e8959] via-[#b39c68] to-[#c28a40] text-[#160f02] font-black text-xs shadow-lg shadow-[#9e8959]/25 hover:brightness-110 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{isArabic ? "حفظ التغييرات" : "Save Changes"}</span>
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: Security & Password Update */}
        {activeTab === "security" && (
          <form onSubmit={handleUpdatePassword} className="mt-4 space-y-4 overflow-y-auto flex-1 no-scrollbar hide-scrollbar">
            <div>
              <label className="block text-xs font-bold text-[#f4e5d0] mb-1.5">
                {isArabic ? "كلمة المرور الحالية:" : "Current Password:"}
              </label>
              <div className="relative">
                <KeyRound className={`absolute ${dir === "rtl" ? "right-3.5" : "left-3.5"} top-1/2 -translate-y-1/2 w-4 h-4 text-[#9e8959]`} />
                <input
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`w-full bg-[#120c02] border border-[#3d3016] rounded-xl ${dir === "rtl" ? "pr-10 pl-10" : "pl-10 pr-10"} py-2.5 text-sm text-[#f4e5d0] placeholder-[#6b655d] focus:outline-none focus:border-[#9e8959] focus:ring-1 focus:ring-[#9e8959]/30 transition text-left`}
                  dir="ltr"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className={`absolute ${dir === "rtl" ? "left-3" : "right-3"} top-1/2 -translate-y-1/2 text-[#a3998b] hover:text-[#f4e5d0] cursor-pointer p-1`}
                >
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#f4e5d0] mb-1.5">
                  {isArabic ? "كلمة المرور الجديدة:" : "New Password:"}
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#120c02] border border-[#3d3016] rounded-xl px-4 py-2.5 pr-10 text-sm text-[#f4e5d0] placeholder-[#6b655d] focus:outline-none focus:border-[#9e8959] focus:ring-1 focus:ring-[#9e8959]/30 transition text-left"
                    dir="ltr"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#a3998b] hover:text-[#f4e5d0] cursor-pointer p-1"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#f4e5d0] mb-1.5">
                  {isArabic ? "تأكيد كلمة المرور الجديدة:" : "Confirm New Password:"}
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#120c02] border border-[#3d3016] rounded-xl px-4 py-2.5 pr-10 text-sm text-[#f4e5d0] placeholder-[#6b655d] focus:outline-none focus:border-[#9e8959] focus:ring-1 focus:ring-[#9e8959]/30 transition text-left"
                    dir="ltr"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#a3998b] hover:text-[#f4e5d0] cursor-pointer p-1"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#120c02] border border-[#3d3016] text-[11px] text-[#a3998b] space-y-1.5">
              <p className="font-bold text-[#f4e5d0] flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-[#9e8959]" />
                <span>{isArabic ? "معايير الأمان المطبقة:" : "Security Standards Applied:"}</span>
              </p>
              <p>{isArabic ? "• يتم تشفير كلمات المرور بحماية أجهزة التشفير المتطورة AES-256-GCM قبل الحفظ." : "• Passwords are protected via AES-256-GCM hardware encryption."}</p>
              <p>{isArabic ? "• التغيير فوري ويسري على تطبيق الويب وتطبيق الهاتف الذكي (APK)." : "• Changes take effect immediately across Web ERP and Android APK."}</p>
            </div>

            <div className="pt-3 flex items-center justify-end gap-2 border-t border-[#3d3016]">
              <button
                type="button"
                onClick={closeProfileModal}
                className="px-4 py-2.5 rounded-xl border border-[#3d3016] bg-[#1a1204] text-[#a3998b] hover:text-white hover:bg-[#251b09] text-xs font-semibold transition cursor-pointer active:scale-95"
              >
                {isArabic ? "إلغاء" : "Cancel"}
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#9e8959] via-[#b39c68] to-[#c28a40] text-[#160f02] font-black text-xs shadow-lg shadow-[#9e8959]/25 hover:brightness-110 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                <span>{isArabic ? "تحديث كلمة المرور" : "Update Password"}</span>
              </button>
            </div>
          </form>
        )}

        {/* Tab 3: Role, Commission & Target */}
        {activeTab === "contract" && (
          <div className="mt-4 space-y-4 overflow-y-auto flex-1 no-scrollbar hide-scrollbar">
            <div className="p-3.5 rounded-2xl bg-[#241a08] border border-[#554625]/60 text-[#cbb588] text-xs flex items-center gap-2.5">
              <Shield className="w-4 h-4 shrink-0 text-[#9e8959]" />
              <span>
                {isArabic 
                  ? "تنبيه رسمي: هذه الصلاحيات والمهام محددة مركزياً ومحمية من قبل الإدارة العامة لشركة بيتولا لمستحضرات التجميل." 
                  : "Official Notice: Roles and parameters are centrally controlled by Betolla General Management."}
              </span>
            </div>

            <div className="p-4 sm:p-5 rounded-2xl bg-[#120c02] border border-[#3d3016] space-y-3.5">
              
              {/* Common Assigned Role Row */}
              <div className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-[#3d3016]">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#9e8959] shrink-0" />
                  <span className="text-xs text-[#a3998b]">{isArabic ? "الدور والصلاحيات:" : "Assigned Role:"}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-bold text-white font-mono">
                    {getRoleBadge(profile.role, isArabic)}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#241a08] text-[#cbb588] border border-[#554625] font-mono shrink-0">
                    {isArabic ? "🔒 معتمد" : "🔒 Verified"}
                  </span>
                </div>
              </div>

              {/* General Manager Role */}
              {profile.role === "general_manager" && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-[#3d3016]">
                    <div className="flex items-center gap-2">
                      <Crown className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="text-xs text-[#a3998b]">{isArabic ? "الموقع القيادي:" : "Leadership Level:"}</span>
                    </div>
                    <span className="text-xs font-bold text-amber-300">
                      {isArabic ? "القيادة التنفيذية العليا للشركة" : "Executive General Management"}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-[#c28a40] shrink-0" />
                      <span className="text-xs text-[#a3998b]">{isArabic ? "نطاق الإشراف والتقارير:" : "Executive Scope:"}</span>
                    </div>
                    <span className="text-xs text-[#f4e5d0]">
                      {isArabic ? "إشراف شامل على المبيعات، التسويق، العمليات اللوجستية، المحاسبة، والقرارات الاستراتيجية" : "Comprehensive oversight of sales, marketing, operations, finance & strategy"}
                    </span>
                  </div>
                </>
              )}

              {/* IT Admin Role */}
              {profile.role === "admin" && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-[#3d3016]">
                    <div className="flex items-center gap-2">
                      <Crown className="w-4 h-4 text-[#9e8959] shrink-0" />
                      <span className="text-xs text-[#a3998b]">{isArabic ? "مستوى الوصول التقني:" : "Technical Access:"}</span>
                    </div>
                    <span className="text-xs font-bold text-[#cbb588]">
                      {isArabic ? "مسؤول النظام والـ IT (System Administrator)" : "Root System Administrator"}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-[#c28a40] shrink-0" />
                      <span className="text-xs text-[#a3998b]">{isArabic ? "المهام التقنية:" : "Technical Scope:"}</span>
                    </div>
                    <span className="text-xs text-[#f4e5d0]">
                      {isArabic ? "إدارة الخوادم، التشفير والأمان، النسخ الاحتياطي، الدعم الفني، وإعدادات النظام" : "Server infrastructure, encryption, backup, tech support & system settings"}
                    </span>
                  </div>
                </>
              )}

              {/* Sales Manager Role */}
              {profile.role === "sales_manager" && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-[#3d3016]">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="text-xs text-[#a3998b]">{isArabic ? "المستهدف البيعي للفريق:" : "Team Sales Target:"}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-emerald-400 font-mono">
                        {profile.monthlyTarget ? `${profile.monthlyTarget.toLocaleString()} ${isArabic ? "د.أ" : "JD"}` : (isArabic ? "25,000 د.أ" : "25,000 JD")}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#241a08] text-emerald-400 border border-emerald-500/30 font-mono shrink-0">
                        {isArabic ? "شهري" : "Monthly"}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-[#c28a40] shrink-0" />
                      <span className="text-xs text-[#a3998b]">{isArabic ? "الصلاحيات الإدارية:" : "Management Scope:"}</span>
                    </div>
                    <span className="text-xs text-[#f4e5d0]">
                      {isArabic ? "إدارة ومتابعة فريق المبيعات، اعتماد الفواتير والعروض، ومراقبة أداء المندوبين" : "Sales reps management, orders audit, target tracking & pricing policies"}
                    </span>
                  </div>
                </>
              )}

              {/* Sales Rep Role */}
              {profile.role === "sales_rep" && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-[#3d3016]">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="text-xs text-[#a3998b]">{isArabic ? "الهدف البيعي الشهري:" : "Monthly Sales Target:"}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-emerald-400 font-mono">
                        {profile.monthlyTarget ? `${profile.monthlyTarget.toLocaleString()} ${isArabic ? "د.أ" : "JD"}` : (isArabic ? "4,500 د.أ" : "4,500 JD")}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#241a08] text-emerald-400 border border-emerald-500/30 font-mono shrink-0">
                        {isArabic ? "شهري" : "Monthly"}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-[#3d3016]">
                    <div className="flex items-center gap-2">
                      <BadgePercent className="w-4 h-4 text-[#9e8959] shrink-0" />
                      <span className="text-xs text-[#a3998b]">{isArabic ? "نسبة عمولة المبيعات:" : "Commission Rate:"}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-[#cbb588] font-mono">
                        {profile.commissionRate ? `${profile.commissionRate}%` : "3.5%"}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#241a08] text-[#cbb588] border border-[#554625] font-mono shrink-0">
                        {isArabic ? "معتمدة" : "Active"}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-[#c28a40] shrink-0" />
                      <span className="text-xs text-[#a3998b]">{isArabic ? "نطاق الصلاحيات:" : "Work Scope:"}</span>
                    </div>
                    <span className="text-xs text-[#f4e5d0]">
                      {isArabic ? "سجل العملاء، جدول الاتصالات، إصدار الفواتير، عروض الأسعار" : "CRM, Calling Schedule, Orders & Quotes"}
                    </span>
                  </div>
                </>
              )}

              {/* Marketing Manager Role */}
              {profile.role === "marketing_manager" && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-[#3d3016]">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-sky-400 shrink-0" />
                      <span className="text-xs text-[#a3998b]">{isArabic ? "قسم إدارة التسويق:" : "Marketing Department:"}</span>
                    </div>
                    <span className="text-xs font-bold text-sky-400">
                      {isArabic ? "الحملات الإعلانية، مصادر الليدات، واستراتيجيات النمو" : "Ad Campaigns, Leads Sources & Growth Strategy"}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-[#c28a40] shrink-0" />
                      <span className="text-xs text-[#a3998b]">{isArabic ? "الصلاحيات والتقارير:" : "Marketing Scope:"}</span>
                    </div>
                    <span className="text-xs text-[#f4e5d0]">
                      {isArabic ? "تحليلات التحويل (CPA/ROAS)، ربط الإعلانات بالطلبات، وتحليل مصادر الليدات والعملاء" : "Analytics, conversion rates, leads channels, customer CRM insights"}
                    </span>
                  </div>
                </>
              )}

              {/* Marketing Specialist Role */}
              {profile.role === "marketing" && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-[#3d3016]">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-rose-400 shrink-0" />
                      <span className="text-xs text-[#a3998b]">{isArabic ? "المهام التسويقية اليومية:" : "Marketing Operations:"}</span>
                    </div>
                    <span className="text-xs font-bold text-rose-400">
                      {isArabic ? "إدارة الليدات، المتابعة التفاعلية، والمحتوى" : "Leads Flow & Social Ingestion"}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-[#c28a40] shrink-0" />
                      <span className="text-xs text-[#a3998b]">{isArabic ? "نطاق الوصول:" : "Role Scope:"}</span>
                    </div>
                    <span className="text-xs text-[#f4e5d0]">
                      {isArabic ? "قاعدة بيانات العملاء والليدات، تصنيف الاهتمامات، وتغذية فريق المبيعات بالبيانات" : "Customer CRM, Leads Classification, Quality Assessment"}
                    </span>
                  </div>
                </>
              )}

              {/* HR & Operations Role */}
              {profile.role === "hr_operations" && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-[#3d3016]">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-purple-400 shrink-0" />
                      <span className="text-xs text-[#a3998b]">{isArabic ? "المجال الإداري والتشغيلي:" : "HR & Operations:"}</span>
                    </div>
                    <span className="text-xs font-bold text-purple-400">
                      {isArabic ? "الموارد البشرية، ضبط الجودة، ومتابعة العمليات" : "HR Management, Quality Control & Fleet Operations"}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-[#c28a40] shrink-0" />
                      <span className="text-xs text-[#a3998b]">{isArabic ? "الصلاحيات المعتمدة:" : "Operational Scope:"}</span>
                    </div>
                    <span className="text-xs text-[#f4e5d0]">
                      {isArabic ? "متابعة ساعات وسجلات العمل، مراقبة حركة التوصيل والأسطول، وضبط كفاءة الموظفين" : "Employee attendance, fleet activity monitoring, operations workflow audit"}
                    </span>
                  </div>
                </>
              )}

              {/* Driver Manager Role */}
              {profile.role === "driver_manager" && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-[#3d3016]">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-sky-400 shrink-0" />
                      <span className="text-xs text-[#a3998b]">{isArabic ? "فريق السائقين المشرف عليهم:" : "Supervised Fleet:"}</span>
                    </div>
                    <span className="text-xs font-bold text-[#f4e5d0]">
                      {isArabic ? "خالد، علي + أسطول شركة BX Arabia للمحافظات" : "Khalid, Ali + BX Arabia for other cities"}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-[#9e8959] shrink-0" />
                      <span className="text-xs text-[#a3998b]">{isArabic ? "الصلاحيات والعمليات:" : "Operations Scope:"}</span>
                    </div>
                    <span className="text-xs text-[#f4e5d0]">
                      {isArabic ? "ترحيل وتعيين المحطات، تسوية عهدة السائقين، متابعة المرتجعات" : "Dispatching, Fleet Routing, Cashbox Reconciliation"}
                    </span>
                  </div>
                </>
              )}

              {/* Driver Role */}
              {profile.role === "driver" && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-[#3d3016]">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="text-xs text-[#a3998b]">{isArabic ? "منطقة العمليات والتوزيع:" : "Delivery Zone:"}</span>
                    </div>
                    <span className="text-xs font-bold text-emerald-400">
                      {isArabic ? "العاصمة عمان ومناطق الوسط" : "Amman & Central Regions"}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-[#9e8959] shrink-0" />
                      <span className="text-xs text-[#a3998b]">{isArabic ? "تحصيل النقدية والدفعات:" : "Payment & Collections:"}</span>
                    </div>
                    <span className="text-xs text-[#f4e5d0]">
                      {isArabic ? "تحصيل كاش (COD)، تأكيد حوالات CliQ، وإغلاق الوردية اليومية" : "COD Cash Collections, CliQ verification, EOD Shift Close"}
                    </span>
                  </div>
                </>
              )}

              {/* Finance Director Role */}
              {profile.role === "finance" && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-[#3d3016]">
                    <div className="flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-purple-400 shrink-0" />
                      <span className="text-xs text-[#a3998b]">{isArabic ? "قسم العمليات المالية:" : "Finance Department:"}</span>
                    </div>
                    <span className="text-xs font-bold text-purple-400">
                      {isArabic ? "الخزينة المركزية، الذمم وتقارير الصندوق" : "Cashbox, Ledgers & Receivables"}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-[#9e8959] shrink-0" />
                      <span className="text-xs text-[#a3998b]">{isArabic ? "الصلاحيات:" : "Finance Scope:"}</span>
                    </div>
                    <span className="text-xs text-[#f4e5d0]">
                      {isArabic ? "مطابقة عهدة السائقين، سندات القبض، وتقارير أرباح المبيعات" : "Reconciliations, Receipts & Financial Audit"}
                    </span>
                  </div>
                </>
              )}

            </div>

            <div className="pt-3 flex justify-end border-t border-[#3d3016]">
              <button
                type="button"
                onClick={closeProfileModal}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#9e8959] to-[#c28a40] text-[#160f02] font-black text-xs shadow-md shadow-[#9e8959]/25 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
              >
                {isArabic ? "إغلاق والعودة" : "Close"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
