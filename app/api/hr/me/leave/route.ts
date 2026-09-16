import {businessUser,businessRpc,businessFailure,requestKey,readBody,BusinessError} from '@/lib/business-server';
import {prepareLeaveRequest,prepareLeaveDecision,hrActor} from '@/lib/hr-server';
import {notifyLeaveRequested,notifyLeaveDecided} from '@/lib/hr-notify';
import type {HrLeaveRequest} from '@/lib/hr';
export const dynamic='force-dynamic';

async function selfActor(req:Request) {
  const user=await businessUser(req,'/api/hr/me/leave');
  const actor=await hrActor(user);
  if(!actor.actor_employee_id)throw new BusinessError('حسابك غير مرتبط بملف وظيفي. تواصل مع الموارد البشرية.',404);
  return {user,actor};
}

// POST -> request leave for yourself (always pending).
export async function POST(req:Request) {
  try{const {user,actor}=await selfActor(req),key=requestKey(req),body=await readBody(req);
    const result=await businessRpc<{request:HrLeaveRequest;replayed:boolean}>('business_hr_leave_request_create',
      {p_actor:user.id,p_key:key,p_data:{...prepareLeaveRequest(body,actor.actor_employee_id),...actor,is_hr:false}});
    if(!result.replayed)await notifyLeaveRequested(result.request,user.username);
    return Response.json({success:true,...result},{status:result.replayed?200:201});
  }catch(e){return businessFailure(e);}
}

// PATCH {id, action, note} -> cancel your own request, or approve/reject a direct report's.
// Authority is decided in SQL from the server-derived employee id (HR role is not applied here).
export async function PATCH(req:Request) {
  try{const {user,actor}=await selfActor(req),key=requestKey(req),body=await readBody(req);
    const result=await businessRpc<{request:HrLeaveRequest;replayed:boolean}>('business_hr_leave_decide',
      {p_actor:user.id,p_key:key,p_data:{...prepareLeaveDecision(body),...actor,is_hr:false}});
    if(!result.replayed)await notifyLeaveDecided(result.request,user.username);
    return Response.json({success:true,...result});
  }catch(e){return businessFailure(e);}
}
