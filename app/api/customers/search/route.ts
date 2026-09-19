import {businessUser,businessRpc,businessFailure,text,repScopeOf,BusinessError} from '@/lib/business-server';
import {searchTerms,isSearchable,matchesCustomer,SEARCH_RESULT_LIMIT,type CustomerSearchHit} from '@/lib/customer-search';
import type {BusinessCustomer} from '@/lib/business';
export const dynamic='force-dynamic';

// GET ?q=<phone or name> -> at most SEARCH_RESULT_LIMIT matching leads (minimal fields, no call history).
// Used by the header search box, including roles that may not browse the full customer list (HR).
// Sales reps only ever get their own leads, same as /api/customers.
export async function GET(req:Request) {
  try{const user=await businessUser(req,'/api/customers/search');
    const query=text(new URL(req.url).searchParams.get('q')??'',100);
    const headers={'Cache-Control':'no-store'};
    const terms=searchTerms(query);
    if(!isSearchable(terms))return Response.json({customers:[]},{headers});
    const rep=repScopeOf(user);
    try{
      const customers=await businessRpc<CustomerSearchHit[]>('business_customer_search',{p_query:query,p_rep:rep,p_limit:SEARCH_RESULT_LIMIT});
      return Response.json({customers},{headers});
    }catch(e){
      // Fallback until migration 026 is applied: same matching rules over the existing list RPCs.
      if(!(e instanceof BusinessError)||e.status!==503)throw e;
      const all=rep
        ?await businessRpc<BusinessCustomer[]>('business_customer_list_by_rep',{p_rep:rep})
        :await businessRpc<BusinessCustomer[]>('business_customer_list',{});
      const customers:CustomerSearchHit[]=all.filter(c=>matchesCustomer(c,terms))
        .sort((a,b)=>(b.updated_at||'').localeCompare(a.updated_at||''))
        .slice(0,SEARCH_RESULT_LIMIT)
        .map(c=>({id:c.id,name:c.name||'',phone:c.phone,city:c.city||'',rep_name_raw:c.rep_name_raw||'',
          classification:c.classification,customer_type:c.customer_type,updated_at:c.updated_at}));
      return Response.json({customers},{headers});
    }
  }catch(e){return businessFailure(e);}
}
