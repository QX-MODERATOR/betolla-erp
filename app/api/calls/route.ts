import {businessUser,businessRpc,businessFailure,requestKey,readBody,prepareCallLog} from '@/lib/business-server';
import {normalizeRepName} from '@/lib/reps';
import type {BusinessCustomer} from '@/lib/business';
export const dynamic='force-dynamic';
export async function POST(req:Request) {
  try{const user=await businessUser(req,'/api/calls'),key=requestKey(req),body=await readBody(req);
    const result=await businessRpc<{customer:BusinessCustomer;log_id:string;replayed:boolean}>('business_call_log_create',
      {p_actor:user.id,p_key:key,p_data:prepareCallLog(body),p_rep_name:normalizeRepName(user.name)});
    return Response.json({success:true,...result},{status:result.replayed?200:201});
  }catch(e){return businessFailure(e);}
}
