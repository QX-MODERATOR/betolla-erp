"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { getCurrentUser } from "@/lib/client-api";
import { useToast } from "@/components/common/toast";
import { matchesRep } from "@/lib/rep-utils";

export interface AppNotification {
  id: string;
  repName: string;
  repId?: string;
  title: string;
  message: string;
  phones?: string[];
  phoneCount?: number;
  source: string;
  createdAt: string;
  read: boolean;
  link?: string;
}

export type PermissionStatus = "granted" | "denied" | "default" | "unsupported";

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  hasPermission: boolean;
  permissionStatus: PermissionStatus;
  lastNotificationTime: number;
  requestPermission: () => Promise<boolean>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  sendNotification: (data: {
    repName: string;
    repId?: string;
    title?: string;
    message: string;
    phones?: string[];
    link?: string;
  }) => Promise<boolean>;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    return {
      notifications: [],
      unreadCount: 0,
      hasPermission: false,
      permissionStatus: "unsupported" as PermissionStatus,
      lastNotificationTime: 0,
      requestPermission: async () => false,
      markAsRead: async () => {},
      markAllAsRead: async () => {},
      sendNotification: async () => false,
    };
  }
  return context;
}

// Synthesize pleasant luxury notification chime using Web Audio API
function playChimeSound() {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // Tone 1: D5 (587.33 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Tone 2: A5 (880 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.12);
    gain2.gain.setValueAtTime(0.35, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.6);
  } catch (e) {
    // Audio playback error (e.g. policy restriction before first user gesture)
  }
}

// Trigger native OS / Web Notification
function fireSystemNotification(title: string, body: string, link?: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "granted") {
    try {
      const notif = new Notification(title, {
        body,
        icon: "/brand/betolla-logo-clean.png",
        badge: "/brand/betolla-logo-clean.png",
        tag: `notif_${Date.now()}`,
      });
      notif.onclick = () => {
        window.focus();
        if (link) window.location.href = link;
        notif.close();
      };
    } catch {
      // Ignore system notification errors
    }
  }
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { showToast } = useToast();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>("default");
  const [lastNotificationTime, setLastNotificationTime] = useState<number>(0);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const initialLoadRef = useRef(true);

  // Check initial notification permission
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermissionStatus(Notification.permission as PermissionStatus);
    } else {
      setPermissionStatus("unsupported");
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermissionStatus("unsupported");
      return false;
    }

    if (Notification.permission === "denied") {
      setPermissionStatus("denied");
      showToast(
        "الإشعارات محظورة في إعدادات المتصفح. يرجى النقر على أيقونة القفل 🔒 بجانب رابط الموقع وتغيير إذن الإشعارات إلى (Allow / سماح).",
        "warning",
        8000
      );
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      const status = result as PermissionStatus;
      setPermissionStatus(status);
      const granted = status === "granted";
      if (granted) {
        showToast("تم تفعيل إشعارات النظام بنجاح!", "success");
      } else if (status === "denied") {
        showToast(
          "تم حظر الإشعارات. يمكنك إلغاء الحظر عبر النقر على رمز القفل 🔒 في شريط عنوان المتصفح.",
          "warning",
          7000
        );
      }
      return granted;
    } catch {
      return false;
    }
  }, [showToast]);

  // Fetch notifications for current user
  const fetchNotifications = useCallback(async () => {
    const user = getCurrentUser();
    const repParam = user?.role === "sales_rep" ? (user.username || "hanan") : "admin";

    try {
      const res = await fetch(`/api/notifications?rep=${encodeURIComponent(repParam)}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();

      if (data.success && Array.isArray(data.notifications)) {
        const fetched: AppNotification[] = data.notifications;
        setNotifications(fetched);

        // Detect newly arrived notifications
        if (!initialLoadRef.current) {
          const newItems = fetched.filter((n) => !n.read && !seenIdsRef.current.has(n.id));

          if (newItems.length > 0) {
            // Mark all incoming items as seen so they are never processed repeatedly
            newItems.forEach((n) => seenIdsRef.current.add(n.id));

            // FILTER: Only alert the actual recipient!
            // When Admin sends leads to Hanan, Admin must NOT hear chimes or get spam toasts
            const isSalesRep = user?.role === "sales_rep";
            const currentUsername = user?.username || "";

            const targetedToMe = newItems.filter((item) => {
              if (isSalesRep) {
                return (
                  matchesRep(item.repName, currentUsername) ||
                  (item.repId && matchesRep(item.repId, currentUsername)) ||
                  item.repName === "all"
                );
              }
              // Admin/Management only gets notified if targeted to admin or all
              return (
                item.repName === "admin" ||
                item.repName === "all" ||
                (item.source !== "admin" && !item.repName)
              );
            });

            if (targetedToMe.length > 0) {
              // 1. Play luxury audio chime EXACTLY ONCE
              playChimeSound();
              setLastNotificationTime(Date.now());

              // 2. Fire single toast and single push notification
              if (targetedToMe.length === 1) {
                const item = targetedToMe[0];
                fireSystemNotification(item.title, item.message, item.link);
                showToast(`${item.title}: ${item.message}`, "info", 7000);
              } else {
                const totalItems = targetedToMe.length;
                const totalPhones = targetedToMe.reduce(
                  (acc, it) => acc + (it.phones?.length || 1),
                  0
                );
                const count = totalPhones > totalItems ? totalPhones : totalItems;
                const title = "بيانات جديدة 🔔 New Data";
                const message = `تم استلام (${count}) أرقام وبيانات جديدة لحسابك. تم تحديث سجل عملائك وجاهز للاتصال.`;

                fireSystemNotification(title, message, "/sales");
                showToast(`${title}: ${message}`, "info", 7000);
              }
            }
          }
        } else {
          // On initial page load, seed seen IDs so we don't spam old notifications
          fetched.forEach((n) => seenIdsRef.current.add(n.id));
          initialLoadRef.current = false;
        }
      }
    } catch {
      // Ignore network polling glitches
    }
  }, [showToast]);

  // Polling interval (every 5 seconds)
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 5000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markAsRead = useCallback(async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {}
  }, []);

  const markAllAsRead = useCallback(async () => {
    const user = getCurrentUser();
    const repName = user?.username || "hanan";
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true, repName }),
      });
    } catch {}
  }, []);

  const sendNotification = useCallback(
    async (data: {
      repName: string;
      repId?: string;
      title?: string;
      message: string;
      phones?: string[];
      link?: string;
    }): Promise<boolean> => {
      try {
        const res = await fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repName: data.repName,
            repId: data.repId,
            title: data.title || "بيانات جديدة 🔔 New Data",
            message: data.message,
            phones: data.phones || [],
            source: "admin",
            link: data.link || "/sales",
          }),
        });
        const json = await res.json();
        if (json.success) {
          fetchNotifications();
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    [fetchNotifications]
  );

  const unreadCount = notifications.filter((n) => !n.read).length;
  const hasPermission = permissionStatus === "granted";

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        hasPermission,
        permissionStatus,
        lastNotificationTime,
        requestPermission,
        markAsRead,
        markAllAsRead,
        sendNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
