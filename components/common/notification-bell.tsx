"use client";

import { useState, useRef, useEffect } from "react";
import { Bell, Check, ExternalLink, Sparkles, Phone, ShieldCheck, X, Volume2 } from "lucide-react";
import { useNotifications, AppNotification } from "@/lib/notification-context";
import { useLanguage } from "@/lib/i18n";
import { useRouter } from "next/navigation";

export function NotificationBell() {
  const router = useRouter();
  const { language, dir } = useLanguage();
  const isArabic = language === "ar";

  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    hasPermission,
    permissionStatus,
    requestPermission,
  } = useNotifications();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click (desktop)
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleNotificationClick = async (notif: AppNotification) => {
    if (!notif.read) {
      await markAsRead(notif.id);
    }
    setIsOpen(false);
    if (notif.link) {
      router.push(notif.link);
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString(isArabic ? "ar-JO" : "en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl border border-[#e8dfcf] hover:border-[#9e8959] bg-white/80 hover:bg-[#f0e6d6]/60 text-[#2b2926] transition-all cursor-pointer active:scale-95 shadow-2xs"
        title={isArabic ? "التنبيهات والإشعارات الفورية (New Data)" : "Notifications (New Data)"}
        aria-label={isArabic ? "الإشعارات" : "Notifications"}
      >
        <Bell className="w-4 h-4 text-[#9e8959]" />

        {/* Pulsing Unread Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-black text-white shadow-xs animate-bounce">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Mobile Dark Backdrop Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 sm:hidden animate-fadeIn"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Notification Dropdown / Modal Panel */}
      {isOpen && (
        <div
          dir={dir}
          className={`
            fixed sm:absolute
            top-16 sm:top-full
            left-2 right-2 sm:left-auto sm:right-auto
            ${dir === "rtl" ? "sm:left-0 sm:right-auto" : "sm:right-0 sm:left-auto"}
            sm:mt-2
            max-w-md sm:max-w-none
            w-auto sm:w-96
            mx-auto sm:mx-0
            max-h-[82vh] sm:max-h-[32rem]
            rounded-2xl sm:rounded-3xl
            bg-white
            border border-stone-200
            shadow-2xl shadow-black/30
            z-50
            flex flex-col
            overflow-hidden
            animate-in fade-in slide-in-from-top-2 duration-150
          `}
        >
          {/* Header */}
          <div className="p-3 sm:p-3.5 bg-gradient-to-r from-[#160f02] via-[#241a08] to-[#160f02] text-[#f4e5d0] flex items-center justify-between gap-2 border-b border-[#554625]/60 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-[#35270e] border border-[#554625] flex items-center justify-center text-[#9e8959] shrink-0">
                <Bell className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-xs text-white truncate">
                    {isArabic ? "التنبيهات والبيانات" : "Notifications"}
                  </span>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-rose-500/25 border border-rose-500/40 text-rose-300 text-[10px] font-black shrink-0">
                      {unreadCount} {isArabic ? "جديد" : "new"}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="text-[10px] sm:text-xs text-[#cbb588] hover:text-[#f4e5d0] font-bold flex items-center gap-1 cursor-pointer transition py-1 px-2 rounded-lg hover:bg-[#35270e]"
                >
                  <Check className="w-3 h-3 text-[#9e8959]" />
                  <span>{isArabic ? "تحديد الكل كمقروء" : "Mark all read"}</span>
                </button>
              )}

              {/* Close Button on Mobile */}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 text-stone-400 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer sm:hidden"
                aria-label={isArabic ? "إغلاق" : "Close"}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Browser Permission Prompt Banner */}
          {permissionStatus === "denied" ? (
            <div className="p-2.5 bg-rose-50 border-b border-rose-200 flex items-start gap-2 text-xs text-rose-900 shrink-0">
              <span className="text-sm shrink-0">🔒</span>
              <div className="space-y-0.5 min-w-0 flex-1">
                <p className="font-bold text-[11px] text-rose-800">
                  {isArabic ? "إشعارات المتصفح محظورة (Blocked)" : "Browser notifications blocked"}
                </p>
                <p className="text-[10px] text-rose-700 leading-tight">
                  {isArabic
                    ? "اضغط على أيقونة القفل 🔒 بجانب الرابط واختر سماح (Allow) لتلقي الإشعارات الفورية."
                    : "Click the lock icon 🔒 next to the address bar and enable notifications."}
                </p>
              </div>
            </div>
          ) : !hasPermission ? (
            <div className="p-2.5 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-2 text-xs text-amber-900 shrink-0">
              <span className="text-[11px] font-medium leading-tight truncate">
                {isArabic ? "تفعيل إشعارات سطح المكتب والهاتف 🔔" : "Enable device notifications 🔔"}
              </span>
              <button
                type="button"
                onClick={requestPermission}
                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-stone-950 rounded-lg text-[10px] font-bold shrink-0 transition cursor-pointer shadow-2xs"
              >
                {isArabic ? "تفعيل الآن" : "Enable"}
              </button>
            </div>
          ) : null}

          {/* Notifications Scrollable List */}
          <div className="flex-1 overflow-y-auto max-h-[58vh] sm:max-h-80 divide-y divide-stone-100 overscroll-contain no-scrollbar hide-scrollbar">
            {notifications.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <div className="w-10 h-10 rounded-xl bg-stone-100 text-stone-400 flex items-center justify-center mx-auto">
                  <Bell className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-stone-700">
                  {isArabic ? "لا توجد تنبيهات حالياً" : "No notifications right now"}
                </p>
                <p className="text-[11px] text-stone-400 max-w-xs mx-auto leading-relaxed">
                  {isArabic
                    ? "عند إسناد أرقام هواتف أو ليدات جديدة لحسابك ستصلك تنبيهات فورية هنا."
                    : "When new leads or phone numbers are assigned to you, you will see alerts here."}
                </p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`p-3 sm:p-3.5 flex items-start gap-2.5 sm:gap-3 transition cursor-pointer active:bg-stone-100 ${
                    notif.read ? "bg-white hover:bg-stone-50/80" : "bg-amber-50/50 hover:bg-amber-50/80"
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${
                      notif.read
                        ? "bg-stone-100 text-stone-500 border border-stone-200"
                        : "bg-gradient-to-br from-amber-400 to-amber-500 text-stone-950 shadow-xs"
                    }`}
                  >
                    <Sparkles className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <h4 className="font-bold text-xs text-stone-900 truncate">{notif.title}</h4>
                      <span className="text-[10px] font-mono text-stone-400 shrink-0">
                        {formatTime(notif.createdAt)}
                      </span>
                    </div>

                    <p className="text-xs text-stone-600 leading-relaxed line-clamp-2">
                      {notif.message}
                    </p>

                    {notif.phones && notif.phones.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {notif.phones.slice(0, 3).map((p, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-stone-100 border border-stone-200 text-[10px] font-mono text-stone-700 shrink-0"
                            dir="ltr"
                          >
                            <Phone className="w-2.5 h-2.5 text-amber-600" />
                            {p}
                          </span>
                        ))}
                        {notif.phones.length > 3 && (
                          <span className="text-[10px] text-stone-400 font-bold self-center">
                            +{notif.phones.length - 3} {isArabic ? "آخرين" : "more"}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {!notif.read && (
                    <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 mt-1.5 ring-2 ring-amber-200" />
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-2.5 bg-stone-50 border-t border-stone-100 flex items-center justify-between text-stone-500 text-[10px] shrink-0">
            <span className="flex items-center gap-1 font-mono text-stone-400">
              <Volume2 className="w-3 h-3 text-emerald-600" />
              <span>{isArabic ? "نغمة التنبيه الصوتي مفعّلة" : "Sound alert active"}</span>
            </span>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-2.5 py-1 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold transition sm:hidden"
            >
              {isArabic ? "إغلاق" : "Close"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
