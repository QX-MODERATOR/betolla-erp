"use client";

import { ArrowLeft, Bell } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { secureFetch } from "@/lib/client-api";
import { HeaderPopover } from "@/components/common/header-popover";
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
  const close = useCallback(() => setOpen(false), []);

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

  // Where a notification actually goes. Notifications written before deep links existed point at a
  // list page — "/orders", "/drivers" — which drops the reader somewhere they still have to search.
  // Their body ends with the order number, so those become openable too rather than staying dead.
  const ORDER_IN_BODY = /\bBET-\d{4}-\d{5,}\b/;
  const targetOf = (item: NotificationItem): string | null => {
    if (!item.link) return null;
    if (item.link.includes("?")) return item.link;
    const named = item.body?.match(ORDER_IN_BODY)?.[0];
    if (named && (item.link === "/orders" || item.link === "/drivers"))
      return `${item.link}?order=${encodeURIComponent(named)}`;
    return item.link;
  };

  const handleItemClick = (item: NotificationItem) => {
    if (!item.read) void markRead(item.id);
    const target = targetOf(item);
    if (!target) return; // nothing to open: leave the popover up rather than closing on nothing
    setOpen(false);
    router.push(target);
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

      <HeaderPopover
        anchorRef={ref}
        open={open}
        onClose={close}
        dir={dir === "rtl" ? "rtl" : "ltr"}
        width={360}
        label={isArabic ? "الإشعارات" : "Notifications"}
        className="bg-white border border-[#e8dfcf]"
      >
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#e8dfcf] sticky top-0 bg-white z-10">
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
              {items.map((item) => {
                // A row that opens something looks and behaves like a link; one that does not stays
                // plain, so the bar never invites a click that goes nowhere.
                const target = targetOf(item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleItemClick(item)}
                    aria-label={target ? `${item.title} — ${isArabic ? "فتح" : "open"}` : item.title}
                    className={`w-full text-start px-4 py-3.5 sm:py-3 transition ${!item.read ? "bg-[#f0e6d6]/40" : ""} ${
                      target ? "hover:bg-[#faf7f2] cursor-pointer" : "cursor-default"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {!item.read && <span className="w-1.5 h-1.5 rounded-full bg-[#9e8959] shrink-0" />}
                      <span className="text-[13px] sm:text-xs font-bold text-[#2b2926] break-words">{item.title}</span>
                      {target && (
                        <ArrowLeft className={`w-3.5 h-3.5 text-[#9e8959] shrink-0 ms-auto ${isArabic ? "" : "rotate-180"}`} aria-hidden />
                      )}
                    </div>
                    {item.body && <p className="mt-0.5 text-xs text-[#6b655d] line-clamp-3 break-words">{item.body}</p>}
                  </button>
                );
              })}
            </div>
          )}
      </HeaderPopover>
    </div>
  );
}
