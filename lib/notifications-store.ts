export interface AppNotification {
  id: string;
  repName: string; // e.g. "حنان", "حمزة", "صابرين", or "all"
  repId?: string;  // e.g. "hanan"
  title: string;
  message: string;
  phones?: string[];
  phoneCount?: number;
  source: string; // "admin" | "system"
  createdAt: string;
  read: boolean;
  link?: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __betolla_notifications__: AppNotification[] | undefined;
}

const NOTIFICATIONS_STORE: AppNotification[] =
  global.__betolla_notifications__ || [];

if (process.env.NODE_ENV !== "production") {
  global.__betolla_notifications__ = NOTIFICATIONS_STORE;
}

export function matchesRep(targetRep: string, userQuery: string): boolean {
  if (!targetRep || !userQuery) return false;
  if (targetRep === "all" || userQuery === "all") return true;

  const t = targetRep.toLowerCase().trim();
  const q = userQuery.toLowerCase().trim();

  if (t === q) return true;
  if ((q.includes("hanan") || q.includes("حنان")) && (t.includes("حنان") || t.includes("hanan"))) return true;
  if ((q.includes("hamza") || q.includes("حمزة")) && (t.includes("حمزة") || t.includes("hamza"))) return true;
  if ((q.includes("sabreen") || q.includes("صابرين")) && (t.includes("صابرين") || t.includes("sabreen"))) return true;

  return false;
}

export function getNotifications(rep?: string | null, unreadOnly?: boolean): {
  notifications: AppNotification[];
  unreadCount: number;
} {
  let results = NOTIFICATIONS_STORE;

  if (rep && rep !== "admin") {
    results = results.filter((n) => matchesRep(n.repName, rep) || (n.repId && matchesRep(n.repId, rep)));
  }

  if (unreadOnly) {
    results = results.filter((n) => !n.read);
  }

  const sorted = [...results].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return {
    notifications: sorted,
    unreadCount: sorted.filter((n) => !n.read).length,
  };
}

export function addNotification(data: {
  repName: string;
  repId?: string;
  title: string;
  message: string;
  phones?: string[];
  source?: string;
  link?: string;
}): AppNotification {
  const phoneList: string[] = Array.isArray(data.phones)
    ? data.phones.map((p) => String(p).trim()).filter(Boolean)
    : [];

  const newNotification: AppNotification = {
    id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    repName: data.repName || "حنان",
    repId: data.repId || (data.repName?.includes("حنان") ? "hanan" : undefined),
    title: data.title || "بيانات جديدة 🔔 New Data",
    message: data.message,
    phones: phoneList,
    phoneCount: phoneList.length,
    source: data.source || "admin",
    createdAt: new Date().toISOString(),
    read: false,
    link: data.link || "/customers",
  };

  NOTIFICATIONS_STORE.unshift(newNotification);
  if (NOTIFICATIONS_STORE.length > 100) {
    NOTIFICATIONS_STORE.length = 100;
  }

  return newNotification;
}

export function markNotificationRead(options: {
  id?: string;
  repName?: string;
  markAllRead?: boolean;
}): void {
  const { id, repName, markAllRead } = options;

  if (markAllRead && repName) {
    NOTIFICATIONS_STORE.forEach((n) => {
      if (matchesRep(n.repName, repName) || (n.repId && matchesRep(n.repId, repName))) {
        n.read = true;
      }
    });
  } else if (id) {
    const notif = NOTIFICATIONS_STORE.find((n) => n.id === id);
    if (notif) notif.read = true;
  }
}
