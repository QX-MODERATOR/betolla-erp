import { NextRequest, NextResponse } from 'next/server';
import { sendTelegramNotification, formatTelegramMessage } from '@/lib/telegram';
import { businessUser, businessFailure, requirePermission } from '@/lib/business-server';

// Sends a message to the admin Telegram chat. Only management may post here; the app's own
// alerts are sent server-side and do not use this route.
export async function POST(request: NextRequest) {
  try {
    requirePermission(await businessUser(request, '/api/telegram'), 'telegram.send');
  } catch (e) {
    return businessFailure(e);
  }
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

export async function GET(request: NextRequest) {
  try {
    await businessUser(request, '/api/telegram');
  } catch (e) {
    return businessFailure(e);
  }
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
