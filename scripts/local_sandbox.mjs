// Native PostgreSQL + official PostgREST + the existing Next app, on loopback only.
// No dotenv is loaded here, and configured remote databases are never accessed.
import {mkdir,readFile,writeFile,access,readdir} from 'node:fs/promises';
import {openSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {createServer,request} from 'node:http';
import {randomBytes} from 'node:crypto';
import {SignJWT} from 'jose';
import pg from '../.local-tests/node_modules/pg/lib/index.js';
import {initdb,pg_ctl} from '../.local-tests/node_modules/@embedded-postgres/windows-x64/dist/index.js';
const folder=resolve('.local-tests/native-sandbox'),dbDir=resolve(folder,'pgdata');
const database='betolla_isolated_20260913',connection={host:'127.0.0.1',port:55439,user:'postgres',database};
await mkdir(folder,{recursive:true});
const exists=async p=>{try{await access(p);return true;}catch{return false;}};
if(!await exists(resolve(dbDir,'PG_VERSION')))execFileSync(initdb,['-D',dbDir,'-U','postgres','--auth=trust','--locale=C','--encoding=UTF8'],{windowsHide:true,stdio:'pipe'});
try{execFileSync(pg_ctl,['-D',dbDir,'status'],{windowsHide:true,stdio:'pipe'});}catch{
 execFileSync(pg_ctl,['-D',dbDir,'-l',resolve(folder,'postgres.log'),'-o','-h 127.0.0.1 -p 55439','-w','start'],{windowsHide:true,stdio:'ignore',timeout:90000});
}
const admin=new pg.Client({...connection,database:'postgres'});await admin.connect();
if(!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[database])).rowCount)await admin.query('CREATE DATABASE '+database);
await admin.end();
const db=new pg.Client(connection);await db.connect();
await db.query(`CREATE TABLE IF NOT EXISTS sandbox_identity(name text PRIMARY KEY CHECK(name='betolla_isolated_20260913'));
 INSERT INTO sandbox_identity VALUES ('betolla_isolated_20260913') ON CONFLICT DO NOTHING;
 CREATE TABLE IF NOT EXISTS sandbox_migrations(name text PRIMARY KEY);`);
if((await db.query('SELECT current_database() AS name')).rows[0].name!==database)throw new Error('Isolation guard failed');
if(!(await db.query("SELECT 1 FROM pg_namespace WHERE nspname='auth'")).rowCount){
 await db.query('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);');
 for(const role of ['anon','authenticated','service_role'])if(!(await db.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount)await db.query('CREATE ROLE '+role+(role==='service_role'?' BYPASSRLS':''));
}
// 002/003 contain company seeds; 004 contains invalid text IDs in UUID seed columns.
// It cannot apply as written. A future additive delivery migration is still required.
for(const file of (await readdir('supabase/migrations')).filter(f=>/^\d+.*\.sql$/.test(f)&&!/^00[234]_/.test(f)).sort()){
 if((await db.query('SELECT 1 FROM sandbox_migrations WHERE name=$1',[file])).rowCount)continue;
 await db.query(await readFile('supabase/migrations/'+file,'utf8'));
 await db.query('INSERT INTO sandbox_migrations VALUES($1)',[file]);
}
await db.query('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;');
await db.end();
let runtime;
if(await exists(resolve(folder,'runtime.json')))runtime=JSON.parse(await readFile(resolve(folder,'runtime.json'),'utf8'));
else{runtime={jwt:randomBytes(48).toString('hex'),password:randomBytes(18).toString('hex'),pgjwt:randomBytes(48).toString('hex')};await writeFile(resolve(folder,'runtime.json'),JSON.stringify(runtime));}
const serviceKey=await new SignJWT({role:'service_role'}).setProtectedHeader({alg:'HS256'}).sign(new TextEncoder().encode(runtime.pgjwt));
const children=[];
function launch(bin,args,env,log){const fd=openSync(resolve(folder,log),'a');const child=spawn(bin,args,{env,windowsHide:true,stdio:['ignore',fd,fd]});children.push(child);return child;}
const pathKey=Object.keys(process.env).find(k=>k.toLowerCase()==='path')||'Path';
launch(resolve('.local-tests/postgrest/postgrest.exe'),[],{...process.env,[pathKey]:dirname(pg_ctl)+';'+process.env[pathKey],PGRST_DB_URI:`postgres://postgres@127.0.0.1:55439/${database}`,PGRST_DB_SCHEMAS:'public',PGRST_JWT_SECRET:runtime.pgjwt,PGRST_SERVER_HOST:'127.0.0.1',PGRST_SERVER_PORT:'55440'},'postgrest.log');
const proxy=createServer((req,res)=>{
 if(!req.url.startsWith('/rest/v1/')){res.writeHead(404);res.end();return;}
 const forward=request({hostname:'127.0.0.1',port:55440,path:req.url.slice(8),method:req.method,headers:req.headers},upstream=>{res.writeHead(upstream.statusCode,upstream.headers);upstream.pipe(res);});
 forward.on('error',()=>{res.writeHead(503);res.end();});req.pipe(forward);
});
await new Promise(r=>proxy.listen(55441,'127.0.0.1',r));
const env={...process.env,BETOLLA_ISOLATED_TEST:'1',NEXT_PUBLIC_BETOLLA_TEST_MODE:'1',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:55441',
 SUPABASE_SERVICE_ROLE_KEY:serviceKey,NEXT_PUBLIC_SUPABASE_ANON_KEY:'isolated-not-used',JWT_SECRET:runtime.jwt,
 TELEGRAM_BOT_TOKEN:'',TELEGRAM_ADMIN_CHAT_ID:''};
for(let i=1;i<=11;i++)env['BETOLLA_ACCOUNT_PASSWORD_'+i]=runtime.password;
launch(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3107'],env,'next.log');
await writeFile(resolve(folder,'pids.json'),JSON.stringify(children.map(c=>c.pid)));
console.log('Isolated sandbox: http://127.0.0.1:3107 | PostgreSQL 55439 | PostgREST 55440. No production connection used.');
const stop=()=>{for(const child of children)child.kill();proxy.close();process.exit(0);};
process.on('SIGINT',stop);process.on('SIGTERM',stop);
