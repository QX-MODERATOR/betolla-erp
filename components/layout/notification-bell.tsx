"use client";

import { Skeleton } from "@/components/common/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { secureFetch } from "@/lib/client-api";
import { useLanguage } from "@/lib/i18n";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

export function NotificationBell() {
  const router = useRouter();
  const { language, dir } = useLanguage();
  const isArabic = language === "ar";
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const res = await secureFetch("/api/notifications");
      if (!res.ok) throw new Error("Notification load failed");
      const data = await res.json();
      setLoadError(false);
      setItems(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const markRead = async (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      const res = await secureFetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!res.ok) void load(); // write failed — resync now instead of showing "read" for up to 30s
    } catch {
      void load();
    }
  };

  const markAllRead = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      const res = await secureFetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
      if (!res.ok) void load();
    } catch {
      void load();
    }
  };

  const handleItemClick = (item: NotificationItem) => {
    if (!item.read) void markRead(item.id);
    setOpen(false);
    if (item.link) router.push(item.link);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={isArabic ? "الإشعارات" : "Notifications"}
        aria-expanded={open} aria-controls="notifications-panel"
        aria-label={isArabic ? "الإشعارات" : "Notifications"}
        className="relative flex items-center justify-center w-11 h-11 rounded-xl border border-[#e8dfcf] hover:border-[#9e8959] bg-white/80 hover:bg-[#f0e6d6]/60 text-[#2b2926] active:scale-95 transition-all cursor-pointer shadow-2xs shrink-0"
      >
        <Bell className="w-4 h-4 text-[#9e8959]" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          id="notifications-panel"
          onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); ref.current?.querySelector("button")?.focus(); } }}
          className={`fixed top-[4.5rem] inset-x-3 z-50 max-h-[calc(100dvh-6rem)] overflow-y-auto bg-white border border-[#e8dfcf] rounded-2xl shadow-2xl sm:absolute sm:top-full sm:mt-2 sm:inset-x-auto sm:w-80 sm:max-h-96 ${dir === "rtl" ? "sm:left-0" : "sm:right-0"}`}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8dfcf] sticky top-0 bg-white">
            <span className="text-sm font-bold text-[#2b2926]">{isArabic ? "الإشعارات" : "Notifications"}</span>
            {unreadCount > 0 && (
              <button type="button" onClick={markAllRead} className="text-xs font-semibold text-[#9e8959] hover:text-[#7b5e28] cursor-pointer">
                {isArabic ? "تعليم الكل كمقروء" : "Mark all read"}
              </button>
            )}
          </div>
          {loadError ? (
            <div role="alert" className="p-4 text-sm text-rose-800"><p>{isArabic ? "تعذر تحميل الإشعارات" : "Notifications unavailable"}</p><button className="min-h-11 underline" onClick={() => void load()}>{isArabic ? "إعادة المحاولة" : "Retry"}</button></div>
          ) : loading ? (
            <div role="status" aria-label={isArabic ? "جاري التحميل" : "Loading"} className="p-4 space-y-3"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
          ) : items.length === 0 ? (
            <EmptyState icon="inbox" title={isArabic ? "لا توجد إشعارات" : "No notifications"} subtitle={isArabic ? "أنت على اطلاع بكل جديد" : "You are all caught up"} className="py-6" />
          ) : (
            <div className="divide-y divide-[#e8dfcf]/60">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleItemClick(item)}
                  className={`w-full text-start px-4 py-3 hover:bg-[#faf7f2] transition cursor-pointer ${!item.read ? "bg-[#f0e6d6]/40" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    {!item.read && <span className="w-1.5 h-1.5 rounded-full bg-[#9e8959] shrink-0" />}
                    <span className="text-xs font-bold text-[#2b2926]">{item.title}</span>
                  </div>
                  {item.body && <p className="mt-0.5 text-xs text-[#6b655d] line-clamp-2">{item.body}</p>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
