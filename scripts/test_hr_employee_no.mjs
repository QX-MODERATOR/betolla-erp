import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {readFile, readdir, mkdir} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import {PGlite} from '../.local-tests/node_modules/@electric-sql/pglite/dist/index.js';

// The employee ID (الرقم الوظيفي) is set by HR (migration 050).
//
// It used to be generated (EMP-0001…) and fixed forever; the company numbers its staff itself. HR —
// the HR account only — now types it when adding someone or on an existing file. It stays unique,
// and an empty one on a new employee still gets the next EMP-xxxx.
const root = new URL('../', import.meta.url);
registerHooks({resolve(s, c, next) { if (s.startsWith('@/')) return next(new URL(s.slice(2) + '.ts', root).href, c); return next(s, c); }});

const dataDir = new URL('../.local-tests/db-' + randomUUID() + '/', import.meta.url);
await mkdir(dataDir, {recursive: true});
const db = new PGlite(fileURLToPath(dataDir));
await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
await db.exec((await readFile(new URL('supabase/migrations/001_initial_schema.sql', root), 'utf8')).replace(/^CREATE EXTENSION[^;]+;/gm, ''));
const files = (await readdir(new URL('supabase/migrations/', root)))
  .filter((f) => /^\d{3}_.*\.sql$/.test(f) && f !== '001_initial_schema.sql' && f.slice(0, 3) <= '050').sort();
assert.ok(files.includes('050_hr_employee_no.sql'));
for (const f of files) await db.exec(await readFile(new URL('supabase/migrations/' + f, root), 'utf8'));
await db.exec('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; SET ROLE service_role;');
const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const create = (fields) => one('SELECT business_hr_employee_create($1,$2,$3) r', ['hr-ops-01', randomUUID(), JSON.stringify({fields})]);
const update = (id, fields) => one('SELECT business_hr_employee_update($1,$2,$3) r', ['hr-ops-01', randomUUID(), JSON.stringify({id, fields})]);

// --- HR types the ID when adding someone; empty still means the next EMP-xxxx.
const a = (await create({full_name_ar: 'سلمى', hire_date: '2026-09-01', employee_no: 'BT-1001'})).r.employee;
assert.equal(a.employee_no, 'BT-1001');
const b = (await create({full_name_ar: 'رامي', hire_date: '2026-09-01', employee_no: '  '})).r.employee;
assert.match(b.employee_no, /^EMP-\d{4}$/, 'empty keeps the automatic number');
const c = (await create({full_name_ar: 'هالة', hire_date: '2026-09-01'})).r.employee;
assert.match(c.employee_no, /^EMP-\d{4}$/);

// --- Unique, and only the allowed characters.
await assert.rejects(create({full_name_ar: 'نسخة', hire_date: '2026-09-01', employee_no: 'BT-1001'}), /DUPLICATE_EMPLOYEE_NO/);
await assert.rejects(create({full_name_ar: 'خطأ', hire_date: '2026-09-01', employee_no: 'رقم ١'}), /INVALID_EMPLOYEE_NO/);
await assert.rejects(update(b.id, {employee_no: 'BT-1001'}), /DUPLICATE_EMPLOYEE_NO/);
await assert.rejects(update(b.id, {employee_no: ''}), /INVALID_EMPLOYEE_NO/, 'an existing employee always has an ID');

// --- Changing it on an existing file, recorded in the file's history.
const moved = (await update(b.id, {employee_no: 'BT-1002'})).r.employee;
assert.equal(moved.employee_no, 'BT-1002');
const audit = await one(`SELECT changes FROM hr_audit_log WHERE entity_id=$1 AND action='update' ORDER BY created_at DESC LIMIT 1`, [b.id]);
assert.equal(audit.changes.employee_no.to, 'BT-1002');
assert.equal((await update(b.id, {job_title: 'مندوبة'})).r.employee.employee_no, 'BT-1002', 'other edits leave it alone');

// --- Who may set it: the HR account only.
const {canSetEmployeeNo, canManageHr} = await import('../lib/hr.ts');
assert.equal(canSetEmployeeNo('hr_operations'), true);
for (const role of ['admin', 'general_manager', 'finance', 'sales_manager']) assert.equal(canSetEmployeeNo(role), false, role);
assert.equal(canManageHr('admin'), true, 'admin still edits the rest of the file');
const {prepareEmployeeUpdate} = await import('../lib/hr-server.ts');
const id = randomUUID();
assert.equal(prepareEmployeeUpdate({id, fields: {employee_no: ' BT-7 '}}).fields.employee_no, 'BT-7');
assert.throws(() => prepareEmployeeUpdate({id, fields: {employee_no: 'BT 7'}}), /الرقم الوظيفي/);
assert.throws(() => prepareEmployeeUpdate({id, fields: {employee_no: ''}}), /لا يمكن أن يكون فارغاً/);
const route = await readFile(new URL('app/api/hr/employees/route.ts', root), 'utf8');
assert.equal((route.match(/onlyHrSetsEmployeeNo\(user,prepareEmployee(Create|Update)\(body\)\)/g) || []).length, 2,
  'both create and update refuse an employee ID from anyone but HR');
const form = await readFile(new URL('components/hr/employee-form-modal.tsx', root), 'utf8');
assert.ok(form.includes('readOnly={!setsEmployeeNo}') && form.includes('if (!setsEmployeeNo) delete fields.employee_no;'),
  'the form shows the ID to everyone and sends it only for HR');

console.log('PASS test_hr_employee_no (HR sets الرقم الوظيفي when adding or editing an employee; empty on a new file still gives the next EMP-xxxx; unique and letters/digits/._/- only; the change is in the file history; only the HR account may set it — API and form — while admin and the general manager edit everything else)');
