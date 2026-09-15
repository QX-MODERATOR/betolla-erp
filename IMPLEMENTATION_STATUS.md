# Persistence worklist

Eight tasks, fixed on 2026-09-13. Done means implemented AND tested; no estimated percentages.

| # | Task | State | Evidence / remaining |
|---|---|---|---|
|1|Reproduce refresh loss, isolated native PostgreSQL/PostgREST connection|Partially verified|Native isolated API/SQL and concurrency tests PASS 2026-09-14; customer fake write/read identified; visual refresh reproduction remains outstanding.|
|2|Orders: create/edit/search/status, persistence lifecycle|Pending|Batch 2 SQL tests exist, browser/restart/multi-session tests outstanding.|
|3|Customers, sales, follow-up and assignment|Create/read verified; edit/assignment/follow-up not built|Durable via `business_customer_create`/`_list`/`_document` RPCs (migration 007). PGlite test PASS. **2026-09-15: real native end-to-end PASS** against an isolated live PostgreSQL + PostgREST + running Next dev server (`scripts/test_customers_native.mjs`, `scripts/local_sandbox.mjs`): create -> independent SQL read -> second independent session re-fetch (refresh-equivalent) -> phone-duplicate resubmission x2 (no duplicate row) -> logout/login -> **full cold restart of Postgres+PostgREST+Next (new OS PIDs confirmed)** -> row still present via both SQL and API. Not done: literal browser-driven click-through (no headless/visual browser used, only real HTTP+SQL), customer edit/reassignment UI, call-log recording UI, hosted (non-local) Supabase.|
|4|Inventory and reversible order movements|Pending|Local-only simulation confirmed.|
|5|Collections and auditable corrections|Pending|Batch 2 partial payment SQL tests exist; no correction workflow yet.|
|6|Delivery assignment, driver collection, reconciliation|Pending|Mock/local data confirmed.|
|7|Reports and durable distribution targets|Pending|Static metrics confirmed.|
|8|Browser lifecycle, Android, handoff|Pending|Not yet tested.|

Confirmed whole-task completion: 0/8 = 0%. Tested subtasks do not count as completed parent tasks.
Connection labels: orders/finance = save/read verified through isolated real API and PostgreSQL; literal browser click-through not verified. Customers = create/read verified through isolated real API and PostgreSQL, including a real process restart (native sandbox); literal browser click-through not verified. Sales follow-up/assignment, inventory, delivery, reports and targets = not connected. Hosted (non-local) Supabase and Android = unverified.
2026-09-14 bounded batch: native API tests pass, including independent sessions, actual row locks, partial balances, deduplication, logout/login and previous-run fixture retrieval. Browser tool encountered a generated connection-error page rejected by its URL policy. No customer implementation included.
2026-09-15 batch A: implemented customer create/read persistence (migration 007, `/api/customers` GET, `/api/leads` POST now writes real rows) and wired `app/customers/page.tsx` to load/reload from the database. Isolated PGlite test (`scripts/test_customers.mjs`) PASS; existing business/session/RBAC tests re-run with no regressions; TypeScript, production build and focused lint (0 errors on touched files) PASS.
2026-09-15 batch B: real native end-to-end lifecycle verification (`scripts/test_customers_native.mjs` against `scripts/local_sandbox.mjs`) PASS — create, independent SQL read, second session re-fetch, duplicate-phone resubmission (x2, no duplicate row), logout/login, and survival across a genuine full cold restart of Postgres+PostgREST+Next (confirmed via new OS process IDs, not just script re-run). Full regression re-run (customer/business/business-client/session-security tests, TypeScript, focused lint, production build) all PASS. No app bug found; an earlier apparent failure during manual restart testing was traced to the tester's own process orchestration (a stale PostgREST instance vs. a fresh one racing on the same port), not the application.
Next: customer edit/reassignment UI and call-log recording (remainder of task 3, not required to unblock task 4), then inventory/order-movement persistence (task 4, now starting). Security/password work stays deferred. Migration 004 needs a separate additive compatibility solution before delivery tests.
No production migration, source import, deployment or external messages are authorized. Preserve auth fixes and unrelated working changes.
