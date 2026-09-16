import {businessUser,businessRpc,businessFailure,BusinessError} from '@/lib/business-server';
export const dynamic='force-dynamic';

// GET -> operational status for the settings page (admin / general manager only).
// Reports only whether configuration is present, never any configured value.
export async function GET(req:Request) {
  try{const user=await businessUser(req,'/api/system/status');
    if(user.role!=='admin'&&user.role!=='general_manager')throw new BusinessError('هذه الصفحة متاحة للإدارة فقط.',403);
    const started=Date.now();
    let db:{ok:boolean;latency_ms:number;today?:string;error?:string};
    try{
      const today=await businessRpc<string>('business_hr_today',{});
      db={ok:true,latency_ms:Date.now()-started,today};
    }catch(e){
      db={ok:false,latency_ms:Date.now()-started,error:e instanceof Error?e.message:'تعذر الاتصال بقاعدة البيانات.'};
    }
    const configured=(name:string)=>!!process.env[name]?.trim();
    return Response.json({
      db,
      server_time:new Date().toISOString(),
      revision:process.env.K_REVISION||'local',
      service:process.env.K_SERVICE||'local',
      node:process.version,
      config:{
        supabase_url:configured('NEXT_PUBLIC_SUPABASE_URL'),
        supabase_server_key:configured('SUPABASE_SERVICE_ROLE_KEY'),
        jwt_secret:configured('JWT_SECRET'),
        telegram:configured('TELEGRAM_BOT_TOKEN')&&configured('TELEGRAM_ADMIN_CHAT_ID'),
      },
    },{headers:{'Cache-Control':'no-store'}});
  }catch(e){return businessFailure(e);}
}
