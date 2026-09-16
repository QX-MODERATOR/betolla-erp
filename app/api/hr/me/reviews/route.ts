import {businessUser,businessRpc,businessFailure,requestKey,readBody,BusinessError} from '@/lib/business-server';
import {prepareReview,prepareAcknowledge,hrActor,repNames,employeeKpis,kpiRange,uuid} from '@/lib/hr-server';
import {notifyReviewSubmitted} from '@/lib/hr-notify';
import type {HrReview,HrEmployee} from '@/lib/hr';
export const dynamic='force-dynamic';

// Self-service performance: your own (non-draft) reviews and, for managers, reviews of direct reports.
// Authority is always derived server-side; the HR role is deliberately not applied on this route.
async function self(req:Request) {
  const user=await businessUser(req,'/api/hr/me/reviews');
  const actor=await hrActor(user);
  if(!actor.actor_employee_id)throw new BusinessError('حسابك غير مرتبط بملف وظيفي. تواصل مع الموارد البشرية.',404);
  return {user,actor:{...actor,is_hr:false}};
}

// GET                              -> {mine, team, reports, today}
// GET ?kpis=<report>&from=&to=     -> KPIs of one of your direct reports
export async function GET(req:Request) {
  try{const {actor}=await self(req);
    const me=actor.actor_employee_id;
    const params=new URL(req.url).searchParams;
    if(params.get('kpis')){
      const id=uuid(params.get('kpis'),'معرّف الموظف'),{from,to}=kpiRange(params);
      const employee=await businessRpc<HrEmployee|null>('business_hr_employee_document',{p_id:id,p_sensitive:false});
      if(!employee||employee.manager_id!==me)throw new BusinessError('يمكنك الاطلاع على مؤشرات فريقك المباشر فقط.',403);
      return Response.json({kpis:await employeeKpis(employee,from,to)},{headers:{'Cache-Control':'no-store'}});
    }
    const [mine,team,employees,today]=await Promise.all([
      businessRpc<HrReview[]>('business_hr_reviews',{p_employee:me,p_manager:null,p_visible_only:true}),
      businessRpc<HrReview[]>('business_hr_reviews',{p_employee:null,p_manager:me,p_visible_only:false}),
      businessRpc<HrEmployee[]>('business_hr_employee_list',{p_sensitive:false}),
      businessRpc<string>('business_hr_today',{}),
    ]);
    const reports=employees.filter(e=>e.manager_id===me&&e.status!=='terminated');
    return Response.json({mine,team,reports,today},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return businessFailure(e);}
}

// POST -> a manager writes or edits a review for a direct report.
export async function POST(req:Request) {
  try{const {user,actor}=await self(req),key=requestKey(req),body=await readBody(req);
    const result=await businessRpc<{review:HrReview;replayed:boolean}>('business_hr_review_save',
      {p_actor:user.id,p_key:key,p_data:{...prepareReview(body),rep_names:repNames(),...actor}});
    if(!result.replayed)await notifyReviewSubmitted(result.review,user.username);
    return Response.json({success:true,...result});
  }catch(e){return businessFailure(e);}
}

// PATCH {id, comment} -> acknowledge your own submitted review.
export async function PATCH(req:Request) {
  try{const {user,actor}=await self(req),key=requestKey(req),body=await readBody(req);
    const result=await businessRpc<{review:HrReview;replayed:boolean}>('business_hr_review_acknowledge',
      {p_actor:user.id,p_key:key,p_data:{...prepareAcknowledge(body),actor_employee_id:actor.actor_employee_id}});
    return Response.json({success:true,...result});
  }catch(e){return businessFailure(e);}
}
