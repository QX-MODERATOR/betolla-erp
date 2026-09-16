// Server-only, best-effort HR notifications (a failed notification never fails the leave action).
import { notifyUser } from '@/lib/notify';
import { businessRpc } from '@/lib/business-server';
import { accountUsername, hrUsernames, financeUsernames } from '@/lib/hr-server';
import { monthLabel, expiryLabel, type HrLeaveRequest, type HrPayrollRun, type HrReview, type HrExpiry } from '@/lib/hr';

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

// Payroll handoff: approved -> finance is asked to pay; paid -> every employee on the run is told
// their payslip is available; reopened -> HR peers are informed.
export async function notifyPayrollTransition(run: HrPayrollRun, action: string, actorUsername: string) {
  const month = monthLabel(run.month);
  const total = `${run.totals.count} موظف · صافي ${Number(run.totals.net).toFixed(3)} د.أ`;
  let targets: { username: string; title: string; body: string; link: string }[] = [];
  if (action === 'approve') {
    targets = financeUsernames().map((username) => ({ username, title: `رواتب ${month} معتمدة وبانتظار الصرف`, body: total, link: '/hr/payroll' }));
  } else if (action === 'reopen') {
    targets = hrUsernames().map((username) => ({ username, title: `أُعيد فتح رواتب ${month}`, body: run.notes, link: '/hr/payroll' }));
  } else if (action === 'pay') {
    targets = (run.payslips || [])
      .map((p) => ({ p, username: accountUsername(p.employee_account_id) }))
      .filter((x): x is { p: (typeof x)['p']; username: string } => !!x.username)
      .map(({ p, username }) => ({ username, title: `تم صرف راتب ${month}`, body: `صافي الراتب ${Number(p.net).toFixed(3)} د.أ`, link: '/hr/me/payslips' }));
  }
  await Promise.all(targets.filter((t) => t.username !== actorUsername)
    .map((t) => notifyUser(t.username, 'hr_payroll', t.title, t.body, t.link)));
}

// Review submitted -> the reviewed employee is asked to read and acknowledge it.
export async function notifyReviewSubmitted(review: HrReview, actorUsername: string) {
  const employee = accountUsername(review.employee_account_id);
  if (review.status !== 'submitted' || !employee || employee === actorUsername) return;
  await notifyUser(employee, 'hr_review', `تقييم أداء جديد (${review.period_label})`,
    `التقييم العام ${review.overall ?? '—'} من 5 — اطّلع عليه وأكّد الاستلام`, '/hr/me/reviews');
}

// Claims due expiry alerts (30 days, 7 days, expired — each sent once per expiry date) and notifies
// HR, plus the employee for their own documents. Best-effort: never throws.
export async function dispatchExpiryAlerts() {
  try {
    const due = await businessRpc<(HrExpiry & { threshold: string })[]>('business_hr_alerts_claim', {});
    const hr = hrUsernames();
    await Promise.all(due.map(async (item) => {
      const when = item.days_left < 0 ? `انتهت منذ ${-item.days_left} يوم` : item.days_left === 0 ? 'تنتهي اليوم' : `تنتهي خلال ${item.days_left} يوم`;
      const title = `${expiryLabel(item)} — ${item.employee_name}`;
      const body = `${when} (${item.expiry_date})`;
      await Promise.all(hr.map((u) => notifyUser(u, 'hr_expiry', title, body, item.kind === 'document' ? '/hr/documents' : `/hr/employees/${item.employee_id}`)));
      const own = item.kind === 'document' ? accountUsername(item.employee_account_id) : null;
      if (own && !hr.includes(own)) await notifyUser(own, 'hr_expiry', `${expiryLabel(item)} الخاصة بك`, `${body} — يرجى التجديد وتسليم النسخة للموارد البشرية`, '/hr/me');
    }));
    return due.length;
  } catch {
    return 0;
  }
}
