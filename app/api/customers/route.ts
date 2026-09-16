import {businessUser,businessRpc,businessFailure,readBody,prepareCustomerUpdate} from '@/lib/business-server';
import {normalizeRepName} from '@/lib/reps';
import type {BusinessCustomer} from '@/lib/business';
export const dynamic='force-dynamic';
export async function GET(req:Request) {
  try{const user=await businessUser(req,'/api/customers');
    // A sales rep only ever needs her own customers (the UI filters to this
    // anyway) — scoping it server-side avoids shipping every other rep's
    // rows over the wire just to discard them client-side.
    const customers=user.role==='sales_rep'
      ? await businessRpc<BusinessCustomer[]>('business_customer_list_by_rep',{p_rep:normalizeRepName(user.name)})
      : await businessRpc<BusinessCustomer[]>('business_customer_list',{});
    return Response.json({customers},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return businessFailure(e);}
}
export async function PATCH(req:Request) {
  try{const user=await businessUser(req,'/api/customers'),body=await readBody(req);
    const {id,data}=prepareCustomerUpdate(body);
    const result=await businessRpc<{customer:BusinessCustomer}>('business_customer_update',{p_actor:user.id,p_id:id,p_data:data});
    return Response.json({success:true,customer:result.customer});
  }catch(e){return businessFailure(e);}
}
