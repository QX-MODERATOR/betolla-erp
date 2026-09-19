import {businessRpc,businessFailure,requestKey,readBody,BusinessError} from '@/lib/business-server';
import {marketingUser,accountName,accountUsernameOf,marketingTeam,prepareTask,prepareTaskUpdate} from '@/lib/marketing-server';
import {uuid} from '@/lib/hr-server';
import {notifyUser} from '@/lib/notify';
import {MARKETING_SIGNOFF_IDS,TASK_STATUS_LABELS,type MktTask,type TaskStatus} from '@/lib/marketing';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};

const named=(t:MktTask):MktTask=>({...t,assignee_name:accountName(t.assignee_account_id),created_by_name:accountName(t.created_by),
  thread:t.thread?.map(u=>({...u,actor_name:accountName(u.actor_id)}))});

// GET             tasks: a manager/coordinator sees the whole team's, anyone else her own
// GET ?id=<uuid>  one task with its thread (status changes and comments, oldest first)
export async function GET(req:Request) {
  try{const {user,access}=await marketingUser(req,'/api/marketing/tasks');
    const id=new URL(req.url).searchParams.get('id');
    if(id){
      const task=await businessRpc<MktTask|null>('business_mkt_task_document',{p_id:uuid(id,'معرّف المهمة'),p_thread:true});
      if(!task)throw new BusinessError('المهمة غير موجودة.',404);
      if(access!=='manage'&&task.assignee_account_id!==user.id&&task.created_by!==user.id)
        throw new BusinessError('هذه المهمة ليست لك.',403);
      return Response.json({access,task:named(task)},{headers});
    }
    const tasks=await businessRpc<MktTask[]>('business_mkt_tasks',{p_account:access==='manage'?null:user.id});
    return Response.json({access,me:user.id,tasks:tasks.map(named),team:marketingTeam()},{headers});
  }catch(e){return businessFailure(e);}
}

// Who hears about a change. Never the person who made it; best-effort (notifyUser swallows failures).
async function tell(accountIds:(string|null)[],actorId:string,title:string,body:string,taskId:string) {
  const usernames=[...new Set(accountIds.filter((id):id is string=>!!id&&id!==actorId).map(accountUsernameOf).filter((u):u is string=>!!u))];
  await Promise.all(usernames.map(u=>notifyUser(u,'marketing_task',title,body,`/marketing/tasks?task=${taskId}`)));
}

// POST {kind:'save', id?, fields}                              create / edit
// POST {kind:'update', id, status?, expected_status?, note?}   move or comment
export async function POST(req:Request) {
  try{const {user,access}=await marketingUser(req,'/api/marketing/tasks');
    const key=requestKey(req),body=await readBody(req);
    const who=accountName(user.id);
    if(body.kind==='save'){
      const result=await businessRpc<{task:MktTask;previous_assignee:string|null;replayed:boolean}>('business_mkt_task_save',
        {p_actor:user.id,p_key:key,p_data:prepareTask(body,user,access)});
      const task=named(result.task);
      if(!result.replayed&&task.assignee_account_id!==result.previous_assignee)
        await tell([task.assignee_account_id],user.id,'مهمة تسويق جديدة مسندة لك',`${task.title} — من ${who}`,task.id);
      return Response.json({success:true,replayed:result.replayed,task},{status:body.id||result.replayed?200:201});
    }
    if(body.kind==='update'){
      const result=await businessRpc<{task:MktTask;status_from:TaskStatus;replayed:boolean}>('business_mkt_task_update',
        {p_actor:user.id,p_key:key,p_data:prepareTaskUpdate(body,user,access)});
      const task=named(result.task);
      if(!result.replayed){
        if(body.status&&task.status==='review')
          // Work waiting for sign-off goes to the manager and the coordinator.
          await tell([...MARKETING_SIGNOFF_IDS],user.id,'مهمة بانتظار مراجعتك',`${task.title} — ${who}`,task.id);
        else if(body.status)
          await tell([task.assignee_account_id,task.created_by],user.id,`المهمة: ${TASK_STATUS_LABELS[task.status].label}`,`${task.title} — ${who}`,task.id);
        else
          await tell([task.assignee_account_id,task.created_by],user.id,'تعليق جديد على مهمة',`${who}: ${String(body.note).slice(0,120)}`,task.id);
      }
      return Response.json({success:true,replayed:result.replayed,task});
    }
    throw new BusinessError('نوع العملية غير صالح.');
  }catch(e){return businessFailure(e);}
}
