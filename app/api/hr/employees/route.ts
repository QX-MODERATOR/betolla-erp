import {businessUser,businessRpc,businessFailure,requestKey,readBody,BusinessError} from '@/lib/business-server';
import {prepareEmployeeCreate,prepareEmployeeUpdate,linkableAccounts,uuid} from '@/lib/hr-server';
import {canManageHr,type HrEmployee,type HrDepartment,type HrAuditEntry} from '@/lib/hr';
export const dynamic='force-dynamic';

async function hrManager(req:Request) {
  const user=await businessUser(req,'/api/hr/employees');
  if(!canManageHr(user.role))throw new BusinessError('لا تملك صلاحية سجلات الموظفين.',403);
  return user;
}

// GET            -> directory + departments + linkable login accounts
// GET ?id=<uuid> -> one employee (sensitive projection) + audit history
export async function GET(req:Request) {
  try{await hrManager(req);
    const id=new URL(req.url).searchParams.get('id');
    if(id){
      const employeeId=uuid(id,'معرّف الموظف');
      const [employee,history]=await Promise.all([
        businessRpc<HrEmployee|null>('business_hr_employee_document',{p_id:employeeId,p_sensitive:true}),
        businessRpc<HrAuditEntry[]>('business_hr_employee_history',{p_id:employeeId}),
      ]);
      if(!employee)throw new BusinessError('الموظف غير موجود.',404);
      return Response.json({employee,history,accounts:linkableAccounts()},{headers:{'Cache-Control':'no-store'}});
    }
    const [employees,departments]=await Promise.all([
      businessRpc<HrEmployee[]>('business_hr_employee_list',{p_sensitive:true}),
      businessRpc<HrDepartment[]>('business_hr_departments',{}),
    ]);
    return Response.json({employees,departments,accounts:linkableAccounts()},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return businessFailure(e);}
}

export async function POST(req:Request) {
  try{const user=await hrManager(req),key=requestKey(req),body=await readBody(req);
    const result=await businessRpc<{employee:HrEmployee;replayed:boolean}>('business_hr_employee_create',
      {p_actor:user.id,p_key:key,p_data:prepareEmployeeCreate(body)});
    return Response.json({success:true,...result},{status:result.replayed?200:201});
  }catch(e){return businessFailure(e);}
}

export async function PATCH(req:Request) {
  try{const user=await hrManager(req),key=requestKey(req),body=await readBody(req);
    const result=await businessRpc<{employee:HrEmployee;replayed:boolean}>('business_hr_employee_update',
      {p_actor:user.id,p_key:key,p_data:prepareEmployeeUpdate(body)});
    return Response.json({success:true,...result});
  }catch(e){return businessFailure(e);}
}
