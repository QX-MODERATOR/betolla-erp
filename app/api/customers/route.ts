import {businessUser,businessRpc,businessFailure} from '@/lib/business-server';
import type {BusinessCustomer} from '@/lib/business';
export const dynamic='force-dynamic';
export async function GET(req:Request) {
  try{await businessUser(req,'/api/customers');
    const customers=await businessRpc<BusinessCustomer[]>('business_customer_list',{});
    return Response.json({customers},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return businessFailure(e);}
}
