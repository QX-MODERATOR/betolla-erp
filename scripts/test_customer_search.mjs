import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {registerHooks} from 'node:module';
import {PGlite} from '../.local-tests/node_modules/@electric-sql/pglite/dist/index.js';

// Header lead search (/api/customers/search): the pre-026 fallback and the migration-026 RPC must
// return the same, relevant matches; empty/short queries match nothing; HR may search but not list.
const root=new URL('../',import.meta.url);
registerHooks({resolve(s,c,next){if(s.startsWith('@/'))return next(new URL(s.slice(2)+'.ts',root).href,c);return next(s,c);}});
process.env.JWT_SECRET=randomBytes(48).toString('hex');
process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-test-service-key';
const {signAuthToken,SYSTEM_ACCOUNTS,isRouteAllowedForRole}=await import('../lib/auth.ts');
const {searchTerms,isSearchable,matchesCustomer}=await import('../lib/customer-search.ts');
const searchRoute=await import('../app/api/customers/search/route.ts');
const customersRoute=await import('../app/api/customers/route.ts');
const token=async id=>signAuthToken(SYSTEM_ACCOUNTS.find(a=>a.id===id).profile);
const [adminT,hrT,repT,driverT,mktT]=await Promise.all(['admin-betolla-01','hr-ops-01','rep-rahma-01','drv-khalid-01','mkt-team-01'].map(token));

const dataDir=new URL('../.local-tests/db-search-'+randomUUID()+'/',import.meta.url);
await mkdir(dataDir,{recursive:true});
const db=new PGlite(fileURLToPath(dataDir),{parsers:{1082:v=>v}});
await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
await db.exec((await readFile(new URL('supabase/migrations/001_initial_schema.sql',root),'utf8')).replace(/^CREATE EXTENSION[^;]+;/gm,''));
for(const file of ['005_payment_methods.sql','006_business_persistence.sql','007_customer_persistence.sql','015_customer_list_performance.sql','016_call_log_rep_attribution.sql','019_customer_list_by_rep.sql'])
  await db.exec(await readFile(new URL('supabase/migrations/'+file,root),'utf8'));
await db.exec('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;');

const seed=[
  ['أحمد علي','0791112233','رحمة'],
  ['احمد سالم','+962 79 555 0001','حنان'],
  ['سارة يوسف','962781112299','رحمة'],
  ['مكتبة الأمل','0770000000','حنان'],
  ['Fatima Test','0799999999','رحمة'],
  ['هدى','0786543210','رحمة'],
];
for(const [i,[name,phone,rep]] of seed.entries())
  await db.query(`INSERT INTO customers(name,phone,rep_name_raw,updated_at) VALUES($1,$2,$3,now()-($4||' minutes')::interval)`,[name,phone,rep,String(i)]);
for(let i=0;i<30;i++)await db.query(`INSERT INTO customers(name,phone,rep_name_raw) VALUES($1,$2,'حنان')`,[`زبون جملة ${i}`,`07955${String(i).padStart(5,'0')}`]);
await db.exec('SET ROLE service_role;');

const rpcArgs={business_customer_search:['p_query','p_rep','p_limit'],business_customer_list:[],business_customer_list_by_rep:['p_rep']};
let calls=[];
const server=createServer(async(req,res)=>{
  try{
    let raw='';for await(const chunk of req)raw+=chunk;
    const name=req.url.split('/').at(-1),names=rpcArgs[name];
    if(!names)throw new Error('Unexpected RPC: '+name);
    calls.push(name);
    const body=JSON.parse(raw);
    const result=await db.query(`SELECT ${name}(${names.map((_,i)=>'$'+(i+1)).join(',')}) AS result`,names.map(n=>body[n]));
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result.rows[0].result));
  }catch(error){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({message:error.message}));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
process.env.NEXT_PUBLIC_SUPABASE_URL=`http://127.0.0.1:${server.address().port}`;
const search=async(q,t=adminT)=>{
  const r=await searchRoute.GET(new Request('http://localhost/api/customers/search?q='+encodeURIComponent(q),{headers:{Authorization:`Bearer ${t}`}}));
  return {status:r.status,body:await r.json()};
};
const names=r=>r.body.customers.map(c=>c.name).sort();

try{
  // --- Pure matching rules ---
  for(const q of ['','  ','ا','00962','962','+962 '])assert.equal(isSearchable(searchTerms(q)),false,`"${q}" must not be searchable`);
  assert.equal(searchTerms('0791').digits,'791');
  assert.equal(matchesCustomer({name:'أحمد',phone:'0790000000'},searchTerms('احمد')),true);
  assert.equal(matchesCustomer({name:'Someone',phone:'0791234567'},searchTerms('احمد')),false); // the old "random results" bug
  assert.equal(matchesCustomer({name:'X',phone:'+962791234567'},searchTerms('0791234')),true);

  // --- Route rules ---
  assert.equal(isRouteAllowedForRole('hr_operations','/api/customers/search'),true);
  for(const p of ['/customers','/calls','/','/api/customers','/api/calls'])assert.equal(isRouteAllowedForRole('hr_operations',p),false,p);
  assert.equal(isRouteAllowedForRole('marketing','/api/customers/search'),true);
  assert.equal(isRouteAllowedForRole('driver','/api/customers/search'),false);
  assert.equal((await search('احمد',driverT)).status,403);
  assert.equal((await customersRoute.GET(new Request('http://localhost/api/customers',{headers:{Authorization:`Bearer ${hrT}`}}))).status,403);
  assert.equal((await search('احمد','garbage')).status,401);

  const cases=async label=>{
    const r1=await search('احمد');                          // alef variants, both Ahmads, nothing else
    assert.equal(r1.status,200,label);assert.deepEqual(names(r1),['أحمد علي','احمد سالم'],label);
    assert.deepEqual(names(await search('0791112')),['أحمد علي'],label);          // phone prefix
    assert.deepEqual(names(await search('791112')),['أحمد علي'],label);
    assert.deepEqual(names(await search('0781112299')),['سارة يوسف'],label);      // stored as 962…
    assert.deepEqual(names(await search('795550001')),['احمد سالم'],label);       // stored with +962 and spaces
    assert.deepEqual(names(await search('مكتبه')),['مكتبة الأمل'],label);         // ة/ه unified
    assert.deepEqual(names(await search('fatima')),['Fatima Test'],label);
    for(const q of ['','ا','00962','962'])assert.equal((await search(q)).body.customers.length,0,`${label} "${q}"`);
    assert.equal((await search('زبون')).body.customers.length,20,label);            // capped
    assert.equal((await search('xyz-nothing')).body.customers.length,0,label);
    assert.deepEqual(names(await search('احمد',hrT)),['أحمد علي','احمد سالم'],label); // HR can search
    assert.deepEqual(names(await search('احمد',repT)),['أحمد علي'],label);         // rep sees own leads only
    assert.equal((await search('زبون',repT)).body.customers.length,0,label);
    const hit=(await search('0791112',mktT)).body.customers[0];
    assert.deepEqual(Object.keys(hit).sort(),['city','classification','customer_type','id','name','phone','rep_name_raw','updated_at'],label); // no history/notes
  };

  // Before migration 026: the route falls back to the list RPCs.
  calls=[];
  await cases('fallback');
  assert.ok(calls.includes('business_customer_list')&&calls.includes('business_customer_list_by_rep'));

  // After migration 026: the database function answers directly, with identical results.
  await db.exec('RESET ROLE;');
  await db.exec(await readFile(new URL('supabase/migrations/026_customer_search.sql',root),'utf8'));
  await db.exec('SET ROLE anon;');
  await assert.rejects(db.query(`SELECT business_customer_search('احمد',NULL,20)`),/permission denied/);
  await db.exec('RESET ROLE; SET ROLE service_role;');
  calls=[];
  await cases('rpc');
  assert.ok(calls.every(c=>c==='business_customer_search'),calls.join(','));
  console.log('PASS test_customer_search (fallback + migration 026 agree; empty queries match nothing; HR search-only)');
}finally{
  server.close();
  await db.close();
}
