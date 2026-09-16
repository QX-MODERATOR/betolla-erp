import { extractTokenFromRequest, verifyAuthToken } from '@/lib/auth';
import { businessRpc, businessFailure, readBody, BusinessError } from '@/lib/business-server';

export const dynamic = 'force-dynamic';

// Notifications are scoped by the caller's own username, never another
// user's — there's no cross-account exposure, so this only requires a valid
// session, not the per-route RBAC allow-lists in isRouteAllowedForRole
// (several roles use positive allow-lists that don't list this route).
async function requireUser(req: Request) {
  const token = extractTokenFromRequest(req);
  const user = token ? await verifyAuthToken(token) : null;
  if (!user) throw new BusinessError('يرجى تسجيل الدخول.', 401);
  return user;
}

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const result = await businessRpc<{ notifications: unknown[]; unread_count: number }>(
      'business_notifications_list',
      { p_username: user.username }
    );
    return Response.json({ success: true, ...result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return businessFailure(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser(req);
    const body = await readBody(req);
    if (body.all) {
      await businessRpc('business_notifications_mark_all_read', { p_username: user.username });
    } else {
      const id = typeof body.id === 'string' ? body.id : '';
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('INVALID_NOTIFICATION_ID');
      await businessRpc('business_notification_mark_read', { p_username: user.username, p_id: id });
    }
    return Response.json({ success: true });
  } catch (e) {
    return businessFailure(e);
  }
}
