// Server-side order preparation for /api/orders (QA audit group 6):
//   * catalog items (sent with a sku) are priced from the catalog, never from the browser;
//   * a manager can enter an order for a sales rep, who then owns it;
//   * (with migration 032) an order for a phone number that already belongs to exactly one customer
//     reuses that customer — decided in the database so retries stay identical.
import {businessRpc,BusinessError,text} from '@/lib/business-server';
import {ASSIGNABLE_REPS,isOwnQueueRole,normalizeRepName} from '@/lib/reps';
import type {BusinessProduct} from '@/lib/business';

const round3=(n:number)=>Math.round(n*1000)/1000;

// A promo quote (migration 038): what a code does to this basket, decided in the database.
export interface PromoQuote {
  ok:boolean; error?:string; code?:string; kind?:string; label?:string; sku?:string; name?:string;
  allowance?:number; already?:number; requested?:number; cap?:number;
  items?:{sku:string;qty:number;price:number;free?:boolean;discounted?:boolean}[];
  granted?:{sku:string;qty:number}[]; saved?:number;
}
const PROMO_ERRORS:Record<string,string>={
  PROMO_NOT_FOUND:'كود الخصم غير موجود.',
  PROMO_INACTIVE:'كود الخصم موقوف حالياً.',
  PROMO_NEEDS_CUSTOMER:'اختر العميلة من القائمة أولاً؛ أكواد الخصم تُسجَّل على عميلة محددة.',
  PROMO_NOT_APPLICABLE:'هذا الكود لا ينطبق على أي صنف في الطلب.',
  PROMO_REP_CAP:'استنفدت عدد العميلات المسموح لك بهذا الكود هذا الشهر.',
  PROMO_ALLOWANCE:'تم استنفاد الكمية المجانية المسموحة لهذه العميلة من هذا الصنف.',
};
export function promoMessage(quote:PromoQuote):string {
  const base=PROMO_ERRORS[quote.error||'']||'تعذر تطبيق كود الخصم.';
  if(quote.error==='PROMO_ALLOWANCE'&&quote.name!==undefined)
    return `${base} (${quote.name}: المطلوب ${quote.requested}، المسموح ${quote.allowance}، المستخدم سابقاً ${quote.already})`;
  if(quote.error==='PROMO_REP_CAP'&&quote.cap!==undefined)return `${base} (الحد: ${quote.cap} عميلة/شهر)`;
  // VIP1/VIP2/VIP3 were merged into VIP (migration 039), which prices every plasma product and
  // package at once. A rep typing an old code by habit should be sent to the new one, not left
  // with "this code is stopped" and no idea what to type instead.
  if(quote.error==='PROMO_INACTIVE'&&/^VIP[123]$/i.test(quote.code||''))
    return `${base} استخدمي كود VIP — يشمل الشامبو والبلسم والبكجات معاً.`;
  return base;
}

/** What a code would do to this basket, without placing anything. */
export async function quotePromo(code:string,customerId:string|null,actorId:string,
  items:{sku:string;qty:number}[]):Promise<PromoQuote> {
  return businessRpc<PromoQuote>('business_promo_quote',
    {p_code:code,p_customer_id:customerId,p_actor:actorId,p_items:items});
}

// Items with a sku get the catalog name and price and the order total is recomputed; items without
// one (orders typed from a WhatsApp message) keep their stated prices, checked by the database.
// With a promo code, the prices come from business_promo_quote instead of the catalog — and
// business_create_order re-derives the same answer before accepting the order, so this is a
// convenience for the page, never the authority on what a customer is charged.
export async function priceCatalogItems(body:Record<string,unknown>,
  actor?:{id:string}):Promise<Record<string,unknown>> {
  if(!Array.isArray(body.items)||!body.items.some(i=>i&&typeof i==='object'&&'sku' in i))return body;
  const catalog=await businessRpc<BusinessProduct[]>('business_inventory_catalog',{});
  const bySku=new Map(catalog.map(p=>[p.sku,p]));
  const promoCode=body.promo_code===undefined||body.promo_code===null?'':text(body.promo_code,24);
  let promoPrices:Map<string,number>|null=null;
  if(promoCode){
    const basket=(body.items as Record<string,unknown>[]).map(item=>({
      sku:text(item?.sku,64),qty:Number(item?.qty??item?.quantity)}));
    const quote=await quotePromo(promoCode,
      body.customer_id===undefined||body.customer_id===null?null:text(body.customer_id,64),
      actor?.id||'',basket);
    if(!quote.ok)throw new BusinessError(promoMessage(quote),400);
    promoPrices=new Map((quote.items||[]).map(i=>[i.sku,Number(i.price)]));
  }
  let total=0;
  const items=(body.items as Record<string,unknown>[]).map(item=>{
    if(!item||typeof item!=='object'||!('sku' in item))throw new BusinessError('لا يمكن خلط أصناف الكتالوج بأصناف يدوية في نفس الطلب.');
    const sku=text(item.sku,64);
    const product=bySku.get(sku);
    if(!product)throw new BusinessError(`المنتج (${sku}) غير موجود أو غير مفعّل. حدّث الصفحة.`,409);
    const qty=Number(item.qty??item.quantity);
    if(!Number.isInteger(qty)||qty<=0||qty>100000)throw new BusinessError('الكمية غير صالحة.');
    const price=promoPrices?.get(sku)??Number(product.sale_price??product.price);
    if(!Number.isFinite(price)||price<0)throw new BusinessError(`سعر المنتج (${product.name_ar}) غير محدد في الكتالوج.`,409);
    total+=price*qty;
    return {name:product.name_ar,qty,price};
  });
  total=round3(total);
  // A total the rep typed by hand (migration 048): the lines keep their catalogue prices and the
  // database records the gap as a discount. She answers for it; afterwards only admin and رشا edit.
  if(body.total_override===true){
    const manual=round3(Number(body.total_amount));
    if(!Number.isFinite(manual)||manual<=0||manual>=10000000)throw new BusinessError('إجمالي الطلبية يجب أن يكون مبلغًا موجبًا.');
    return {...body,items,total_amount:manual,total_override:true};
  }
  // The page sends the total the rep showed the customer. If it differs from today's catalogue
  // (prices changed meanwhile, or she set it herself) it is kept as she sent it, as a hand-typed
  // total: the rep answers for the amount (owner, 2026-09-23), and the gap is recorded as a discount.
  if(body.total_amount!==undefined&&body.total_amount!==null&&body.total_amount!==''&&Math.abs(Number(body.total_amount)-total)>0.0005){
    const sent=round3(Number(body.total_amount));
    if(!Number.isFinite(sent)||sent<=0||sent>=10000000)throw new BusinessError('إجمالي الطلبية يجب أن يكون مبلغًا موجبًا.');
    return {...body,items,total_amount:sent,total_override:true};
  }
  return {...body,items,total_amount:total};
}

// Whose order this is: a sales rep (or marketing specialist) always herself; anyone else may name a
// rep from the roster.
export async function orderRep(user:{id:string;role:string;name:string},body:Record<string,unknown>):Promise<{repName:string;ownerId:string|undefined}> {
  const own=normalizeRepName(user.name);
  if(isOwnQueueRole(user.role)||body.rep_name===undefined||body.rep_name===null||body.rep_name==='')return {repName:own,ownerId:undefined};
  const rep=normalizeRepName(text(body.rep_name,100));
  if(!(ASSIGNABLE_REPS as readonly string[]).includes(rep))throw new BusinessError('المندوب المحدد غير معروف.');
  const {SYSTEM_ACCOUNTS}=await import('@/lib/auth');
  const account=SYSTEM_ACCOUNTS.find(a=>isOwnQueueRole(a.profile.role)&&normalizeRepName(a.profile.name)===rep);
  // A rep without a login account keeps the creator as owner (the rep name is still recorded).
  return {repName:rep,ownerId:account&&account.profile.id!==user.id?account.profile.id:undefined};
}
