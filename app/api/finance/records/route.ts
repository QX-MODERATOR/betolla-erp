import {businessUser,businessRpc,businessDb,businessFailure,BusinessError} from '@/lib/business-server';
import {SYSTEM_ACCOUNTS} from '@/lib/auth';
import {ammanDate,ammanToday,shiftDate} from '@/lib/dates';
import {receivables,paymentLedger,paymentsCsv,expenses,budgets,profitAndLoss,profitAndLossCsv,auditTrail,
  type RequestRow,type CampaignRow,type SpendEntry,type PayrollRun,type AdvanceEntry,type CostLine,type OrderChangeRow} from '@/lib/finance-pages';
import type {BusinessOrder,BusinessProduct} from '@/lib/business';
export const dynamic='force-dynamic';

// The finance manager's pages (finance, admin, general manager — the /api/finance route rule). Read-only.
// GET ?view=receivables                         what each customer owes now, every open invoice
// GET ?view=payments&from=…&to=…[&format=csv]   every payment received in the period, and who recorded it
// GET ?view=expenses&from=…&to=…                marketing spend entries, payroll runs, open advances
// GET ?view=budgets                             each marketing campaign's budget against its spend
// GET ?view=reports&from=…&to=…[&format=csv]    profit and loss and cash flow, month by month
// GET ?view=audit&from=…&to=…                   who recorded, reversed, cancelled, edited or paid what
//
// As in /api/finance/overview, a source that fails to load comes back as null and the page says so.
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const VIEWS=['receivables','payments','expenses','budgets','reports','audit'] as const;
const PAGE=1000;
type Query={range:(a:number,b:number)=>PromiseLike<{data:unknown;error:unknown}>};

// Every row of a table read, a page at a time (PostgREST caps a response at 1000 rows), or null.
async function all<T>(make:()=>Query):Promise<T[]|null> {
  try{const out:T[]=[];
    for(let i=0;;i+=PAGE){const {data,error}=await make().range(i,i+PAGE-1);
      if(error)return null;const rows=(data??[]) as T[];out.push(...rows);if(rows.length<PAGE)return out;}
  }catch{return null;}
}
async function rpc<T>(name:string):Promise<T|null> {
  try{return await businessRpc<T>(name,{});}catch{return null;}
}
// Account id -> the person's name, for "recorded by" columns.
const NAMES:Record<string,string>=Object.fromEntries(SYSTEM_ACCOUNTS.map(a=>[a.id,a.profile.name]));
const one=<T,>(v:T|T[]|null|undefined)=>Array.isArray(v)?v[0]:v;
const csvResponse=(body:string,name:string)=>new Response(body,{headers:{'Content-Type':'text/csv; charset=utf-8',
  'Content-Disposition':`attachment; filename="${name}"`,'Cache-Control':'no-store'}});

export async function GET(req:Request) {
  try{await businessUser(req,'/api/finance');
    const params=new URL(req.url).searchParams;
    const view=params.get('view') as (typeof VIEWS)[number];
    if(!VIEWS.includes(view))throw new BusinessError('الصفحة المطلوبة غير معروفة.');
    const today=ammanToday();
    const from=params.get('from')||today.slice(0,8)+'01',to=params.get('to')||today;
    if(!DAY.test(from)||!DAY.test(to)||from>to)throw new BusinessError('الفترة غير صالحة.');
    if(shiftDate(from,400)<to)throw new BusinessError('أقصى فترة هي سنة واحدة تقريباً (400 يوم).');
    const csv=params.get('format')==='csv';
    const db=businessDb();
    const orders=()=>businessRpc<BusinessOrder[]>('business_list',{p_scope:null});
    const campaigns=()=>all<CampaignRow>(()=>db.from('mkt_campaigns')
      .select('id,code,name,channel,status,start_date,end_date,budget,target_revenue').order('start_date',{ascending:false}));
    const spend=(range:boolean)=>all<SpendEntry>(()=>{
      const q=db.from('mkt_spend').select('id,campaign_id,spend_date,amount,description,created_by,created_at,voided_at,voided_by,void_reason');
      return (range?q.gte('spend_date',from).lte('spend_date',to):q).order('spend_date',{ascending:false});
    });
    const payroll=()=>rpc<PayrollRun[]>('business_hr_payroll_runs');
    const advances=async()=>{
      type Row=Omit<AdvanceEntry,'employee'>&{hr_employees:{full_name_ar:string}|{full_name_ar:string}[]|null};
      const rows=await all<Row>(()=>db.from('hr_advances')
        .select('id,amount,monthly_amount,start_month,reason,status,created_at,hr_employees(full_name_ar)').order('created_at',{ascending:false}));
      return rows&&rows.map(({hr_employees,...a})=>({...a,amount:Number(a.amount),monthly_amount:Number(a.monthly_amount),
        employee:one(hr_employees)?.full_name_ar||'—'}));
    };
    // Requests are stamped when made; a day's margin either side, then Amman days decide.
    const requests=(ops:string[])=>all<RequestRow>(()=>db.from('business_requests')
      .select('operation,actor_id,result_id,created_at,payload').in('operation',ops)
      .gte('created_at',shiftDate(from,-1)).lt('created_at',shiftDate(to,2)).order('created_at',{ascending:false}));

    if(view==='receivables')
      return Response.json({receivables:receivables(await orders(),today),today},{headers:{'Cache-Control':'no-store'}});

    if(view==='payments'){
      const [list,reqs]=await Promise.all([orders(),requests(['payment','payment_reverse'])]);
      const ledger=paymentLedger(list,reqs??[],NAMES,from,to);
      if(csv)return csvResponse(paymentsCsv(ledger.rows),`betolla-payments-${from}_${to}.csv`);
      return Response.json({payments:ledger,recorded_by_available:reqs!==null},{headers:{'Cache-Control':'no-store'}});
    }

    if(view==='expenses'){
      const [c,s,p,a]=await Promise.all([campaigns(),spend(true),payroll(),advances()]);
      return Response.json({expenses:expenses({campaigns:c,spend:s,payroll:p,advances:a},NAMES,from,to)},{headers:{'Cache-Control':'no-store'}});
    }

    if(view==='budgets'){
      const [c,s,list]=await Promise.all([campaigns(),spend(false),orders()]);
      if(c===null||s===null)throw new BusinessError('تعذر تحميل الحملات التسويقية.',503);
      return Response.json({budgets:budgets(c,s,list)},{headers:{'Cache-Control':'no-store'}});
    }

    if(view==='reports'){
      type LineDb={product_id:string|null;quantity:number;orders:{order_date:string;status:string}|{order_date:string;status:string}[]|null};
      const [list,lineRows,catalog,s,p]=await Promise.all([orders(),
        all<LineDb>(()=>db.from('order_items').select('product_id,quantity,orders!inner(order_date,status)')
          .gte('orders.order_date',from).lte('orders.order_date',to).order('id')),
        rpc<BusinessProduct[]>('business_inventory_catalog'),spend(true),payroll()]);
      const lines:CostLine[]|null=lineRows&&lineRows.flatMap(l=>{const o=one(l.orders);
        return o?[{product_id:l.product_id,quantity:Number(l.quantity),order_date:o.order_date,status:o.status}]:[];});
      const pl=profitAndLoss({orders:list,lines,catalog,spend:s,payroll:p},from,to);
      if(csv)return csvResponse(profitAndLossCsv(pl),`betolla-pnl-${from}_${to}.csv`);
      return Response.json({report:pl},{headers:{'Cache-Control':'no-store'}});
    }

    // audit
    const [list,reqs,changes,s,c,p,a]=await Promise.all([orders(),
      requests(['payment','payment_reverse','status','mkt_spend','mkt_spend_void','hr_payroll_transition','hr_advance']),
      all<OrderChangeRow>(()=>db.from('order_changes').select('order_id,actor_id,changes,changed_at')
        .gte('changed_at',shiftDate(from,-1)).lt('changed_at',shiftDate(to,2)).order('changed_at',{ascending:false})),
      spend(false),campaigns(),payroll(),advances()]);
    if(reqs===null)throw new BusinessError('تعذر تحميل سجل العمليات.',503);
    const rows=auditTrail({requests:reqs,orderChanges:changes,orders:list,spend:s,campaigns:c,payroll:p,advances:a},NAMES)
      .filter(r=>{const d=ammanDate(r.at);return d>=from&&d<=to;});
    return Response.json({audit:rows,order_changes_available:changes!==null},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return businessFailure(e);}
}
