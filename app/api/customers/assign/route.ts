import {randomUUID} from 'node:crypto';
import {businessUser,businessRpc,businessFailure,readBody,requirePermission,requestKey,date,text,BusinessError} from '@/lib/business-server';
import {normalizePhone,MAX_BATCH} from '@/lib/contact-import';
import {ASSIGNABLE_REPS,repUsernameForDisplayName} from '@/lib/reps';
import {notifyUser} from '@/lib/notify';
export const dynamic='force-dynamic';

// POST {rep, call_date, contacts:[{name,phone}], dry_run?}
// Management sends a rep the numbers she is to call on call_date ("إرسال أرقام للمندوب" on /sales).
// dry_run reports, per phone, whether the number is new, unassigned, with another rep or already
// hers — the preview the admin checks before sending. The real send needs an Idempotency-Key, so a
// retried click never sends the list twice. Phones are normalised here with the same code the
// preview used; a phone that is still not a phone is refused rather than silently dropped.
type BatchResult={total:number;created:number;reassigned:number;unchanged:number;replayed?:boolean;dry_run?:boolean;
  rows?:{phone:string;status:'new'|'existing'|'other_rep'|'same_rep';current_rep?:string|null;existing_name?:string|null}[]};

export async function POST(req:Request) {
  try{const user=await businessUser(req,'/api/customers');requirePermission(user,'customers.assign_batch');
    const body=await readBody(req);
    const rep=text(body.rep,100);
    if(!ASSIGNABLE_REPS.includes(rep))throw new BusinessError('اختر المندوب الذي سيتصل بهذه الأرقام.');
    const call_date=date(body.call_date);
    if(!call_date)throw new BusinessError('اختر تاريخ الاتصال.');
    if(!Array.isArray(body.contacts)||!body.contacts.length||body.contacts.length>MAX_BATCH)
      throw new BusinessError(`أرسل من رقم واحد حتى ${MAX_BATCH} رقم في المرة.`);
    const contacts=body.contacts.map((c:unknown)=>{
      const row=(c&&typeof c==='object'?c:{}) as Record<string,unknown>;
      const {phone,status}=normalizePhone(row.phone);
      if(status==='invalid')throw new BusinessError(`رقم غير صالح: ${text(row.phone,40)||'(فارغ)'}`);
      return {name:text(row.name,200),phone};
    });
    const dryRun=body.dry_run===true;
    const result=await businessRpc<BatchResult>('business_customer_assign_batch',{p_actor:user.id,
      p_key:dryRun?randomUUID():requestKey(req),p_data:{rep,call_date,dry_run:dryRun,contacts}});
    if(!dryRun&&!result.replayed&&result.total>0){
      // Best-effort: the send is already saved; a rep with no login simply finds them on /sales.
      try{
        const username=await repUsernameForDisplayName(rep);
        if(username)await notifyUser(username,'new_lead',`وصلتك ${result.total} أرقام للاتصال`,
          `أرسلتها الإدارة للاتصال بتاريخ ${call_date}`,'/sales');
      }catch{/* notification delivery is not part of the send */}
    }
    return Response.json({success:true,...result});
  }catch(e){return businessFailure(e);}
}
