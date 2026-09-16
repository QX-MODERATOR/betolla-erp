import {businessUser,businessRpc,businessFailure,requestKey,readBody,BusinessError} from '@/lib/business-server';
import {prepareAttendanceSettings,prepareHoliday,parseYear} from '@/lib/hr-server';
import {canManageHr,type HrHoliday} from '@/lib/hr';
export const dynamic='force-dynamic';

async function hrManager(req:Request) {
  const user=await businessUser(req,'/api/hr/settings');
  if(!canManageHr(user.role))throw new BusinessError('لا تملك صلاحية إعدادات الموارد البشرية.',403);
  return user;
}

export async function GET(req:Request) {
  try{await hrManager(req);
    const year=parseYear(new URL(req.url).searchParams.get('year'));
    const [settings,holidays]=await Promise.all([
      businessRpc<Record<string,unknown>>('business_hr_settings',{}),
      businessRpc<HrHoliday[]>('business_hr_holidays',{p_year:year}),
    ]);
    return Response.json({settings,holidays},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return businessFailure(e);}
}

// POST {kind:'attendance', ...settings} | {kind:'holiday', action:'add'|'remove', ...}
export async function POST(req:Request) {
  try{const user=await hrManager(req),key=requestKey(req),body=await readBody(req);
    if(body.kind==='attendance'){
      const result=await businessRpc<{settings:Record<string,unknown>;replayed:boolean}>('business_hr_settings_save',
        {p_actor:user.id,p_key:key,p_data:prepareAttendanceSettings(body)});
      return Response.json({success:true,...result});
    }
    if(body.kind==='holiday'){
      const result=await businessRpc<{id:string;replayed:boolean}>('business_hr_holiday_save',
        {p_actor:user.id,p_key:key,p_data:prepareHoliday(body)});
      return Response.json({success:true,...result});
    }
    throw new BusinessError('نوع الإعداد غير صالح.');
  }catch(e){return businessFailure(e);}
}
