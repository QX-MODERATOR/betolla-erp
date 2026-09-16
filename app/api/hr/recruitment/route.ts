import {businessUser,businessRpc,businessFailure,requestKey,readBody,BusinessError} from '@/lib/business-server';
import {prepareOpening,prepareCandidate,prepareHire} from '@/lib/hr-server';
import {canManageHr,type HrOpening,type HrCandidate,type HrDepartment,type HrEmployee} from '@/lib/hr';
export const dynamic='force-dynamic';

async function hrManager(req:Request) {
  const user=await businessUser(req,'/api/hr/recruitment');
  if(!canManageHr(user.role))throw new BusinessError('لا تملك صلاحية التوظيف.',403);
  return user;
}

// GET -> openings (with stage counts), all candidates, departments.
export async function GET(req:Request) {
  try{await hrManager(req);
    const [openings,candidates,departments]=await Promise.all([
      businessRpc<HrOpening[]>('business_hr_openings',{}),
      businessRpc<HrCandidate[]>('business_hr_candidates',{p_opening:null}),
      businessRpc<HrDepartment[]>('business_hr_departments',{}),
    ]);
    return Response.json({openings,candidates,departments},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return businessFailure(e);}
}

// POST {kind:'opening'|'candidate'|'hire', ...}
export async function POST(req:Request) {
  try{const user=await hrManager(req),key=requestKey(req),body=await readBody(req);
    const call=<T extends object>(fn:string,data:unknown)=>businessRpc<T>(fn,{p_actor:user.id,p_key:key,p_data:data});
    if(body.kind==='opening')
      return Response.json({success:true,...await call<{id:string;replayed:boolean}>('business_hr_opening_save',prepareOpening(body))});
    if(body.kind==='candidate')
      return Response.json({success:true,...await call<{candidate:HrCandidate;replayed:boolean}>('business_hr_candidate_save',prepareCandidate(body))});
    if(body.kind==='hire')
      return Response.json({success:true,...await call<{employee:HrEmployee;opening_closed:boolean;replayed:boolean}>('business_hr_candidate_hire',prepareHire(body))},{status:201});
    throw new BusinessError('نوع العملية غير صالح.');
  }catch(e){return businessFailure(e);}
}
