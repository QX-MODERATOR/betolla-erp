import {businessUser,businessRpc,businessFailure,readBody,requestKey,text,date,BusinessError} from '@/lib/business-server';
import {ammanToday} from '@/lib/dates';
import {DRIVERS,DRIVER_MANAGER_ROLES,RECONCILE_ROLES,canonicalDriver,type DriverOrderRecord} from '@/lib/driver-ops';
import {driversFor,mayActOnDriver} from '@/lib/bx';
import {driverBoard,driverAction,stepKey,orderId,expectedStatus,optionalNote,optionalMoney,type DriverAction} from '@/lib/driver-server';
import {usernameForDriverDisplayName,notifyUser,notifyOrderStatusChange} from '@/lib/notify';

export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};

const RECONCILE_LABEL:Record<string,string>={delivered:'مكتمل',returned:'مرتجع',postponed:'مؤجل',remaining:'متبقي',pending:'خرج مع السائق'};

// GET: one day's driver work, never the full history. Today (the default) means everything still
// open plus whatever finished today. Any other day — a past day for the archive, or a day a
// customer booked ahead for — means the orders dated that day, so a scheduled run can be planned
// and reviewed instead of being buried in today's list.
export async function GET(req:Request) {
  try{
    const user=await businessUser(req,'/api/drivers');
    const today=ammanToday();
    const day=date(new URL(req.url).searchParams.get('date')??undefined)??today;
    // The picking list: what has to come off the shelf, scoped to this account's drivers. Asked for
    // separately so opening the board does not pay for it.
    if(new URL(req.url).searchParams.get('view')==='picking'){
      const roster=driversFor(user);
      const partial=roster.length>0&&roster.length<DRIVERS.length;
      const picking=await businessRpc('business_picking_list',{p_drivers:partial?roster:null});
      return Response.json({success:true,picking},{headers});
    }
    const [board,inventoryNeeded]=await Promise.all([
      driverBoard(null,day===today?null:day),
      businessRpc<unknown[]>('business_driver_stock_needed',{}),
    ]);
    // Each board shows only the drivers this account runs. BX moved to صابرين, so ضياء's board no
    // longer carries it; an unassigned order stays visible to everyone who may assign one, which is
    // how an order reaches BX at all.
    // Only an account that owns SOME of the drivers is narrowed: ضياء lost BX, صابرين has only BX.
    // Finance and the other whole-business roles own no driver in particular and still need to see
    // every run to reconcile the day's cash, so they are left alone.
    const roster=driversFor(user);
    const partial=roster.length>0&&roster.length<DRIVERS.length;
    const myDrivers=roster.length?roster:[...DRIVERS];
    const orders=(day===today?board:board.filter(o=>o.order_date===day))
      .filter(o=>!partial||mayActOnDriver(user,o.driver));
    const mine=(d:string)=>orders.filter(o=>o.driver===d);
    const summaries=Object.fromEntries(myDrivers.map(d=>{
      const list=mine(d),delivered=list.filter(o=>o.status==='delivered');
      const expectedCash=list.filter(o=>o.status!=='returned').reduce((s,o)=>s+(o.status==='delivered'?o.cash_collected??o.cash_to_collect:o.cash_to_collect),0);
      const collectedCash=delivered.reduce((s,o)=>s+(o.cash_collected??0),0);
      return [d,{driver:d,totalOrders:list.length,deliveredCount:delivered.length,
        returnedCount:list.filter(o=>o.status==='returned').length,
        remainingCount:list.filter(o=>!['delivered','returned'].includes(o.status)).length,
        expectedCash,collectedCash,diff:collectedCash-expectedCash}];
    }));
    // Loads = orders waiting to be put in a driver's car (processing, assigned).
    const driverLoads=myDrivers.map(d=>{
      const list=mine(d).filter(o=>o.dbStatus==='processing');
      return {driver:d,orders:list.map(o=>({id:o.id,dbStatus:o.dbStatus,customer:o.customer_name,area:o.area,items:o.products,cash:o.cash_to_collect})),
        totalCash:list.reduce((s,o)=>s+o.cash_to_collect,0)};
    });
    // Reconciliation = the selected day's run: everything out with a driver or already finished.
    const reconcileOrders=orders.filter(o=>o.driver&&o.dbStatus!=='confirmed'&&o.dbStatus!=='processing').map(o=>({
      id:o.id,dbStatus:o.dbStatus,driver:o.driver,customer:o.customer_name,area:o.area,
      expectedCash:o.cash_to_collect,
      actualCash:o.status==='delivered'?(o.cash_collected??o.cash_to_collect):0,
      status:RECONCILE_LABEL[o.status]||'خرج مع السائق',
      notes:o.note,paymentMethod:o.payment_method,cliqIncludesDelivery:o.cliq_includes_delivery,
    }));
    return Response.json({success:true,date:day,drivers_available:myDrivers,orders,summaries,driverLoads,inventoryNeeded,reconcileOrders,
      // Ownership of actual drivers, not the display roster: a viewer like HR has neither.
      canManage:DRIVER_MANAGER_ROLES.includes(user.role)||roster.length>0,
      canReconcile:RECONCILE_ROLES.includes(user.role)||roster.length>0,
      drivers:myDrivers},{headers});
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
    // صابرين runs BX Arabia while staying a sales rep, so the gate is the driver she may touch,
    // not her role. driversFor() answers that for everyone: management gets all, ضياء gets
    // everyone except BX (it moved off her board), a coordinator gets only BX.
    const roster=driversFor(user);
    // A partial roster is an ownership split and is enforced below; an empty one means the account
    // is here by role (finance reconciling cash) and is not driver-scoped at all.
    const partial=roster.length>0&&roster.length<DRIVERS.length;
    if(!allowed.includes(user.role)&&!roster.length)
      throw new BusinessError('لا تملك صلاحية تعديل طلبات التوصيل.',403);

    // Whoever ends up carrying an order is told, whichever screen assigned it. Silent on unassign:
    // there is nothing for the driver to do about work that was taken off him.
    const tellDriver=async(driver:string|null,detail:string,count:number)=>{
      if(!driver||count<=0)return;
      const username=await usernameForDriverDisplayName(driver);
      if(username)await notifyUser(username,'orders_assigned','تم تعيين طلبيات جديدة لك',detail,'/driver');
    };

    // A driver named anywhere in this request must be one this account may act on.
    const guardDriver=(name:string|null)=>{
      if(partial&&!mayActOnDriver(user,name))
        throw new BusinessError(`طلبات ${name} ليست ضمن صلاحيتك.`,403);
    };
    // …and so must the driver an order already carries, or a coordinator could take an order off
    // another driver's run. Loaded once per request rather than once per order.
    let boardByIdPromise:Promise<Map<string,string|null>>|null=null;
    const guardOrders=async(ids:string[])=>{
      if(!ids.length)return;
      if(!partial)return; // full access, or not driver-scoped at all
      boardByIdPromise??=driverBoard(null,null).then(rows=>new Map(rows.map(o=>[o.id,o.driver])));
      const byId=await boardByIdPromise;
      for(const id of ids){
        if(!byId.has(id))continue; // unknown here: the action itself will report it
        if(!mayActOnDriver(user,byId.get(id)??null))
          throw new BusinessError(`الطلب ${id} ليس ضمن صلاحيتك.`,403);
      }
    };

    if(action==='assign_orders'){
      // orders: [{id, status}] — status is what the page showed (the stale check).
      if(!Array.isArray(body.orders)||!body.orders.length||body.orders.length>200)throw new BusinessError('اختر طلبًا واحدًا على الأقل.');
      const driver=body.driver===null||body.driver===''?null:canonicalDriver(text(body.driver,60));
      if(body.driver&&!driver)throw new BusinessError('اختر سائقًا صحيحًا.');
      guardDriver(driver);
      await guardOrders((body.orders as Record<string,unknown>[]).map(r=>orderId(r?.id)));
      const outcomes:Outcome[]=[];
      for(const raw of body.orders as Record<string,unknown>[]){
        const id=orderId(raw?.id);
        try{
          const step:DriverAction=driver?{action:'assign',driver,expected_status:expectedStatus(raw.status)}:{action:'unassign',expected_status:expectedStatus(raw.status)};
          outcomes.push({id,ok:true,order:await driverAction(user.id,stepKey(key,id,step.action),id,step)});
        }catch(e){outcomes.push(failure(id,e));}
      }
      const saved=outcomes.filter(o=>o.ok).length;
      await tellDriver(driver,`عدد الطلبيات: ${saved}`,saved);
      return batchResponse(outcomes,driver?`تم تعيين ${saved} طلب للسائق ${driver}.`:`تم إلغاء تعيين ${saved} طلب.`);
    }

    if(action==='update_order'){
      // The manager's edit dialog: details, then driver, then delivery state — each step only if it changes something.
      const id=orderId(body.orderId);
      await guardOrders([id]);
      if(body.driver!==undefined)
        guardDriver(body.driver===null||body.driver===''?null:canonicalDriver(text(body.driver,60)));
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
        if(driver!==order!.driver){
          await run(driver?{action:'assign',driver,expected_status:current}:{action:'unassign',expected_status:current});
          // The bulk path told the driver; this one did not, so a driver assigned a single order
          // from its own dialog — the ordinary way to do it — never heard about it.
          await tellDriver(driver,`${order!.customer_name} — ${order!.area||''} — ${id}`.trim(),1);
        }
      }
      const state=body.state===undefined?undefined:text(body.state,20);
      if(state!==undefined&&state!==order!.status){
        if(state==='delivered')await run({action:'deliver',expected_status:current,amount:optionalMoney(body.cashCollected)??order!.cash_to_collect});
        else if(state==='returned')await run({action:'return',expected_status:current,reason:optionalNote(body.returnReason)});
        else if(state==='postponed')await run({action:'postpone',expected_status:current});
        else if(state==='remaining')await run({action:'remaining',expected_status:current});
        else if(state==='pending')await run({action:'resume',expected_status:current});
        else if(state==='cancelled')await run({action:'cancel',expected_status:current,reason:optionalNote(body.cancelReason)});
        else throw new BusinessError('حالة التوصيل غير صالحة.');
        // Only these three states are real orders.status transitions (postpone/remaining/resume
        // are just a delivery-attempt flag, the order stays confirmed/processing/shipped).
        if(['delivered','returned','cancelled'].includes(state))await notifyOrderStatusChange(order!,state);
      }
      return Response.json({success:true,message:`تم حفظ الطلب ${id}.`,order},{headers});
    }

    if(action==='dispatch'){
      if(!Array.isArray(body.orderIds)||body.orderIds.length>500)throw new BusinessError('قائمة الطلبات غير صالحة.');
      const drivers=(Array.isArray(body.drivers)?body.drivers:[]).map(d=>canonicalDriver(text(d,60))).filter(Boolean);
      if(!drivers.length)throw new BusinessError('اختر سائقًا واحدًا على الأقل.');
      for(const d of drivers)guardDriver(d);
      await guardOrders(body.orderIds.map(orderId));
      const result=await businessRpc<{shipped:string[];skipped:string[]}>('business_driver_dispatch',
        {p_actor:user.id,p_data:{ids:body.orderIds.map(orderId),drivers}});
      return Response.json({success:true,...result,
        message:`خرج ${result.shipped.length} طلب مع السائقين.`+(result.skipped.length?` لم يُرسل ${result.skipped.length} (تغيّرت حالتها أو سائقها).`:'')},{headers});
    }

    if(action==='reconcile'){
      // Only rows the user changed are sent; each becomes one checked action.
      if(!Array.isArray(body.changes)||!body.changes.length||body.changes.length>300)throw new BusinessError('لا توجد تعديلات للحفظ.');
      const byLabel:Record<string,string>={'مكتمل':'deliver','مرتجع':'return','مؤجل':'postpone','متبقي':'remaining','خرج مع السائق':'resume'};
      await guardOrders((body.changes as Record<string,unknown>[]).map(r=>orderId(r?.id)));
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
