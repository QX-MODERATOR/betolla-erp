// Proves password changes survive a server restart, not just the current process.
// Regression coverage for the bug fixed in this session: setUserPassword() used to
// write into an in-memory Map only, so a changed password silently reverted to the
// .env password on the next cold start. Now it's a real Postgres row (migration
// 020_account_password_overrides.sql) read/written via business_password_override_get/set.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {readFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {registerHooks} from 'node:module';
import {PGlite} from '../.local-tests/node_modules/@electric-sql/pglite/dist/index.js';

const root=new URL('../',import.meta.url);
registerHooks({resolve(s,c,next){if(s.startsWith('@/'))return next(new URL(s.slice(2)+'.ts',root).href,c);return next(s,c);}});

const ORIGINAL_ADMIN_PW='test-admin-pw-0123456789abcdef';
process.env.BETOLLA_ACCOUNT_PASSWORD_1=ORIGINAL_ADMIN_PW;
process.env.JWT_SECRET='test-jwt-secret-0123456789abcdef0123456789abcdef';
// No Supabase env vars yet: proves login still works against the plain .env
// password when no override has ever been set (no DB round trip needed).
const authNoDb=await import('../lib/auth-password.ts');
assert.equal(await authNoDb.verifyUserPassword('admin',ORIGINAL_ADMIN_PW),true);
assert.ok(await authNoDb.authenticateUser('admin',ORIGINAL_ADMIN_PW));

const dataDir=new URL('../.local-tests/db-'+randomUUID()+'/',import.meta.url);
await mkdir(dataDir,{recursive:true});
let db=new PGlite(fileURLToPath(dataDir));
await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
const initial=await readFile(new URL('supabase/migrations/001_initial_schema.sql',root),'utf8');
await db.exec(initial.replace(/^CREATE EXTENSION[^;]+;/gm,''));
await db.exec(await readFile(new URL('supabase/migrations/020_account_password_overrides.sql',root),'utf8'));
await db.exec('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;');
await db.exec('SET ROLE service_role;');

const rpcArgs={business_password_override_get:['p_username'],business_password_override_set:['p_username','p_hash']};
const server=createServer(async(req,res)=>{
  try{
    let raw='';for await(const chunk of req)raw+=chunk;
    const name=req.url.split('/').at(-1),names=rpcArgs[name];
    if(!names)throw new Error('Unexpected RPC: '+name);
    const body=JSON.parse(raw);
    const values=names.map(n=>body[n]);
    const result=await db.query(`SELECT ${name}(${names.map((_,i)=>'$'+(i+1)).join(',')}) AS result`,values);
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result.rows[0].result));
  }catch(error){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({message:error.message,code:error.code}));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
process.env.NEXT_PUBLIC_SUPABASE_URL=`http://127.0.0.1:${server.address().port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-test-service-key';

try{
  // Change the password through the same module instance the "server" would use.
  const NEW_PW='new-secret-pw-9876543210';
  assert.equal(await authNoDb.setUserPassword('admin',NEW_PW),true);

  // The row is a scrypt hash, never the plaintext password.
  const row=(await db.query('SELECT password_hash FROM account_password_overrides WHERE username=$1',['admin'])).rows[0];
  assert.ok(row);assert.ok(!row.password_hash.includes(NEW_PW));

  assert.equal(await authNoDb.verifyUserPassword('admin',NEW_PW),true);
  assert.equal(await authNoDb.verifyUserPassword('admin',ORIGINAL_ADMIN_PW),false); // old password no longer valid
  assert.ok(await authNoDb.authenticateUser('admin',NEW_PW));

  // Simulate a real server restart: a brand-new module instance (blank in-memory
  // cache), same database. Only the DB row can make this pass.
  const authRestarted=await import('../lib/auth-password.ts?restart='+randomUUID());
  assert.equal(await authRestarted.verifyUserPassword('admin',NEW_PW),true);
  assert.equal(await authRestarted.verifyUserPassword('admin',ORIGINAL_ADMIN_PW),false);
  assert.ok(await authRestarted.authenticateUser('admin',NEW_PW));

  // Durability of the database itself, independent of any Node module cache.
  await db.close();db=new PGlite(fileURLToPath(dataDir));
  const afterRestart=(await db.query('SELECT password_hash FROM account_password_overrides WHERE username=$1',['admin'])).rows[0];
  assert.equal(afterRestart.password_hash,row.password_hash);

  console.log('PASS: password override persists in Postgres (hashed, never plaintext); survives a simulated server restart (fresh module cache) and a real database close/reopen.');
}finally{await new Promise(r=>server.close(r));await db.close();}
