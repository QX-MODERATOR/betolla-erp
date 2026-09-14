# Engineering checkpoint — 2026-09-13

## Latest checkpoint — 2026-09-14, bounded native verification batch
- This section supersedes older next-priority paragraphs: password/security development remains deferred. Eight tasks remain fixed in IMPLEMENTATION_STATUS.md; no whole task is yet complete.
- Added local native PostgreSQL + official PostgREST launcher and real Next API tests. All endpoints bind loopback; Next overrides remote configuration, suppresses Telegram credentials, uses a separate build directory and displays a synthetic-data banner. No production writes or deployment.
- PASS today: independent SQL reads, actual Supabase client/PostgREST RPC calls, two authenticated sessions, partial balance (10 total, 8 collected, 2 outstanding), duplicate retry, competing collections, row-lock contention, logout/login and retrieval of a previous-run fixture. Native database restarted successfully; browser refresh/full lifecycle is NOT yet verified.
- Root cause still outstanding for customers: app/customers/page.tsx initializes SAMPLE_CUSTOMERS; app/api/leads/route.ts returns a constructed object without a database write. No customer fix was implemented in this batch. Orders/finance already use durable RPCs from batch 2.
- Local launcher excludes company seeds 002/003 and broken 004 (text driver IDs in UUID columns). Delivery migration compatibility remains a blocker; no guessed identity mapping or existing permission changes.
- Reproduction prerequisites (ignored .local-tests): pg, @embedded-postgres/windows-x64@18.4.0-beta.17 with its hydrate-symlinks script, and official PostgREST v16.3 executable at .local-tests/postgrest/postgrest.exe. Run node scripts/local_sandbox.mjs, then node scripts/test_native_persistence.mjs. Runtime credentials and database files remain ignored. Local database is betolla_isolated_20260913 on port 55439; app 3107; PostgREST 55440; adapter 55441.
- Browser attempt encountered a stopped server and a browser-tool URL-policy rejection of its generated connection-error page; no visual persistence claim. Server was subsequently restarted and API tests passed.
- git diff --check passed. Focused lint/TypeScript commands produced no completion output and were interrupted to keep this batch bounded; current-batch lint/typecheck remain unverified (earlier batch checks are not substitutes). Final measured usage: 32% five-hour, 42% weekly; daily unavailable. Unrelated android/app/build.gradle and lib/security.ts changes remain outside this batch's commit.
- Usage has five-hour/weekly windows, no daily counter. One bounded batch then stop as requested. Next exact task: implement additive customer create/edit/read persistence and connect customer UI, then verify save -> independent SQL -> Refresh -> relogin/restart/second session before marking it complete.

## Confirmed baseline
- App root is this directory. Existing Next 16.3.4 / React 19 / Supabase and Android WebView retained. Read AGENTS.md and bundled route-handler/middleware docs.
- Started from the current working tree, including eleven accounts and local Android/UI edits. Branch `fix/session-security-20260913`; initial safe-code checkpoint `801d048`. Excluded sensitive auth/security/Android build files from the initial checkpoint; retained those working files.
- Company sources are outside this repository. Inspected top-level names/sizes/types and the KPI workbook's sheet names and first rows only, without editing/importing company records. KPI sheets cover daily operations, sales, leads and cleaning.
- Android loads a configurable web URL and supports RTL; no Android rebuild or device test in this batch.

## Batch 1: session trust boundary
- `lib/auth.ts`: removed default signing secret; require an explicit JWT_SECRET of at least 32 bytes; pin HS256; require expiration/issued-at/issuer/audience; match identity, role and representative against current registered accounts; safely reject malformed cookies and non-string login inputs.
- Removed eleven inline account passwords from code. Their current values were retained in ignored `.env.local` as `BETOLLA_ACCOUNT_PASSWORD_1` through `_11`, in existing account order. This preserves local login; it is not database-backed credential storage. Confirmed all eleven environment values decode exactly, including special characters.
- Generated a random local JWT_SECRET because none was configured. Do not copy this secret into documentation, logs or Git. Existing tokens must be replaced by a fresh login after restarting the local server.
- `app/api/auth/password/route.ts`, `middleware.ts`, profile modal: require a valid session, restrict changes to that session's own username, validate input types, and attach the existing bearer token from the UI. Password update durability remains unresolved (runtime map).
- `scripts/test_session_security.mjs`: disposable random credentials, no environment loading, network or external notifications. Tests token round trip, twelve invalid tokens, malformed cookies, missing/weak keys, and five password-handler rejection cases.
- Signing keystore excluded from future tracking; its local file is retained. Older Git history still needs credential/signing-material review before any publication; history was not rewritten.

## Validation
- Isolated session/security test: PASS. Focused lint for auth, password handler, middleware and new test: PASS. Final TypeScript `--noEmit --incremental false`: PASS.
- Production build: PASS after allowing Google Fonts access (first restricted build could not fetch Cairo). No deployment or production database writes.
- Full lint: FAIL, 602 errors and 5432 warnings across the project. No broad automatic fixes. Logs are ignored local files.
- No live browser/device authentication or database persistence/concurrency tests. No company import, migrations, remote push or outgoing customer messages.

## Deployment prerequisites and next batch
- Provision JWT_SECRET and all eleven server-only account password variables through the deployment secret store before deploying. Missing settings fail closed. Local environment is not shipped in Git. Do not restore default signing keys as rollback; use a previous reviewed application version with managed secrets.
- Highest next priorities: replace runtime password overrides and finance invoice/payment arrays with durable server-side storage, canonical account IDs, password hashes and session invalidation; use transactional, idempotent collection posting and ownership checks. Finance currently serves sample invoices; leads POST returns success without saving. These are NOT production-ready features.
- Review actual database schema/RLS and identity mapping before preparing additive migrations with a rollback plan. No production migration is authorized. Keep finance/order amount versus collection/receivable definitions separate as requested.

## Batch 2 — durable orders and collections (priority changed)
- Authentication/password/security work deferred; previous fixes and unrelated local edits preserved.
- Replaced order/finance simulation routes and UI arrays with existing Supabase-table reads and atomic RPC writes; partial/full payments, exact JOD balances, safe retries, transfer-reference deduplication, and persisted status transitions. UI waits for confirmation and retains failed commands for retry; no outgoing notifications.
- Added `lib/business*.ts`, migrations 005/006, focused database/client tests. Existing rows/policies untouched; no company import, remote migration or deployment.
- PASS: actual SQL + route tests in disposable PGlite (legacy balances, rollback, lost-response retry, partial/full payments, duplicates, roles, close/reopen persistence); client retry tests; TypeScript; build. Focused lint: 0 errors, 17 existing unused-import warnings in the two UI pages; unrelated lint deferred.
- Unverified: hosted Supabase/PostgREST, real concurrent database sessions, browser/mobile UI, legacy rep UUID → account ownership mapping. Migration/configuration must be verified in staging before business usage; absent setup fails explicitly.
- Next: staging verification of migrations and ownership, then refund/stock integration. Review/rollback and isolated test instructions: `supabase/migrations/BUSINESS_PERSISTENCE.md`. No production changes authorized.
