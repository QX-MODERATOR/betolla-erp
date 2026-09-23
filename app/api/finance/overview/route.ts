import {businessUser,businessRpc,businessDb,businessFailure,BusinessError} from '@/lib/business-server';
import {financeOverview,financeOrdersCsv,type FinanceInputs} from '@/lib/finance-overview';
import {ammanToday,shiftDate} from '@/lib/dates';
import type {BusinessOrder,BusinessProduct} from '@/lib/business';
export const dynamic='force-dynamic';

// المركز المالي (finance, admin, general manager — the /api/finance route rule). Read-only.
// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD           the figures for that period (default: this month)
// GET ?from=…&to=…&format=csv                  every order in the period with its money columns
//
// Orders are required; every other source is optional. A source that fails to load (a table from
// a migration not yet applied, a transient error) comes back as null and the page says that section
// is unavailable, rather than the whole centre failing or quietly showing zero.
const DAY=/^\d{4}-\d{2}-\d{2}$/;
// A table read: its rows, or null if it failed.
async function rows<T>(query:PromiseLike<{data:unknown;error:unknown}>):Promise<T[]|null> {
  try{const {data,error}=await query;return error?null:((data??[]) as T[]);}catch{return null;}
}
// An RPC read: its result, or null if it failed.
async function rpc<T>(name:string):Promise<T|null> {
  try{return await businessRpc<T>(name,{});}catch{return null;}
}
type Campaign={name:string;channel:string};
type SpendDb={spend_date:string;amount:number;voided_at:string|null;mkt_campaigns:Campaign|Campaign[]|null};
type RedemptionDb={code:string;amount_saved:number;redeemed_at:string};

export async function GET(req:Request) {
  try{await businessUser(req,'/api/finance');
    const params=new URL(req.url).searchParams;
    const today=ammanToday();
    const from=params.get('from')||today.slice(0,8)+'01',to=params.get('to')||today;
    if(!DAY.test(from)||!DAY.test(to)||from>to)throw new BusinessError('الفترة غير صالحة.');
    if(shiftDate(from,400)<to)throw new BusinessError('أقصى فترة هي سنة واحدة تقريباً (400 يوم).');

    const orders=await businessRpc<BusinessOrder[]>('business_list',{p_scope:null});
    if(params.get('format')==='csv')
      return new Response(financeOrdersCsv(orders,from,to),{headers:{'Content-Type':'text/csv; charset=utf-8',
        'Content-Disposition':`attachment; filename="betolla-finance-${from}_${to}.csv"`,'Cache-Control':'no-store'}});

    const db=businessDb();
    const [closures,spendRows,payroll,advances,redemptionRows,catalog]=await Promise.all([
      rows<NonNullable<FinanceInputs['closures']>[number]>(db.from('driver_shift_closures')
        .select('driver_name,shift_date,is_closed,cash_collected,counted_cash,delivered_count,returned_count,closed_by')
        .gte('shift_date',from).lte('shift_date',to)),
      rows<SpendDb>(db.from('mkt_spend').select('spend_date,amount,voided_at,mkt_campaigns(name,channel)')
        .gte('spend_date',from).lte('spend_date',to)),
      rpc<NonNullable<FinanceInputs['payroll']>>('business_hr_payroll_runs'),
      rows<NonNullable<FinanceInputs['advances']>[number]>(db.from('hr_advances')
        .select('amount,monthly_amount,status,start_month').eq('status','active')),
      // Redemptions are stamped with a time; a day's margin either side, then Amman days decide.
      rows<RedemptionDb>(db.from('promo_redemptions').select('code,amount_saved,redeemed_at')
        .gte('redeemed_at',shiftDate(from,-1)).lte('redeemed_at',shiftDate(to,2))),
      rpc<BusinessProduct[]>('business_inventory_catalog'),
    ]);
    const campaignOf=(c:SpendDb['mkt_campaigns'])=>Array.isArray(c)?c[0]:c;
    const spend=spendRows&&spendRows.map(r=>({spend_date:r.spend_date,amount:Number(r.amount),voided_at:r.voided_at,
      campaign:campaignOf(r.mkt_campaigns)?.name||'—',channel:campaignOf(r.mkt_campaigns)?.channel}));
    const redemptions=redemptionRows&&redemptionRows.map(r=>({code:r.code,saved:Number(r.amount_saved),redeemed_at:r.redeemed_at}));

    const overview=financeOverview({orders,closures,spend,payroll,advances,redemptions,catalog},from,to,today);
    return Response.json({overview},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return businessFailure(e);}
}
