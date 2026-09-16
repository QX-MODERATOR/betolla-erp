import {businessUser,businessRpc,businessFailure,readBody,requestKey,text,BusinessError} from '@/lib/business-server';
import type {AuthUser} from '@/lib/auth';
import {DRIVER_MANAGER_ROLES,ACTION_FOR_STATUS,canonicalDriver,driverOfAccount,type DriverShiftSummary} from '@/lib/driver-ops';
import {driverBoard,driverShift,driverAction,stepKey,orderId,expectedStatus,optionalNote,optionalMoney,optionalDate,type DriverAction} from '@/lib/driver-server';

export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};

const DRIVER_CARD:Record<string,{name:string;avatar:string}>={
  'خالد':{name:'خالد المندوب',avatar:'خ'},'علي':{name:'علي المندوب',avatar:'ع'},'BX Arabia':{name:'BX Arabia (شركة توصيل)',avatar:'BX'},
};

// A driver always acts as themselves (any ?driver= / driverName from the browser is ignored).
// Delivery managers may open any driver's view by name.
function resolveDriver(user:AuthUser,requested:unknown):{driver:string;isManager:boolean} {
  if(user.role==='driver'){
    const own=driverOfAccount(user);
    if(!own)throw new BusinessError('حساب السائق غير مرتبط باسم سائق. تواصل مع مدير السائقين.',403);
    return {driver:own,isManager:false};
  }
  if(!DRIVER_MANAGER_ROLES.includes(user.role))throw new BusinessError('لا تملك صلاحية هذه العملية.',403);
  const driver=canonicalDriver(text(requested,60));
  if(!driver)throw new BusinessError('اختر السائق.');
  return {driver,isManager:true};
}

export async function GET(req:Request) {
  try{
    const user=await businessUser(req,'/api/driver');
    const {driver}=resolveDriver(user,new URL(req.url).searchParams.get('driver'));
    const [orders,shift]=await Promise.all([driverBoard(driver),driverShift(driver)]);
    const closure=shift.closure?.is_closed?shift.closure:null;
    return Response.json({success:true,orders,shift,
      driver:{key:driver,...(DRIVER_CARD[driver]||{name:driver,avatar:driver.slice(0,1)})},
      shiftClosure:closure?{closed:true,closedAt:closure.closed_at,notes:closure.notes,cashCollected:closure.cash_collected,
        countedCash:closure.counted_cash,deliveredCount:closure.delivered_count,returnedCount:closure.returned_count}:{closed:false}},{headers});
  }catch(e){return businessFailure(e);}
}

export async function POST(req:Request) {
  try{
    const user=await businessUser(req,'/api/driver');
    const body=await readBody(req),action=text(body.action,40);
    const {driver,isManager}=resolveDriver(user,body.driverName);

    if(action==='update_status'){
      const key=requestKey(req),id=orderId(body.orderId);
      const status=text(body.status,20) as keyof typeof ACTION_FOR_STATUS;
      const act=ACTION_FOR_STATUS[status];
      if(!act)throw new BusinessError('حالة التوصيل غير صالحة.');
      const step:DriverAction={action:act,expected_status:expectedStatus(body.expectedStatus),note:optionalNote(body.notes),
        // Drivers may only touch their own orders; the database enforces it.
        acting_driver:isManager?undefined:driver};
      if(act==='deliver'){
        const amount=optionalMoney(body.cashCollected);
        if(amount===undefined)throw new BusinessError('أدخل المبلغ المستلم (0 إذا لم يُدفع شيء).');
        step.amount=amount;
      }
      if(act==='return')step.reason=optionalNote(body.returnReason);
      if(act==='postpone')step.postpone_date=optionalDate(body.postponeDate);
      const order=await driverAction(user.id,stepKey(key,id,act),id,step);
      return Response.json({success:true,order,message:`تم حفظ حالة الطلب ${id}.`},{headers});
    }

    if(action==='close_shift'||action==='reopen_shift'){
      if(action==='reopen_shift'&&!isManager)throw new BusinessError('إعادة فتح الوردية تحتاج موافقة مدير السائقين.',403);
      const counted=action==='close_shift'?optionalMoney(body.countedCash):undefined;
      if(action==='close_shift'&&counted===undefined)throw new BusinessError('أدخل مبلغ الكاش الذي عددته قبل إغلاق الوردية.');
      const shift=await businessRpc<DriverShiftSummary>('business_driver_shift_action',{p_actor:user.id,p_data:action==='close_shift'
        ?{driver,action:'close',counted_cash:counted,notes:text(body.notes,2000)}
        :{driver,action:'reopen'}});
      return Response.json({success:true,shift,message:action==='close_shift'?`تم إغلاق وردية ${driver}.`:`تمت إعادة فتح وردية ${driver}.`},{headers});
    }

    throw new BusinessError('الإجراء المطلوب غير معروف.');
  }catch(e){return businessFailure(e);}
}
