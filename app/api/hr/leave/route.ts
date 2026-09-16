import {businessUser,businessRpc,businessFailure,requestKey,readBody,BusinessError} from '@/lib/business-server';
import {prepareLeaveRequest,prepareLeaveDecision,prepareLeaveType,prepareLeaveAdjustment,parseYear,hrActor} from '@/lib/hr-server';
import {notifyLeaveRequested,notifyLeaveDecided} from '@/lib/hr-notify';
import {canManageHr,type HrEmployee,type HrHoliday,type HrLeaveRequest,type HrLeaveBalance,type HrLeaveType,type HrLeaveAdjustment} from '@/lib/hr';
export const dynamic='force-dynamic';

async function hrManager(req:Request) {
  const user=await businessUser(req,'/api/hr/leave');
  if(!canManageHr(user.role))throw new BusinessError('لا تملك صلاحية إدارة الإجازات.',403);
  return user;
}

// GET ?year=YYYY -> all requests, balances, types, adjustments and the data forms need.
export async function GET(req:Request) {
  try{await hrManager(req);
    const year=parseYear(new URL(req.url).searchParams.get('year'));
    const [requests,balances,types,adjustments,employees,holidays,settings,today]=await Promise.all([
      businessRpc<HrLeaveRequest[]>('business_hr_leave_requests',{p_year:year,p_employee:null,p_manager:null}),
      businessRpc<HrLeaveBalance[]>('business_hr_leave_balances',{p_year:year,p_employee:null}),
      businessRpc<HrLeaveType[]>('business_hr_leave_types',{}),
      businessRpc<HrLeaveAdjustment[]>('business_hr_leave_adjustments',{p_year:year,p_employee:null}),
      businessRpc<HrEmployee[]>('business_hr_employee_list',{p_sensitive:false}),
      businessRpc<HrHoliday[]>('business_hr_holidays',{p_year:null}),
      businessRpc<Record<string,unknown>>('business_hr_settings',{}),
      businessRpc<string>('business_hr_today',{}),
    ]);
    return Response.json({year,today,requests,balances,types,adjustments,employees,holidays,settings},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return businessFailure(e);}
}

// POST {kind:'request'|'type'|'adjustment', ...}
export async function POST(req:Request) {
  try{const user=await hrManager(req),key=requestKey(req),body=await readBody(req);
    if(body.kind==='request'){
      const result=await businessRpc<{request:HrLeaveRequest;replayed:boolean}>('business_hr_leave_request_create',
        {p_actor:user.id,p_key:key,p_data:{...prepareLeaveRequest(body),...await hrActor(user)}});
      if(!result.replayed)await notifyLeaveRequested(result.request,user.username);
      return Response.json({success:true,...result},{status:result.replayed?200:201});
    }
    if(body.kind==='type'){
      const result=await businessRpc<{id:string;replayed:boolean}>('business_hr_leave_type_save',
        {p_actor:user.id,p_key:key,p_data:prepareLeaveType(body)});
      return Response.json({success:true,...result});
    }
    if(body.kind==='adjustment'){
      const result=await businessRpc<{id:string;replayed:boolean}>('business_hr_leave_adjust',
        {p_actor:user.id,p_key:key,p_data:prepareLeaveAdjustment(body)});
      return Response.json({success:true,...result},{status:result.replayed?200:201});
    }
    throw new BusinessError('نوع العملية غير صالح.');
  }catch(e){return businessFailure(e);}
}

// PATCH {id, action:'approve'|'reject'|'cancel', note}
export async function PATCH(req:Request) {
  try{const user=await hrManager(req),key=requestKey(req),body=await readBody(req);
    const result=await businessRpc<{request:HrLeaveRequest;replayed:boolean}>('business_hr_leave_decide',
      {p_actor:user.id,p_key:key,p_data:{...prepareLeaveDecision(body),...await hrActor(user)}});
    if(!result.replayed)await notifyLeaveDecided(result.request,user.username);
    return Response.json({success:true,...result});
  }catch(e){return businessFailure(e);}
}
