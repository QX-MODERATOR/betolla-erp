import {businessUser,businessRpc,businessFailure,readBody,prepareCustomerUpdate,requirePermission,leadScope,repScopeOf,BusinessError,text} from '@/lib/business-server';
import {customerPage,callQueue,PAGE_SIZE_MAX} from '@/lib/customer-list';
import {can} from '@/lib/permissions';
import type {BusinessCustomer} from '@/lib/business';
export const dynamic='force-dynamic';
// GET                         full list (sales reps: their own) — kept for older pages
// GET ?view=page&q=&rep=&type=&offset=&limit=   one page of the list + totals
// GET ?view=calls              customers with a scheduled call
// GET ?rep=<name>              one rep's customers (managers switching reps on the sales page)
// GET ?id=<uuid>               one customer with the full call history
export async function GET(req:Request) {
  try{const user=await businessUser(req,'/api/customers');
    const params=new URL(req.url).searchParams;
    // A sales rep (or marketing specialist) only ever sees her own customers.
    const repScope=repScopeOf(user);
    const headers={'Cache-Control':'no-store'};
    const id=params.get('id');
    if(id){
      if(!/^[0-9a-f-]{36}$/i.test(id))throw new BusinessError('معرّف العميل غير صالح.');
      await leadScope(user,id);
      const customer=await businessRpc<BusinessCustomer|null>('business_customer_document',{p_id:id});
      if(!customer)throw new BusinessError('العميل غير موجود.',404);
      return Response.json({customer},{headers});
    }
    const view=params.get('view');
    if(view==='page'){
      const int=(v:string|null,d:number)=>{const n=Number(v);return Number.isInteger(n)&&n>=0?n:d;};
      const page=await customerPage(repScope,{
        query:text(params.get('q')??'',100),rep:text(params.get('rep')??'',100),type:text(params.get('type')??'',40),
        offset:int(params.get('offset'),0),limit:Math.min(Math.max(int(params.get('limit'),50),1),PAGE_SIZE_MAX)});
      return Response.json(page,{headers});
    }
    if(view==='calls')return Response.json({customers:await callQueue(repScope)},{headers});
    const rep=params.get('rep');
    if(rep&&!repScope){
      const customers=await businessRpc<BusinessCustomer[]>('business_customer_list_by_rep',{p_rep:text(rep,100)});
      return Response.json({customers},{headers});
    }
    const customers=repScope
      ? await businessRpc<BusinessCustomer[]>('business_customer_list_by_rep',{p_rep:repScope})
      : await businessRpc<BusinessCustomer[]>('business_customer_list',{});
    return Response.json({customers},{headers});
  }catch(e){return businessFailure(e);}
}
export async function PATCH(req:Request) {
  try{const user=await businessUser(req,'/api/customers');requirePermission(user,'customers.edit');
    const body=await readBody(req);
    const {id,data}=prepareCustomerUpdate(body);
    const scope=await leadScope(user,id);
    if(data.rep_name!==undefined&&!can(user.role,'customers.reassign')&&data.rep_name!==scope)
      throw new BusinessError('لا يمكنك نقل العميل إلى مندوب آخر.',403);
    // Taking a contact off every rep's list (the remove button on /sales) is admin's alone.
    if(data.rep_name===''&&!can(user.role,'customers.unassign',user.id))
      throw new BusinessError('إزالة الرقم من قائمة المندوب متاحة للإدارة فقط.',403);
    const result=await businessRpc<{customer:BusinessCustomer}>('business_customer_update',
      {p_actor:user.id,p_id:id,p_data:scope===undefined?data:{...data,scope_rep:scope}});
    return Response.json({success:true,customer:result.customer});
  }catch(e){return businessFailure(e);}
}
