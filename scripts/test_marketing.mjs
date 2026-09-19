import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {readFile,readdir,mkdir} from 'node:fs/promises';
import {PGlite} from '../.local-tests/node_modules/@electric-sql/pglite/dist/index.js';

// Migration 044: the marketing department. What this proves:
//   - a campaign's results are counted from facts (spend ledger, attributed leads, their orders),
//     and cancelled/returned orders, voided spend and orders before the start date do not count
//   - spend is additive: a mistake is voided with a reason, never edited away
//   - attribution is one campaign per lead, a rep can only tag her own leads, and the webhook mode
//     never steals a lead another campaign already has
//   - tasks: a team member moves her own work up to "review"; only the manager closes or reopens
//   - every write replays safely on the same idempotency key
const root=new URL('../',import.meta.url);
const dataDir=new URL('../.local-tests/db-'+randomUUID()+'/',import.meta.url);
await mkdir(dataDir,{recursive:true});
const db=new PGlite(fileURLToPath(dataDir));
await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
const initial=await readFile(new URL('supabase/migrations/001_initial_schema.sql',root),'utf8');
await db.exec(initial.replace(/^CREATE EXTENSION[^;]+;/gm,''));
// Every migration up to and including 044, in order — marketing must sit on top of all of them.
const files=(await readdir(new URL('supabase/migrations/',root))).filter(f=>/^\d{3}_.*\.sql$/.test(f)&&f!=='001_initial_schema.sql'&&f.slice(0,3)<='044').sort();
assert.ok(files.includes('044_marketing.sql'));
for(const f of files)await db.exec(await readFile(new URL('supabase/migrations/'+f,root),'utf8'));
await db.exec('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; SET ROLE service_role;');

const one=async(sql,params=[])=>(await db.query(sql,params)).rows[0];
const rpc=async(fn,args)=>{
  const names=Object.keys(args);
  const row=await one(`SELECT ${fn}(${names.map((n,i)=>`${n}=>$${i+1}`).join(',')}) r`,
    names.map(n=>args[n]!==null&&typeof args[n]==='object'&&!Array.isArray(args[n])?JSON.stringify(args[n]):args[n]));
  return row.r;
};
const fails=async(promise,code)=>{await assert.rejects(promise,e=>e.message===code,`expected ${code}`);};
const MGR='mgr-mkt-01',LEEN='mkt-leen-01',HANIN='mkt-team-01';
const today=(await one('SELECT business_hr_today()::text d')).d;
const shift=async(days)=>(await one(`SELECT (business_hr_today()+$1::int)::text d`,[days])).d;

// --- Campaigns
const save=(data,actor=MGR,key=randomUUID())=>rpc('business_mkt_campaign_save',{p_actor:actor,p_key:key,p_data:data});
const startDate=await shift(-10);
const key1=randomUUID();
const createBody={fields:{code:'META-SEP',name:'حملة ميتا أيلول',channel:'facebook',objective:'leads',status:'active',
  start_date:startDate,budget:'300',target_leads:'50',promo_code:'VIP'}};
const created=await save(createBody,MGR,key1);
assert.equal(created.replayed,false);
const camp=created.campaign;
assert.equal(camp.code,'META-SEP');
assert.equal(Number(camp.budget),300);
assert.equal(camp.leads,0);
assert.equal(camp.cost_per_lead,null,'no leads yet: cost per lead is unknown, not zero');
// Same key, same body: the same campaign, not a second one.
const again=await save(createBody,MGR,key1);
assert.equal(again.replayed,true);
assert.equal(again.campaign.id,camp.id);
assert.equal((await one('SELECT count(*)::int n FROM mkt_campaigns')).n,1);
// Same key, different body: refused.
await fails(save({fields:{...createBody.fields,name:'غير'}},MGR,key1),'IDEMPOTENCY_CONFLICT');
// Codes are unique regardless of case, dates must be in order, the promo code must exist.
await fails(save({fields:{...createBody.fields,code:'meta-sep'}}),'DUPLICATE_CAMPAIGN_CODE');
await fails(save({fields:{...createBody.fields,code:'X-2',end_date:await shift(-20)}}),'INVALID_CAMPAIGN');
await fails(save({fields:{...createBody.fields,code:'X-3',promo_code:'NOPE'}}),'PROMO_NOT_FOUND');
await fails(save({fields:{...createBody.fields,code:'bad code!'}}),'INVALID_CAMPAIGN');
// A partial update changes only what it names.
const edited=(await save({id:camp.id,fields:{budget:'400'}})).campaign;
assert.equal(Number(edited.budget),400);
assert.equal(edited.name,'حملة ميتا أيلول');
const other=(await save({fields:{code:'TIKTOK',name:'تيك توك',channel:'tiktok',start_date:startDate}})).campaign;
assert.equal(other.status,'planned');

// --- Spend ledger
const spend=(data,key=randomUUID())=>rpc('business_mkt_spend_record',{p_actor:MGR,p_key:key,p_data:data});
const s1=await spend({campaign_id:camp.id,spend_date:startDate,amount:'100',description:'Meta ads week 1'});
await spend({campaign_id:camp.id,spend_date:today,amount:'50'});
const wrong=await spend({campaign_id:camp.id,spend_date:today,amount:'999'});
await fails(spend({campaign_id:camp.id,spend_date:today,amount:'0'}),'INVALID_SPEND');
await fails(spend({campaign_id:randomUUID(),spend_date:today,amount:'5'}),'CAMPAIGN_NOT_FOUND');
const voidIt=(data,key=randomUUID())=>rpc('business_mkt_spend_void',{p_actor:MGR,p_key:key,p_data:data});
await fails(voidIt({id:wrong.id,reason:''}),'VOID_REASON_REQUIRED');
await voidIt({id:wrong.id,reason:'مبلغ خاطئ'});
await fails(voidIt({id:wrong.id,reason:'مرة ثانية'}),'SPEND_ALREADY_VOIDED');
const ledger=await rpc('business_mkt_spend',{p_campaign:camp.id});
assert.equal(ledger.length,3,'the voided entry stays on the ledger');
assert.equal(ledger.find(s=>s.id===wrong.id).void_reason,'مبلغ خاطئ');
assert.equal(ledger.find(s=>s.id===s1.id).description,'Meta ads week 1');

// --- Leads and orders
const lead=async(name,rep,createdDaysAgo)=>{
  const id=randomUUID();
  await db.query(`INSERT INTO customers(id,name,phone,rep_name_raw,created_at) VALUES($1,$2,$3,$4,now()-($5::int*interval '1 day'))`,
    [id,name,'079'+String(Math.floor(Math.random()*1e7)).padStart(7,'0'),rep,createdDaysAgo]);
  return id;
};
const order=async(customer,status,amount,daysAgo)=>{
  await db.query(`INSERT INTO orders(order_number,customer_id,status,subtotal,total_amount,created_at)
    VALUES($1,$2,$3::order_status_enum,$4,$4,now()-($5::int*interval '1 day'))`,['T-'+randomUUID(),customer,status,amount,daysAgo]);
};
const a=await lead('ليد لين 1','لين',3), b=await lead('ليد لين 2','لين',2), old=await lead('عميلة قديمة','رحمة',100);
const rahmas=await lead('ليد رحمة','رحمة',1);
await order(a,'delivered',40,2);
await order(a,'confirmed',25,1);
await order(a,'cancelled',500,1);          // cancelled: not revenue
await order(old,'delivered',60,50);         // before the campaign started: not this campaign's
await order(old,'returned',30,1);           // returned: not revenue
await order(old,'shipped',35,1);

const attribute=(data,actor=MGR,key=randomUUID())=>rpc('business_mkt_attribute',{p_actor:actor,p_key:key,p_data:data});
// A rep may only tag her own leads.
await fails(attribute({campaign_id:camp.id,customer_ids:[a,rahmas],scope_rep:'لين'},LEEN),'MKT_FORBIDDEN');
assert.equal((await one('SELECT count(*)::int n FROM mkt_attributions')).n,0,'a refused batch tags nothing');
const r1=await attribute({campaign_id:camp.id,customer_ids:[a,b],scope_rep:'لين'},LEEN);
assert.equal(r1.changed,2);
const r2=await attribute({campaign_code:'meta-sep',customer_ids:[old,a]});
assert.equal(r2.changed,1,'the code is matched case-insensitively');
assert.equal(r2.skipped,1,'a lead already on this campaign is left alone');

let doc=await rpc('business_mkt_campaign_document',{p_id:camp.id});
assert.equal(Number(doc.spend),150,'voided spend does not count');
assert.equal(doc.leads,3);
assert.equal(doc.new_leads,2,'the old customer was found before the campaign, not by it');
assert.equal(doc.orders,3,'delivered + confirmed + shipped');
assert.equal(doc.converted,2);
assert.equal(Number(doc.revenue),100,'40 + 25 + 35: no cancelled, no returned, nothing before the start');
assert.equal(Number(doc.delivered_revenue),40);
assert.equal(Number(doc.cost_per_lead),50);
assert.equal(Number(doc.cost_per_customer),75);
assert.equal(Number(doc.roas),0.67);
assert.equal(Number(doc.conversion_rate),66.7);
assert.equal(Number(doc.budget_used),37.5);

// Last touch: moving a lead to another campaign takes it (and its revenue) off the first.
await attribute({campaign_id:other.id,customer_ids:[old]});
doc=await rpc('business_mkt_campaign_document',{p_id:camp.id});
assert.equal(doc.leads,2);
assert.equal(Number(doc.revenue),65);
// The webhook mode never steals: 'first' leaves an attributed lead where it is.
const r3=await attribute({campaign_code:'META-SEP',customer_ids:[old],mode:'first'},'leads-webhook');
assert.equal(r3.changed,0);
assert.equal((await one('SELECT campaign_id FROM mkt_attributions WHERE customer_id=$1',[old])).campaign_id,other.id);
// Clearing only removes leads from the campaign named.
const r4=await attribute({campaign_id:camp.id,customer_ids:[b,old],mode:'clear'});
assert.equal(r4.changed,1);
assert.equal(r4.skipped,1);
const leads=await rpc('business_mkt_campaign_leads',{p_campaign:camp.id});
assert.deepEqual(leads.map(l=>l.customer_id),[a]);
assert.equal(leads[0].orders,2);
assert.equal(Number(leads[0].revenue),65);
const tags=await rpc('business_mkt_attributions_of',{p_customer_ids:`{${a},${b},${old}}`});
assert.equal(tags[a].code,'META-SEP');
assert.equal(tags[b],undefined);
assert.equal(tags[old].code,'TIKTOK');
// Every change is in the audit log with where the lead came from.
const moves=(await db.query(`SELECT action,changes FROM mkt_audit_log WHERE entity='customer' AND entity_id=$1 ORDER BY created_at`,[old])).rows;
assert.deepEqual(moves.map(m=>m.action),['attribution_set','attribution_set']);
assert.equal(moves[1].changes.from,camp.id);
// A cancelled campaign takes no new leads.
await save({id:other.id,fields:{status:'cancelled'}});
await fails(attribute({campaign_id:other.id,customer_ids:[b]}),'CAMPAIGN_CLOSED');

// The list puts live campaigns first.
const list=await rpc('business_mkt_campaigns',{});
assert.deepEqual(list.map(c=>c.code),['META-SEP','TIKTOK']);

// --- Tasks
const task=(data,actor=MGR,key=randomUUID())=>rpc('business_mkt_task_save',{p_actor:actor,p_key:key,p_data:data});
const move=(data,actor=MGR,key=randomUUID())=>rpc('business_mkt_task_update',{p_actor:actor,p_key:key,p_data:data});
const t1=(await task({fields:{title:'تصميم 3 بوستات للحملة',assignee_account_id:HANIN,campaign_id:camp.id,due_date:await shift(2),priority:'high'}})).task;
assert.equal(t1.status,'todo');
assert.equal(t1.campaign_name,'حملة ميتا أيلول');
assert.equal(t1.thread.length,1);
// A member raises tasks only for herself.
await fails(task({scope_account:HANIN,fields:{title:'لغيري',assignee_account_id:LEEN}},HANIN),'MKT_FORBIDDEN');
const own=(await task({scope_account:HANIN,fields:{title:'فكرة ريلز'}},HANIN)).task;
assert.equal(own.assignee_account_id,HANIN);
// ...and cannot touch someone else's.
const leens=(await task({fields:{title:'مهمة لين',assignee_account_id:LEEN}})).task;
await fails(move({id:leens.id,note:'تعليق',scope_account:HANIN},HANIN),'MKT_FORBIDDEN');

// Hanin works it through to review; she cannot sign it off herself.
await move({id:t1.id,status:'in_progress',expected_status:'todo',scope_account:HANIN},HANIN);
await fails(move({id:t1.id,status:'review',expected_status:'todo',scope_account:HANIN},HANIN),'STALE_TASK');
await move({id:t1.id,status:'review',expected_status:'in_progress',note:'جاهزة للمراجعة',scope_account:HANIN},HANIN);
await fails(move({id:t1.id,status:'done',scope_account:HANIN},HANIN),'TASK_CLOSE_FORBIDDEN');
// The manager sends it back — with a reason — and later signs it off.
await fails(move({id:t1.id,status:'in_progress',may_close:true}),'TASK_NOTE_REQUIRED');
await move({id:t1.id,status:'in_progress',note:'غيّري الألوان',may_close:true});
await move({id:t1.id,note:'تم التعديل',scope_account:HANIN},HANIN);
await move({id:t1.id,status:'review',scope_account:HANIN},HANIN);
const doneKey=randomUUID();
const done=(await move({id:t1.id,status:'done',may_close:true},MGR,doneKey)).task;
assert.equal(done.status,'done');
assert.ok(done.completed_at);
assert.equal((await move({id:t1.id,status:'done',may_close:true},MGR,doneKey)).replayed,true,'a retried sign-off is not a second one');
// A closed task stays closed for the member.
await fails(move({id:t1.id,status:'in_progress',scope_account:HANIN},HANIN),'TASK_CLOSE_FORBIDDEN');
const thread=done.thread.map(u=>u.kind+':'+(u.status_to||u.note));
assert.deepEqual(thread,['created:todo','status:in_progress','status:review','status:in_progress','comment:تم التعديل','status:review','status:done']);
assert.equal(done.comments,1);

// Hanin sees her own tasks; the manager sees everyone's.
const mine=await rpc('business_mkt_tasks',{p_account:HANIN});
assert.deepEqual(mine.map(t=>t.title).sort(),['تصميم 3 بوستات للحملة','فكرة ريلز'].sort());
assert.equal(mine.at(-1).status,'done','closed work sorts last');
assert.equal((await rpc('business_mkt_tasks',{p_account:null})).length,3);

// Nothing here is reachable except through the service role.
const grants=(await db.query(`SELECT count(*)::int n FROM information_schema.role_table_grants
  WHERE table_name LIKE 'mkt\\_%' AND grantee IN ('anon','authenticated','PUBLIC')`)).rows[0].n;
assert.equal(grants,0);

console.log('PASS test_marketing (campaign results counted from spend, attributed leads and their orders; voided spend and cancelled/returned/pre-start orders excluded; reps tag only their own leads; the webhook never steals a lead; members work tasks to review and only the manager closes; every write replays on its key)');
await db.close();
