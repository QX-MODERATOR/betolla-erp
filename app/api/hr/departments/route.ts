import {businessUser,businessRpc,businessFailure,requestKey,readBody,BusinessError} from '@/lib/business-server';
import {prepareDepartment} from '@/lib/hr-server';
import {canManageHr,type HrDepartment} from '@/lib/hr';
export const dynamic='force-dynamic';

async function hrManager(req:Request) {
  const user=await businessUser(req,'/api/hr/departments');
  if(!canManageHr(user.role))throw new BusinessError('لا تملك صلاحية إدارة الأقسام.',403);
  return user;
}

export async function GET(req:Request) {
  try{await hrManager(req);
    const departments=await businessRpc<HrDepartment[]>('business_hr_departments',{});
    return Response.json({departments},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return businessFailure(e);}
}

// Creates a department (no id) or updates one (with id).
export async function POST(req:Request) {
  try{const user=await hrManager(req),key=requestKey(req),body=await readBody(req);
    const result=await businessRpc<{id:string;replayed:boolean}>('business_hr_department_save',
      {p_actor:user.id,p_key:key,p_data:prepareDepartment(body)});
    return Response.json({success:true,...result},{status:result.replayed?200:201});
  }catch(e){return businessFailure(e);}
}
