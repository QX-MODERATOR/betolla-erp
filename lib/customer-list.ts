// Paged customer list, call queue and dashboard summary (migration 031). Each helper falls back to
// the older full-list RPCs, with the same rules applied in code, while the migration is missing.
import {businessRpc,BusinessError} from '@/lib/business-server';
import {normalizeArabic,phoneCore} from '@/lib/customer-search';
import {ammanToday} from '@/lib/dates';
import type {BusinessCustomer} from '@/lib/business';

export const PAGE_SIZE_MAX=200;

export interface CustomerPage {total:number;all_total:number;customers:BusinessCustomer[]}
export interface PageQuery {query:string;rep:string;type:string;offset:number;limit:number}

async function withFallback<T>(primary:()=>Promise<T>,fallback:()=>Promise<T>):Promise<T> {
  try{return await primary();}
  catch(e){
    // 503 = the database function is not there yet (or the database is unreachable, in which case
    // the fallback fails the same way).
    if(!(e instanceof BusinessError)||e.status!==503)throw e;
    return fallback();
  }
}

const fullList=(repScope:string|null)=>repScope
  ?businessRpc<BusinessCustomer[]>('business_customer_list_by_rep',{p_rep:repScope})
  :businessRpc<BusinessCustomer[]>('business_customer_list',{});

// Mirrors the matching in business_customer_page.
export function customerMatches(c:BusinessCustomer,query:string):boolean {
  const raw=query.trim();
  if(!raw)return true;
  const digitCount=raw.replace(/\D/g,'').length;
  const digits=digitCount>=3?phoneCore(raw):'';
  if(digits.length>=3&&phoneCore(c.phone).includes(digits))return true;
  if(!/[^\d\s+()\-]/.test(raw))return false;
  const term=normalizeArabic(raw);
  return [c.name,c.city,c.address,c.notes].some(v=>normalizeArabic(v).includes(term));
}

export function customerPage(repScope:string|null,q:PageQuery):Promise<CustomerPage> {
  return withFallback(
    ()=>businessRpc<CustomerPage>('business_customer_page',{p_rep_scope:repScope,p_query:q.query,p_rep:q.rep,p_type:q.type,p_offset:q.offset,p_limit:q.limit}),
    async()=>{
      const all=await fullList(repScope);
      const filtered=all.filter(c=>(!q.rep||c.rep_name_raw===q.rep)&&(!q.type||c.customer_type===q.type)&&customerMatches(c,q.query));
      return {total:filtered.length,all_total:all.length,
        customers:filtered.slice(q.offset,q.offset+q.limit).map(c=>({...c,history:[]}))};
    });
}

export function callQueue(repScope:string|null):Promise<BusinessCustomer[]> {
  return withFallback(
    ()=>businessRpc<BusinessCustomer[]>('business_call_queue',{p_rep_scope:repScope}),
    async()=>(await fullList(repScope)).filter(c=>c.next_call_date)
      .sort((a,b)=>(a.next_call_date||'').localeCompare(b.next_call_date||'')||a.id.localeCompare(b.id))
      .map(c=>({...c,history:c.history.slice(0,1)})));
}

export interface DashboardSummary {
  customers_total:number; scheduled_calls:number; today_calls:BusinessCustomer[];
  rep_counts:{name:string;count:number}[]; active_orders:number; products:number;
}

export function dashboardSummary():Promise<DashboardSummary> {
  const today=ammanToday();
  return withFallback(
    ()=>businessRpc<DashboardSummary>('business_dashboard_summary',{p_today:today}),
    async()=>{
      const [customers,orders,catalog]=await Promise.all([
        fullList(null),
        businessRpc<{status:string}[]>('business_list',{p_scope:null}),
        businessRpc<unknown[]>('business_inventory_catalog',{}),
      ]);
      const counts=new Map<string,number>();
      for(const c of customers)counts.set(c.rep_name_raw||'',(counts.get(c.rep_name_raw||'')||0)+1);
      return {
        customers_total:customers.length,
        scheduled_calls:customers.filter(c=>c.next_call_date).length,
        today_calls:customers.filter(c=>c.next_call_date===today).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,6).map(c=>({...c,history:c.history.slice(0,1)})),
        rep_counts:[...counts].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name)),
        active_orders:orders.filter(o=>!['delivered','cancelled','returned'].includes(o.status)).length,
        products:catalog.length,
      };
    });
}
