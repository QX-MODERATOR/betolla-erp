import {businessUser,businessFailure,readBody,text,BusinessError} from '@/lib/business-server';
import {securityRpc} from '@/lib/session';
export const dynamic='force-dynamic';

// Phone push registration for the signed-in account (the Android app calls this with its
// Firebase Cloud Messaging token after each page load, and removes it on sign-out).
function deviceToken(body:Record<string,unknown>):string {
  const token=text(body.token,4096);
  if(token.length<20||!/^[A-Za-z0-9:_\-]+$/.test(token))throw new BusinessError('رمز الجهاز غير صالح.');
  return token;
}

async function run(name:string,args:Record<string,unknown>) {
  const result=await securityRpc(name,args);
  // Before migration 030 there is nowhere to store devices: accept quietly, push is simply off.
  if(result.status==='unavailable')throw new BusinessError('تعذر حفظ إعداد الإشعارات. أعد المحاولة لاحقًا.',503);
  return result.status==='ok';
}

export async function POST(req:Request) {
  try{const user=await businessUser(req,'/api/devices'),body=await readBody(req);
    const platform=text(body.platform,20)||'android';
    if(platform!=='android')throw new BusinessError('نوع الجهاز غير مدعوم.');
    const stored=await run('business_push_register',{p_token:deviceToken(body),p_account:user.id,p_platform:platform});
    return Response.json({success:true,enabled:stored});
  }catch(e){return businessFailure(e);}
}

export async function DELETE(req:Request) {
  try{const user=await businessUser(req,'/api/devices'),body=await readBody(req);
    await run('business_push_unregister',{p_token:deviceToken(body),p_account:user.id});
    return Response.json({success:true});
  }catch(e){return businessFailure(e);}
}
