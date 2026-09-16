import {secureFetch,getCurrentUser} from '@/lib/client-api';
const pendingKey=(slot:string)=>'betolla-pending:'+getCurrentUser()?.id+':'+slot;

// A pending command is retry metadata, never the source of saved business data.
// Retain it across reloads until the server confirms or definitively rejects it.
export async function saveBusiness<T>(slot:string,url:string,body:unknown,method='POST'):Promise<T> {
  const storageKey=pendingKey(slot);
  const payload=JSON.stringify(body);
  let pending: {key:string;payload:string}|null=JSON.parse(sessionStorage.getItem(storageKey)||'null');
  if(pending&&pending.payload!==payload)throw new Error('توجد محاولة غير مؤكدة. أعد إرسال بياناتها الأصلية قبل إنشاء عملية مختلفة.');
  if(!pending){
    const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
    pending={key:`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`,payload};
    sessionStorage.setItem(storageKey,JSON.stringify(pending));
  }
  const response=await secureFetch(url,{method,headers:{'Content-Type':'application/json','Idempotency-Key':pending.key},body:pending.payload});
  const data=await response.json();
  if(!response.ok||!data.success){
    if(response.status>=400&&response.status<500&&response.status!==408&&response.status!==429)sessionStorage.removeItem(storageKey);
    throw new Error(data.error||'تعذر تأكيد الحفظ. أعد المحاولة.');
  }
  sessionStorage.removeItem(storageKey);
  return data as T;
}
export function pendingBusiness(slot:string) {
  if(typeof window==='undefined')return null;
  const stored=sessionStorage.getItem(pendingKey(slot));
  return stored?JSON.parse(JSON.parse(stored).payload):null;
}
// 503 from the business RPC layer means "safe to retry the same read" (see
// databaseErrors' fallback message in lib/business-server.ts) — at real data
// scale (tens of thousands of rows) a read can intermittently time out under
// load even after being optimized to a single set-based query. Reads carry no
// idempotency risk, so a bounded automatic retry recovers most of these
// transparently instead of forcing the user to notice and click "retry".
const RETRY_DELAYS_MS=[400,1200];
export async function loadBusiness<T>(url:string):Promise<T> {
  let lastError:Error|null=null;
  for(let attempt=0;attempt<=RETRY_DELAYS_MS.length;attempt++){
    const response=await secureFetch(url,{cache:'no-store'}),data=await response.json();
    if(response.ok)return data as T;
    lastError=new Error(data.error||'تعذر تحميل البيانات.');
    if(response.status!==503||attempt===RETRY_DELAYS_MS.length)break;
    await new Promise(r=>setTimeout(r,RETRY_DELAYS_MS[attempt]));
  }
  throw lastError;
}
