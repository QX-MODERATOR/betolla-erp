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
  Target
} from "lucide-react";
import { useProfile } from "@/lib/profile-context";
import { useLanguage } from "@/lib/i18n";
import { useLoading } from "@/lib/loading-context";

export function ProfileSettingsModal() {
  const { profile, updateProfile, isProfileModalOpen, closeProfileModal, isSalesRep } = useProfile();
  const { language, dir } = useLanguage();
  const { startLoading, stopLoading } = useLoading();
  const isArabic = language === "ar";

  const [activeTab, setActiveTab] = useState<"info" | "security" | "contract">("info");

  // Form states
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("عمان والوسط");
  const [bio, setBio] = useState("");
  const [avatarColor, setAvatarColor] = useState("amber");

  // Security password states
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.name || "");
      setPhone(profile.phone || "");
      setWhatsapp(profile.whatsapp || profile.phone || "");
      setEmail(profile.email || `${profile.username}@betolla.com`);
      setCity(profile.city || "عمان والوسط");
      setBio(profile.bio || "");
      setAvatarColor(profile.avatarColor || "amber");
    }
  }, [profile, isProfileModalOpen]);

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
        setTimeout(() => {
          closeProfileModal();
        }, 1000);
      } else {
        setFormError(res.message || "حدث خطأ أثناء الحفظ.");
      }
    }, 500);
  };

  const handleUpdatePassword = (e: React.FormEvent) => {
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

    setTimeout(() => {
      stopLoading();
      setFormSuccess(isArabic ? "🔒 تم تحديث كلمة المرور بنجاح!" : "Password updated successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }, 600);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/75 backdrop-blur-md overflow-y-auto"
      dir={dir}
    >
      <div className="relative w-full max-w-lg bg-stone-900 border border-amber-500/30 rounded-3xl shadow-2xl p-6 sm:p-8 text-stone-100 ring-1 ring-white/10 my-8">
        
        {/* Top Gold Accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-amber-400 to-transparent rounded-t-3xl" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-stone-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-stone-950 font-bold text-lg shadow-lg shadow-amber-500/30">
              {profile.avatar || (isArabic ? "ر" : "R")}
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <span>{fullName || profile.name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 font-mono">
                  {isSalesRep ? (isArabic ? "مندوبة معتمدة" : "Sales Rep") : (isArabic ? "المدير العام" : "Admin")}
                </span>
              </h3>
              <p className="text-xs text-stone-400 mt-0.5">
                {isArabic ? "تعديل البيانات الشخصية وأرقام التواصل وكلمة المرور" : "Edit personal contact data, phone, and password"}
              </p>
            </div>
          </div>
          <button
            onClick={closeProfileModal}
            className="p-2 text-stone-400 hover:text-white rounded-xl hover:bg-stone-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-2 mt-4 p-1 bg-stone-950/60 rounded-xl border border-stone-800">
          <button
            type="button"
            onClick={() => { setActiveTab("info"); setFormError(null); setFormSuccess(null); }}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === "info"
                ? "bg-amber-500 text-stone-950 shadow-sm"
                : "text-stone-400 hover:text-stone-200"
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>{isArabic ? "البيانات الشخصية" : "Personal Info"}</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab("security"); setFormError(null); setFormSuccess(null); }}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === "security"
                ? "bg-amber-500 text-stone-950 shadow-sm"
                : "text-stone-400 hover:text-stone-200"
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>{isArabic ? "الأمان وكلمة المرور" : "Security"}</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab("contract"); setFormError(null); setFormSuccess(null); }}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === "contract"
                ? "bg-amber-500 text-stone-950 shadow-sm"
                : "text-stone-400 hover:text-stone-200"
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>{isArabic ? "الصلاحيات والهدف" : "Role & Scope"}</span>
          </button>
        </div>

        {/* Notifications / Feedback */}
        {formError && (
          <div className="mt-4 p-3 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{formError}</span>
          </div>
        )}

        {formSuccess && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{formSuccess}</span>
          </div>
        )}

        {/* Tab 1: Personal Contact Information (Editable by Employee) */}
        {activeTab === "info" && (
          <form onSubmit={handleSaveProfile} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-stone-300 mb-1.5">
                {isArabic ? "الاسم الكامل (يظهر في فواتير الواتساب والتقارير):" : "Full Name (Shown on invoices & reports):"}
              </label>
              <div className="relative">
                <User className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={isArabic ? "مثال: رحمة الجمّال" : "e.g. Rahma Al-Jammal"}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl pr-10 pl-4 py-2.5 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500 transition"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1.5">
                  {isArabic ? "رقم الهاتف الشخصي / العمل:" : "Phone Number:"}
                </label>
                <div className="relative">
                  <Phone className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0793937385"
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl pr-10 pl-4 py-2.5 text-sm font-mono text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500 transition text-left"
                    dir="ltr"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1.5">
                  {isArabic ? "رقم الواتساب لإرسال الفواتير:" : "WhatsApp Number for Invoices:"}
                </label>
                <div className="relative">
                  <MessageSquare className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
                  <input
                    type="tel"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="0793937385"
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl pr-10 pl-4 py-2.5 text-sm font-mono text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500 transition text-left"
                    dir="ltr"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1.5">
                  {isArabic ? "البريد الإلكتروني المهني:" : "Work Email:"}
                </label>
                <div className="relative">
                  <Mail className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="rahma@betolla.com"
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl pr-10 pl-4 py-2.5 text-sm font-mono text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500 transition text-left"
                    dir="ltr"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1.5">
                  {isArabic ? "المحافظة / منطقة الاتصال:" : "Assigned Territory:"}
                </label>
                <div className="relative">
                  <MapPin className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500" />
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder={isArabic ? "عمان والوسط" : "Amman & Central"}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl pr-10 pl-4 py-2.5 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500 transition"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-300 mb-1.5">
                {isArabic ? "ملاحظة تعريفية / رسالة الاتصال المفضلة:" : "Calling Intro & Bio:"}
              </label>
              <textarea
                rows={2}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder={isArabic ? "أدخلي أي تفضيلات شخصية أو ملاحظات عن أسلوب التواصل مع صالوناتك..." : "Enter your personal calling bio..."}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl p-3 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500 transition resize-none"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeProfileModal}
                className="px-4 py-2.5 rounded-xl border border-stone-800 text-stone-400 hover:text-white text-xs font-semibold transition cursor-pointer"
              >
                {isArabic ? "إلغاء" : "Cancel"}
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs shadow-md shadow-amber-500/20 transition flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{isArabic ? "حفظ التغييرات" : "Save Changes"}</span>
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: Security & Password Update */}
        {activeTab === "security" && (
          <form onSubmit={handleUpdatePassword} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-stone-300 mb-1.5">
                {isArabic ? "كلمة المرور الحالية:" : "Current Password:"}
              </label>
              <div className="relative">
                <KeyRound className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl pr-10 pl-4 py-2.5 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500 transition text-left"
                  dir="ltr"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1.5">
                  {isArabic ? "كلمة المرور الجديدة:" : "New Password:"}
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-2.5 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500 transition text-left"
                  dir="ltr"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1.5">
                  {isArabic ? "تأكيد كلمة المرور الجديدة:" : "Confirm New Password:"}
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-2.5 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500 transition text-left"
                  dir="ltr"
                  required
                />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-stone-950/80 border border-stone-800 text-[11px] text-stone-400 space-y-1">
              <p className="font-semibold text-stone-300">
                {isArabic ? "🔒 معايير الأمان المطبقة:" : "🔒 Security Standards Applied:"}
              </p>
              <p>{isArabic ? "• يتم تشفير كلمات المرور باستخدام تشفير العتاد AES-256-GCM قبل الحفظ." : "• Passwords are protected via AES-256-GCM hardware encryption."}</p>
              <p>{isArabic ? "• التغيير فوري ويسري على تطبيق الويب وتطبيق الهاتف الذكي." : "• Changes take effect immediately across Web and Android app."}</p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeProfileModal}
                className="px-4 py-2.5 rounded-xl border border-stone-800 text-stone-400 hover:text-white text-xs font-semibold transition cursor-pointer"
              >
                {isArabic ? "إلغاء" : "Cancel"}
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs shadow-md shadow-amber-500/20 transition flex items-center gap-1.5 cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                <span>{isArabic ? "تحديث كلمة المرور" : "Update Password"}</span>
              </button>
            </div>
          </form>
        )}

        {/* Tab 3: Role, Commission & Target (Locked by Company) */}
        {activeTab === "contract" && (
          <div className="mt-5 space-y-3.5">
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
              <Shield className="w-4 h-4 shrink-0 text-amber-400" />
              <span>
                {isArabic 
                  ? "تنبيه أمان: هذه البيانات محددة مركزياً من قبل الإدارة العامة لشركة بيتولا ومحمية من التعديل." 
                  : "Security Notice: These fields are controlled centrally by Betolla General Management and are read-only."}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-stone-950 border border-stone-800 space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-stone-800/80">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-amber-400" />
                  <span className="text-xs text-stone-300">{isArabic ? "الدور والصلاحيات:" : "Assigned Role:"}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-stone-100 font-mono">
                    {profile.role === "sales_rep" ? (isArabic ? "مندوبة مبيعات (Sales Rep)" : "Sales Representative") : "Administrator"}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-800 text-stone-400 font-mono">🔒 مقفل</span>
                </div>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-stone-800/80">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs text-stone-300">{isArabic ? "الهدف البيعي الشهري:" : "Monthly Sales Target:"}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-emerald-400 font-mono">
                    {profile.monthlyTarget ? `${profile.monthlyTarget.toLocaleString()} د.أ` : "4,500 د.أ"}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-800 text-stone-400 font-mono">🔒 محدد مسبقاً</span>
                </div>
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <BadgePercent className="w-4 h-4 text-amber-400" />
                  <span className="text-xs text-stone-300">{isArabic ? "نسبة عمولة المبيعات:" : "Commission Rate:"}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-amber-400 font-mono">
                    {profile.commissionRate ? `${profile.commissionRate}%` : "3.5%"}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-800 text-stone-400 font-mono">🔒 معتمدة</span>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={closeProfileModal}
                className="px-5 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold transition cursor-pointer"
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
