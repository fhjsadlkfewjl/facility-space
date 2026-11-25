# Обновление 2026-10-15 — имеет приоритет над предыдущим описанием

Все 19 missing floors ACTIVE=false и live FAIL, но archived/deleted/replaced не определено. Furniture label dimensions не подтверждены. searchUser tableNum наблюдался как object; точная вложенная структура не исследована. История площади до импорта неизвестна. Остаток включает инженерные задачи, а не только IT.

---

# Assumptions and boundaries

- Dump и browser capture — разные снимки. Legacy IDs сохраняются; 32 новых live objects и 90 не наблюдавшихся legacy objects требуют сверки. Отсутствие в ответе не означает удаление.
- 18 floor-not-found — буквальный ответ портала, не автоматически неактивные этажи в новой БД. HTTP 502 для 296125 — ошибка источника, не доказательство отсутствия.
- SVG/canvas/basis units не считаются метрами. 26 medium / 21 low / 30 none scale hypotheses, 0 official scales. Учётные площади и inferred dimensions раздельны.
- Однозначность employee assignment определяется существующими безопасными правилами; shared seating из неоднозначных строк не выводится. Quarantine не скрывается ради меньшего числа.
- Parking registry/vehicles/prices для реальной компании отсутствуют. Проверены synthetic сценарии. Не выдуманы ставки или business rules.
- Локальная demo identity не является SSO. Секреты, raw HAR/SQL, БД и employee projections не входят в переносимый ZIP.
- UI smoke не заменяет Chromium E2E; PGlite не заменяет native PostgreSQL races. Заблокированные проверки явно отмечены.
