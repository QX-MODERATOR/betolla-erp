import {businessUser,businessRpc,businessFailure,requestKey,readBody,prepareOrder,requirePermission,leadScope,text,BusinessError} from '@/lib/business-server';
import {canonicalDriver,DRIVERS} from '@/lib/driver-ops';
import {isBxCoordinator,mayActOnDriver} from '@/lib/bx';
import {priceCatalogItems,orderRep} from '@/lib/order-pricing';
import {normalizeRepName} from '@/lib/reps';
import {driverManagerUsernames,notifyUser,notifyOrderStatusChange} from '@/lib/notify';
import type {BusinessOrder} from '@/lib/business';
export const dynamic='force-dynamic';
export async function GET(req:Request) {
  try{const user=await businessUser(req,'/api/orders');
    const orderNumber=new URL(req.url).searchParams.get('changes');
    if(orderNumber){
      const changes=await businessRpc('business_order_changes',{p_order_number:orderNumber});
      return Response.json({changes},{headers:{'Cache-Control':'no-store'}});
    }
    const orders=await businessRpc<BusinessOrder[]>('business_list',{p_scope:user.role==='sales_rep'?user.id:null});
    return Response.json({orders},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return businessFailure(e);}
}
export async function POST(req:Request) {
  try{const user=await businessUser(req,'/api/orders');requirePermission(user,'orders.create');
    const key=requestKey(req),body=await readBody(req);
    const {repName,ownerId}=await orderRep(user,body);
    const data:Record<string,unknown>=prepareOrder(await priceCatalogItems(body,user),repName);
    const repScope=user.role==='sales_rep'?normalizeRepName(user.name):null;
    if(data.customer_id)await leadScope(user,String(data.customer_id));
    else{data.reuse_phone=true;if(repScope)data.scope_rep=repScope;}
    if(ownerId)data.owner_account_id=ownerId;
    const result=await businessRpc<{order:BusinessOrder;replayed:boolean}>('business_create_order',
      {p_actor:user.id,p_key:key,p_data:JSON.parse(JSON.stringify(data))});

    if(!result.replayed){
      // New order ready for delivery -> notify whoever assigns drivers next.
      const usernames=await driverManagerUsernames();
      await Promise.all(usernames.map((u)=>notifyUser(
        u,'new_order',
        'طلبية جديدة بانتظار تعيين سائق',
        `${result.order.customer_name} — ${result.order.city} — ${result.order.id}`,
        // Straight to the order that needs a driver, on the page where she assigns one.
        `/drivers?order=${encodeURIComponent(result.order.id)}`
      )));
    }

    return Response.json({success:true,...result},{status:result.replayed?200:201});
  }catch(e){return businessFailure(e);}
}
export async function PATCH(req:Request) {
  try{const user=await businessUser(req,'/api/orders');
    const key=requestKey(req),body=await readBody(req);
    if(body.action==='edit'){
      requirePermission(user,'orders.edit');
      const data:Record<string,unknown>={id:body.id};
      for(const field of ['city','address','notes','customer_name','customer_phone','items'] as const)
        if(body[field]!==undefined)data[field]=body[field];
      const result=await businessRpc('business_order_update',
        {p_actor:user.id,p_scope:user.role==='sales_rep'?user.id:null,p_key:key,p_data:data});
      return Response.json({success:true,...result as object});
    }
    requirePermission(user,'orders.status');
    // Sending goods out is its own permission, and it needs a named driver. The database refuses a
    // driverless processing -> shipped regardless (DRIVER_REQUIRED, migration 041); this is the
    // early, readable half of the same rule.
    let driver:string|undefined;
    if(body.status==='shipped'){
      // A BX coordinator ships her own BX orders; the driver check below keeps her to them.
      if(!isBxCoordinator(user))requirePermission(user,'orders.dispatch');
      // canonicalDriver only normalises — it returns any non-empty name unchanged — so check the
      // roster too, or a typo becomes a driver nobody can reconcile a shift against.
      driver=body.driver===undefined||body.driver===null||body.driver===''?undefined:canonicalDriver(text(body.driver,60))??undefined;
      if(driver&&!(DRIVERS as readonly string[]).includes(driver))throw new BusinessError('اختر سائقًا صحيحًا.');
      // BX Arabia belongs to صابرين, everyone else to ضياء: shipping an order names a driver, so the
      // same split applies here as on the delivery boards.
      if(driver&&!mayActOnDriver(user,driver))throw new BusinessError(`طلبات ${driver} ليست ضمن صلاحيتك.`,403);
    }
    const result=await businessRpc<{order:BusinessOrder;replayed:boolean}>('business_status',{p_actor:user.id,p_scope:user.role==='sales_rep'?user.id:null,
      p_key:key,p_data:{id:body.id,status:body.status,expected_status:body.expected_status,driver}});
    if(!result.replayed)await notifyOrderStatusChange(result.order,String(body.status));
    return Response.json({success:true,...result});
  }catch(e){return businessFailure(e);}
}
