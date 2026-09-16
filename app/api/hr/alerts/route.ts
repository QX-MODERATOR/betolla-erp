import {businessUser,businessRpc,businessFailure,BusinessError} from '@/lib/business-server';
import {dispatchExpiryAlerts} from '@/lib/hr-notify';
import {canManageHr,type HrExpiry} from '@/lib/hr';
export const dynamic='force-dynamic';

// GET [?days=90] -> documents/contracts/probation periods expiring soon (or already expired).
// Also sends any newly-due reminders (30 days, 7 days, expired), each once per expiry date.
export async function GET(req:Request) {
  try{const user=await businessUser(req,'/api/hr/alerts');
    if(!canManageHr(user.role))throw new BusinessError('لا تملك صلاحية التنبيهات.',403);
    const days=Math.min(Math.max(Number(new URL(req.url).searchParams.get('days'))||90,1),365);
    const sent=await dispatchExpiryAlerts();
    const expiries=await businessRpc<HrExpiry[]>('business_hr_expiries',{p_days:days});
    return Response.json({expiries,sent},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return businessFailure(e);}
}
