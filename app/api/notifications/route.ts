import { NextRequest, NextResponse } from "next/server";
import {
  getNotifications,
  addNotification,
  markNotificationRead,
  type AppNotification,
} from "@/lib/notifications-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

export type { AppNotification };

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rep = searchParams.get("rep");
    const unreadOnly = searchParams.get("unread") === "true";

    const { notifications, unreadCount } = getNotifications(rep, unreadOnly);

    return NextResponse.json(
      {
        success: true,
        notifications,
        unreadCount,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load notifications" },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { repName, repId, title, message, phones, source = "admin", link = "/customers" } = body;

    if (!title || !message) {
      return NextResponse.json(
        { success: false, error: "Title and message are required" },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const newNotification = addNotification({
      repName,
      repId,
      title,
      message,
      phones,
      source,
      link,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Notification created successfully",
        notification: newNotification,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create notification" },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, repName, markAllRead } = body;

    markNotificationRead({ id, repName, markAllRead });

    return NextResponse.json(
      { success: true, message: "Notifications updated" },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update notification" },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
