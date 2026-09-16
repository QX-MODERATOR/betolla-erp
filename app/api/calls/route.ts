import {businessUser,businessRpc,businessFailure,requestKey,readBody,prepareCallLog,requirePermission,leadScope} from '@/lib/business-server';
import {normalizeRepName} from '@/lib/reps';
import type {BusinessCustomer} from '@/lib/business';
export const dynamic='force-dynamic';
export async function POST(req:Request) {
  try{const user=await businessUser(req,'/api/calls');requirePermission(user,'calls.log');
    const key=requestKey(req),body=await readBody(req);
    const data=prepareCallLog(body);
    const scope=await leadScope(user,data.customer_id);
    const result=await businessRpc<{customer:BusinessCustomer;log_id:string;replayed:boolean}>('business_call_log_create',
      {p_actor:user.id,p_key:key,p_data:scope===undefined?data:{...data,scope_rep:scope},p_rep_name:normalizeRepName(user.name)});
    return Response.json({success:true,...result},{status:result.replayed?200:201});
  }catch(e){return businessFailure(e);}
}
