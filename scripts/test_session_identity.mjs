import assert from 'node:assert/strict';

// refreshSessionUser re-derives the signed-in identity from the session cookie (/api/auth/me),
// because the localStorage copy the login page writes can be missing or wrong while the session
// is still valid — and everything role-aware (sidebar nav, useCan) reads only that copy.
function storage(){const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};}
const events=[];
globalThis.window={dispatchEvent:(e)=>{events.push(e.type);return true;}};
globalThis.Event=class{constructor(type){this.type=type;}};
Object.defineProperty(globalThis,'localStorage',{value:storage(),configurable:true});

const {refreshSessionUser,getCurrentUser}=await import('../lib/client-api.ts');
const SESSION={id:'rep-rahma-01',username:'rahma.sales',name:'رحمة (مبيعات)',role:'sales_rep',repId:'rahma'};
let mode='ok';
const calls=[];
globalThis.fetch=async(url,options)=>{
  calls.push({url,...options});
  if(mode==='401')return Response.json({success:false,error:'expired'},{status:401});
  if(mode==='500')return Response.json({success:false},{status:500});
  if(mode==='offline')throw new Error('offline');
  return Response.json({success:true,user:SESSION});
};

// 1. No cached copy at all (cleared site data, fresh WebView): the session fills it in, so the
//    sidebar and every permission-gated control can render instead of failing closed forever.
let user=await refreshSessionUser();
assert.equal(user.role,'sales_rep');
assert.equal(getCurrentUser().role,'sales_rep');
assert.equal(calls.at(-1).url,'/api/auth/me');
assert.equal(events.at(-1),'betolla_user_updated');

// 2. A cached role that disagrees with the session loses: a tampered localStorage entry cannot
//    widen what the UI offers (the API always enforced this; now the UI matches it).
localStorage.setItem('betolla_user',JSON.stringify({...SESSION,role:'admin'}));
user=await refreshSessionUser();
assert.equal(user.role,'sales_rep');

// 3. Display fields edited in profile settings survive the refresh; identity and role do not.
localStorage.setItem('betolla_user',JSON.stringify({...SESSION,name:'رحمة الاسم المخصص',phone:'0790000000',avatar:'ر'}));
user=await refreshSessionUser();
assert.equal(user.name,'رحمة الاسم المخصص');
assert.equal(user.phone,'0790000000');
assert.equal(user.avatar,'ر');
assert.equal(user.repId,'rahma');

// 4. Display fields belonging to a *different* account are never carried over.
localStorage.setItem('betolla_user',JSON.stringify({id:'rep-hanan-01',name:'حنان'}));
user=await refreshSessionUser();
assert.equal(user.name,'رحمة (مبيعات)');

// 5. An ended session clears the cached copy, so the app stops showing a stale identity.
localStorage.setItem('betolla_user',JSON.stringify(SESSION));
mode='401';
assert.equal(await refreshSessionUser(),null);
assert.equal(getCurrentUser(),null);

// 6. A server error or a dropped connection leaves whatever is cached alone: an offline reload
//    must not log the user out of the UI.
localStorage.setItem('betolla_user',JSON.stringify(SESSION));
mode='500';
assert.equal(await refreshSessionUser(),null);
assert.equal(getCurrentUser().role,'sales_rep');
mode='offline';
assert.equal(await refreshSessionUser(),null);
assert.equal(getCurrentUser().role,'sales_rep');

console.log('PASS: session identity recovered from /api/auth/me — fills an empty cache, overrides a tampered role, keeps edited display fields, clears on 401, and holds the cache on 5xx/offline.');
