# Engineering checkpoint — 2026-09-13

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
