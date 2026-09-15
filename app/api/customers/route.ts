import {businessUser,businessRpc,businessFailure,readBody,prepareCustomerUpdate} from '@/lib/business-server';
import type {BusinessCustomer} from '@/lib/business';
export const dynamic='force-dynamic';
export async function GET(req:Request) {
  try{await businessUser(req,'/api/customers');
    const customers=await businessRpc<BusinessCustomer[]>('business_customer_list',{});
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
