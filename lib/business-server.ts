import {createClient} from '@supabase/supabase-js';
import {extractTokenFromRequest,verifyAuthToken,isRouteAllowedForRole} from '@/lib/auth';
import {parseWhatsAppOrderText} from '@/lib/order-parser';
import {can,type Action} from '@/lib/permissions';
import {normalizeRepName} from '@/lib/reps';
export class BusinessError extends Error {
  status:number;
  constructor(message:string,status=400){super(message);this.status=status;}
}
export async function businessUser(req:Request,path:string) {
  const token=extractTokenFromRequest(req),user=token?await verifyAuthToken(token):null;
  if(!user)throw new BusinessError('يرجى تسجيل الدخول.',401);
  if(!isRouteAllowedForRole(user.role,path))throw new BusinessError('لا تملك صلاحية هذه العملية.',403);
  return user;
}
// The route is open to the role (businessUser); this checks the role may also perform the change.
export function requirePermission(user:{role:string},action:Action) {
  if(!can(user.role,action))throw new BusinessError('لا تملك صلاحية تنفيذ هذا التعديل. صلاحيتك للعرض فقط.',403);
}
// A sales rep may only touch leads assigned to her. Returns the rep scope to pass to the database
// (which enforces it again), or undefined for roles that are not limited to their own leads.
export async function leadScope(user:{role:string;name:string},customerId:string):Promise<string|undefined> {
  if(user.role!=='sales_rep')return undefined;
  const rep=normalizeRepName(user.name);
  const doc=await businessRpc<{rep_name_raw:string}|null>('business_customer_document',{p_id:customerId});
  if(!doc)throw new BusinessError('العميل غير موجود.',404);
  if(!rep||doc.rep_name_raw!==rep)throw new BusinessError('هذا العميل غير مسند لك.',403);
  return rep;
}
export function requestKey(req:Request) {
  const key=req.headers.get('Idempotency-Key');
  if(!key||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key))throw new BusinessError('معرّف العملية مطلوب لإعادة المحاولة بأمان.');
  return key;
}
export async function readBody(req:Request):Promise<Record<string,unknown>> {
  let body;try{body=await req.json();}catch{throw new BusinessError('بيانات الطلب غير صالحة.');}
  if(!body||typeof body!=='object'||Array.isArray(body))throw new BusinessError('بيانات الطلب غير صالحة.');
  return body;
}
export function text(value:unknown,max=1000):string {
  if(value===undefined||value===null)return '';
  if(typeof value!=='string'||value.length>max)throw new BusinessError('حقل نصي غير صالح.');
  return value.trim();
}
const LEAD_SOURCES=['sales','social_media','doctor','google_maps','whatsapp','crm_legacy','phone','commercial','unverified','unknown'];
import {ACTIVE_SALES_REPS as ACTIVE_REPS} from '@/lib/reps';
export function prepareLead(body:Record<string,unknown>) {
  const rawPhone=text(body.phone,40);
  if(!rawPhone)throw new BusinessError('رقم هاتف العميل مطلوب لإضافة الليد.');
  let phone=rawPhone.replace(/[^\d+]/g,'');
  if(phone.startsWith('+962'))phone='0'+phone.slice(4);
  else if(phone.startsWith('962'))phone='0'+phone.slice(3);
  if(!/^\d{7,15}$/.test(phone))throw new BusinessError('رقم الهاتف غير صالح.');
  const source=text(body.source,60).toLowerCase();
  const repRaw=text(body.rep_name,100);
  const assignedRep=repRaw&&repRaw!=='auto'?repRaw:ACTIVE_REPS[Math.floor(Math.random()*ACTIVE_REPS.length)];
  return {name:text(body.name,200)||'عميل محتمل جديد',phone,city:text(body.city,200)||'عمان',
    address:text(body.address,1000),notes:text(body.notes,2000)||'تم استلام الرقم آلياً من التسويق / n8n',
    lead_source:LEAD_SOURCES.includes(source)?source:'unknown',rep_name:assignedRep};
}
export function money(value:unknown) {
  if((typeof value!=='string'&&typeof value!=='number')||!/^\d+(\.\d{1,3})?$/.test(String(value)))throw new BusinessError('المبلغ يجب أن يكون رقمًا موجبًا حتى ثلاث منازل عشرية.');
  const amount=Number(value);
  if(!Number.isFinite(amount)||amount<0||amount>=10000000)throw new BusinessError('المبلغ خارج النطاق المسموح.');
  return amount;
}
export function date(value:unknown) {
  if(value===undefined||value==='')return undefined;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw new BusinessError('التاريخ غير صالح.');
  return value;
}
export function prepareOrder(input:Record<string,unknown>,repName:string) {
  let body=input;
  if(input.rawText!==undefined){
    const raw=text(input.rawText,20000);if(!raw)throw new BusinessError('أدخل نص الطلب.');
    const p=parseWhatsAppOrderText(raw);
    body={customer_name:p.customerName,customer_phone:p.phone,city:p.city,address:p.address,
      items:p.items.map(i=>({name:i.productName,qty:i.quantity})),items_summary:p.itemsSummary,total_amount:p.totalAmount,
      source:p.source,payment_method:p.paymentMethod,status:p.isReservation?'draft':'confirmed',installment_notes:p.installmentNotes,raw_whatsapp_text:raw};
  }
  const name=text(body.customer_name,200),phone=text(body.customer_phone,40),total=money(body.total_amount);
  // A promo code can make an order genuinely free (a salon's samples), so zero is allowed only
  // when one is attached; business_create_order enforces the same rule.
  const promoCode=body.promo_code===undefined||body.promo_code===null?'':text(body.promo_code,24);
  if(!name||!phone||total<0||(total===0&&!promoCode))throw new BusinessError('اسم العميل والهاتف ومبلغ الطلب الموجب مطلوبة.');
  if(!Array.isArray(body.items)||!body.items.length||body.items.length>200)throw new BusinessError('أصناف الطلب مطلوبة (حتى 200 صنف).');
  const items=body.items.map((i:Record<string,unknown>)=>{
    if(!i||typeof i!=='object')throw new BusinessError('الصنف غير صالح.');
    const rawQty=i.qty??i.quantity;
    if(typeof rawQty!=='number'&&typeof rawQty!=='string')throw new BusinessError('الكمية غير صالحة.');
    const qty=Number(rawQty),name=text(i.name??i.productName,500);
    if(!name||!Number.isInteger(qty)||qty<=0||qty>100000)throw new BusinessError('اسم الصنف وكمية صحيحة موجبة مطلوبان.');
    return {name,qty,price:i.price===undefined||i.price===null?null:money(i.price)};
  });
  const knownTotal=items.reduce((s,i)=>s+Math.round((i.price??0)*1000)*i.qty,0);
  if(knownTotal>Math.round(total*1000)||(items.every(i=>i.price!==null)&&knownTotal!==Math.round(total*1000)))throw new BusinessError('إجمالي الأصناف لا يطابق إجمالي الطلب.');
  if(promoCode&&!/^[\w-]{2,24}$/.test(promoCode))throw new BusinessError('كود الخصم غير صالح.');
  const method=text(body.payment_method)||'cash_on_delivery',status=text(body.status)||'confirmed';
  if(!['cash','cash_on_delivery','installment','cliq','zain_cash','bank_transfer'].includes(method)||!['draft','confirmed'].includes(status))throw new BusinessError('طريقة الدفع أو الحالة غير صالحة.');
  const customerId=text(body.customer_id,36)||undefined;
  if(customerId&&!/^[0-9a-f-]{36}$/i.test(customerId))throw new BusinessError('معرّف العميل غير صالح.');
  return {customer_id:customerId,customer_name:name,customer_phone:phone,city:text(body.city,200),address:text(body.address),
    rep_name:repName,items,items_summary:text(body.items_summary,4000)||items.map(i=>`${i.qty} × ${i.name}`).join(' + '),
    total_amount:total,source:text(body.source,200)||'manual',payment_method:method,status,
    installment_notes:text(body.installment_notes),raw_whatsapp_text:text(body.raw_whatsapp_text,20000),order_date:date(body.order_date),due_date:date(body.due_date),
    ...(promoCode?{promo_code:promoCode}:{})};
}
export function preparePayment(body:Record<string,unknown>) {
  const amount=money(body.amount),invoice_id=text(body.invoice_id,100),payment_method=text(body.payment_method,40),reference_number=text(body.reference_number,200).toLowerCase();
  if(!invoice_id||amount<=0)throw new BusinessError('الفاتورة والمبلغ الموجب مطلوبان.');
  if(!['cash','cash_on_delivery','cliq','zain_cash','bank_transfer'].includes(payment_method))throw new BusinessError('طريقة القبض غير صالحة.');
  if(['cliq','zain_cash','bank_transfer'].includes(payment_method)&&!reference_number)throw new BusinessError('رقم التحويل مطلوب.');
  return {invoice_id,amount,payment_method,reference_number,notes:text(body.notes)};
}
export function preparePaymentReversal(body:Record<string,unknown>) {
  const payment_id=text(body.payment_id,36);
  if(!payment_id||!/^[0-9a-f-]{36}$/i.test(payment_id))throw new BusinessError('معرّف الدفعة غير صالح.');
  return {payment_id,notes:text(body.notes,2000)};
}
const MOVEMENT_TYPES=['purchase_in','sale_out','adjustment','damaged','return_in'];
export function prepareInventoryMovement(body:Record<string,unknown>) {
  const sku=text(body.sku,64);
  if(!sku)throw new BusinessError('رمز المنتج (SKU) مطلوب.');
  const type=text(body.type,20);
  if(!MOVEMENT_TYPES.includes(type))throw new BusinessError('نوع حركة المخزون غير صالح.');
  const rawQty=body.quantity;
  if((typeof rawQty!=='number'&&typeof rawQty!=='string')||!/^\d+$/.test(String(rawQty)))throw new BusinessError('الكمية يجب أن تكون رقمًا صحيحًا موجبًا.');
  const qty=Number(rawQty);
  if(!Number.isInteger(qty)||qty<=0||qty>1000000)throw new BusinessError('الكمية خارج النطاق المسموح.');
  let delta:number;
  if(type==='purchase_in'||type==='return_in')delta=qty;
  else if(type==='sale_out'||type==='damaged')delta=-qty;
  else delta=text(body.direction)==='-'?-qty:qty;
  return {sku,type,delta,reference:text(body.reference,300),notes:text(body.notes,2000)};
}
export function prepareInventoryReversal(body:Record<string,unknown>) {
  const id=text(body.movement_id,36);
  if(!id||!/^[0-9a-f-]{36}$/i.test(id))throw new BusinessError('معرّف الحركة غير صالح.');
  return {movement_id:id};
}
const CUSTOMER_TYPES=['end_user','salon','pharmacy','clinic','wholesale','sale','gift','other'];
const CLASSIFICATIONS=['customer','cold_lead','personal','salon','home_based','pharmacy','no_response','not_interested','doctor_lead','repeat_caller','social_media','unclassified','needs_review','other'];
const CALL_OUTCOMES=['answered','no_answer','busy','wrong_number','not_interested','callback_requested','order_placed','whatsapp_sent'];
export function prepareCustomerUpdate(body:Record<string,unknown>) {
  const id=text(body.id,36);
  if(!id||!/^[0-9a-f-]{36}$/i.test(id))throw new BusinessError('معرّف العميل غير صالح.');
  const data:Record<string,unknown>={};
  if(body.name!==undefined)data.name=text(body.name,200);
  if(body.phone!==undefined){
    let phone=text(body.phone,40).replace(/[^\d+]/g,'');
    if(phone.startsWith('+962'))phone='0'+phone.slice(4);
    else if(phone.startsWith('962'))phone='0'+phone.slice(3);
    if(!/^\d{7,15}$/.test(phone))throw new BusinessError('رقم الهاتف غير صالح.');
    data.phone=phone;
  }
  if(body.city!==undefined)data.city=text(body.city,200);
  if(body.address!==undefined)data.address=text(body.address,1000);
  if(body.notes!==undefined)data.notes=text(body.notes,2000);
  if(body.rep_name!==undefined)data.rep_name=text(body.rep_name,100);
  if(body.customer_type!==undefined){
    const v=text(body.customer_type,40);
    if(!CUSTOMER_TYPES.includes(v))throw new BusinessError('نوع العميل غير صالح.');
    data.customer_type=v;
  }
  if(body.classification!==undefined){
    const v=text(body.classification,40);
    if(!CLASSIFICATIONS.includes(v))throw new BusinessError('تصنيف العميل غير صالح.');
    data.classification=v;
  }
  if(body.next_call_date!==undefined)data.next_call_date=date(body.next_call_date)||'';
  if(body.next_call_time!==undefined)data.next_call_time=callTime(body.next_call_time);
  return {id,data};
}
// 'HH:MM' (24h) for a scheduled call, or '' for none.
export function callTime(value:unknown):string {
  const t=text(value,5);
  if(t&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))throw new BusinessError('وقت الاتصال غير صالح.');
  return t;
}
export function prepareCallLog(body:Record<string,unknown>) {
  const customer_id=text(body.customer_id,36);
  if(!customer_id||!/^[0-9a-f-]{36}$/i.test(customer_id))throw new BusinessError('معرّف العميل غير صالح.');
  const outcome=text(body.outcome,40);
  if(!CALL_OUTCOMES.includes(outcome))throw new BusinessError('نتيجة المكالمة غير صالحة.');
  const next_call_date=body.next_call_date!==undefined?(date(body.next_call_date)||''):undefined;
  const next_call_time=next_call_date&&body.next_call_time!==undefined?callTime(body.next_call_time)||undefined:undefined;
  return {customer_id,outcome,notes:text(body.notes,2000),next_call_date,next_call_time};
}
const databaseErrors:Record<string,[string,number]>={
  IDEMPOTENCY_CONFLICT:['استُخدم معرّف العملية مع بيانات مختلفة.',409],DUPLICATE_REFERENCE:['مرجع التحويل مسجل سابقًا.',409],
  OVERPAYMENT:['المبلغ يتجاوز الرصيد المتبقي. حدّث البيانات قبل المحاولة.',409],STALE_ORDER:['تغيّرت حالة الطلب. حدّث القائمة.',409],
  ORDER_NOT_COLLECTIBLE:['هذه الحالة غير قابلة للتحصيل.',409],FORBIDDEN:['لا تملك صلاحية هذا الطلب.',403],
  ORDER_NOT_FOUND:['الطلب غير موجود.',404],INVOICE_NOT_FOUND:['الفاتورة غير موجودة.',404],INVALID_STATUS:['انتقال الحالة غير مسموح.',400],
  DRIVER_REQUIRED:['اختر السائق قبل إخراج الطلب للتوصيل.',400],
  REFERENCE_REQUIRED:['رقم التحويل مطلوب.',400],TOTAL_MISMATCH:['إجمالي الأصناف لا يطابق الطلب.',400],INVALID_AMOUNT:['المبلغ غير صالح.',400],
  INVALID_ITEMS:['الأصناف غير صالحة.',400],INVALID_ORDER:['الطلب غير صالح.',400],INVALID_METHOD:['طريقة الدفع غير صالحة.',400],CUSTOMER_NOT_FOUND:['العميل غير موجود.',404],
  PRODUCT_NOT_FOUND:['المنتج غير موجود أو غير مفعّل.',404],INVALID_MOVEMENT:['بيانات حركة المخزون غير صالحة.',400],
  INVALID_QUANTITY:['الكمية غير صالحة.',400],INSUFFICIENT_STOCK:['الكمية المتاحة بالمستودع غير كافية لهذه الحركة.',409],
  MOVEMENT_NOT_FOUND:['حركة المخزون غير موجودة.',404],ALREADY_REVERSED:['تم عكس هذه الحركة مسبقًا.',409],
  // A bundle has no stock of its own: its availability comes from the bottles it is made of.
  PRODUCT_IS_BUNDLE:['هذا بكج مكوّن من أصناف أخرى؛ أدخل الحركة على الأصناف المكوّنة له.',400],
  // Promo codes (038). The price checks fire when the browser asks for a discount the rules
  // do not grant, which takes the whole order down rather than charging the wrong amount.
  PROMO_NOT_FOUND:['كود الخصم غير موجود.',404],PROMO_INACTIVE:['كود الخصم موقوف حالياً.',400],
  PROMO_NEEDS_CUSTOMER:['أكواد الخصم تُسجَّل على عميلة محددة؛ اختر العميلة أولاً.',400],
  PROMO_NOT_APPLICABLE:['هذا الكود لا ينطبق على أي صنف في الطلب.',400],
  PROMO_REP_CAP:['استنفدت عدد العميلات المسموح لك بهذا الكود هذا الشهر.',409],
  PROMO_ALLOWANCE:['تم استنفاد الكمية المجانية المسموحة لهذه العميلة من هذا الصنف.',409],
  PROMO_PRICE_MISMATCH:['سعر الصنف لا يطابق كود الخصم. حدّث الصفحة وأعد تطبيق الكود.',409],
  HAS_PAYMENTS:['لا يمكن تعديل أصناف طلب استُلمت عليه دفعات. اعكس الدفعة أولاً.',409],
  MOVEMENT_NOT_REVERSIBLE:['لا يمكن عكس حركة عكسية أخرى.',400],
  INVALID_PHONE:['رقم الهاتف غير صالح.',400],INVALID_ACTOR:['هوية المستخدم غير صالحة.',401],
  INVALID_OUTCOME:['نتيجة المكالمة غير صالحة.',400],
  PAYMENT_NOT_FOUND:['الدفعة غير موجودة.',404],PAYMENT_NOT_REVERSIBLE:['لا يمكن عكس دفعة عكسية أخرى.',400],
  PAYMENT_ALREADY_REVERSED:['تم عكس هذه الدفعة مسبقًا.',409],
  INVALID_EMPLOYEE:['بيانات الموظف غير صالحة.',400],EMPLOYEE_NOT_FOUND:['الموظف غير موجود.',404],
  STALE_EMPLOYEE:['تم تعديل سجل الموظف من جلسة أخرى. حدّث الصفحة قبل الحفظ.',409],
  ACCOUNT_ALREADY_LINKED:['حساب الدخول هذا مرتبط بموظف آخر.',409],DUPLICATE_NATIONAL_ID:['الرقم الوطني مسجل لموظف آخر.',409],
  DEPARTMENT_NOT_FOUND:['القسم غير موجود.',404],MANAGER_NOT_FOUND:['المدير المباشر غير موجود.',404],
  MANAGER_CYCLE:['لا يمكن أن يكون الموظف مديرًا لمديره (تسلسل إداري دائري).',400],
  TERMINATION_DATE_REQUIRED:['تاريخ انتهاء الخدمة مطلوب عند إنهاء الخدمة.',400],
  INVALID_DEPARTMENT:['بيانات القسم غير صالحة.',400],DUPLICATE_DEPARTMENT:['رمز القسم مستخدم مسبقًا.',409],
  INVALID_SETTINGS:['إعدادات الموارد البشرية غير صالحة.',400],INVALID_HOLIDAY:['بيانات العطلة غير صالحة.',400],
  DUPLICATE_HOLIDAY:['يوجد عطلة مسجلة في هذا التاريخ.',409],HOLIDAY_NOT_FOUND:['العطلة غير موجودة.',404],
  EMPLOYEE_INACTIVE:['حساب الموظف غير فعّال (موقوف أو منتهية خدمته).',409],
  ALREADY_CHECKED_IN:['تم تسجيل دخولك اليوم مسبقًا.',409],NOT_CHECKED_IN:['لم يتم تسجيل الدخول اليوم بعد.',409],
  ALREADY_CHECKED_OUT:['تم تسجيل خروجك اليوم مسبقًا.',409],INVALID_ATTENDANCE:['بيانات الحضور غير صالحة.',400],
  ATTENDANCE_FUTURE_DATE:['لا يمكن تعديل حضور يوم لم يأتِ بعد.',400],
  INVALID_LEAVE_TYPE:['بيانات نوع الإجازة غير صالحة.',400],DUPLICATE_LEAVE_TYPE:['رمز نوع الإجازة مستخدم مسبقًا.',409],
  LEAVE_TYPE_NOT_FOUND:['نوع الإجازة غير موجود أو غير مفعّل.',404],LEAVE_TYPE_NOT_ELIGIBLE:['هذا النوع من الإجازات غير متاح لهذا الموظف.',400],
  INVALID_LEAVE_DATES:['تواريخ الإجازة غير صالحة.',400],LEAVE_SPANS_YEARS:['قسّم الإجازة التي تمتد لسنتين إلى طلبين.',400],
  LEAVE_NO_WORKING_DAYS:['الفترة المختارة لا تحتوي على أيام عمل.',400],
  LEAVE_OVERLAP:['يوجد طلب إجازة آخر يتداخل مع هذه الفترة.',409],
  INSUFFICIENT_LEAVE_BALANCE:['رصيد الإجازات غير كافٍ لهذا الطلب.',409],
  LEAVE_NOT_FOUND:['طلب الإجازة غير موجود.',404],LEAVE_NOT_PENDING:['تم البت في هذا الطلب مسبقًا. حدّث القائمة.',409],
  LEAVE_NOT_CANCELLABLE:['لا يمكن إلغاء هذا الطلب.',409],INVALID_LEAVE_ACTION:['الإجراء غير صالح.',400],
  DECISION_NOTE_REQUIRED:['سبب الرفض مطلوب.',400],INVALID_ADJUSTMENT:['بيانات تعديل الرصيد غير صالحة.',400],
  INVALID_PAYROLL:['بيانات الرواتب غير صالحة.',400],PAYROLL_LOCKED:['رواتب هذا الشهر معتمدة أو مصروفة ولا يمكن تعديلها.',409],
  PAYROLL_FUTURE_MONTH:['لا يمكن احتساب رواتب شهر لم يبدأ بعد.',400],PAYROLL_NOT_FOUND:['مسير الرواتب غير موجود.',404],
  PAYROLL_BAD_STATUS:['حالة مسير الرواتب تغيّرت. حدّث الصفحة.',409],PAYROLL_EMPTY:['لا يوجد موظفون في هذا المسير.',400],
  PAYROLL_NEGATIVE_NET:['يوجد موظف براتب صافٍ سالب. راجع الخصومات قبل الاعتماد.',409],
  PAYROLL_NOTE_REQUIRED:['سبب إعادة الفتح مطلوب.',400],COMPONENT_NOT_FOUND:['بند الراتب غير موجود.',404],
  ADJUSTMENT_NOT_FOUND:['الحركة غير موجودة.',404],ADJUSTMENT_ALREADY_VOIDED:['تم إلغاء هذه الحركة مسبقًا.',409],
  ADVANCE_NOT_FOUND:['السلفة غير موجودة.',404],ADVANCE_NOT_ACTIVE:['السلفة ليست قيد السداد.',409],
  INVALID_OPENING:['بيانات الوظيفة غير صالحة.',400],OPENING_NOT_FOUND:['الوظيفة غير موجودة.',404],
  OPENING_CLOSED:['الوظيفة مغلقة ولا تستقبل مرشحين.',409],DUPLICATE_CANDIDATE:['هذا المرشح مسجل مسبقًا على نفس الوظيفة.',409],
  CANDIDATE_NOT_FOUND:['المرشح غير موجود.',404],CANDIDATE_LOCKED:['تم تعيين هذا المرشح ولا يمكن تعديله.',409],
  INVALID_STAGE:['مرحلة التوظيف غير صالحة.',400],REJECTION_REASON_REQUIRED:['سبب الرفض مطلوب.',400],
  REVIEW_NOT_FOUND:['التقييم غير موجود.',404],REVIEW_LOCKED:['تم إرسال هذا التقييم ولا يمكن تعديله.',409],
  DUPLICATE_REVIEW:['يوجد تقييم لهذا الموظف في نفس الفترة.',409],INVALID_REVIEW:['بيانات التقييم غير صالحة.',400],
  DOCUMENT_NOT_FOUND:['المستند غير موجود.',404],INVALID_DOCUMENT:['بيانات المستند غير صالحة.',400],
  INVALID_TIME:['وقت الاتصال غير صالح.',400],
  INVALID_DRIVER:['اختر سائقًا صحيحًا.',400],NO_DRIVER:['عيّن سائقًا للطلب أولًا.',409],
  INVALID_ACTION:['الإجراء غير صالح.',400],INVALID_DATE:['التاريخ غير صالح (لا يمكن أن يكون في الماضي).',400],
};
export async function businessRpc<T>(name:string,args:Record<string,unknown>):Promise<T> {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new BusinessError('خدمة الحفظ غير مهيأة. لم يتم تأكيد أي حفظ.',503);
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await db.rpc(name,args);
  if(error){const known=databaseErrors[error.message];if(known)throw new BusinessError(...known);
    throw new BusinessError('تعذر تأكيد الحفظ أو القراءة. أعد المحاولة بنفس العملية؛ لا تنشئ عملية بديلة.',503);}
  return data as T;
}
export function businessFailure(error:unknown) {
  return Response.json({success:false,error:error instanceof BusinessError?error.message:'تعذر تأكيد العملية. أعد المحاولة بنفس البيانات.'},
    {status:error instanceof BusinessError?error.status:503});
}
