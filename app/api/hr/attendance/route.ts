import {businessUser,businessRpc,businessFailure,requestKey,readBody,BusinessError} from '@/lib/business-server';
import {prepareAttendanceCorrection,parseMonth} from '@/lib/hr-server';
import {canManageHr,monthDays,type HrAttendance,type HrEmployee,type HrHoliday,type HrLeaveRequest} from '@/lib/hr';
export const dynamic='force-dynamic';

async function hrManager(req:Request) {
  const user=await businessUser(req,'/api/hr/attendance');
  if(!canManageHr(user.role))throw new BusinessError('لا تملك صلاحية سجلات الحضور.',403);
  return user;
}

// GET ?month=YYYY-MM -> everything the monthly attendance sheet needs.
export async function GET(req:Request) {
  try{await hrManager(req);
    const month=parseMonth(new URL(req.url).searchParams.get('month'));
    const days=monthDays(month),from=days[0],to=days.at(-1)!,year=Number(month.slice(0,4));
    const [employees,records,holidays,settings,requests,today]=await Promise.all([
      businessRpc<HrEmployee[]>('business_hr_employee_list',{p_sensitive:false}),
      businessRpc<HrAttendance[]>('business_hr_attendance_range',{p_from:from,p_to:to,p_employee:null}),
      businessRpc<HrHoliday[]>('business_hr_holidays',{p_year:year}),
      businessRpc<Record<string,unknown>>('business_hr_settings',{}),
      businessRpc<HrLeaveRequest[]>('business_hr_leave_requests',{p_year:year,p_employee:null,p_manager:null}),
      businessRpc<string>('business_hr_today',{}),
    ]);
    const leaves=requests.filter(r=>r.status==='approved'&&r.end_date>=from&&r.start_date<=to);
    return Response.json({month,today,employees,records,holidays,settings,leaves},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return businessFailure(e);}
}

// POST -> HR correction of one employee's day (reason required, audited).
export async function POST(req:Request) {
  try{const user=await hrManager(req),key=requestKey(req),body=await readBody(req);
    const result=await businessRpc<{attendance:HrAttendance;replayed:boolean}>('business_hr_attendance_set',
      {p_actor:user.id,p_key:key,p_data:prepareAttendanceCorrection(body)});
    return Response.json({success:true,...result});
  }catch(e){return businessFailure(e);}
}
