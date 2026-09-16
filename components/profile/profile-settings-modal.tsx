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
  Calculator,
  UserCog,
  Users
} from "lucide-react";
import { useProfile, UserProfile } from "@/lib/profile-context";
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

// Built from the live profile roster (allProfiles), never hardcoded — a
// hand-maintained duplicate list here is exactly what silently drifted out of
// sync with lib/auth.ts's usernames before and broke this whole selector.
const EMPLOYEE_GROUP_ORDER: { role: UserProfile["role"]; groupAr: string; groupEn: string }[] = [
  { role: "sales_rep", groupAr: "فريق المبيعات", groupEn: "Sales Team" },
  { role: "sales_manager", groupAr: "فريق المبيعات", groupEn: "Sales Team" },
  { role: "driver_manager", groupAr: "أسطول وسائقي التوصيل", groupEn: "Fleet & Drivers" },
  { role: "driver", groupAr: "أسطول وسائقي التوصيل", groupEn: "Fleet & Drivers" },
  { role: "admin", groupAr: "الإدارة والمكاتب المركزية", groupEn: "HQ & Administration" },
  { role: "general_manager", groupAr: "الإدارة والمكاتب المركزية", groupEn: "HQ & Administration" },
  { role: "finance", groupAr: "الإدارة والمكاتب المركزية", groupEn: "HQ & Administration" },
  { role: "hr_operations", groupAr: "الإدارة والمكاتب المركزية", groupEn: "HQ & Administration" },
  { role: "marketing_manager", groupAr: "الإدارة والمكاتب المركزية", groupEn: "HQ & Administration" },
  { role: "marketing", groupAr: "الإدارة والمكاتب المركزية", groupEn: "HQ & Administration" },
];

function buildEmployeeGroups(allProfiles: Record<string, UserProfile>) {
  const groups: { groupAr: string; groupEn: string; items: UserProfile[] }[] = [];
  for (const { role, groupAr, groupEn } of EMPLOYEE_GROUP_ORDER) {
    let group = groups.find((g) => g.groupAr === groupAr);
    if (!group) {
      group = { groupAr, groupEn, items: [] };
      groups.push(group);
    }
    for (const p of Object.values(allProfiles)) {
      if (p.role === role) group.items.push(p);
    }
  }
  return groups.filter((g) => g.items.length > 0);
}

export function ProfileSettingsModal() {
  const { 
    profile, 
    allProfiles,
    updateProfile, 
    isProfileModalOpen, 
    closeProfileModal, 
    switchProfile,
    isAdmin,
    targetEditUser
  } = useProfile();

  const { language, dir, toggleLanguage, setLanguage } = useLanguage();
  const { startLoading, stopLoading } = useLoading();
  const { showToast } = useToast();
  const isArabic = language === "ar";

  const [activeTab, setActiveTab] = useState<"info" | "security" | "contract">("info");

  // Form states — selectedUser holds a stable profile id (see lib/profile-store.ts), not a username.
  const [selectedUser, setSelectedUser] = useState<string>("admin-betolla-01");
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

  // Sync active user when modal opens or target changes
  useEffect(() => {
    if (isProfileModalOpen) {
      const active = targetEditUser || profile?.id || "admin-betolla-01";
      setSelectedUser(active);
    }
  }, [isProfileModalOpen, targetEditUser, profile?.id]);

  // Sync form values whenever the active profile or selectedUser changes
  useEffect(() => {
    const currentTarget = allProfiles[selectedUser] || profile;
    if (currentTarget) {
      setFullName(currentTarget.name || "");
      setPhone(currentTarget.phone || "");
      setWhatsapp(currentTarget.whatsapp || currentTarget.phone || "");
      setEmail(currentTarget.email || `${currentTarget.username}@betolla.com`);
      setCity(currentTarget.city || (isArabic ? "عمان والوسط" : "Amman & Central"));
      setBio(currentTarget.bio || "");
      setAvatarColor(currentTarget.avatarColor || "gold");
    }
  }, [selectedUser, profile, allProfiles, isArabic]);

  if (!isProfileModalOpen || !profile) return null;

  const currentViewingProfile = allProfiles[selectedUser] || profile;

  const handleSelectUser = (id: string) => {
    setSelectedUser(id);
    switchProfile(id);
    setFormError(null);
    setFormSuccess(null);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
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

    try {
      const res = await updateProfile(
        {
          name: fullName.trim(),
          phone: phone.trim(),
          whatsapp: whatsapp.trim() || phone.trim(),
          email: email.trim(),
          city: city.trim(),
          bio: bio.trim(),
          avatarColor,
        },
        selectedUser
      );

      stopLoading();

      if (res.success) {
        const successMsg = isArabic
          ? `🎉 تم حفظ وتحديث بيانات ${fullName.trim()} بنجاح في النظام!`
          : `Profile for ${fullName.trim()} updated successfully!`;
        setFormSuccess(successMsg);
        showToast(successMsg, "success");
        setTimeout(() => {
          closeProfileModal();
        }, 850);
      } else {
        setFormError(res.message || (isArabic ? "حدث خطأ أثناء الحفظ." : "Save failed."));
        showToast(res.message || "حدث خطأ أثناء الحفظ", "error");
      }
    } catch (err: any) {
      stopLoading();
      setFormError(err.message || "فشل الاتصال بالخادم لحفظ البيانات.");
    }
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
      setFormError(
        isArabic
          ? "كلمة المرور الجديدة يجب أن تكون 6 أحرف أو أرقام على الأقل."
          : "New password must be at least 6 characters."
      );
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
          username: currentViewingProfile.username,
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

  const currentAvatar = currentViewingProfile.avatar || (fullName ? fullName.charAt(0) : isArabic ? "م" : "U");

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeProfileModal();
      }}
      className="fixed inset-0 z-[9990] flex items-center justify-center p-2.5 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto no-scrollbar hide-scrollbar animate-backdropFadeIn"
      dir={dir}
    >
      <div className="relative w-full max-w-lg sm:max-w-xl bg-gradient-to-b from-[#160f02] via-[#1d1405] to-[#160f02] border border-[#554625] rounded-2xl sm:rounded-3xl shadow-2xl shadow-black/90 p-3.5 sm:p-6 text-[#f4e5d0] ring-1 ring-[#9e8959]/25 my-auto max-h-[94vh] sm:max-h-[90vh] flex flex-col no-scrollbar hide-scrollbar animate-modalSlideUp">
        
        {/* Ambient Gold Orbs */}
        <div className="absolute w-60 h-60 sm:w-72 sm:h-72 bg-[#9e8959]/10 rounded-full blur-3xl pointer-events-none -top-10 -right-10" />
        <div className="absolute w-60 h-60 sm:w-72 sm:h-72 bg-[#c28a40]/10 rounded-full blur-3xl pointer-events-none -bottom-10 -left-10" />

        {/* Top Gold Accent Bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#9e8959] to-transparent rounded-t-2xl sm:rounded-t-3xl" />

        {/* Modal Header */}
        <div className="flex items-center justify-between gap-2.5 pb-3 sm:pb-3.5 border-b border-[#3d3016] shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-[#9e8959] via-[#c28a40] to-[#7d6534] text-[#160f02] flex items-center justify-center font-black text-base sm:text-xl shadow-md shrink-0 ring-2 ring-[#554625]/60">
              {currentAvatar}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="text-sm sm:text-base font-black text-white truncate max-w-[150px] sm:max-w-[200px]">
                  {fullName || currentViewingProfile.name}
                </h3>
                <span className="text-[9px] sm:text-[10px] px-2 py-0.5 rounded-full bg-[#241a08] text-[#cbb588] border border-[#554625] font-semibold shrink-0">
                  {getRoleBadge(currentViewingProfile.role, isArabic)}
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-[#a3998b] truncate mt-0.5">
                {isArabic ? "تعديل البيانات، رقم الهاتف وكلمة المرور" : "Edit profile data, phone & password"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Direct Language Switcher in Modal Header */}
            <button
              type="button"
              onClick={toggleLanguage}
              title={isArabic ? "Switch to English" : "التحويل إلى العربية"}
              className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-xl border border-[#554625] bg-[#241a08] hover:bg-[#35270e] hover:border-[#9e8959] text-[#f4e5d0] text-[11px] sm:text-xs font-bold transition shadow-xs cursor-pointer active:scale-95"
            >
              <Globe className="w-3.5 h-3.5 text-[#9e8959] shrink-0" />
              <span>{isArabic ? "EN" : "عربي"}</span>
            </button>

            <button
              onClick={closeProfileModal}
              aria-label={isArabic ? "إغلاق النافذة" : "Close modal"}
              className="p-1.5 text-[#a3998b] hover:text-[#f4e5d0] rounded-xl hover:bg-[#281c08] border border-transparent hover:border-[#3d3016] transition cursor-pointer active:scale-95 shrink-0"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Admin Employee Selector (Visible when Admin or General Manager opens settings) */}
        {isAdmin && (
          <div className="mt-2.5 p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-[#241a08] border border-[#554625] flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Users className="w-4 h-4 text-[#9e8959] shrink-0" />
              <div className="min-w-0">
                <span className="text-xs font-bold text-white block truncate">
                  {isArabic ? "تحديد حساب الموظف للتعديل:" : "Select Employee to Edit:"}
                </span>
                <span className="text-[10px] text-[#cbb588]/80 block truncate">
                  {isArabic ? "بصفتك مديراً، يمكنك مراجعة وتحديث أرقام هواتف وبيانات أي موظف" : "As admin, you can edit any employee contact info"}
                </span>
              </div>
            </div>

            <select
              value={selectedUser}
              onChange={(e) => handleSelectUser(e.target.value)}
              className="w-full sm:w-auto bg-[#120c02] border border-[#554625] text-[#f4e5d0] rounded-xl text-xs font-bold px-3 py-1.5 focus:outline-none focus:border-[#9e8959] cursor-pointer"
            >
              {buildEmployeeGroups(allProfiles).map((group, gIdx) => (
                <optgroup key={gIdx} label={isArabic ? group.groupAr : group.groupEn}>
                  {group.items.map((emp) => (
                    <option key={emp.id} value={emp.id} className="bg-[#160f02] text-[#f4e5d0]">
                      {emp.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        )}

        {/* Fully Responsive Navigation Tabs ("options") */}
        <div className="flex gap-1 sm:gap-1.5 mt-3 p-1 sm:p-1.5 bg-[#120c02] rounded-xl sm:rounded-2xl border border-[#3d3016] shrink-0">
          <button
            type="button"
            onClick={() => { setActiveTab("info"); setFormError(null); setFormSuccess(null); }}
            className={`flex-1 py-2 px-1 sm:px-2 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold transition flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer active:scale-95 ${
              activeTab === "info"
                ? "bg-gradient-to-r from-[#9e8959] via-[#b39c68] to-[#c28a40] text-[#160f02] font-black shadow-md shadow-[#9e8959]/25"
                : "text-[#a3998b] hover:text-[#f4e5d0] hover:bg-[#1a1204]"
            }`}
          >
            <User className="w-3.5 h-3.5 shrink-0" />
            <span className="inline sm:hidden">{isArabic ? "البيانات" : "Info"}</span>
            <span className="hidden sm:inline">{isArabic ? "البيانات الشخصية" : "Personal Info"}</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab("security"); setFormError(null); setFormSuccess(null); }}
            className={`flex-1 py-2 px-1 sm:px-2 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold transition flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer active:scale-95 ${
              activeTab === "security"
                ? "bg-gradient-to-r from-[#9e8959] via-[#b39c68] to-[#c28a40] text-[#160f02] font-black shadow-md shadow-[#9e8959]/25"
                : "text-[#a3998b] hover:text-[#f4e5d0] hover:bg-[#1a1204]"
            }`}
          >
            <KeyRound className="w-3.5 h-3.5 shrink-0" />
            <span className="inline sm:hidden">{isArabic ? "كلمة المرور" : "Password"}</span>
            <span className="hidden sm:inline">{isArabic ? "الأمان وكلمة المرور" : "Security"}</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab("contract"); setFormError(null); setFormSuccess(null); }}
            className={`flex-1 py-2 px-1 sm:px-2 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold transition flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer active:scale-95 ${
              activeTab === "contract"
                ? "bg-gradient-to-r from-[#9e8959] via-[#b39c68] to-[#c28a40] text-[#160f02] font-black shadow-md shadow-[#9e8959]/25"
                : "text-[#a3998b] hover:text-[#f4e5d0] hover:bg-[#1a1204]"
            }`}
          >
            <Shield className="w-3.5 h-3.5 shrink-0" />
            <span className="inline sm:hidden">{isArabic ? "الصلاحيات" : "Scope"}</span>
            <span className="hidden sm:inline">{isArabic ? "الصلاحيات والمهام" : "Role & Scope"}</span>
          </button>
        </div>

        {/* Feedback Notifications */}
        {formError && (
          <div className="mt-2.5 p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2 shrink-0 animate-fadeIn">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span className="leading-snug">{formError}</span>
          </div>
        )}

        {formSuccess && (
          <div className="mt-2.5 p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2 shrink-0 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span className="leading-snug">{formSuccess}</span>
          </div>
        )}

        {/* Tab 1: Personal Contact Information ("profile info") */}
        {activeTab === "info" && (
          <form onSubmit={handleSaveProfile} className="mt-3 overflow-y-auto flex-1 pr-1 pl-1 space-y-3 sm:space-y-3.5 no-scrollbar hide-scrollbar overscroll-contain">
            <div>
              <label className="block text-xs font-bold text-[#f4e5d0] mb-1">
                {isArabic ? "الاسم الكامل (يظهر في فواتير الواتساب والتقارير):" : "Full Name:"}
              </label>
              <div className="relative">
                <div className={`absolute ${dir === "rtl" ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 pointer-events-none text-[#9e8959]`}>
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={isArabic ? "مثال: حنان (مبيعات)" : "e.g. Hanan (Sales)"}
                  className={`w-full bg-[#120c02] border border-[#3d3016] rounded-xl ${
                    dir === "rtl" ? "pr-9 pl-3" : "pl-9 pr-3"
                  } py-2 sm:py-2.5 text-xs sm:text-sm text-[#f4e5d0] placeholder-[#6b655d] focus:outline-none focus:border-[#9e8959] focus:ring-1 focus:ring-[#9e8959]/30 transition`}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
              <div>
                <label className="block text-xs font-bold text-[#f4e5d0] mb-1">
                  {isArabic ? "رقم الهاتف للتواصل والطلبيات:" : "Phone Number:"}
                </label>
                <div className="relative">
                  <div className={`absolute ${dir === "rtl" ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 pointer-events-none text-[#9e8959]`}>
                    <Phone className="w-4 h-4" />
                  </div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0790000000"
                    className={`w-full bg-[#120c02] border border-[#3d3016] rounded-xl ${
                      dir === "rtl" ? "pr-9 pl-3" : "pl-9 pr-3"
                    } py-2 sm:py-2.5 text-xs sm:text-sm font-mono text-[#f4e5d0] placeholder-[#6b655d] focus:outline-none focus:border-[#9e8959] focus:ring-1 focus:ring-[#9e8959]/30 transition text-left`}
                    dir="ltr"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#f4e5d0] mb-1">
                  {isArabic ? "رقم الواتساب لإرسال الفواتير:" : "WhatsApp Number:"}
                </label>
                <div className="relative">
                  <div className={`absolute ${dir === "rtl" ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 pointer-events-none text-emerald-400`}>
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <input
                    type="tel"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="0790000000"
                    className={`w-full bg-[#120c02] border border-[#3d3016] rounded-xl ${
                      dir === "rtl" ? "pr-9 pl-3" : "pl-9 pr-3"
                    } py-2 sm:py-2.5 text-xs sm:text-sm font-mono text-[#f4e5d0] placeholder-[#6b655d] focus:outline-none focus:border-[#9e8959] focus:ring-1 focus:ring-[#9e8959]/30 transition text-left`}
                    dir="ltr"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
              <div>
                <label className="block text-xs font-bold text-[#f4e5d0] mb-1">
                  {isArabic ? "البريد الإلكتروني المهني:" : "Work Email:"}
                </label>
                <div className="relative">
                  <div className={`absolute ${dir === "rtl" ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 pointer-events-none text-[#9e8959]`}>
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@betolla.com"
                    className={`w-full bg-[#120c02] border border-[#3d3016] rounded-xl ${
                      dir === "rtl" ? "pr-9 pl-3" : "pl-9 pr-3"
                    } py-2 sm:py-2.5 text-xs sm:text-sm font-mono text-[#f4e5d0] placeholder-[#6b655d] focus:outline-none focus:border-[#9e8959] focus:ring-1 focus:ring-[#9e8959]/30 transition text-left`}
                    dir="ltr"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#f4e5d0] mb-1">
                  {isArabic ? "المحافظة / منطقة العمل:" : "Assigned City:"}
                </label>
                <div className="relative">
                  <div className={`absolute ${dir === "rtl" ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 pointer-events-none text-[#c28a40]`}>
                    <MapPin className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder={isArabic ? "عمان والوسط" : "Amman & Central"}
                    className={`w-full bg-[#120c02] border border-[#3d3016] rounded-xl ${
                      dir === "rtl" ? "pr-9 pl-3" : "pl-9 pr-3"
                    } py-2 sm:py-2.5 text-xs sm:text-sm text-[#f4e5d0] placeholder-[#6b655d] focus:outline-none focus:border-[#9e8959] focus:ring-1 focus:ring-[#9e8959]/30 transition`}
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#f4e5d0] mb-1">
                {isArabic ? "ملاحظة تعريفية / رسالة الاتصال المفضلة:" : "Bio & Calling Notes:"}
              </label>
              <textarea
                rows={2}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder={isArabic ? "أدخلي أي تفضيلات شخصية أو ملاحظات عن أسلوب التواصل..." : "Personal bio..."}
                className="w-full bg-[#120c02] border border-[#3d3016] rounded-xl p-2.5 text-xs text-[#f4e5d0] placeholder-[#6b655d] focus:outline-none focus:border-[#9e8959] focus:ring-1 focus:ring-[#9e8959]/30 transition resize-none leading-relaxed"
              />
            </div>

            {/* Language Preference Card */}
            <div className="p-3 bg-[#120c02] rounded-xl sm:rounded-2xl border border-[#3d3016] space-y-2">
              <div className="flex items-center justify-between gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-[#f4e5d0] flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-[#9e8959]" />
                  <span>{isArabic ? "لغة واجهة النظام:" : "System Language:"}</span>
                </span>
                <span className="text-[10px] text-[#a3998b] font-mono">
                  {isArabic ? "تنعكس فوراً على كامل النظام" : "Instant across ERP"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => setLanguage("ar")}
                  className={`py-2 px-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer border active:scale-95 ${
                    isArabic
                      ? "bg-gradient-to-r from-[#9e8959] to-[#c28a40] text-[#160f02] border-[#9e8959] shadow-xs font-black"
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
                  className={`py-2 px-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer border active:scale-95 ${
                    !isArabic
                      ? "bg-gradient-to-r from-[#9e8959] to-[#c28a40] text-[#160f02] border-[#9e8959] shadow-xs font-black"
                      : "bg-[#1a1204] text-[#a3998b] border-[#3d3016] hover:text-[#f4e5d0] hover:border-[#554625]"
                  }`}
                >
                  <span className="text-sm">🇬🇧</span>
                  <span>English</span>
                  {!isArabic && <Check className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Action Buttons: Responsive for Mobile */}
            <div className="pt-2.5 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 border-t border-[#3d3016] shrink-0">
              <button
                type="button"
                onClick={closeProfileModal}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-[#3d3016] bg-[#1a1204] text-[#a3998b] hover:text-white hover:bg-[#251b09] text-xs font-semibold transition cursor-pointer active:scale-95 text-center"
              >
                {isArabic ? "إلغاء" : "Cancel"}
              </button>
              <button
                type="submit"
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#9e8959] via-[#b39c68] to-[#c28a40] text-[#160f02] font-black text-xs shadow-lg shadow-[#9e8959]/25 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{isArabic ? "حفظ التغييرات" : "Save Changes"}</span>
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: Security & Password Update ("change password") */}
        {activeTab === "security" && (
          <form onSubmit={handleUpdatePassword} className="mt-3 overflow-y-auto flex-1 pr-1 pl-1 space-y-3 sm:space-y-3.5 no-scrollbar hide-scrollbar overscroll-contain">
            <div>
              <label className="block text-xs font-bold text-[#f4e5d0] mb-1">
                {isArabic ? "كلمة المرور الحالية:" : "Current Password:"}
              </label>
              <div className="relative">
                <div className={`absolute ${dir === "rtl" ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 pointer-events-none text-[#9e8959]`}>
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`w-full bg-[#120c02] border border-[#3d3016] rounded-xl ${
                    dir === "rtl" ? "pr-9 pl-9" : "pl-9 pr-9"
                  } py-2 sm:py-2.5 text-xs sm:text-sm text-[#f4e5d0] placeholder-[#6b655d] focus:outline-none focus:border-[#9e8959] focus:ring-1 focus:ring-[#9e8959]/30 transition text-left`}
                  dir="ltr"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className={`absolute ${dir === "rtl" ? "left-2.5" : "right-2.5"} top-1/2 -translate-y-1/2 text-[#a3998b] hover:text-[#f4e5d0] cursor-pointer p-1`}
                >
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
              <div>
                <label className="block text-xs font-bold text-[#f4e5d0] mb-1">
                  {isArabic ? "كلمة المرور الجديدة:" : "New Password:"}
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#120c02] border border-[#3d3016] rounded-xl px-3 py-2 sm:py-2.5 pr-9 text-xs sm:text-sm text-[#f4e5d0] placeholder-[#6b655d] focus:outline-none focus:border-[#9e8959] focus:ring-1 focus:ring-[#9e8959]/30 transition text-left"
                    dir="ltr"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#a3998b] hover:text-[#f4e5d0] cursor-pointer p-1"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#f4e5d0] mb-1">
                  {isArabic ? "تأكيد كلمة المرور الجديدة:" : "Confirm New Password:"}
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#120c02] border border-[#3d3016] rounded-xl px-3 py-2 sm:py-2.5 pr-9 text-xs sm:text-sm text-[#f4e5d0] placeholder-[#6b655d] focus:outline-none focus:border-[#9e8959] focus:ring-1 focus:ring-[#9e8959]/30 transition text-left"
                    dir="ltr"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#a3998b] hover:text-[#f4e5d0] cursor-pointer p-1"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl sm:rounded-2xl bg-[#120c02] border border-[#3d3016] text-[11px] text-[#a3998b] space-y-1">
              <p className="font-bold text-[#f4e5d0] flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-[#9e8959]" />
                <span>{isArabic ? "معايير الأمان والحماية:" : "Security Specifications:"}</span>
              </p>
              <p>{isArabic ? "• تشفير فوري وحماية متقدمة AES-256-GCM قبل الحفظ في قواعد البيانات." : "• Instant AES-256-GCM encryption before saving."}</p>
              <p>{isArabic ? "• التحديث فوري ويسري مباشرة على منصة الويب وتطبيق الهاتف الذكي (APK)." : "• Effective immediately across Web and Android APK."}</p>
            </div>

            {/* Action Buttons: Responsive for Mobile */}
            <div className="pt-2.5 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 border-t border-[#3d3016] shrink-0">
              <button
                type="button"
                onClick={closeProfileModal}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-[#3d3016] bg-[#1a1204] text-[#a3998b] hover:text-white hover:bg-[#251b09] text-xs font-semibold transition cursor-pointer active:scale-95 text-center"
              >
                {isArabic ? "إلغاء" : "Cancel"}
              </button>
              <button
                type="submit"
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#9e8959] via-[#b39c68] to-[#c28a40] text-[#160f02] font-black text-xs shadow-lg shadow-[#9e8959]/25 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                <span>{isArabic ? "تحديث كلمة المرور" : "Update Password"}</span>
              </button>
            </div>
          </form>
        )}

        {/* Tab 3: Role, Commission & Target ("role info") */}
        {activeTab === "contract" && (
          <div className="mt-3 overflow-y-auto flex-1 pr-1 pl-1 space-y-3 sm:space-y-3.5 no-scrollbar hide-scrollbar overscroll-contain">
            <div className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-[#241a08] border border-[#554625]/60 text-[#cbb588] text-xs flex items-center gap-2">
              <Shield className="w-4 h-4 shrink-0 text-[#9e8959]" />
              <span className="leading-snug">
                {isArabic 
                  ? "تنبيه رسمي: هذه الصلاحيات والمهام محددة مركزياً ومحمية من قبل الإدارة العامة لشركة بيتولا." 
                  : "Official: Roles and permissions are centrally controlled by Betolla Management."}
              </span>
            </div>

            <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-[#120c02] border border-[#3d3016] space-y-2.5">
              
              {/* Role Badge Row */}
              <div className="py-2 border-b border-[#3d3016] flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                <div className="flex items-center gap-2 text-xs text-[#a3998b] shrink-0">
                  <Shield className="w-4 h-4 text-[#9e8959] shrink-0" />
                  <span>{isArabic ? "الدور والصلاحيات:" : "Assigned Role:"}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-white font-mono">
                    {getRoleBadge(currentViewingProfile.role, isArabic)}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#241a08] text-[#cbb588] border border-[#554625] font-mono shrink-0">
                    {isArabic ? "🔒 معتمد" : "🔒 Verified"}
                  </span>
                </div>
              </div>

              {/* General Manager Role */}
              {currentViewingProfile.role === "general_manager" && (
                <>
                  <div className="py-2 border-b border-[#3d3016] flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                    <div className="flex items-center gap-2 text-xs text-[#a3998b] shrink-0">
                      <Crown className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>{isArabic ? "الموقع القيادي:" : "Leadership Level:"}</span>
                    </div>
                    <span className="text-xs font-bold text-amber-300 sm:text-right">
                      {isArabic ? "القيادة التنفيذية العليا للشركة" : "Executive General Management"}
                    </span>
                  </div>

                  <div className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                    <div className="flex items-center gap-2 text-xs text-[#a3998b] shrink-0">
                      <Briefcase className="w-4 h-4 text-[#c28a40] shrink-0" />
                      <span>{isArabic ? "نطاق الإشراف والتقارير:" : "Executive Scope:"}</span>
                    </div>
                    <span className="text-xs text-[#f4e5d0] leading-relaxed sm:text-right">
                      {isArabic ? "إشراف شامل على المبيعات، التسويق، العمليات اللوجستية، والمحاسبة" : "Comprehensive oversight"}
                    </span>
                  </div>
                </>
              )}

              {/* IT Admin Role */}
              {currentViewingProfile.role === "admin" && (
                <>
                  <div className="py-2 border-b border-[#3d3016] flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                    <div className="flex items-center gap-2 text-xs text-[#a3998b] shrink-0">
                      <Crown className="w-4 h-4 text-[#9e8959] shrink-0" />
                      <span>{isArabic ? "مستوى الوصول التقني:" : "Technical Access:"}</span>
                    </div>
                    <span className="text-xs font-bold text-[#cbb588] sm:text-right">
                      {isArabic ? "مسؤول النظام والـ IT (System Administrator)" : "Root System Administrator"}
                    </span>
                  </div>

                  <div className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                    <div className="flex items-center gap-2 text-xs text-[#a3998b] shrink-0">
                      <Briefcase className="w-4 h-4 text-[#c28a40] shrink-0" />
                      <span>{isArabic ? "المهام التقنية:" : "Technical Scope:"}</span>
                    </div>
                    <span className="text-xs text-[#f4e5d0] leading-relaxed sm:text-right">
                      {isArabic ? "إدارة الخوادم، التشفير والأمان، النسخ الاحتياطي، وإعدادات النظام" : "Server, backup & system configs"}
                    </span>
                  </div>
                </>
              )}

              {/* Sales Manager Role */}
              {currentViewingProfile.role === "sales_manager" && (
                <>
                  <div className="py-2 border-b border-[#3d3016] flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                    <div className="flex items-center gap-2 text-xs text-[#a3998b] shrink-0">
                      <Target className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{isArabic ? "المستهدف البيعي للفريق:" : "Team Sales Target:"}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-emerald-400 font-mono">
                        {currentViewingProfile.monthlyTarget ? `${currentViewingProfile.monthlyTarget.toLocaleString()} ${isArabic ? "د.أ" : "JD"}` : (isArabic ? "25,000 د.أ" : "25,000 JD")}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#241a08] text-emerald-400 border border-emerald-500/30 font-mono shrink-0">
                        {isArabic ? "شهري" : "Monthly"}
                      </span>
                    </div>
                  </div>

                  <div className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                    <div className="flex items-center gap-2 text-xs text-[#a3998b] shrink-0">
                      <Briefcase className="w-4 h-4 text-[#c28a40] shrink-0" />
                      <span>{isArabic ? "الصلاحيات الإدارية:" : "Management Scope:"}</span>
                    </div>
                    <span className="text-xs text-[#f4e5d0] leading-relaxed sm:text-right">
                      {isArabic ? "إدارة ومتابعة فريق المبيعات، اعتماد الفواتير والعروض، ومراقبة أداء المندوبين" : "Sales reps audit, targets & discounts"}
                    </span>
                  </div>
                </>
              )}

              {/* Sales Rep Role */}
              {currentViewingProfile.role === "sales_rep" && (
                <>
                  <div className="py-2 border-b border-[#3d3016] flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                    <div className="flex items-center gap-2 text-xs text-[#a3998b] shrink-0">
                      <Target className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{isArabic ? "الهدف البيعي الشهري:" : "Monthly Sales Target:"}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-emerald-400 font-mono">
                        {currentViewingProfile.monthlyTarget ? `${currentViewingProfile.monthlyTarget.toLocaleString()} ${isArabic ? "د.أ" : "JD"}` : (isArabic ? "4,500 د.أ" : "4,500 JD")}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#241a08] text-emerald-400 border border-emerald-500/30 font-mono shrink-0">
                        {isArabic ? "شهري" : "Monthly"}
                      </span>
                    </div>
                  </div>

                  <div className="py-2 border-b border-[#3d3016] flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                    <div className="flex items-center gap-2 text-xs text-[#a3998b] shrink-0">
                      <BadgePercent className="w-4 h-4 text-[#9e8959] shrink-0" />
                      <span>{isArabic ? "نسبة عمولة المبيعات:" : "Commission Rate:"}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-[#cbb588] font-mono">
                        {currentViewingProfile.commissionRate ? `${currentViewingProfile.commissionRate}%` : "3.0%"}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#241a08] text-[#cbb588] border border-[#554625] font-mono shrink-0">
                        {isArabic ? "معتمدة" : "Active"}
                      </span>
                    </div>
                  </div>

                  <div className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                    <div className="flex items-center gap-2 text-xs text-[#a3998b] shrink-0">
                      <Briefcase className="w-4 h-4 text-[#c28a40] shrink-0" />
                      <span>{isArabic ? "نطاق الصلاحيات:" : "Work Scope:"}</span>
                    </div>
                    <span className="text-xs text-[#f4e5d0] leading-relaxed sm:text-right">
                      {isArabic ? "سجل العملاء، جدول الاتصالات، إصدار الفواتير، وعروض الأسعار" : "CRM, Calls, Orders & Invoices"}
                    </span>
                  </div>
                </>
              )}

              {/* Marketing Roles */}
              {(currentViewingProfile.role === "marketing" || currentViewingProfile.role === "marketing_manager") && (
                <>
                  <div className="py-2 border-b border-[#3d3016] flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                    <div className="flex items-center gap-2 text-xs text-[#a3998b] shrink-0">
                      <Sparkles className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{isArabic ? "المهام التسويقية:" : "Marketing Operations:"}</span>
                    </div>
                    <span className="text-xs font-bold text-rose-400 sm:text-right">
                      {isArabic ? "إدارة الليدات، الإعلانات، والمحتوى" : "Leads Flow & Campaigns"}
                    </span>
                  </div>

                  <div className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                    <div className="flex items-center gap-2 text-xs text-[#a3998b] shrink-0">
                      <Briefcase className="w-4 h-4 text-[#c28a40] shrink-0" />
                      <span>{isArabic ? "نطاق الوصول:" : "Role Scope:"}</span>
                    </div>
                    <span className="text-xs text-[#f4e5d0] leading-relaxed sm:text-right">
                      {isArabic ? "قاعدة بيانات العملاء، تصنيف الاهتمامات، وتغذية فريق المبيعات" : "CRM Leads, Classification & Allocation"}
                    </span>
                  </div>
                </>
              )}

              {/* Driver & Driver Manager Roles */}
              {(currentViewingProfile.role === "driver" || currentViewingProfile.role === "driver_manager") && (
                <>
                  <div className="py-2 border-b border-[#3d3016] flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                    <div className="flex items-center gap-2 text-xs text-[#a3998b] shrink-0">
                      <Truck className="w-4 h-4 text-sky-400 shrink-0" />
                      <span>{isArabic ? "منطقة العمليات والتوزيع:" : "Delivery Zone:"}</span>
                    </div>
                    <span className="text-xs font-bold text-sky-400 sm:text-right">
                      {isArabic ? "العاصمة عمان ومناطق الوسط والمحافظات" : "Amman & Central Jordan"}
                    </span>
                  </div>

                  <div className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                    <div className="flex items-center gap-2 text-xs text-[#a3998b] shrink-0">
                      <Calculator className="w-4 h-4 text-[#9e8959] shrink-0" />
                      <span>{isArabic ? "تحصيل النقدية والعهد:" : "Cashbox & Collections:"}</span>
                    </div>
                    <span className="text-xs text-[#f4e5d0] leading-relaxed sm:text-right">
                      {isArabic ? "تحصيل الدفعات كاش (COD)، تأكيد CliQ، وتسوية العهدة" : "COD Cash, CliQ verification & dispatch"}
                    </span>
                  </div>
                </>
              )}

              {/* Finance Role */}
              {currentViewingProfile.role === "finance" && (
                <>
                  <div className="py-2 border-b border-[#3d3016] flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                    <div className="flex items-center gap-2 text-xs text-[#a3998b] shrink-0">
                      <Calculator className="w-4 h-4 text-purple-400 shrink-0" />
                      <span>{isArabic ? "قسم العمليات المالية:" : "Finance Operations:"}</span>
                    </div>
                    <span className="text-xs font-bold text-purple-400 sm:text-right">
                      {isArabic ? "الخزينة المركزية، الذمم وتقارير الصندوق" : "Treasury, Cash & Receivables"}
                    </span>
                  </div>

                  <div className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                    <div className="flex items-center gap-2 text-xs text-[#a3998b] shrink-0">
                      <Target className="w-4 h-4 text-[#9e8959] shrink-0" />
                      <span>{isArabic ? "الصلاحيات:" : "Finance Scope:"}</span>
                    </div>
                    <span className="text-xs text-[#f4e5d0] leading-relaxed sm:text-right">
                      {isArabic ? "مطابقة عهدة السائقين، سندات القبض، والتقارير المالية" : "Reconciliation & Financial Audit"}
                    </span>
                  </div>
                </>
              )}

              {/* HR Role */}
              {currentViewingProfile.role === "hr_operations" && (
                <>
                  <div className="py-2 border-b border-[#3d3016] flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                    <div className="flex items-center gap-2 text-xs text-[#a3998b] shrink-0">
                      <Shield className="w-4 h-4 text-purple-400 shrink-0" />
                      <span>{isArabic ? "المجال الإداري والتشغيلي:" : "HR & Operations:"}</span>
                    </div>
                    <span className="text-xs font-bold text-purple-400 sm:text-right">
                      {isArabic ? "الموارد البشرية، ضبط الجودة، والعمليات" : "HR Management & Ops Quality"}
                    </span>
                  </div>

                  <div className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                    <div className="flex items-center gap-2 text-xs text-[#a3998b] shrink-0">
                      <Briefcase className="w-4 h-4 text-[#c28a40] shrink-0" />
                      <span>{isArabic ? "الصلاحيات المعتمدة:" : "Operational Scope:"}</span>
                    </div>
                    <span className="text-xs text-[#f4e5d0] leading-relaxed sm:text-right">
                      {isArabic ? "متابعة سجلات العمل، كفاءة الموظفين، وضبط العمليات" : "Attendance, efficiency & operations"}
                    </span>
                  </div>
                </>
              )}

            </div>

            {/* Close Button: Responsive */}
            <div className="pt-2.5 flex justify-end border-t border-[#3d3016] shrink-0">
              <button
                type="button"
                onClick={closeProfileModal}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#9e8959] to-[#c28a40] text-[#160f02] font-black text-xs shadow-md shadow-[#9e8959]/25 hover:brightness-110 active:scale-95 transition-all cursor-pointer text-center"
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
