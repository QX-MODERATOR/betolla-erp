import { NextRequest, NextResponse } from 'next/server';
import { sendTelegramNotification, formatTelegramMessage } from '@/lib/telegram';
import { requireRole } from '@/lib/api-auth';

// Every role in the app's RBAC matrix is allowed to trigger a notification
// (see isRouteAllowedForRole in lib/auth.ts) — this endpoint just requires
// that the caller is authenticated as staff, not any specific department.
const ANY_STAFF_ROLE = ["sales_rep", "driver_manager", "driver", "finance"] as const;

export async function POST(request: NextRequest) {
  const auth = await requireRole([...ANY_STAFF_ROLE]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { message, type = 'info', title = 'Notification', details = '', urgent = false } = body;

    let finalMessage = message;
    if (!message && details) {
      finalMessage = formatTelegramMessage(type as any, title, details);
    } else if (!message) {
      finalMessage = formatTelegramMessage(type as any, title, 'No details provided.');
    }

    const result = await sendTelegramNotification(finalMessage, { urgent });
    
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  const auth = await requireRole([...ANY_STAFF_ROLE]);
  if (auth instanceof NextResponse) return auth;

  const tokenExists = !!process.env.TELEGRAM_BOT_TOKEN;
  const chatIdExists = !!process.env.TELEGRAM_ADMIN_CHAT_ID;
  
  return NextResponse.json({
    status: 'active',
    config: {
      botTokenConfigured: tokenExists,
      chatIdConfigured: chatIdExists,
    }
  });
}
