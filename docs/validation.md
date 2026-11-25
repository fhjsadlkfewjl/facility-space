> Historical October report. Current executed results: [validation-final.md](validation-final.md).

# Проверка релиза

2026-10-15: npm ci, npm run build PASS; npm test 53 PASS / 1 native SKIP; npm run test:python 5 PASS. Изолированный import + replay + verify PASS. Counts и mappings: recovery/*.json. Логи без локальных персональных путей: validation-20261015/.

Новые проверки: area/rate periods; restore additions/removals и отказ удалить занятое место; version conflict; CSV parser/preview/stale atomic apply; ambiguous classification; permissions; DQ/unified SQL-input; malformed JSON/413; immutable audit/layout UPDATE/DELETE/TRUNCATE.

Chromium E2E: четыре сценария не дошли до исполнения из-за launch EPERM/SIGABRT. Native initdb: shmget EPERM. Docker: не установлен. Это BLOCKED/NOT RUN, не PASS.

Ручной просмотр встроенным браузером: синтетическая роль администратора, parking, dashboard с quality/search/CSV controls. Полный save/import browser workflow не подтверждён.

Performance: benchmark-local.ts, реальный объём 1758 rooms/4670 furniture/35649 employees; последовательные app.inject чтения на PGlite, один холодный и три прогретых запроса. Без сетевой задержки, без concurrent users. Ответы employee search не сохранялись. Не измерена отдельно booking availability под нагрузкой.

CI запускает PostgreSQL service/native tests, browser tests и compose health. Для backup/restore нужен отдельный smoke и подтверждение восстановления. Не выполнено в этой среде.
