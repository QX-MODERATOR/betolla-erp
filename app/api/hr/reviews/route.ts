import {businessUser,businessRpc,businessFailure,requestKey,readBody,BusinessError} from '@/lib/business-server';
import {prepareReview,hrActor,repNames,employeeKpis,kpiRange,uuid} from '@/lib/hr-server';
import {notifyReviewSubmitted} from '@/lib/hr-notify';
import {canManageHr,type HrReview,type HrEmployee} from '@/lib/hr';
export const dynamic='force-dynamic';

async function hrManager(req:Request) {
  const user=await businessUser(req,'/api/hr/reviews');
  if(!canManageHr(user.role))throw new BusinessError('لا تملك صلاحية تقييمات الأداء.',403);
  return user;
}

// GET                              -> all reviews + employees + today
// GET ?kpis=<employee>&from=&to=   -> objective indicators for a period (preview while writing a review)
export async function GET(req:Request) {
  try{await hrManager(req);
    const params=new URL(req.url).searchParams;
    if(params.get('kpis')){
      const id=uuid(params.get('kpis'),'معرّف الموظف'),{from,to}=kpiRange(params);
      const employee=await businessRpc<HrEmployee|null>('business_hr_employee_document',{p_id:id,p_sensitive:false});
      if(!employee)throw new BusinessError('الموظف غير موجود.',404);
      return Response.json({kpis:await employeeKpis(employee,from,to)},{headers:{'Cache-Control':'no-store'}});
    }
    const [reviews,employees,today]=await Promise.all([
      businessRpc<HrReview[]>('business_hr_reviews',{p_employee:null,p_manager:null,p_visible_only:false}),
      businessRpc<HrEmployee[]>('business_hr_employee_list',{p_sensitive:false}),
      businessRpc<string>('business_hr_today',{}),
    ]);
    return Response.json({reviews,employees,today},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return businessFailure(e);}
}

// POST -> create/update a review; the KPI snapshot is taken by the database at save time.
export async function POST(req:Request) {
  try{const user=await hrManager(req),key=requestKey(req),body=await readBody(req);
    const result=await businessRpc<{review:HrReview;replayed:boolean}>('business_hr_review_save',
      {p_actor:user.id,p_key:key,p_data:{...prepareReview(body),rep_names:repNames(),...await hrActor(user)}});
    if(!result.replayed)await notifyReviewSubmitted(result.review,user.username);
    return Response.json({success:true,...result});
  }catch(e){return businessFailure(e);}
}
