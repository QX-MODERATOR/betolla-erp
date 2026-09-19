// Server-only: in-app call reminders (migration 033). Each reminder goes to the rep's bell and her
// phone (push). Reps without an ERP login cannot receive them; their calls are skipped.
import {businessRpc} from '@/lib/business-server';
import {notifyUser} from '@/lib/notify';
import {repUsernameForDisplayName} from '@/lib/reps';
import {ammanToday} from '@/lib/dates';

export const REMINDER_LEAD_MINUTES=10;

const timeFmt=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Amman',hour:'2-digit',minute:'2-digit',hour12:false});
export const ammanTime=(iso:string)=>timeFmt.format(new Date(iso));

interface DueCall {customer_id:string;name:string;phone:string;rep_name:string;due_at:string}

// Calls starting within the next REMINDER_LEAD_MINUTES (each reminded once). Returns how many
// reminders were delivered to someone.
export async function sendDueCallReminders():Promise<number> {
  const due=await businessRpc<DueCall[]>('business_call_reminders_claim',{p_lead_minutes:REMINDER_LEAD_MINUTES});
  let sent=0;
  for(const call of due){
    const username=await repUsernameForDisplayName(call.rep_name);
    if(!username)continue;
    await notifyUser(username,'call_reminder',`تذكير: اتصال مع ${call.name} الساعة ${ammanTime(call.due_at)}`,
      `رقم الهاتف: ${call.phone}`,`/calls?customer=${encodeURIComponent(call.customer_id)}`);
    sent++;
  }
  return sent;
}

interface DigestRow {rep_name:string;today:number;overdue:number;first_at:string|null}

// Morning summary per rep, at most once per day.
export async function sendDailyCallDigest():Promise<number> {
  const day=ammanToday();
  if(!await businessRpc<boolean>('business_task_claim',{p_task:'call_digest',p_key:day}))return 0;
  const rows=await businessRpc<DigestRow[]>('business_call_digest',{p_day:day});
  let sent=0;
  for(const row of rows){
    if(!row.today&&!row.overdue)continue;
    const username=await repUsernameForDisplayName(row.rep_name);
    if(!username)continue;
    const title=row.today?`لديك ${row.today} اتصال مجدول اليوم`:'لا توجد اتصالات مجدولة اليوم';
    const parts=[row.first_at?`أول اتصال الساعة ${ammanTime(row.first_at)}`:'',row.overdue?`${row.overdue} اتصال متأخر من أيام سابقة`:''].filter(Boolean);
    await notifyUser(username,'call_digest',title,parts.join(' · ')||'بالتوفيق اليوم','/calls');
    sent++;
  }
  return sent;
}
