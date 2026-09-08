/**
 * Google Calendar Integration Helper for Betolla ERP
 * Supports direct web/mobile deep-linking into Google Calendar app on Android
 * and Google Calendar REST API integration.
 */

export interface CalendarEventPayload {
  customerName: string;
  customerPhone: string;
  notes?: string;
  address?: string;
  repName?: string;
  startDate: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  durationMinutes?: number;
}

/**
 * Generates a one-click Google Calendar URL that opens the Google Calendar app
 * on Android or desktop with pre-populated event details.
 */
export function generateGoogleCalendarUrl(event: CalendarEventPayload): string {
  const title = encodeURIComponent(`متابعة اتصال عميل: ${event.customerName}`);
  
  const duration = event.durationMinutes || 20;

  // Clean time string: extract digits and handle AM/PM
  let rawTime = event.startTime || "10:00";
  const isPM = rawTime.includes("م") || rawTime.toLowerCase().includes("pm");
  rawTime = rawTime.replace(/[^\d:]/g, '').trim();
  const parts = rawTime.split(':');
  let h = parseInt(parts[0], 10);
  if (isNaN(h)) h = 10;
  if (isPM && h < 12) h += 12;
  let m = parseInt(parts[1], 10);
  if (isNaN(m)) m = 0;

  const startHour = String(h).padStart(2, '0');
  const startMin = String(m).padStart(2, '0');
  const cleanDate = (event.startDate || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  const startStr = `${cleanDate}T${startHour}${startMin}00`;

  // Calculate end time
  const endH = (h + Math.floor((m + duration) / 60)) % 24;
  const endM = (m + duration) % 60;
  const endHour = String(endH).padStart(2, '0');
  const endMin = String(endM).padStart(2, '0');
  const endStr = `${cleanDate}T${endHour}${endMin}00`;

  const details = encodeURIComponent(
    `📞 العميل: ${event.customerName}\n` +
    `📱 رقم الهاتف: ${event.customerPhone}\n` +
    `📍 العنوان: ${event.address || 'غير محدد'}\n` +
    `👤 المندوب المسؤول: ${event.repName || 'مبيعات بيتولا'}\n` +
    `📝 ملاحظات المتابعة: ${event.notes || 'متابعة دورية'}\n` +
    `🚀 تم التوليد آلياً من نظام Betolla ERP`
  );

  const location = encodeURIComponent(event.address || 'عمان، الأردن');

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startStr}/${endStr}&details=${details}&location=${location}`;
}

/**
 * Validates the configured Google Calendar API key
 */
export async function verifyGoogleCalendarApiKey(): Promise<{ valid: boolean; message: string }> {
  const apiKey = process.env.GOOGLE_CALENDAR_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_API_KEY;
  if (!apiKey) {
    return { valid: false, message: "مفتاح Google Calendar API غير متوفر في الإعدادات." };
  }

  try {
    // Ping public primary calendar endpoint to verify API key validity
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/en.jordan%23holiday%40group.v.calendar.google.com?key=${apiKey}`);
    if (res.ok) {
      return { valid: true, message: "تم التحقق من مفتاح Google Calendar API بنجاح وهو نشط." };
    } else {
      const err = await res.json().catch(() => ({}));
      return { valid: false, message: `فشل التحقق من المفتاح: ${err.error?.message || res.statusText}` };
    }
  } catch (error) {
    return { valid: false, message: `تعذر الاتصال بخدمة تقويم جوجل: ${String(error)}` };
  }
}
