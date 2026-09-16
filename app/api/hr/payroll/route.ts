import {businessUser,businessRpc,businessFailure,requestKey,readBody,BusinessError} from '@/lib/business-server';
import {
  preparePayrollGenerate,preparePayrollTransition,preparePayrollAdjustment,prepareAdvance,prepareComponent,
  preparePayrollSettings,parseMonth,uuid,
} from '@/lib/hr-server';
import {notifyPayrollTransition} from '@/lib/hr-notify';
import {
  canManageHr,canViewPayroll,
  type HrPayrollRun,type HrEmployee,type HrAdvance,type HrPayrollAdjustment,type HrSalaryComponent,
} from '@/lib/hr';
export const dynamic='force-dynamic';

async function payrollUser(req:Request) {
  const user=await businessUser(req,'/api/hr/payroll');
  if(!canViewPayroll(user.role))throw new BusinessError('لا تملك صلاحية الرواتب.',403);
  return user;
}
function requireHr(role:Parameters<typeof canManageHr>[0]) {
  if(!canManageHr(role))throw new BusinessError('هذه العملية متاحة للموارد البشرية فقط.',403);
}

// GET                    -> runs + settings (+ employees/advances for HR)
// GET ?id=<run>          -> one run with payslips
// GET ?adjustments=YYYY-MM  (HR) -> one-off adjustments of that month
// GET ?employee=<id>        (HR) -> that employee's salary components and advances
export async function GET(req:Request) {
  try{const user=await payrollUser(req);
    const params=new URL(req.url).searchParams;
    const headers={'Cache-Control':'no-store'};
    if(params.get('id')){
      const run=await businessRpc<HrPayrollRun|null>('business_hr_payroll_run',{p_id:uuid(params.get('id'),'مسير الرواتب')});
      if(!run)throw new BusinessError('مسير الرواتب غير موجود.',404);
      return Response.json({run},{headers});
    }
    if(params.get('adjustments')){
      requireHr(user.role);
      const adjustments=await businessRpc<HrPayrollAdjustment[]>('business_hr_payroll_adjustments',{p_month:parseMonth(params.get('adjustments'))});
      return Response.json({adjustments},{headers});
    }
    if(params.get('employee')){
      requireHr(user.role);
      const id=uuid(params.get('employee'),'معرّف الموظف');
      const [components,advances]=await Promise.all([
        businessRpc<HrSalaryComponent[]>('business_hr_salary_components',{p_employee:id}),
        businessRpc<HrAdvance[]>('business_hr_advances',{p_employee:id}),
      ]);
      return Response.json({components,advances},{headers});
    }
    const [runs,settings,today]=await Promise.all([
      businessRpc<HrPayrollRun[]>('business_hr_payroll_runs',{}),
      businessRpc<Record<string,unknown>>('business_hr_settings',{}),
      businessRpc<string>('business_hr_today',{}),
    ]);
    if(!canManageHr(user.role))return Response.json({runs,settings:{payroll:settings.payroll},today},{headers});
    const [employees,advances]=await Promise.all([
      businessRpc<HrEmployee[]>('business_hr_employee_list',{p_sensitive:false}),
      businessRpc<HrAdvance[]>('business_hr_advances',{p_employee:null}),
    ]);
    return Response.json({runs,settings:{payroll:settings.payroll},today,employees,advances},{headers});
  }catch(e){return businessFailure(e);}
}

// POST {kind: generate|transition|adjustment|advance|component|settings, ...}
// Finance may only use `transition` (and only the `pay` action is authorised for it in SQL).
export async function POST(req:Request) {
  try{const user=await payrollUser(req),key=requestKey(req),body=await readBody(req);
    const call=<T extends object=Record<string,unknown>>(fn:string,data:unknown)=>businessRpc<T>(fn,{p_actor:user.id,p_key:key,p_data:data});
    switch(body.kind){
      case 'transition':{
        const result=await call<{run:HrPayrollRun;changed:boolean;replayed:boolean}>('business_hr_payroll_transition',
          preparePayrollTransition(body,user.role));
        if(!result.replayed&&!result.changed)await notifyPayrollTransition(result.run,String(body.action),user.username);
        return Response.json({success:true,...result});
      }
      case 'generate':
        requireHr(user.role);
        return Response.json({success:true,...await call<{run:HrPayrollRun;replayed:boolean}>('business_hr_payroll_generate',preparePayrollGenerate(body))});
      case 'adjustment':
        requireHr(user.role);
        return Response.json({success:true,...await call('business_hr_adjustment_save',preparePayrollAdjustment(body))});
      case 'advance':
        requireHr(user.role);
        return Response.json({success:true,...await call('business_hr_advance_save',prepareAdvance(body))});
      case 'component':
        requireHr(user.role);
        return Response.json({success:true,...await call('business_hr_component_save',prepareComponent(body))});
      case 'settings':
        requireHr(user.role);
        return Response.json({success:true,...await call('business_hr_settings_save',preparePayrollSettings(body))});
      default:
        throw new BusinessError('نوع العملية غير صالح.');
    }
  }catch(e){return businessFailure(e);}
}
