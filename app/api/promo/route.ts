import {businessUser,businessRpc,businessFailure,readBody,text,requirePermission,BusinessError} from '@/lib/business-server';
import {quotePromo,promoMessage,type PromoQuote} from '@/lib/order-pricing';

export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};

// GET: the code list with this month's usage — management only, since it exposes every rep's caps.
export async function GET(req:Request) {
  try{
    const user=await businessUser(req,'/api/promo');
    if(!['admin','general_manager','sales_manager'].includes(user.role))
      throw new BusinessError('قائمة أكواد الخصم متاحة للإدارة فقط.',403);
    return Response.json({codes:await businessRpc('business_promo_codes',{})},{headers});
  }catch(e){return businessFailure(e);}
}

// POST: what a code would do to this basket. Quoting is not granting — business_create_order
// re-derives the same answer before accepting the order — so any account that may create an
// order may ask, and the quote is always attributed to the asker for the per-rep cap.
export async function POST(req:Request) {
  try{
    const user=await businessUser(req,'/api/promo');
    requirePermission(user,'orders.create');
    const body=await readBody(req);
    const code=text(body.code,24);
    if(!code)throw new BusinessError('أدخل كود الخصم.');
    if(!Array.isArray(body.items)||!body.items.length||body.items.length>200)
      throw new BusinessError('أضف أصناف الطلب قبل تطبيق الكود.');
    const items=(body.items as Record<string,unknown>[]).map(i=>{
      const sku=text(i?.sku,64),qty=Number(i?.qty);
      if(!sku||!Number.isInteger(qty)||qty<=0||qty>100000)throw new BusinessError('الأصناف غير صالحة.');
      return {sku,qty};
    });
    const customerId=text(body.customer_id,36)||null;
    if(customerId&&!/^[0-9a-f-]{36}$/i.test(customerId))throw new BusinessError('معرّف العميل غير صالح.');
    const quote:PromoQuote=await quotePromo(code,customerId,user.id,items);
    // A refused code is an answer, not a failure: the page shows why and the rep fixes the basket.
    return Response.json({success:true,quote,message:quote.ok?undefined:promoMessage(quote)},{headers});
  }catch(e){return businessFailure(e);}
}

// PATCH: the per-code monthly cap and whether it is live. Prices and sample allowances are
// deliberately not editable here — changing what VIP3 costs is a pricing decision.
export async function PATCH(req:Request) {
  try{
    const user=await businessUser(req,'/api/promo');
    if(!['admin','general_manager'].includes(user.role))
      throw new BusinessError('تعديل أكواد الخصم متاح لمسؤول النظام والمدير العام.',403);
    const body=await readBody(req);
    const code=text(body.code,24);
    if(!code)throw new BusinessError('أدخل كود الخصم.');
    const data:Record<string,unknown>={code};
    if(body.per_rep_monthly_cap!==undefined)
      data.per_rep_monthly_cap=body.per_rep_monthly_cap===null||body.per_rep_monthly_cap===''?null:Number(body.per_rep_monthly_cap);
    if(body.is_active!==undefined){
      if(typeof body.is_active!=='boolean')throw new BusinessError('حالة الكود غير صالحة.');
      data.is_active=body.is_active;
    }
    const codes=await businessRpc('business_promo_code_update',{p_actor:user.id,p_data:data});
    return Response.json({success:true,codes,message:'تم حفظ إعدادات الكود.'},{headers});
  }catch(e){return businessFailure(e);}
}
