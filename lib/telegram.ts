// lib/telegram.ts

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

// Working hours: Sun-Wed 9:30-16:30, Thu 9:30-15:00, Fri OFF (Jordan timezone UTC+3)
export function isWithinWorkingHours(): boolean {
  const now = new Date();
  // Get time in Jordan
  const jordanTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Amman" }));
  const day = jordanTime.getDay(); // 0 = Sunday, 5 = Friday
  const hours = jordanTime.getHours();
  const minutes = jordanTime.getMinutes();
  
  const timeInMinutes = hours * 60 + minutes;
  
  // Friday OFF
  if (day === 5) return false;
  
  // Thursday 9:30 (570) to 15:00 (900)
  if (day === 4) {
    return timeInMinutes >= 570 && timeInMinutes <= 900;
  }
  
  // Sun-Wed (and Sat implicitly if not mentioned as OFF, let's assume same as Sun-Wed)
  // 9:30 (570) to 16:30 (990)
  return timeInMinutes >= 570 && timeInMinutes <= 990;
}

export function formatTelegramMessage(type: 'error' | 'warning' | 'info' | 'success', title: string, details: string): string {
  const icons = {
    error: '🔴',
    warning: '🟡',
    info: '🔵',
    success: '🟢'
  };
  
  const now = new Date();
  const timestamp = now.toLocaleString("en-US", { timeZone: "Asia/Amman" });
  
  return `${icons[type]} *${title}*
_${timestamp}_

${details}`;
}

export async function sendTelegramNotification(
  message: string, 
  options?: { 
    urgent?: boolean;
    parseMode?: 'Markdown' | 'HTML';
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_CHAT_ID) {
      console.warn("Telegram credentials missing");
      return { success: false, error: "Credentials missing" };
    }

    if (!options?.urgent && !isWithinWorkingHours()) {
      console.log("Outside working hours. Skipping non-urgent Telegram notification.");
      return { success: true };
    }

    const parseMode = options?.parseMode || 'Markdown';
    
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_ADMIN_CHAT_ID,
        text: message,
        parse_mode: parseMode,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: errorText };
    }

    return { success: true };
  } catch (error) {
    console.error("Telegram error:", error);
    return { success: false, error: String(error) };
  }
}

export async function notifyError(title: string, details: string): Promise<void> {
  const msg = formatTelegramMessage('error', title, details);
  await sendTelegramNotification(msg, { urgent: true });
}

export async function notifyWarning(title: string, details: string): Promise<void> {
  const msg = formatTelegramMessage('warning', title, details);
  await sendTelegramNotification(msg);
}

export async function notifyInfo(title: string, details: string): Promise<void> {
  const msg = formatTelegramMessage('info', title, details);
  await sendTelegramNotification(msg);
}

export async function notifyNewOrder(orderNumber: string, customerName: string, amount: number): Promise<void> {
  const title = `New Order: ${orderNumber}`;
  const details = `Customer: ${customerName}\nAmount: ${amount.toFixed(3)} JOD`;
  const msg = formatTelegramMessage('success', title, details);
  await sendTelegramNotification(msg);
}

export async function notifyLowStock(productName: string, remaining: number): Promise<void> {
  const title = `Low Stock Alert`;
  const details = `Product: ${productName}\nRemaining: ${remaining} units left`;
  const msg = formatTelegramMessage('warning', title, details);
  await sendTelegramNotification(msg, { urgent: true });
}

export async function notifyDriverReconciliationIssue(driverName: string, expectedCash: number, actualCash: number): Promise<void> {
  const title = `Driver Reconciliation Issue`;
  const details = `Driver: ${driverName}\nExpected: ${expectedCash.toFixed(3)} JOD\nActual: ${actualCash.toFixed(3)} JOD\nDifference: ${(expectedCash - actualCash).toFixed(3)} JOD`;
  const msg = formatTelegramMessage('error', title, details);
  await sendTelegramNotification(msg, { urgent: true });
}

export async function notifySystemError(endpoint: string, error: string): Promise<void> {
  const title = `System Error @ ${endpoint}`;
  const details = `Error Details:\n\`\`\`\n${error}\n\`\`\``;
  const msg = formatTelegramMessage('error', title, details);
  await sendTelegramNotification(msg, { urgent: true });
}
