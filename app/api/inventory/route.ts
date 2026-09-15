import {businessUser,businessRpc,businessFailure,requestKey,readBody,prepareInventoryMovement,prepareInventoryReversal} from '@/lib/business-server';
import type {BusinessProduct,BusinessMovement} from '@/lib/business';
export const dynamic='force-dynamic';
export async function GET(req:Request) {
  try{await businessUser(req,'/api/inventory');
    const [catalog,movements]=await Promise.all([
      businessRpc<BusinessProduct[]>('business_inventory_catalog',{}),
      businessRpc<BusinessMovement[]>('business_inventory_movements',{p_limit:200}),
    ]);
    return Response.json({catalog,movements},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return businessFailure(e);}
}
export async function POST(req:Request) {
  try{const user=await businessUser(req,'/api/inventory'),key=requestKey(req),body=await readBody(req);
    const result=await businessRpc<{movement:BusinessMovement;stock:number;replayed:boolean}>('business_inventory_movement_create',
      {p_actor:user.id,p_key:key,p_data:prepareInventoryMovement(body)});
    return Response.json({success:true,...result},{status:result.replayed?200:201});
  }catch(e){return businessFailure(e);}
}
export async function PATCH(req:Request) {
  try{const user=await businessUser(req,'/api/inventory'),key=requestKey(req),body=await readBody(req);
    const result=await businessRpc<{movement:BusinessMovement;stock:number;replayed:boolean}>('business_inventory_movement_reverse',
      {p_actor:user.id,p_key:key,p_data:prepareInventoryReversal(body)});
    return Response.json({success:true,...result});
  }catch(e){return businessFailure(e);}
}
