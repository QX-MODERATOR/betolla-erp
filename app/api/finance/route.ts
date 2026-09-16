import {businessUser,businessRpc,businessFailure,requestKey,readBody,preparePayment,preparePaymentReversal,requirePermission} from '@/lib/business-server';
import {toInvoice,financeSummary,type BusinessOrder} from '@/lib/business';
export const dynamic='force-dynamic';
export async function GET(req:Request) {
  try{await businessUser(req,'/api/finance');
    const orders=await businessRpc<BusinessOrder[]>('business_list',{p_scope:null});
    const invoices=orders.filter(o=>o.invoice_number).map(toInvoice);
    return Response.json({invoices,summary:financeSummary(invoices)},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return businessFailure(e);}
}
export async function POST(req:Request) {
  try{const user=await businessUser(req,'/api/finance');requirePermission(user,'finance.write');
    const key=requestKey(req),body=await readBody(req);
    const result=await businessRpc<{order:BusinessOrder;payment_id:string;replayed:boolean}>('business_collect',
      {p_actor:user.id,p_key:key,p_data:preparePayment(body)});
    return Response.json({success:true,invoice:toInvoice(result.order),payment_id:result.payment_id,replayed:result.replayed});
  }catch(e){return businessFailure(e);}
}
export async function PATCH(req:Request) {
  try{const user=await businessUser(req,'/api/finance');requirePermission(user,'finance.write');
    const key=requestKey(req),body=await readBody(req);
    const result=await businessRpc<{order:BusinessOrder;reversal_id:string;replayed:boolean}>('business_payment_reverse',
      {p_actor:user.id,p_key:key,p_data:preparePaymentReversal(body)});
    return Response.json({success:true,invoice:toInvoice(result.order),reversal_id:result.reversal_id,replayed:result.replayed});
  }catch(e){return businessFailure(e);}
}
