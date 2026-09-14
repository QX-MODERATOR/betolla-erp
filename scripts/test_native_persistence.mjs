import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import pg from '../.local-tests/node_modules/pg/lib/index.js';
const base='http://127.0.0.1:3107',connection={host:'127.0.0.1',port:55439,user:'postgres',database:'betolla_isolated_20260913'};
const runtime=JSON.parse(await readFile('.local-tests/native-sandbox/runtime.json','utf8'));
const db=new pg.Client(connection);await db.connect();
assert.equal((await db.query('SELECT name FROM sandbox_identity')).rows[0].name,connection.database);
async function login(){const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:runtime.password}),signal:AbortSignal.timeout(45000)});assert.equal(r.status,200);return (await r.json()).token;}
const token=await login(),secondToken=await login();
async function api(path,body,key=randomUUID(),auth=token,method=body?'POST':'GET'){
 const r=await fetch(base+path,{method,headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json','Idempotency-Key':key},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(45000)});
 return {status:r.status,data:await r.json()};
}
try{
 let previous;
 try{previous=JSON.parse(await readFile('.local-tests/native-sandbox/verified-order.json','utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 if(previous){
  assert.equal((await db.query('SELECT total_amount FROM orders WHERE id=$1',[previous.db_id])).rows[0].total_amount,'10.000');
  assert.ok((await api('/api/orders')).data.orders.some(o=>o.id===previous.id));
  assert.equal((await db.query('SELECT sum(amount) AS paid FROM payments WHERE invoice_id=(SELECT id FROM invoices WHERE order_id=$1)',[previous.db_id])).rows[0].paid,previous.paid.toFixed(3));
  console.log('PASS: previous-run fixture remains in independent database and API reads.');
 }
 const payload={customer_name:'Native persistence fixture '+randomUUID().slice(0,6),customer_phone:'0000000000',total_amount:10,payment_method:'installment',items:[{name:'Fixture item',qty:2,price:5}]};
 const key=randomUUID();const created=await api('/api/orders',payload,key);assert.equal(created.status,201,JSON.stringify(created.data));
 const order=created.data.order;
 assert.equal((await db.query('SELECT total_amount FROM orders WHERE id=$1',[order.db_id])).rows[0].total_amount,'10.000');
 assert.equal((await api('/api/orders',payload,key,secondToken)).data.order.id,order.id);
 const pay={invoice_id:order.invoice_number,amount:3,payment_method:'cash',reference_number:''};
 const paykey=randomUUID();const pair=await Promise.all([api('/api/finance',pay,paykey),api('/api/finance',pay,paykey,secondToken)]);
 assert.ok(pair.every(r=>r.status===200));
 assert.equal((await db.query('SELECT sum(amount) AS paid FROM payments WHERE invoice_id=(SELECT id FROM invoices WHERE order_id=$1)',[order.db_id])).rows[0].paid,'3.000');
 const race=await Promise.all([api('/api/finance',{...pay,amount:5}),api('/api/finance',{...pay,amount:5},randomUUID(),secondToken)]);
 assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
 const invoice=(await api('/api/finance',undefined,undefined,secondToken)).data.invoices.find(i=>i.order_id===order.id);assert.equal(invoice.outstanding_amount,2);
 // Independent DB connections demonstrate row-lock contention, not an in-process mock.
 const a=new pg.Client(connection),b=new pg.Client(connection);await a.connect();await b.connect();
 await a.query('BEGIN');await a.query('SELECT id FROM orders WHERE id=$1 FOR UPDATE',[order.db_id]);
 await b.query("SET lock_timeout='200ms'");
 await assert.rejects(b.query('SELECT id FROM orders WHERE id=$1 FOR UPDATE',[order.db_id]),/lock timeout/);
 await a.query('ROLLBACK');await a.end();await b.end();
 await fetch(base+'/api/auth/logout',{method:'POST',headers:{Authorization:'Bearer '+token}});
 const relog=await login();assert.ok((await api('/api/orders',undefined,undefined,relog)).data.orders.some(o=>o.id===order.id));
 await writeFile('.local-tests/native-sandbox/verified-order.json',JSON.stringify({id:order.id,db_id:order.db_id,name:payload.customer_name,paid:8}));
 console.log('PASS: real Next API -> Supabase client -> PostgREST -> PostgreSQL; independent DB reads; two authenticated sessions; real connection locks; partial balances; duplicate retry; logout/login retention.');
}finally{await db.end();}
