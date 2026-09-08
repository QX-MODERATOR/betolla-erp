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
  
  // Format start and end datetime
  const time = event.startTime || "10:00";
  const duration = event.durationMinutes || 20;

  // Build clean ISO-like date string for Google: YYYYMMDDTHHmmSS
  const cleanDate = event.startDate.replace(/-/g, '');
  const [hours, mins] = time.split(':');
  const startHour = hours.padStart(2, '0');
  const startMin = (mins || '00').padStart(2, '0');
  
  const startStr = `${cleanDate}T${startHour}${startMin}00`;
  
  // Calculate end time
  const startDateObj = new Date(`${event.startDate}T${startHour}:${startMin}:00`);
  const endDateObj = new Date(startDateObj.getTime() + duration * 60000);
  const endHour = String(endDateObj.getHours()).padStart(2, '0');
  const endMin = String(endDateObj.getMinutes()).padStart(2, '0');
  const endCleanDate = endDateObj.toISOString().split('T')[0].replace(/-/g, '');
  const endStr = `${endCleanDate}T${endHour}${endMin}00`;

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
