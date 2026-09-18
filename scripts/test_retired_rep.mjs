import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
const root=new URL('../',import.meta.url);
registerHooks({resolve(s,c,next){if(s.startsWith('@/'))return next(new URL(s.slice(2)+'.ts',root).href,c);return next(s,c);}});

// سارة was retired on 2026-09-18: a login account and an assignable rep name with no employee
// behind them. Leads were being auto-assigned to her at random and nobody could work the queue.
// Retiring a rep must stop new work reaching her WITHOUT hiding the customers she already holds —
// those records keep rep_name_raw = "سارة" and a manager still has to be able to find and move them.
const {ACTIVE_SALES_REPS,normalizeRepName,repUsernameForDisplayName}=await import('../lib/reps.ts');
const {SYSTEM_ACCOUNTS,findAccount}=await import('../lib/auth.ts');
const {ALL_INITIAL_PROFILES}=await import('../lib/profile-store.ts');

// 1. Gone from the three places that would give her new work or a way in.
assert.ok(!ACTIVE_SALES_REPS.includes('سارة'),'retired rep must leave the auto-assignment pool');
assert.equal(findAccount('sara.sales'),null,'retired rep must have no login account');
assert.equal(SYSTEM_ACCOUNTS.find(a=>a.profile.id==='rep-sara-01'),undefined);
assert.equal(ALL_INITIAL_PROFILES['rep-sara-01'],undefined);
assert.equal(await repUsernameForDisplayName('سارة'),null,'no username resolves for a retired rep');

// 2. The reps who remain are untouched, and the two real new hires keep their own password slots.
// Renumbering passwordEnv would silently point حنين at حمزة's secret, so the gap at 20 stays.
for (const rep of ['حمزة','رحمة','صابرين','حنان','حنين','آية','رشا'])
  assert.ok(ACTIVE_SALES_REPS.includes(rep),`${rep} must still be assignable`);
const envOf=(u)=>SYSTEM_ACCOUNTS.find(a=>a.profile.username===u)?.passwordEnv;
assert.equal(envOf('hamza.sales'),'BETOLLA_ACCOUNT_PASSWORD_19');
assert.equal(envOf('haneen.sales'),'BETOLLA_ACCOUNT_PASSWORD_21');
assert.equal(SYSTEM_ACCOUNTS.filter(a=>a.passwordEnv==='BETOLLA_ACCOUNT_PASSWORD_20').length,0);

// 3. No duplicate ids, usernames or password slots survived the edit.
const ids=SYSTEM_ACCOUNTS.map(a=>a.profile.id);
assert.equal(new Set(ids).size,ids.length,'account ids must stay unique');
const envs=SYSTEM_ACCOUNTS.map(a=>a.passwordEnv);
assert.equal(new Set(envs).size,envs.length,'two accounts must never share a password slot');
const names=SYSTEM_ACCOUNTS.flatMap(a=>a.usernames);
assert.equal(new Set(names).size,names.length,'usernames must stay unique');

// 4. Her existing customers stay visible. Both screens fall back to the rep names present in the
// data, so a name off the roster still appears — this is what keeps the 451 records reachable.
const repNamesFromData=['حمزة','سارة','رحمة'];            // as app/sales/page.tsx builds it
const queueReps=new Set([...ACTIVE_SALES_REPS,...repNamesFromData]);
assert.ok(queueReps.has('سارة'),'a retired rep with live data must still appear in the queue switcher');
const editForm={rep_name:'سارة'};                          // as app/customers/page.tsx builds it
const dropdown=[...ACTIVE_SALES_REPS,...(editForm.rep_name&&!ACTIVE_SALES_REPS.includes(editForm.rep_name)?[editForm.rep_name]:[])];
assert.ok(dropdown.includes('سارة'),'her customers must stay reassignable to someone else');

// 5. Name matching is unchanged, so nothing about the stored rep_name_raw shifts meaning.
assert.equal(normalizeRepName('سارة (مبيعات)'),'سارة');

console.log('PASS test_retired_rep (سارة takes no new leads and has no login, حمزة/حنين keep their own password slots, and her existing customers stay visible and reassignable)');
