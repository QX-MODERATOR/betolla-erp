import {businessUser,businessRpc,businessFailure,requestKey,readBody,BusinessError} from '@/lib/business-server';
import {preparePunch} from '@/lib/hr-server';
import type {HrAttendance} from '@/lib/hr';
export const dynamic='force-dynamic';

// GET -> lightweight "today" status for the header punch button.
export async function GET(req:Request) {
  try{const user=await businessUser(req,'/api/hr/me/attendance');
    const employeeId=await businessRpc<string|null>('business_hr_employee_id_for_account',{p_account:user.id});
    if(!employeeId)return Response.json({linked:false},{headers:{'Cache-Control':'no-store'}});
    const today=await businessRpc<string>('business_hr_today',{});
    const [records,settings]=await Promise.all([
      businessRpc<HrAttendance[]>('business_hr_attendance_range',{p_from:today,p_to:today,p_employee:employeeId}),
      businessRpc<Record<string,unknown>>('business_hr_settings',{}),
    ]);
    return Response.json({linked:true,today,record:records[0]??null,settings},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return businessFailure(e);}
}

// POST {action:'check_in'|'check_out'} for the caller's own linked employee record.
// The timestamp is taken from the database clock, not the device.
export async function POST(req:Request) {
  try{const user=await businessUser(req,'/api/hr/me/attendance'),key=requestKey(req),body=await readBody(req);
    const employeeId=await businessRpc<string|null>('business_hr_employee_id_for_account',{p_account:user.id});
    if(!employeeId)throw new BusinessError('حسابك غير مرتبط بملف وظيفي. تواصل مع الموارد البشرية.',404);
    const result=await businessRpc<{attendance:HrAttendance;replayed:boolean}>('business_hr_attendance_punch',
      {p_actor:user.id,p_key:key,p_data:preparePunch(body,employeeId)});
    return Response.json({success:true,...result});
  }catch(e){return businessFailure(e);}
}
