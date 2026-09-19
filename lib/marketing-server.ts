// Server-only marketing input validation and helpers. Everything is normalised here before it reaches
// the business_mkt_* RPCs (migration 044), which re-check the invariants that matter.
import { BusinessError, businessUser, text, money, date } from '@/lib/business-server';
import { SYSTEM_ACCOUNTS } from '@/lib/auth';
import { MARKETING_TEAM, marketingAccess, type MarketingAccess, type MktTeamMember } from '@/lib/marketing';
import { uuid } from '@/lib/hr-server';

const CHANNELS = ['facebook', 'instagram', 'tiktok', 'snapchat', 'google', 'whatsapp', 'influencer', 'offline', 'other'];
const OBJECTIVES = ['awareness', 'leads', 'sales', 'retention'];
const CAMPAIGN_STATUSES = ['planned', 'active', 'paused', 'completed', 'cancelled'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const TASK_STATUSES = ['todo', 'in_progress', 'review', 'done', 'cancelled'];

/** The signed-in user plus their standing in the department; refuses anyone outside it. */
export async function marketingUser(req: Request, path: string) {
  const user = await businessUser(req, path);
  const access = marketingAccess(user);
  if (!access) throw new BusinessError('هذه الصفحة لفريق التسويق فقط.', 403);
  return { user, access };
}

export function requireManage(access: MarketingAccess) {
  if (access !== 'manage') throw new BusinessError('هذه العملية لمدير التسويق والمنسّق فقط.', 403);
}

export function accountName(id: string | null | undefined): string {
  if (!id) return '';
  if (id === 'leads-webhook') return 'نموذج الإعلان (آلي)';
  const account = SYSTEM_ACCOUNTS.find((a) => a.profile.id === id);
  return account ? account.profile.name.replace(/\s*\([^)]*\)\s*$/, '').trim() || account.profile.name : id;
}

export function accountUsernameOf(id: string): string | null {
  return SYSTEM_ACCOUNTS.find((a) => a.profile.id === id)?.profile.username ?? null;
}

/** The roster with display names, for pickers and the team panel. */
export function marketingTeam(): MktTeamMember[] {
  return MARKETING_TEAM.flatMap((m) => {
    const account = SYSTEM_ACCOUNTS.find((a) => a.profile.id === m.accountId);
    return account ? [{ ...m, name: accountName(m.accountId), username: account.profile.username }] : [];
  });
}

function oneOf(value: unknown, allowed: string[], label: string): string {
  const v = text(value, 40);
  if (!allowed.includes(v)) throw new BusinessError(`${label} غير صالح.`);
  return v;
}

function optionalMoney(value: unknown): string {
  return value === '' || value === null || value === undefined ? '' : String(money(value));
}

function optionalCount(value: unknown, label: string): string {
  if (value === '' || value === null || value === undefined) return '';
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 1000000) throw new BusinessError(`${label} غير صالح.`);
  return String(n);
}

function teamAccount(value: unknown, label: string, allowEmpty: boolean): string {
  const v = text(value, 100);
  if (!v && allowEmpty) return '';
  if (!MARKETING_TEAM.some((m) => m.accountId === v)) throw new BusinessError(`${label} ليس من فريق التسويق.`);
  return v;
}

const CAMPAIGN_FIELDS: Record<string, (v: unknown) => string> = {
  code: (v) => {
    const code = text(v, 24);
    if (!/^[A-Za-z0-9_-]{2,24}$/.test(code)) throw new BusinessError('رمز الحملة: حرفان إلى 24 حرفًا إنجليزيًا أو أرقامًا أو - و _ (مثل META-SEP).');
    return code;
  },
  name: (v) => {
    const name = text(v, 200);
    if (name.length < 2) throw new BusinessError('اسم الحملة مطلوب.');
    return name;
  },
  channel: (v) => oneOf(v, CHANNELS, 'القناة'),
  objective: (v) => oneOf(v, OBJECTIVES, 'الهدف'),
  status: (v) => oneOf(v, CAMPAIGN_STATUSES, 'حالة الحملة'),
  start_date: (v) => {
    const d = date(v);
    if (!d) throw new BusinessError('تاريخ بداية الحملة مطلوب.');
    return d;
  },
  end_date: (v) => date(v) || '',
  budget: optionalMoney,
  target_leads: (v) => optionalCount(v, 'هدف الليدات'),
  target_revenue: optionalMoney,
  owner_account_id: (v) => teamAccount(v, 'مسؤول الحملة', true),
  promo_code: (v) => text(v, 24),
  audience: (v) => text(v, 500),
  notes: (v) => text(v, 2000),
};

export function prepareCampaign(body: Record<string, unknown>) {
  const raw = body.fields;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BusinessError('بيانات الحملة غير صالحة.');
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const parse = CAMPAIGN_FIELDS[key];
    if (parse && value !== undefined) fields[key] = parse(value);
  }
  const id = body.id ? uuid(body.id, 'معرّف الحملة') : '';
  if (!id) for (const key of ['code', 'name', 'channel', 'start_date'])
    if (!fields[key]) throw new BusinessError('الرمز والاسم والقناة وتاريخ البداية مطلوبة لإنشاء حملة.');
  if (id && !Object.keys(fields).length) throw new BusinessError('لا توجد تغييرات للحفظ.');
  if (fields.start_date && fields.end_date && fields.end_date < fields.start_date)
    throw new BusinessError('تاريخ نهاية الحملة يجب أن يكون بعد بدايتها.');
  return id ? { id, fields } : { fields };
}

export function prepareSpend(body: Record<string, unknown>) {
  const spend_date = date(body.spend_date);
  if (!spend_date) throw new BusinessError('تاريخ المصروف مطلوب.');
  const amount = money(body.amount);
  if (amount <= 0) throw new BusinessError('مبلغ المصروف يجب أن يكون أكبر من صفر.');
  return { campaign_id: uuid(body.campaign_id, 'معرّف الحملة'), spend_date, amount: String(amount), description: text(body.description, 500) };
}

export function prepareSpendVoid(body: Record<string, unknown>) {
  const reason = text(body.reason, 500);
  if (reason.length < 3) throw new BusinessError('سبب الإلغاء مطلوب.');
  return { id: uuid(body.id, 'معرّف المصروف'), reason };
}

export function prepareAttribution(body: Record<string, unknown>) {
  const mode = body.mode === 'clear' ? 'clear' : 'set';
  if (!Array.isArray(body.customer_ids) || !body.customer_ids.length || body.customer_ids.length > 500)
    throw new BusinessError('اختر ليدًا واحدًا على الأقل (حتى 500).');
  const customer_ids = [...new Set(body.customer_ids.map((v) => uuid(v, 'معرّف العميل')))];
  return { campaign_id: uuid(body.campaign_id, 'معرّف الحملة'), customer_ids, mode };
}

const TASK_FIELDS: Record<string, (v: unknown) => string> = {
  title: (v) => {
    const t = text(v, 200);
    if (t.length < 2) throw new BusinessError('عنوان المهمة مطلوب.');
    return t;
  },
  description: (v) => text(v, 4000),
  campaign_id: (v) => (v ? uuid(v, 'الحملة') : ''),
  assignee_account_id: (v) => teamAccount(v, 'المسؤول عن المهمة', false),
  due_date: (v) => date(v) || '',
  priority: (v) => oneOf(v, PRIORITIES, 'الأولوية'),
};

/**
 * A task save. A member (not a manager) is scoped to herself: the database refuses a task she
 * raises for someone else, or an edit to one that is not hers.
 */
export function prepareTask(body: Record<string, unknown>, user: { id: string }, access: MarketingAccess) {
  const raw = body.fields;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BusinessError('بيانات المهمة غير صالحة.');
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const parse = TASK_FIELDS[key];
    if (parse && value !== undefined) fields[key] = parse(value);
  }
  const id = body.id ? uuid(body.id, 'معرّف المهمة') : '';
  if (!id && !fields.title) throw new BusinessError('عنوان المهمة مطلوب.');
  if (!id && access === 'manage' && !fields.assignee_account_id) throw new BusinessError('اختر المسؤول عن المهمة.');
  if (id && !Object.keys(fields).length) throw new BusinessError('لا توجد تغييرات للحفظ.');
  const data: Record<string, unknown> = id ? { id, fields } : { fields };
  if (access !== 'manage') data.scope_account = user.id;
  return data;
}

export function prepareTaskUpdate(body: Record<string, unknown>, user: { id: string }, access: MarketingAccess) {
  const data: Record<string, unknown> = { id: uuid(body.id, 'معرّف المهمة') };
  const note = text(body.note, 2000);
  if (body.status !== undefined && body.status !== '') {
    data.status = oneOf(body.status, TASK_STATUSES, 'حالة المهمة');
    if (body.expected_status) data.expected_status = oneOf(body.expected_status, TASK_STATUSES, 'حالة المهمة');
  } else if (!note) throw new BusinessError('اكتب التعليق أولًا.');
  if (note) data.note = note;
  if (access === 'manage') data.may_close = true;
  else data.scope_account = user.id;
  return data;
}
