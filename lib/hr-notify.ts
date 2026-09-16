// Server-only, best-effort HR notifications (a failed notification never fails the leave action).
import { notifyUser } from '@/lib/notify';
import { accountUsername, hrUsernames } from '@/lib/hr-server';
import type { HrLeaveRequest } from '@/lib/hr';

const range = (r: HrLeaveRequest) =>
  r.start_date === r.end_date ? `${r.start_date}${r.half_day ? ' (نصف يوم)' : ''}` : `${r.start_date} → ${r.end_date}`;

// New pending request -> the employee's direct manager (if they have a login) and all HR accounts.
export async function notifyLeaveRequested(r: HrLeaveRequest, actorUsername: string) {
  if (r.status !== 'pending') return;
  const manager = accountUsername(r.manager_account_id);
  const targets = new Set([...hrUsernames(), ...(manager ? [manager] : [])]);
  targets.delete(actorUsername);
  const title = `طلب ${r.type_name} جديد: ${r.employee_name}`;
  const body = `${range(r)} · ${r.days} يوم${r.reason ? ` — ${r.reason}` : ''}`;
  await Promise.all([...targets].map((u) =>
    notifyUser(u, 'hr_leave_request', title, body, u === manager && !hrUsernames().includes(u) ? '/hr/me' : '/hr/leave')));
}

// Decision -> the employee (if they have a login and didn't make the change themselves).
export async function notifyLeaveDecided(r: HrLeaveRequest, actorUsername: string) {
  const employee = accountUsername(r.employee_account_id);
  if (!employee || employee === actorUsername) return;
  const verb = r.status === 'approved' ? 'تمت الموافقة على' : r.status === 'rejected' ? 'تم رفض' : 'تم إلغاء';
  await notifyUser(employee, 'hr_leave_decision', `${verb} طلب ${r.type_name}`,
    `${range(r)}${r.decision_note ? ` — ${r.decision_note}` : ''}`, '/hr/me');
}
