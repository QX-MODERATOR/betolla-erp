import {businessUser,businessRpc,businessFailure} from '@/lib/business-server';
import type {HrEmployee} from '@/lib/hr';
export const dynamic='force-dynamic';

// Self-service: always scoped to the caller's own login account id, never a
// client-supplied one. HR-internal notes are stripped from the employee's view.
export async function GET(req:Request) {
  try{const user=await businessUser(req,'/api/hr/me');
    const employee=await businessRpc<HrEmployee|null>('business_hr_employee_by_account',{p_account:user.id});
    if(employee)delete employee.notes;
    return Response.json({employee},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return businessFailure(e);}
}
