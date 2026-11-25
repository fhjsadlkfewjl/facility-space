# Обновление 2026-10-15 — имеет приоритет над предыдущим описанием

Area history и полный layout restore реализованы. Следующие инженерные цели: DQ lifecycle, bulk cross-floor movement, история room type/location для стоимости, native concurrency/E2E. Подробная граница готовности — gap-list.md.

---

# Целевая модель и отличие от текущей

Основа уже реализована: устойчивые legacy IDs, нормализованная spatial hierarchy, отдельные furniture/workplaces, интервалы assignments/bookings, official/calculated area, source provenance, audit и optimistic layout versions.

Для корпоративного запуска остаются контракты identity/org sync, authoritative mappings масштаба/площадей/классов, правила reconciliation и shared seating, parking/rate registry, deployment/retention/UAT. Требования перечислены в gap-list.md.

Следующие инженерные расширения не считаются готовыми: полный topology rollback, historical area ledger для финансовых отчётов на дату, automatic changed-source reconciliation с manual override policy, полноценные browser/concurrency/load/restore проверки. Текущая версия предлагает geometry diff/restore и snapshot import, не скрывая эти границы.
