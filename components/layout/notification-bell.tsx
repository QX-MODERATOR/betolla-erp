"use client";

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
  const ref = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const res = await secureFetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
    } catch {
      // Silent — a failed notification fetch shouldn't disrupt the page.
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
      await secureFetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    } catch {
      // Best-effort; next poll reconciles real state.
    }
  };

  const markAllRead = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await secureFetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
    } catch {
      // Best-effort; next poll reconciles real state.
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
        aria-label={isArabic ? "الإشعارات" : "Notifications"}
        className="relative flex items-center justify-center w-9 h-9 rounded-xl border border-[#e8dfcf] hover:border-[#9e8959] bg-white/80 hover:bg-[#f0e6d6]/60 text-[#2b2926] active:scale-95 transition-all cursor-pointer shadow-2xs shrink-0"
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
          className={`absolute top-full mt-2 z-50 w-80 max-h-96 overflow-y-auto bg-white border border-[#e8dfcf] rounded-2xl shadow-2xl ${
            dir === "rtl" ? "right-0" : "left-0"
          }`}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8dfcf] sticky top-0 bg-white">
            <span className="text-sm font-bold text-[#2b2926]">{isArabic ? "الإشعارات" : "Notifications"}</span>
            {unreadCount > 0 && (
              <button type="button" onClick={markAllRead} className="text-xs font-semibold text-[#9e8959] hover:text-[#7b5e28] cursor-pointer">
                {isArabic ? "تعليم الكل كمقروء" : "Mark all read"}
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="py-8 text-center text-xs text-stone-400">{isArabic ? "لا توجد إشعارات." : "No notifications."}</p>
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
