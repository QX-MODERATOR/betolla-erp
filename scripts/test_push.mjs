import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {registerHooks} from 'node:module';
import {PGlite} from '../.local-tests/node_modules/@electric-sql/pglite/dist/index.js';

// Phone push (migration 030): device registration per account, every in-app notification is also
// sent through Firebase Cloud Messaging, invalid tokens are dropped, and nothing breaks when the
// migration or Google credentials are missing. Google endpoints are faked locally.
const root=new URL('../',import.meta.url);
registerHooks({resolve(s,c,next){
  if(s.startsWith('@/'))return next(new URL(s.slice(2)+'.ts',root).href,c);
  if(s==='next/server')return next('next/server.js',c);
  return next(s,c);
}});
process.env.JWT_SECRET=randomBytes(48).toString('hex');
process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-test-service-key';

const dataDir=new URL('../.local-tests/db-push-'+randomUUID()+'/',import.meta.url);
await mkdir(dataDir,{recursive:true});
const db=new PGlite(fileURLToPath(dataDir));
await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
await db.exec((await readFile(new URL('supabase/migrations/001_initial_schema.sql',root),'utf8')).replace(/^CREATE EXTENSION[^;]+;/gm,''));
for(const f of ['006_business_persistence.sql','017_notifications.sql'])await db.exec(await readFile(new URL('supabase/migrations/'+f,root),'utf8'));
await db.exec('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; SET ROLE service_role;');

const fcm=[];let metadataUp=true;const goneTokens=new Set();
const server=createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  const path=req.url.split('?')[0];
  const reply=(status,obj)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(obj));};
  if(path==='/metadata-token'){
    if(!metadataUp||req.headers['metadata-flavor']!=='Google')return reply(404,{});
    return reply(200,{access_token:'fake-google-token',expires_in:3600});
  }
  if(path==='/fcm-send'){
    const msg=JSON.parse(raw).message;fcm.push({auth:req.headers.authorization,msg});
    if(goneTokens.has(msg.token))return reply(404,{error:{status:'NOT_FOUND',details:[{errorCode:'UNREGISTERED'}]}});
    return reply(200,{name:'projects/betolla-erp/messages/1'});
  }
  const name=path.split('/').at(-1);
  const body=raw?JSON.parse(raw):{};const keys=Object.keys(body);
  if(!(await db.query(`SELECT 1 FROM pg_proc WHERE proname=$1`,[name])).rows.length)return reply(404,{code:'PGRST202',message:'Could not find the function'});
  try{
    const values=keys.map(k=>Array.isArray(body[k])?body[k]:body[k]!==null&&typeof body[k]==='object'?JSON.stringify(body[k]):body[k]);
    const r=await db.query(`SELECT ${name}(${keys.map((k,i)=>`${k} => $${i+1}`).join(',')}) AS result`,values);
    reply(200,r.rows[0].result);
  }catch(e){reply(400,{message:e.message});}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
process.env.NEXT_PUBLIC_SUPABASE_URL=base;
process.env.PUSH_METADATA_TOKEN_URL=base+'/metadata-token';
process.env.PUSH_FCM_URL=base+'/fcm-send';

const {signAuthToken,SYSTEM_ACCOUNTS,isRouteAllowedForRole}=await import('../lib/auth.ts');
const devices=await import('../app/api/devices/route.ts');
const {notifyUser}=await import('../lib/notify.ts');
const {resetPushTokenCache}=await import('../lib/push.ts');
const tok=async id=>signAuthToken(SYSTEM_ACCOUNTS.find(a=>a.id===id).profile);
const khalidT=await tok('drv-khalid-01'),aliT=await tok('drv-ali-01'),rahmaT=await tok('rep-rahma-01');
const call=async(method,body,t)=>{
  const r=await devices[method](new Request('http://localhost/api/devices',{method,headers:{'Content-Type':'application/json',...(t?{Authorization:`Bearer ${t}`}:{})},body:JSON.stringify(body)}));
  return {status:r.status,body:await r.json()};
};
const q=async(sql,p)=>(await db.query(sql,p)).rows;
const PHONE_A='fcm-token-A:'+randomBytes(20).toString('hex');
const PHONE_B='fcm-token-B:'+randomBytes(20).toString('hex');

try{
  for(const role of ['driver','sales_rep','finance','hr_operations','marketing'])assert.equal(isRouteAllowedForRole(role,'/api/devices'),true,role);

  // Before migration 030: registration is accepted but push is off; notifications still work.
  let r=await call('POST',{token:PHONE_A},khalidT);
  assert.equal(r.status,200);assert.equal(r.body.enabled,false);
  await notifyUser('khalid.driver','orders_assigned','طلبات جديدة','عدد: 1','/driver');
  assert.equal((await q(`SELECT count(*)::int n FROM notifications`))[0].n,1);
  assert.equal(fcm.length,0);

  await db.exec('RESET ROLE;');
  await db.exec(await readFile(new URL('supabase/migrations/030_push_devices.sql',root),'utf8'));
  await db.exec('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; SET ROLE anon;');
  await assert.rejects(db.query(`SELECT * FROM push_devices`),/permission denied/);
  await db.exec('RESET ROLE; SET ROLE service_role;');

  // Validation and access.
  assert.equal((await call('POST',{token:PHONE_A})).status,401);
  assert.equal((await call('POST',{token:'short'},khalidT)).status,400);
  assert.equal((await call('POST',{token:PHONE_A+' <script>'},khalidT)).status,400);
  assert.equal((await call('POST',{token:PHONE_A,platform:'ios'},khalidT)).status,400);

  r=await call('POST',{token:PHONE_A},khalidT);assert.deepEqual(r.body,{success:true,enabled:true});
  assert.equal((await call('POST',{token:PHONE_A},khalidT)).status,200,'re-registering is harmless');
  await call('POST',{token:PHONE_B},khalidT);
  assert.deepEqual((await q(`SELECT account_id FROM push_devices ORDER BY token`)).map(x=>x.account_id),['drv-khalid-01','drv-khalid-01']);

  // A notification reaches every phone of the account, with the in-app link.
  await notifyUser('khalid.driver','orders_assigned','تم تعيين طلبيات جديدة لك','عدد الطلبيات: 3','/driver');
  assert.equal(fcm.length,2);
  assert.deepEqual(fcm.map(f=>f.msg.token).sort(),[PHONE_A,PHONE_B].sort());
  const m=fcm[0].msg;
  assert.equal(fcm[0].auth,'Bearer fake-google-token');
  assert.deepEqual(m.notification,{title:'تم تعيين طلبيات جديدة لك',body:'عدد الطلبيات: 3'});
  assert.deepEqual(m.data,{title:'تم تعيين طلبيات جديدة لك',body:'عدد الطلبيات: 3',link:'/driver',type:'orders_assigned'});
  assert.equal(m.android.notification.channel_id,'betolla_default');
  // Other accounts get nothing.
  fcm.length=0;
  await notifyUser('ali.driver','orders_assigned','x','y','/driver');
  assert.equal(fcm.length,0);
  // External links are never passed to the phone.
  await notifyUser('khalid.driver','t','x','y','https://evil.example');
  assert.ok(fcm.every(f=>f.msg.data.link==='/'));

  // The same phone signing in as someone else moves to that account.
  fcm.length=0;
  await call('POST',{token:PHONE_B},aliT);
  await notifyUser('khalid.driver','t','x','y','/driver');
  assert.deepEqual(fcm.map(f=>f.msg.token),[PHONE_A]);

  // Sign-out removes only the caller's own registration.
  assert.equal((await call('DELETE',{token:PHONE_A},rahmaT)).status,200);
  assert.equal((await q(`SELECT count(*)::int n FROM push_devices WHERE token=$1`,[PHONE_A]))[0].n,1,'someone else cannot remove it');
  await call('DELETE',{token:PHONE_A},khalidT);
  assert.equal((await q(`SELECT count(*)::int n FROM push_devices WHERE token=$1`,[PHONE_A]))[0].n,0);

  // Firebase says a token is gone: it is removed.
  fcm.length=0;goneTokens.add(PHONE_B);
  await notifyUser('ali.driver','t','x','y','/driver');
  assert.equal(fcm.length,1);
  assert.equal((await q(`SELECT count(*)::int n FROM push_devices WHERE token=$1`,[PHONE_B]))[0].n,0);

  // Password change clears the account's devices.
  await call('POST',{token:PHONE_A},khalidT);
  await q(`SELECT business_push_unregister_account('drv-khalid-01')`);
  assert.equal((await q(`SELECT count(*)::int n FROM push_devices`))[0].n,0);

  // Not on Google Cloud (no metadata server): no push, no error, the notification is still saved.
  await call('POST',{token:PHONE_A},khalidT);
  metadataUp=false;resetPushTokenCache();fcm.length=0;
  const before=(await q(`SELECT count(*)::int n FROM notifications`))[0].n;
  await notifyUser('khalid.driver','t','x','y','/driver');
  assert.equal(fcm.length,0);
  assert.equal((await q(`SELECT count(*)::int n FROM notifications`))[0].n,before+1);

  console.log('PASS test_push (device registration per account, push for every in-app notification, safe links, token cleanup, graceful without migration or credentials)');
}finally{
  server.close();
  await db.close();
}
