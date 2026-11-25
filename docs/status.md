# Facility Space — pilot status, 11 November 2026

**Problem:** the old Office Map and manual/Excel facilities workflows separate plans, seating, inventory, areas and operational decisions.

**Solution:** one runnable Fastify + React + PostgreSQL service with Employee, Facilities/AHO and Admin experiences. Atlas was the UX concept; Facility Space is the service built around recovered office data and a repeatable migration pipeline.

**Verified real data:** the recovered October snapshot imports 14 buildings, 77 legacy floors, 1,758 rooms, 4,670 furniture objects, 4,130 workplaces and 2,338 permanent assignments. All **58 active floors** have recovered editor snapshots and SVG backgrounds. The other **19 floors are inactive legacy records**. This is snapshot coverage, not live synchronisation. Object matching is 4,262/4,294 (99.25%): 32 live-only and 90 legacy-only objects remain explicitly listed. Import replay preserves counts.

**Implemented:** maps, room classification/areas, inventory, seating, booking, parking engine, rate/cost views, CSV preview/validation/apply, layout editing and restore-as-new-version, audit/history, searchable/sortable facilities tables, and a persistent Data Quality review workflow. Employee self-service derives identity on the server, requires explicit move confirmation and only releases the current user's own assignment. Financial/admin endpoints remain protected.

**Quality and truthfulness:** quarantine remains **547** (518 ambiguous assignments, 11 unmatched inventory, 17 missing-floor rooms, one inactive resource). Review status does not remove or resolve source ambiguity. Inferred scale is not official scale. Parking/rates in the demo are synthetic. No production write operation was performed against the old portal.

**Validation:** see [validation-final.md](validation-final.md) for this run's actual build, test, browser, Docker, backup/restore and performance results. Security checks cover selected risks and are not a penetration test.

**Remaining engineering limits:** generic bulk cross-floor inventory/workplace relocation is not implemented; use individually validated layout operations. Historical room location and interval-integrated costs are not implemented. A changed upstream snapshot needs an explicit merge/sync workflow. Restore is a layout operation, not a rollback of assignments or a whole database. See [master checklist](master-project-checklist.md).

**External work:** IT must confirm employee identity/sync, Blitz OIDC registration, role mappings and deployment. AHO must review classification and areas, resolve quarantine, provide parking/rates and conduct UAT. Corporate SSO and live employee sync are not completed.

**Recommendation:** suitable for a candid father demonstration and bounded AHO UAT of the documented pilot workflows after checking this run's validation report. Not production-ready and not represented as a fully finished project.
