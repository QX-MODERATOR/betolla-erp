"use client";

import { useState, useRef, useEffect } from "react";
import { Bell, Check, ExternalLink, Sparkles, Phone, ShieldCheck } from "lucide-react";
import { useNotifications, AppNotification } from "@/lib/notification-context";
import { useRouter } from "next/navigation";

export function NotificationBell() {
  const router = useRouter();
  const { notifications, unreadCount, markAsRead, markAllAsRead, hasPermission, permissionStatus, requestPermission } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
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
      return date.toLocaleTimeString("ar-JO", { hour: "2-digit", minute: "2-digit" });
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
        title="التنبيهات والإشعارات الفورية (New Data)"
        aria-label="الإشعارات"
      >
        <Bell className="w-4 h-4 text-[#9e8959]" />

        {/* Pulsing Unread Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-black text-white shadow-xs animate-bounce">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown Panel */}
      {isOpen && (
        <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white border border-stone-200 shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
          {/* Header */}
          <div className="p-3.5 bg-gradient-to-r from-[#160f02] via-[#241a08] to-[#160f02] text-[#f4e5d0] flex items-center justify-between border-b border-[#554625]/60">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#9e8959]" />
              <span className="font-bold text-xs text-white">التنبيهات والبيانات الجديدة</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-bold">
                  {unreadCount} جديد
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="text-[10px] text-[#9e8959] hover:text-[#bda66d] font-bold flex items-center gap-1 cursor-pointer transition"
              >
                <Check className="w-3 h-3" />
                <span>تحديد الكل كمقروء</span>
              </button>
            )}
          </div>

          {/* Permission Prompt or Blocked Notice */}
          {permissionStatus === "denied" ? (
            <div className="p-2.5 bg-rose-50 border-b border-rose-200 flex items-start gap-2 text-xs text-rose-900">
              <span className="text-sm shrink-0">🔒</span>
              <div className="space-y-0.5 min-w-0 flex-1">
                <p className="font-bold text-[11px] text-rose-800">إشعارات المتصفح محظورة (Blocked)</p>
                <p className="text-[10px] text-rose-700 leading-tight">
                  لتفعيلها: اضغط على أيقونة القفل 🔒 بجانب رابط الموقع في المتصفح، ثم اختر <strong>سماح للإشعارات (Allow)</strong> وأعد تحميل الصفحة.
                </p>
                <p className="text-[10px] text-emerald-800 font-semibold pt-0.5">
                  ✓ النغمة الصوتية والنوافذ المنبثقة تعمل بنجاح داخل النظام.
                </p>
              </div>
            </div>
          ) : !hasPermission ? (
            <div className="p-2.5 bg-amber-50 border-b border-amber-100 flex items-center justify-between text-xs text-amber-900">
              <span className="text-[11px] font-medium leading-tight">تفعيل إشعارات سطح المكتب وهاتف أندرويد 🔔</span>
              <button
                type="button"
                onClick={requestPermission}
                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-stone-950 rounded-lg text-[10px] font-bold shrink-0 transition cursor-pointer shadow-2xs"
              >
                تفعيل الآن
              </button>
            </div>
          ) : null}

          {/* Notifications List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-stone-100">
            {notifications.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <div className="w-10 h-10 rounded-xl bg-stone-100 text-stone-400 flex items-center justify-center mx-auto">
                  <Bell className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-stone-700">لا توجد تنبيهات حالياً</p>
                <p className="text-[11px] text-stone-400">
                  عند قيام الإدارة بإسناد أرقام هواتف أو ليدات جديدة لحسابك ستصلك تنبيهات فورية هنا.
                </p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`p-3.5 flex items-start gap-3 transition cursor-pointer ${
                    notif.read ? "bg-white hover:bg-stone-50/80" : "bg-amber-50/50 hover:bg-amber-50/80"
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${
                      notif.read
                        ? "bg-stone-100 text-stone-500 border border-stone-200"
                        : "bg-amber-500 text-stone-950 shadow-xs animate-pulse"
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

                    <p className="text-xs text-stone-600 leading-relaxed line-clamp-2">{notif.message}</p>

                    {notif.phones && notif.phones.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {notif.phones.slice(0, 3).map((p, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md bg-stone-100 border border-stone-200 text-[10px] font-mono text-stone-700"
                            dir="ltr"
                          >
                            <Phone className="w-2.5 h-2.5 text-amber-600" />
                            {p}
                          </span>
                        ))}
                        {notif.phones.length > 3 && (
                          <span className="text-[10px] text-stone-400 font-bold self-center">
                            +{notif.phones.length - 3} آخرين
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
          <div className="p-2.5 bg-stone-50 border-t border-stone-100 text-center">
            <span className="text-[10px] text-stone-400 font-mono">نظام الإشعارات الفوري لبيتولا ERP</span>
          </div>
        </div>
      )}
    </div>
  );
}
