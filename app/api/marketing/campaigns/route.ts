import {businessRpc,businessFailure,requestKey,readBody,repScopeOf,BusinessError} from '@/lib/business-server';
import {
  marketingUser,requireManage,accountName,marketingTeam,
  prepareCampaign,prepareSpend,prepareSpendVoid,prepareAttribution,
} from '@/lib/marketing-server';
import {uuid} from '@/lib/hr-server';
import type {MktCampaign,MktSpend,MktCampaignLead} from '@/lib/marketing';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};

const named=(c:MktCampaign):MktCampaign=>({...c,owner_name:accountName(c.owner_account_id)});
// The promo codes a campaign can be linked to — only the people who edit campaigns need them.
const promoCodesFor=async(access:string)=>access==='manage'
  ?(await businessRpc<{code:string;label:string;is_active:boolean}[]>('business_promo_codes',{}))
    .map(p=>({code:p.code,label_ar:p.label,is_active:p.is_active}))
  :[];

// GET            every campaign with its results, the team, and (for managers) the promo codes to link
// GET ?id=<uuid> one campaign: results, spend ledger, attributed leads
export async function GET(req:Request) {
  try{const {access}=await marketingUser(req,'/api/marketing/campaigns');
    const id=new URL(req.url).searchParams.get('id');
    if(id){
      const campaignId=uuid(id,'معرّف الحملة');
      const [campaign,spend,leads,promoCodes]=await Promise.all([
        businessRpc<MktCampaign|null>('business_mkt_campaign_document',{p_id:campaignId}),
        businessRpc<MktSpend[]>('business_mkt_spend',{p_campaign:campaignId}),
        businessRpc<MktCampaignLead[]>('business_mkt_campaign_leads',{p_campaign:campaignId}),
        promoCodesFor(access),
      ]);
      if(!campaign)throw new BusinessError('الحملة غير موجودة.',404);
      return Response.json({access,campaign:named(campaign),
        spend:spend.map(s=>({...s,created_by_name:accountName(s.created_by)})),
        leads:leads.map(l=>({...l,attributed_by_name:accountName(l.attributed_by)})),
        team:marketingTeam(),promo_codes:promoCodes},{headers});
    }
    const [campaigns,promoCodes]=await Promise.all([
      businessRpc<MktCampaign[]>('business_mkt_campaigns',{}).then(list=>list.map(named)),
      promoCodesFor(access),
    ]);
    return Response.json({access,campaigns,team:marketingTeam(),promo_codes:promoCodes},{headers});
  }catch(e){return businessFailure(e);}
}

// POST {kind:'campaign'|'spend'|'void', ...}   manager and coordinator
// POST {kind:'attribute', campaign_id, customer_ids, mode?:'clear'}   anyone on the team; a rep or
//      specialist only for leads assigned to her (enforced again by the database)
export async function POST(req:Request) {
  try{const {user,access}=await marketingUser(req,'/api/marketing/campaigns');
    const key=requestKey(req),body=await readBody(req);
    const call=<T extends object>(fn:string,data:unknown)=>businessRpc<T>(fn,{p_actor:user.id,p_key:key,p_data:data});
    if(body.kind==='campaign'){
      requireManage(access);
      const result=await call<{campaign:MktCampaign;replayed:boolean}>('business_mkt_campaign_save',prepareCampaign(body));
      return Response.json({success:true,...result,campaign:named(result.campaign)},{status:body.id||result.replayed?200:201});
    }
    if(body.kind==='spend'){
      requireManage(access);
      return Response.json({success:true,...await call<{id:string;replayed:boolean}>('business_mkt_spend_record',prepareSpend(body))},{status:201});
    }
    if(body.kind==='void'){
      requireManage(access);
      return Response.json({success:true,...await call<{id:string;replayed:boolean}>('business_mkt_spend_void',prepareSpendVoid(body))});
    }
    if(body.kind==='attribute'){
      const data:Record<string,unknown>=prepareAttribution(body);
      if(access!=='manage'){
        // A member tags only her own leads; with no personal queue there is nothing she may tag.
        const scope=repScopeOf(user);
        if(!scope)throw new BusinessError('هذا خارج صلاحيتك في قسم التسويق.',403);
        data.scope_rep=scope;
      }
      return Response.json({success:true,...await call<{changed:number;skipped:number;replayed:boolean}>('business_mkt_attribute',data)});
    }
    throw new BusinessError('نوع العملية غير صالح.');
  }catch(e){return businessFailure(e);}
}
