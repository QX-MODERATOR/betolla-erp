import {businessUser,businessRpc,businessFailure,readBody,requestKey,text,BusinessError} from '@/lib/business-server';
import {DRIVERS,DRIVER_MANAGER_ROLES,RECONCILE_ROLES,canonicalDriver,type DriverOrderRecord} from '@/lib/driver-ops';
import {driverBoard,driverAction,stepKey,orderId,expectedStatus,optionalNote,optionalMoney,type DriverAction} from '@/lib/driver-server';
import {usernameForDriverDisplayName,notifyUser} from '@/lib/notify';

export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};

const RECONCILE_LABEL:Record<string,string>={delivered:'مكتمل',returned:'مرتجع',postponed:'مؤجل',remaining:'متبقي',pending:'خرج مع السائق'};

// GET: today's driver work only (open orders + orders finished today), never the full history.
export async function GET(req:Request) {
  try{
    const user=await businessUser(req,'/api/drivers');
    const [orders,inventoryNeeded]=await Promise.all([
      driverBoard(null),
      businessRpc<unknown[]>('business_driver_stock_needed',{}),
    ]);
    const mine=(d:string)=>orders.filter(o=>o.driver===d);
    const summaries=Object.fromEntries(DRIVERS.map(d=>{
      const list=mine(d),delivered=list.filter(o=>o.status==='delivered');
      const expectedCash=list.filter(o=>o.status!=='returned').reduce((s,o)=>s+(o.status==='delivered'?o.cash_collected??o.cash_to_collect:o.cash_to_collect),0);
      const collectedCash=delivered.reduce((s,o)=>s+(o.cash_collected??0),0);
      return [d,{driver:d,totalOrders:list.length,deliveredCount:delivered.length,
        returnedCount:list.filter(o=>o.status==='returned').length,
        remainingCount:list.filter(o=>!['delivered','returned'].includes(o.status)).length,
        expectedCash,collectedCash,diff:collectedCash-expectedCash}];
    }));
    // Loads = orders waiting to be put in a driver's car (processing, assigned).
    const driverLoads=DRIVERS.map(d=>{
      const list=mine(d).filter(o=>o.dbStatus==='processing');
      return {driver:d,orders:list.map(o=>({id:o.id,dbStatus:o.dbStatus,customer:o.customer_name,area:o.area,items:o.products,cash:o.cash_to_collect})),
        totalCash:list.reduce((s,o)=>s+o.cash_to_collect,0)};
    });
    // Reconciliation = today's run: everything out with a driver or finished today.
    const reconcileOrders=orders.filter(o=>o.driver&&o.dbStatus!=='confirmed'&&o.dbStatus!=='processing').map(o=>({
      id:o.id,dbStatus:o.dbStatus,driver:o.driver,customer:o.customer_name,area:o.area,
      expectedCash:o.cash_to_collect,
      actualCash:o.status==='delivered'?(o.cash_collected??o.cash_to_collect):0,
      status:RECONCILE_LABEL[o.status]||'خرج مع السائق',
      notes:o.note,paymentMethod:o.payment_method,cliqIncludesDelivery:o.cliq_includes_delivery,
    }));
    return Response.json({success:true,drivers_available:DRIVERS,orders,summaries,driverLoads,inventoryNeeded,reconcileOrders,
      canManage:DRIVER_MANAGER_ROLES.includes(user.role),canReconcile:RECONCILE_ROLES.includes(user.role)},{headers});
  }catch(e){return businessFailure(e);}
}

type Outcome={id:string;ok:boolean;error?:string;order?:DriverOrderRecord};
const failure=(id:string,e:unknown):Outcome=>({id,ok:false,error:e instanceof BusinessError?e.message:'تعذر تأكيد الحفظ لهذا الطلب. أعد المحاولة.'});

function batchResponse(outcomes:Outcome[],okMessage:string) {
  const failed=outcomes.filter(o=>!o.ok);
  return Response.json({success:failed.length===0,results:outcomes,
    message:failed.length?undefined:okMessage,
    error:failed.length?`لم يتم حفظ ${failed.length} من ${outcomes.length}: `+failed.map(f=>`${f.id} (${f.error})`).join('، '):undefined},
    {status:failed.length?409:200,headers});
}

export async function POST(req:Request) {
  try{
    const user=await businessUser(req,'/api/drivers');
    const body=await readBody(req),action=text(body.action,40),key=requestKey(req);
    const allowed=action==='reconcile'?RECONCILE_ROLES:DRIVER_MANAGER_ROLES;
    if(!allowed.includes(user.role))throw new BusinessError('لا تملك صلاحية تعديل طلبات التوصيل.',403);

    if(action==='assign_orders'){
      // orders: [{id, status}] — status is what the page showed (the stale check).
      if(!Array.isArray(body.orders)||!body.orders.length||body.orders.length>200)throw new BusinessError('اختر طلبًا واحدًا على الأقل.');
      const driver=body.driver===null||body.driver===''?null:canonicalDriver(text(body.driver,60));
      if(body.driver&&!driver)throw new BusinessError('اختر سائقًا صحيحًا.');
      const outcomes:Outcome[]=[];
      for(const raw of body.orders as Record<string,unknown>[]){
        const id=orderId(raw?.id);
        try{
          const step:DriverAction=driver?{action:'assign',driver,expected_status:expectedStatus(raw.status)}:{action:'unassign',expected_status:expectedStatus(raw.status)};
          outcomes.push({id,ok:true,order:await driverAction(user.id,stepKey(key,id,step.action),id,step)});
        }catch(e){outcomes.push(failure(id,e));}
      }
      const saved=outcomes.filter(o=>o.ok).length;
      if(driver&&saved){
        const username=await usernameForDriverDisplayName(driver);
        if(username)await notifyUser(username,'orders_assigned','تم تعيين طلبيات جديدة لك',`عدد الطلبيات: ${saved}`,'/driver');
      }
      return batchResponse(outcomes,driver?`تم تعيين ${saved} طلب للسائق ${driver}.`:`تم إلغاء تعيين ${saved} طلب.`);
    }

    if(action==='update_order'){
      // The manager's edit dialog: details, then driver, then delivery state — each step only if it changes something.
      const id=orderId(body.orderId);
      let current=expectedStatus(body.expectedStatus);
      let order:DriverOrderRecord|undefined;
      const run=async(step:DriverAction)=>{order=await driverAction(user.id,stepKey(key,id,step.action),id,{...step,expected_status:current});current=order.dbStatus;};
      const method=body.paymentMethod===undefined?undefined:text(body.paymentMethod,20);
      if(method!==undefined&&!['cash','cliq'].includes(method))throw new BusinessError('طريقة الدفع غير صالحة.');
      await run({action:'details',expected_status:current,
        payment_method:method===undefined?undefined:method==='cliq'?'cliq':'cash_on_delivery',
        cliq_includes_delivery:typeof body.cliqIncludesDelivery==='boolean'?body.cliqIncludesDelivery:undefined,
        delivery_fee:optionalMoney(body.deliveryFee),note:optionalNote(body.note)});
      if(body.driver!==undefined){
        const driver=body.driver===null||body.driver===''?null:canonicalDriver(text(body.driver,60));
        if(body.driver&&!driver)throw new BusinessError('اختر سائقًا صحيحًا.');
        if(driver!==order!.driver)await run(driver?{action:'assign',driver,expected_status:current}:{action:'unassign',expected_status:current});
      }
      const state=body.state===undefined?undefined:text(body.state,20);
      if(state!==undefined&&state!==order!.status){
        if(state==='delivered')await run({action:'deliver',expected_status:current,amount:optionalMoney(body.cashCollected)??order!.cash_to_collect});
        else if(state==='returned')await run({action:'return',expected_status:current,reason:optionalNote(body.returnReason)});
        else if(state==='postponed')await run({action:'postpone',expected_status:current});
        else if(state==='remaining')await run({action:'remaining',expected_status:current});
        else if(state==='pending')await run({action:'resume',expected_status:current});
        else throw new BusinessError('حالة التوصيل غير صالحة.');
      }
      return Response.json({success:true,message:`تم حفظ الطلب ${id}.`,order},{headers});
    }

    if(action==='dispatch'){
      if(!Array.isArray(body.orderIds)||body.orderIds.length>500)throw new BusinessError('قائمة الطلبات غير صالحة.');
      const drivers=(Array.isArray(body.drivers)?body.drivers:[]).map(d=>canonicalDriver(text(d,60))).filter(Boolean);
      if(!drivers.length)throw new BusinessError('اختر سائقًا واحدًا على الأقل.');
      const result=await businessRpc<{shipped:string[];skipped:string[]}>('business_driver_dispatch',
        {p_actor:user.id,p_data:{ids:body.orderIds.map(orderId),drivers}});
      return Response.json({success:true,...result,
        message:`خرج ${result.shipped.length} طلب مع السائقين.`+(result.skipped.length?` لم يُرسل ${result.skipped.length} (تغيّرت حالتها أو سائقها).`:'')},{headers});
    }

    if(action==='reconcile'){
      // Only rows the user changed are sent; each becomes one checked action.
      if(!Array.isArray(body.changes)||!body.changes.length||body.changes.length>300)throw new BusinessError('لا توجد تعديلات للحفظ.');
      const byLabel:Record<string,string>={'مكتمل':'deliver','مرتجع':'return','مؤجل':'postpone','متبقي':'remaining','خرج مع السائق':'resume'};
      const outcomes:Outcome[]=[];
      for(const raw of body.changes as Record<string,unknown>[]){
        const id=orderId(raw?.id);
        try{
          const act=byLabel[text(raw.status,30)];
          if(!act)throw new BusinessError('حالة التسوية غير صالحة.');
          const step:DriverAction={action:act,expected_status:expectedStatus(raw.dbStatus),note:optionalNote(raw.notes)};
          if(act==='deliver'){const amount=optionalMoney(raw.actualCash);if(amount===undefined)throw new BusinessError('أدخل المبلغ المحصّل.');step.amount=amount;}
          outcomes.push({id,ok:true,order:await driverAction(user.id,stepKey(key,id,act),id,step)});
        }catch(e){outcomes.push(failure(id,e));}
      }
      return batchResponse(outcomes,`تم حفظ تسوية ${outcomes.length} طلب.`);
    }

    throw new BusinessError('إجراء غير معروف.');
  }catch(e){return businessFailure(e);}
}
