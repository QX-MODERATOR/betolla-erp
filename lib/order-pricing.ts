// Server-side order preparation for /api/orders (QA audit group 6):
//   * catalog items (sent with a sku) are priced from the catalog, never from the browser;
//   * a manager can enter an order for a sales rep, who then owns it;
//   * (with migration 032) an order for a phone number that already belongs to exactly one customer
//     reuses that customer — decided in the database so retries stay identical.
import {businessRpc,BusinessError,text} from '@/lib/business-server';
import {ACTIVE_SALES_REPS,normalizeRepName} from '@/lib/reps';
import type {BusinessProduct} from '@/lib/business';

const round3=(n:number)=>Math.round(n*1000)/1000;

// Items with a sku get the catalog name and price and the order total is recomputed; items without
// one (orders typed from a WhatsApp message) keep their stated prices, checked by the database.
export async function priceCatalogItems(body:Record<string,unknown>):Promise<Record<string,unknown>> {
  if(!Array.isArray(body.items)||!body.items.some(i=>i&&typeof i==='object'&&'sku' in i))return body;
  const catalog=await businessRpc<BusinessProduct[]>('business_inventory_catalog',{});
  const bySku=new Map(catalog.map(p=>[p.sku,p]));
  let total=0;
  const items=(body.items as Record<string,unknown>[]).map(item=>{
    if(!item||typeof item!=='object'||!('sku' in item))throw new BusinessError('لا يمكن خلط أصناف الكتالوج بأصناف يدوية في نفس الطلب.');
    const sku=text(item.sku,64);
    const product=bySku.get(sku);
    if(!product)throw new BusinessError(`المنتج (${sku}) غير موجود أو غير مفعّل. حدّث الصفحة.`,409);
    const qty=Number(item.qty??item.quantity);
    if(!Number.isInteger(qty)||qty<=0||qty>100000)throw new BusinessError('الكمية غير صالحة.');
    const price=Number(product.sale_price??product.price);
    if(!Number.isFinite(price)||price<0)throw new BusinessError(`سعر المنتج (${product.name_ar}) غير محدد في الكتالوج.`,409);
    total+=price*qty;
    return {name:product.name_ar,qty,price};
  });
  total=round3(total);
  // The page shows a total before sending; if the catalog changed meanwhile, say so instead of
  // silently charging a different amount.
  if(body.total_amount!==undefined&&Math.abs(Number(body.total_amount)-total)>0.0005)
    throw new BusinessError(`تغيّرت أسعار الكتالوج (المجموع الصحيح ${total.toFixed(3)} د.أ). حدّث الصفحة ثم أعد المحاولة.`,409);
  return {...body,items,total_amount:total};
}

// Whose order this is: a sales rep always herself; anyone else may name a rep from the roster.
export async function orderRep(user:{id:string;role:string;name:string},body:Record<string,unknown>):Promise<{repName:string;ownerId:string|undefined}> {
  const own=normalizeRepName(user.name);
  if(user.role==='sales_rep'||body.rep_name===undefined||body.rep_name===null||body.rep_name==='')return {repName:own,ownerId:undefined};
  const rep=normalizeRepName(text(body.rep_name,100));
  if(!(ACTIVE_SALES_REPS as readonly string[]).includes(rep))throw new BusinessError('المندوب المحدد غير معروف.');
  const {SYSTEM_ACCOUNTS}=await import('@/lib/auth');
  const account=SYSTEM_ACCOUNTS.find(a=>a.profile.role==='sales_rep'&&normalizeRepName(a.profile.name)===rep);
  // A rep without a login account keeps the creator as owner (the rep name is still recorded).
  return {repName:rep,ownerId:account&&account.profile.id!==user.id?account.profile.id:undefined};
}
