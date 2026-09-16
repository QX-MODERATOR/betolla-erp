import {businessUser,businessRpc,businessFailure,requestKey,readBody,prepareOrder,requirePermission} from '@/lib/business-server';
import {normalizeRepName} from '@/lib/reps';
import {driverManagerUsernames,notifyUser} from '@/lib/notify';
import type {BusinessOrder} from '@/lib/business';
export const dynamic='force-dynamic';
export async function GET(req:Request) {
  try{const user=await businessUser(req,'/api/orders');
    const orders=await businessRpc<BusinessOrder[]>('business_list',{p_scope:user.role==='sales_rep'?user.id:null});
    return Response.json({orders},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return businessFailure(e);}
}
export async function POST(req:Request) {
  try{const user=await businessUser(req,'/api/orders');requirePermission(user,'orders.create');
    const key=requestKey(req),body=await readBody(req);
    const result=await businessRpc<{order:BusinessOrder;replayed:boolean}>('business_create_order',
      {p_actor:user.id,p_key:key,p_data:prepareOrder(body,normalizeRepName(user.name))});

    if(!result.replayed){
      // New order ready for delivery -> notify whoever assigns drivers next.
      const usernames=await driverManagerUsernames();
      await Promise.all(usernames.map((u)=>notifyUser(
        u,'new_order',
        'طلبية جديدة بانتظار تعيين سائق',
        `${result.order.customer_name} — ${result.order.city} — ${result.order.id}`,
        '/drivers'
      )));
    }

    return Response.json({success:true,...result},{status:result.replayed?200:201});
  }catch(e){return businessFailure(e);}
}
export async function PATCH(req:Request) {
  try{const user=await businessUser(req,'/api/orders');requirePermission(user,'orders.status');
    const key=requestKey(req),body=await readBody(req);
    const result=await businessRpc('business_status',{p_actor:user.id,p_scope:user.role==='sales_rep'?user.id:null,
      p_key:key,p_data:{id:body.id,status:body.status,expected_status:body.expected_status}});
    return Response.json({success:true,...result as object});
  }catch(e){return businessFailure(e);}
}
