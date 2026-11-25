# Remaining gaps — 11 November 2026

## Engineering limits

- Generic bulk cross-floor inventory/workplace transfer is not implemented. Existing layout movement validates geometry; bulk inventory verification and workplace availability changes are supported.
- Historical room building/location and an integral of costs over arbitrary intervals are not implemented. Area/rate validity and newly observed classification history are supported; history before observation is unknown.
- New upstream snapshots require an explicit reconciliation/merge process. Replay of the same snapshot is idempotent; it is not live synchronization.
- Layout restoration creates a new version and protects assignments/bookings; it is not a full business-database rollback and does not reconstruct physically deleted business resources.
- Object reconciliation retains 32 live-only and 90 legacy-only differences. Do not delete or invent resources merely to force totals to match.
- Browser coverage is a defined pilot suite, not exhaustive testing of every field/error path. Security checks are not a complete penetration test. PGlite timings are not concurrent PostgreSQL load measurements.

## External integration / business decisions

See [five IT requirements](it-questions-final.md) and [six AHO requirements](aho-questions-final.md). Corporate OIDC and live employee/org synchronization remain incomplete. The 19 inactive floors are not a blocker to demonstrating the 58 active recovered floors.

## Closed since the October package

Persisted Data Quality lifecycle, self-only employee endpoints with confirmation/stale-state checks, classification history, bulk availability UI, native PostgreSQL race tests, runnable Chrome E2E, Docker health/restart/backup/restore. Exact executed checks are in [validation-final.md](validation-final.md).
