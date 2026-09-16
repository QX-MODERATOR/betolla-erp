import {businessUser,businessRpc,businessFailure,requestKey,readBody,BusinessError} from '@/lib/business-server';
import {prepareDocument,uuid} from '@/lib/hr-server';
import {dispatchExpiryAlerts} from '@/lib/hr-notify';
import {canManageHr,type HrDocument,type HrEmployee} from '@/lib/hr';
export const dynamic='force-dynamic';

async function hrManager(req:Request) {
  const user=await businessUser(req,'/api/hr/documents');
  if(!canManageHr(user.role))throw new BusinessError('لا تملك صلاحية مستندات الموظفين.',403);
  return user;
}

// GET [?employee=<id>] -> document register (all, or one employee's) + employees for the form.
export async function GET(req:Request) {
  try{await hrManager(req);
    const employee=new URL(req.url).searchParams.get('employee');
    const [documents,employees,today]=await Promise.all([
      businessRpc<HrDocument[]>('business_hr_documents',{p_employee:employee?uuid(employee,'معرّف الموظف'):null}),
      businessRpc<HrEmployee[]>('business_hr_employee_list',{p_sensitive:false}),
      businessRpc<string>('business_hr_today',{}),
    ]);
    return Response.json({documents,employees,today},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return businessFailure(e);}
}

// POST -> create/update/archive a document record (metadata only). New expiries may trigger reminders.
export async function POST(req:Request) {
  try{const user=await hrManager(req),key=requestKey(req),body=await readBody(req);
    const result=await businessRpc<{id:string;replayed:boolean}>('business_hr_document_save',
      {p_actor:user.id,p_key:key,p_data:prepareDocument(body)});
    if(!result.replayed)await dispatchExpiryAlerts();
    return Response.json({success:true,...result});
  }catch(e){return businessFailure(e);}
}
