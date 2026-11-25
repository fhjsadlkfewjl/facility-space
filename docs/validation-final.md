# Validation — 11 November 2026

Executed against the recovered continuation project with this run's changes. Earlier October environment failures are historical, not current results.

| Check | Result |
|---|---|
| Install | PASS — npm ci; compatible dependency fixes applied |
| Build | PASS — TypeScript and Vite production build |
| Application/API/import/geometry/permissions/booking/parking/audit/CSV/security | **58 PASS, 0 FAIL, 0 SKIP** with TEST_DATABASE_URL configured |
| Python import/HAR/snapshot | **5 PASS** |
| Chrome demo E2E | **5 PASS** |
| Chrome recovered real floor/SVG | **1 PASS**, read-only map inspection |
| Fresh recovered data import + replay | PASS; counts preserved; per-floor evidence in reconciliation report |
| PostgreSQL native concurrency | PASS — two assignments; booking race; workplace and parking booking vs permanent assignment; layout version conflict; audit consistency |
| Docker fresh database → migrations → synthetic seed → API/web health | PASS on final release stack |
| Restart → persistence | PASS — 16 workplaces, IN_REVIEW review and one audit entry retained |
| Backup → separate verification database | PASS — pg_dump/pg_restore; same workplace/review/audit checks; baseline snapshot is a full object |
| Dependency security audit | Seven initial advisories corrected with compatible updates; **zero remaining reported** |

The final browser suite exercises self assignment/move/release, search→map, role navigation, responsive layout, AHO dashboard, inventory verification, booking conflict, parking screen, CSV export, persisted DQ review, 30° rotation, undo/redo, version comparison and restoration. It is not exhaustive coverage of every form and error path. Separate API tests cover parking engine behavior. Docker smoke uses synthetic seed; the full recovered dataset is verified separately in an isolated PGlite database.

The initial synthetic layout version previously contained only furniture; the new restore scenario exposed this. Seed now records a full layout. New imports record baselines, and existing missing baselines are appended as current observations without rewriting history. Historical incomplete versions remain immutable and are rejected safely.

## Performance

[performance-final.json](performance-final.json) records cold and three warm runs for dashboard, inventory, employee/global search, busiest floor, workplaces, bookings, availability, reports and Data Quality on 1,758 rooms, 4,670 furniture objects and roughly 35,649 employees. Every measured endpoint returned HTTP 200. These are local sequential PGlite measurements, not load testing or a production SLA. Existing indexes were retained; no speculative index changes were made.

## Security scope

Tests cover selected malformed/oversized inputs, permissions/IDOR, self-service identity and stale confirmation, occupied-place conflicts, SVG and CSV handling, geometry/timestamps, immutable history and transaction audit consistency. Employee general assignment calls are denied; self-service accepts no employee ID. Database uniqueness/locking remains a final concurrency guard. This is **not a complete penetration test**.

No old-portal production write was performed. No corporate OIDC client or live employee sync was claimed as validated.

Machine-readable execution summary: [validation-final.json](validation-final.json).
