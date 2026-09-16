import {businessUser,businessRpc,businessFailure} from '@/lib/business-server';
import {parseMonth} from '@/lib/hr-server';
import {dispatchExpiryAlerts} from '@/lib/hr-notify';
import {monthDays,type HrDocument,type HrEmployee,type HrAttendance,type HrHoliday,type HrLeaveRequest,type HrLeaveBalance,type HrLeaveType} from '@/lib/hr';
export const dynamic='force-dynamic';

// Self-service: always scoped to the caller's own login account id, never a
// client-supplied one. HR-internal notes are stripped from the employee's view.
// GET ?month=YYYY-MM selects which month of attendance to return.
export async function GET(req:Request) {
  try{const user=await businessUser(req,'/api/hr/me');
    const employee=await businessRpc<HrEmployee|null>('business_hr_employee_by_account',{p_account:user.id});
    if(!employee)return Response.json({employee:null},{headers:{'Cache-Control':'no-store'}});
    delete employee.notes;
    const month=parseMonth(new URL(req.url).searchParams.get('month'));
    const days=monthDays(month),year=Number(month.slice(0,4));
    // Any employee's visit also triggers due expiry reminders (each is sent at most once).
    await dispatchExpiryAlerts();
    const [today,settings,attendance,holidays,types,requests,teamRequests,documents]=await Promise.all([
      businessRpc<string>('business_hr_today',{}),
      businessRpc<Record<string,unknown>>('business_hr_settings',{}),
      businessRpc<HrAttendance[]>('business_hr_attendance_range',{p_from:days[0],p_to:days.at(-1),p_employee:employee.id}),
      businessRpc<HrHoliday[]>('business_hr_holidays',{p_year:null}),
      businessRpc<HrLeaveType[]>('business_hr_leave_types',{}),
      businessRpc<HrLeaveRequest[]>('business_hr_leave_requests',{p_year:null,p_employee:employee.id,p_manager:null}),
      businessRpc<HrLeaveRequest[]>('business_hr_leave_requests',{p_year:null,p_employee:null,p_manager:employee.id}),
      businessRpc<HrDocument[]>('business_hr_documents',{p_employee:employee.id}),
    ]);
    const balanceYear=Number(today.slice(0,4));
    const balances=await businessRpc<HrLeaveBalance[]>('business_hr_leave_balances',{p_year:balanceYear,p_employee:employee.id});
    const todayRecord=(today.slice(0,7)===month?attendance:
      await businessRpc<HrAttendance[]>('business_hr_attendance_range',{p_from:today,p_to:today,p_employee:employee.id}))
      .find(a=>a.work_date===today)??null;
    return Response.json({
      employee,month,today,settings,attendance,todayRecord,holidays,balances,balanceYear,
      types:types.filter(t=>t.is_active&&(!t.gender||t.gender===employee.gender)),
      requests:requests.filter(r=>Number(r.start_date.slice(0,4))>=year-1),
      // Only what a manager needs to act on: their direct reports' open requests.
      teamRequests:teamRequests.filter(r=>r.status==='pending'),
      // Own document register, without HR-internal notes.
      documents:documents.filter(d=>!d.archived).map(d=>({...d,notes:''})),
    },{headers:{'Cache-Control':'no-store'}});
  }catch(e){return businessFailure(e);}
}
