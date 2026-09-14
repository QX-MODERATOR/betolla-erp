# Persistence worklist

Eight tasks, fixed on 2026-09-13. Done means implemented AND tested; no estimated percentages.

| # | Task | State | Evidence / remaining |
|---|---|---|---|
|1|Reproduce refresh loss, isolated native PostgreSQL/PostgREST connection|Partially verified|Native isolated API/SQL and concurrency tests PASS 2026-09-14; customer fake write/read identified; visual refresh reproduction remains outstanding.|
|2|Orders: create/edit/search/status, persistence lifecycle|Pending|Batch 2 SQL tests exist, browser/restart/multi-session tests outstanding.|
|3|Customers, sales, follow-up and assignment|Pending|UI arrays and local-only updates confirmed.|
|4|Inventory and reversible order movements|Pending|Local-only simulation confirmed.|
|5|Collections and auditable corrections|Pending|Batch 2 partial payment SQL tests exist; no correction workflow yet.|
|6|Delivery assignment, driver collection, reconciliation|Pending|Mock/local data confirmed.|
|7|Reports and durable distribution targets|Pending|Static metrics confirmed.|
|8|Browser lifecycle, Android, handoff|Pending|Not yet tested.|

Confirmed whole-task completion: 0/8 = 0%. Tested subtasks do not count as completed parent tasks.
Connection labels: orders/finance = save/read verified through isolated real API and PostgreSQL; browser lifecycle not verified. Customers, sales, inventory, delivery, reports and targets = not connected. Hosted Supabase and Android = unverified.
2026-09-14 bounded batch: native API tests pass, including independent sessions, actual row locks, partial balances, deduplication, logout/login and previous-run fixture retrieval. Browser tool encountered a generated connection-error page rejected by its URL policy. No customer implementation included.
Next: customer create/edit/read migration and API/UI wiring, followed by independent SQL and complete browser lifecycle checks. Security/password work stays deferred. Migration 004 needs a separate additive compatibility solution before delivery tests.
No production migration, source import, deployment or external messages are authorized. Preserve auth fixes and unrelated working changes.
