import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {registerHooks} from 'node:module';
import {SignJWT} from 'jose';
import {PGlite} from '../.local-tests/node_modules/@electric-sql/pglite/dist/index.js';

// Sign-in hardening (migration 028): no built-in passwords, httpOnly session cookie only,
// safe return path, lockout after repeated failures, logout/password change end sessions,
// stored (hashed) password changes, lead intake secret + rate limit, and graceful behaviour
// before the migration is applied or when the database is unreachable.
const root=new URL('../',import.meta.url);
registerHooks({resolve(s,c,next){
  if(s.startsWith('@/'))return next(new URL(s.slice(2)+'.ts',root).href,c);
  if(s==='next/server')return next('next/server.js',c);
  return next(s,c);
}});
process.env.JWT_SECRET=randomBytes(48).toString('hex');
process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-test-service-key';
const RAHMA_PW=randomBytes(12).toString('hex');
process.env.BETOLLA_ACCOUNT_PASSWORD_4=RAHMA_PW;           // rahma.sales
delete process.env['khalid.driver'];delete process.env.BETOLLA_ACCOUNT_PASSWORD_10;
delete process.env.TELEGRAM_BOT_TOKEN;

const auth=await import('../lib/auth.ts');
const login=await import('../app/api/auth/login/route.ts');
const logout=await import('../app/api/auth/logout/route.ts');
const me=await import('../app/api/auth/me/route.ts');
const password=await import('../app/api/auth/password/route.ts');
const leads=await import('../app/api/leads/route.ts');

const dataDir=new URL('../.local-tests/db-auth-'+randomUUID()+'/',import.meta.url);
await mkdir(dataDir,{recursive:true});
const db=new PGlite(fileURLToPath(dataDir));
await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
await db.exec((await readFile(new URL('supabase/migrations/001_initial_schema.sql',root),'utf8')).replace(/^CREATE EXTENSION[^;]+;/gm,''));
for(const f of ['005_payment_methods.sql','006_business_persistence.sql','007_customer_persistence.sql','009_customer_management.sql','015_customer_list_performance.sql','016_call_log_rep_attribution.sql','017_notifications.sql','021_lead_untouched_fix.sql'])
  await db.exec(await readFile(new URL('supabase/migrations/'+f,root),'utf8'));
await db.exec('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; SET ROLE service_role;');

// Minimal PostgREST: named-argument RPC calls; unknown functions answer like PostgREST (PGRST202).
let down=false;const calls=[];
const server=createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  if(down){res.writeHead(503,{'Content-Type':'application/json'});res.end('{"message":"unavailable"}');return;}
  const name=req.url.split('?')[0].split('/').at(-1);calls.push(name);
  const body=raw?JSON.parse(raw):{};const keys=Object.keys(body);
  const exists=(await db.query(`SELECT 1 FROM pg_proc WHERE proname=$1`,[name])).rows.length>0;
  if(!exists){res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({code:'PGRST202',message:`Could not find the function public.${name}`}));return;}
  try{
    const values=keys.map(k=>body[k]!==null&&typeof body[k]==='object'?JSON.stringify(body[k]):body[k]);
    const r=await db.query(`SELECT ${name}(${keys.map((k,i)=>`${k} => $${i+1}`).join(',')}) AS result`,values);
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(r.rows[0].result));
  }catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({message:e.message}));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
process.env.NEXT_PUBLIC_SUPABASE_URL=`http://127.0.0.1:${server.address().port}`;

const post=(handler,path,body,{cookie,headers={}}={})=>handler(new Request('https://erp.test'+path,{method:'POST',
  headers:{'Content-Type':'application/json','x-forwarded-proto':'https',...(cookie?{cookie:`betolla_token=${cookie}`}:{}),...headers},
  body:typeof body==='string'?body:JSON.stringify(body)}));
const json=async r=>({status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')||''});
const tokenOf=setCookie=>decodeURIComponent((setCookie.match(/betolla_token=([^;]*)/)||[])[1]||'');
const signIn=async(username,pw,from)=>json(await post(login.POST,'/api/auth/login',{username,password:pw,from}));
const whoAmI=async token=>(await me.GET(new Request('https://erp.test/api/auth/me',{headers:{cookie:`betolla_token=${token}`}}))).status;
const q=async(sql,p)=>(await db.query(sql,p)).rows;

try{
  // --- Pure helpers ---
  const rahma=auth.findAccount('RAHMA.sales');
  assert.equal(rahma.profile.id,'rep-rahma-01');
  assert.equal(auth.matchesConfiguredPassword(rahma,RAHMA_PW),true);
  assert.equal(auth.matchesConfiguredPassword(rahma,RAHMA_PW+'x'),false);
  const khalid=auth.findAccount('khalid');
  assert.equal(auth.matchesConfiguredPassword(khalid,'khalid2026'),false,'no built-in driver password');
  assert.equal(auth.matchesConfiguredPassword(khalid,''),false);
  assert.ok(!JSON.stringify(auth.SYSTEM_ACCOUNTS).includes(RAHMA_PW),'passwords are not kept in the account list');
  assert.equal(auth.safeReturnPath('sales_rep','/customers?tab=2'),'/customers?tab=2');
  for(const bad of ['//evil.com','/\\evil.com','https://evil.com','/api/orders','/login','/finance',null,'','/'])
    assert.equal(auth.safeReturnPath('sales_rep',bad),'/sales',String(bad));
  assert.equal(auth.safeReturnPath('admin','/finance'),'/finance');

  // ===== Phase A: migration 028 not applied yet — sign-in still works as before =====
  let r=await signIn('khalid','khalid2026');
  assert.equal(r.status,401,'the old built-in driver password is gone');
  process.env['khalid.driver']='drv-'+randomBytes(8).toString('hex');
  assert.equal((await signIn('khalid',process.env['khalid.driver'])).status,200,'configured driver password works');

  r=await signIn('rahma.sales',RAHMA_PW,'/customers');
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal(r.body.token,undefined,'the token is never given to page scripts');
  assert.equal(r.body.redirectUrl,'/customers');
  assert.match(r.cookie,/HttpOnly/i);assert.match(r.cookie,/Secure/i);assert.match(r.cookie,/SameSite=lax/i);
  const tokenA=tokenOf(r.cookie);
  assert.equal(await whoAmI(tokenA),200);
  assert.equal((await signIn('rahma.sales',RAHMA_PW,'//evil.com')).body.redirectUrl,'/sales');
  for(let i=0;i<7;i++)assert.equal((await signIn('rahma.sales','wrong')).status,401,'no lockout without the table');
  assert.equal((await json(await post(login.POST,'/api/auth/login',{ciphertext:'x',iv:'y',ts:1}))).status,400);
  assert.equal((await json(await post(login.POST,'/api/auth/login','not json'))).status,400);
  r=await json(await post(password.POST,'/api/auth/password',{username:'rahma.sales',currentPassword:RAHMA_PW,newPassword:'newpass123'},{cookie:tokenA}));
  assert.equal(r.status,503);assert.match(r.body.error,/غير مفعّل/);
  assert.equal((await signIn('rahma.sales',RAHMA_PW)).status,200,'nothing changed');
  // Logout still clears the cookie.
  r=await json(await post(logout.POST,'/api/auth/logout',{},{cookie:tokenA}));
  assert.equal(r.status,200);assert.match(r.cookie,/betolla_token=;/);assert.match(r.cookie,/HttpOnly/i);

  // ===== Phase B: apply migration 028 =====
  await db.exec('RESET ROLE;');
  await db.exec(await readFile(new URL('supabase/migrations/028_auth_security.sql',root),'utf8'));
  await db.exec('SET ROLE anon;');
  await assert.rejects(db.query(`SELECT auth_session_check('x','y',1)`),/permission denied/);
  await assert.rejects(db.query(`SELECT * FROM auth_account_state`),/permission denied/);
  await db.exec('RESET ROLE; SET ROLE service_role;');

  // Lockout: 5 wrong passwords lock the account, even the right password is refused while locked.
  for(let i=1;i<=4;i++)assert.equal((await signIn('rahma.sales','wrong-'+i)).status,401);
  r=await signIn('rahma.sales','wrong-5');
  assert.equal(r.status,429);assert.match(r.body.error,/مؤقتًا/);
  r=await signIn('rahma.sales',RAHMA_PW);
  assert.equal(r.status,429,'locked account refuses even the right password');
  assert.equal((await signIn('RAHMA.SALES',RAHMA_PW)).status,429,'username case does not bypass the lock');
  // Other accounts and unknown usernames are unaffected / separate.
  assert.equal((await signIn('khalid',process.env['khalid.driver'])).status,200);
  for(let i=0;i<6;i++)await signIn('nobody-'+i,'x');
  assert.equal((await signIn('khalid',process.env['khalid.driver'])).status,200,'guessing unknown names never locks real accounts');
  // Lock expires.
  await q(`UPDATE security_rate_limits SET locked_until=now()-interval '1 second' WHERE bucket='login:rep-rahma-01'`);
  r=await signIn('rahma.sales',RAHMA_PW);
  assert.equal(r.status,200);
  assert.deepEqual(await q(`SELECT bucket FROM security_rate_limits WHERE bucket='login:rep-rahma-01'`),[],'success clears the counter');
  const deviceA=tokenOf(r.cookie);
  const deviceB=tokenOf((await signIn('rahma.sales',RAHMA_PW)).cookie);
  assert.notEqual(deviceA,deviceB);
  assert.equal(await whoAmI(deviceA),200);assert.equal(await whoAmI(deviceB),200);

  // Logout ends that session only, on the server.
  assert.equal((await post(logout.POST,'/api/auth/logout',{},{cookie:deviceA})).status,200);
  assert.equal(await whoAmI(deviceA),401,'a logged-out token no longer works');
  assert.equal(await auth.verifyAuthToken(deviceA),null);
  assert.equal(await whoAmI(deviceB),200,'other devices stay signed in');
  // Tokens issued before this change have no jti: logout still ends them (by token hash).
  const legacy=await new SignJWT({...rahma.profile}).setProtectedHeader({alg:'HS256'}).setIssuedAt()
    .setExpirationTime('7d').setIssuer('betolla-erp').setAudience('betolla-users').sign(new TextEncoder().encode(process.env.JWT_SECRET));
  assert.equal(await whoAmI(legacy),200);
  await post(logout.POST,'/api/auth/logout',{},{cookie:legacy});
  assert.equal(await whoAmI(legacy),401);
  assert.equal((await post(logout.POST,'/api/auth/logout',{},{cookie:'garbage'})).status,200,'logout never fails');

  // Password change.
  const change=(token,body)=>post(password.POST,'/api/auth/password',{username:'rahma.sales',currentPassword:RAHMA_PW,...body},{cookie:token}).then(json);
  assert.equal((await change(deviceB,{newPassword:'short1'})).status,400);
  assert.equal((await change(deviceB,{newPassword:'onlyletters'})).status,400);
  assert.equal((await change(deviceB,{newPassword:'12345678'})).status,400);
  assert.equal((await change(deviceB,{newPassword:RAHMA_PW})).status,400,'must differ');
  assert.equal((await change(deviceB,{username:'admin',newPassword:'newpass123'})).status,403);
  assert.equal((await change(deviceB,{currentPassword:'wrong',newPassword:'newpass123'})).status,401);
  assert.equal((await q(`SELECT hits FROM security_rate_limits WHERE bucket='login:rep-rahma-01'`))[0].hits,1,'wrong current password counts toward lockout');
  const deviceC=tokenOf((await signIn('rahma.sales',RAHMA_PW)).cookie);
  await new Promise(res=>setTimeout(res,1100)); // tokens issued in an earlier second than the change
  const NEW_PW='نجمة'+randomBytes(4).toString('hex')+'7';
  r=await change(deviceB,{newPassword:NEW_PW});
  assert.equal(r.status,200,JSON.stringify(r.body));
  const fresh=tokenOf(r.cookie);
  assert.ok(fresh&&fresh!==deviceB,'this device gets a fresh session');
  assert.equal(await whoAmI(fresh),200);
  assert.equal(await whoAmI(deviceB),401,'the old session on this device ended');
  assert.equal(await whoAmI(deviceC),401,'other devices are signed out');
  const [row]=await q(`SELECT password_hash FROM auth_account_state WHERE account_id='rep-rahma-01'`);
  assert.match(row.password_hash,/^scrypt\$16384\$8\$1\$/);assert.ok(!row.password_hash.includes(NEW_PW));
  assert.equal((await signIn('rahma.sales',RAHMA_PW)).status,401,'the configured password no longer works');
  assert.equal((await signIn('rahma.sales',NEW_PW)).status,200,'the new password works (survives restarts: it is in the database)');

  // Database unreachable: new sign-ins are refused (never falls back to the replaced password);
  // existing signed tokens keep working rather than logging everyone out.
  const liveToken=tokenOf((await signIn('rahma.sales',NEW_PW)).cookie);
  down=true;
  assert.equal((await signIn('rahma.sales',RAHMA_PW)).status,503);
  assert.equal((await signIn('rahma.sales',NEW_PW)).status,503);
  assert.equal(await whoAmI(liveToken),200);
  down=false;

  // --- Lead intake ---
  const lead=(n,headers={})=>post(leads.POST,'/api/leads',{name:'ليد '+n,phone:'079'+String(1000000+n)},{headers:{'x-forwarded-for':'203.0.113.9, 10.0.0.1',...headers}}).then(json);
  process.env.LEADS_WEBHOOK_SECRET='lead-secret-'+randomBytes(6).toString('hex');
  assert.equal((await lead(1)).status,401);
  assert.equal((await lead(1,{'x-leads-secret':'wrong'})).status,401);
  const ok={'x-leads-secret':process.env.LEADS_WEBHOOK_SECRET};
  assert.equal((await lead(1,ok)).status,201);
  for(let i=2;i<=20;i++)assert.equal((await lead(i,ok)).status,201,'lead '+i);
  assert.equal((await lead(21,ok)).status,429,'per-client limit');
  assert.equal((await lead(22,{...ok,'x-forwarded-for':'198.51.100.7'})).status,201,'another client is fine');
  await q(`UPDATE security_rate_limits SET hits=500 WHERE bucket='lead:all'`);
  assert.equal((await lead(23,{...ok,'x-forwarded-for':'198.51.100.8'})).status,429,'total ceiling');
  delete process.env.LEADS_WEBHOOK_SECRET;
  await q(`DELETE FROM security_rate_limits WHERE bucket LIKE 'lead:%'`);
  assert.equal((await lead(24)).status,201,'without a configured secret the endpoint stays open (rate limited)');

  console.log('PASS test_auth_hardening (no built-in passwords, httpOnly cookie, safe redirects, lockout, logout + password-change revocation, hashed stored passwords, lead secret/limits, pre-migration and outage behaviour)');
}finally{
  server.close();
  await db.close();
}
