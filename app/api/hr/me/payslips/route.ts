import {businessUser,businessRpc,businessFailure} from '@/lib/business-server';
import type {HrPayslip,HrAdvance} from '@/lib/hr';
export const dynamic='force-dynamic';

// The caller's own payslips (approved/paid runs only) and salary advances.
export async function GET(req:Request) {
  try{const user=await businessUser(req,'/api/hr/me/payslips');
    const employeeId=await businessRpc<string|null>('business_hr_employee_id_for_account',{p_account:user.id});
    if(!employeeId)return Response.json({linked:false,payslips:[],advances:[]},{headers:{'Cache-Control':'no-store'}});
    const [payslips,advances]=await Promise.all([
      businessRpc<HrPayslip[]>('business_hr_payslips_for_employee',{p_employee:employeeId}),
      businessRpc<HrAdvance[]>('business_hr_advances',{p_employee:employeeId}),
    ]);
    return Response.json({linked:true,payslips,advances},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return businessFailure(e);}
}
