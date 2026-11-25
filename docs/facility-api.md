# API для АХО

Общие правила входа и ошибок: [API](api.md). Финансовые и управляющие операции требуют соответствующей роли и прав на здание. Даты и время передаются с часовым поясом; конец периода не включается в него.

| Раздел | Основные маршруты | Реализация и схемы |
|---|---|---|
| Обзор и реестры | `/api/dashboard`, `/api/spaces`, `/api/inventory` | [facility.ts](../apps/api/src/facility.ts), [corporate.ts](../apps/api/src/corporate.ts) |
| Здания и этажи | `/api/buildings`, `/api/floors`, `/api/building-wizard/preview`, `/api/building-wizard/apply` | [facility.ts](../apps/api/src/facility.ts), [building-wizard.ts](../apps/api/src/building-wizard.ts) |
| Помещения | `/api/rooms/:id/summary`, `/api/rooms/:id/parameters`, `/api/rooms/:id/area-history` | [corporate.ts](../apps/api/src/corporate.ts), [repairs.ts](../apps/api/src/repairs.ts), [continuation.ts](../apps/api/src/continuation.ts) |
| План и масштаб | `/api/floors/:id/background`, `/api/floors/:id/calibration`, `/api/floors/:id/recalculate-areas`, `/api/floors/:id/editor` | [facility.ts](../apps/api/src/facility.ts), [corporate.ts](../apps/api/src/corporate.ts), [editor.ts](../apps/api/src/editor.ts) |
| Версии | `/api/floors/:id/versions/:version`, `/api/floors/:id/versions/:version/restore` | [continuation.ts](../apps/api/src/continuation.ts), [restore.ts](../apps/api/src/restore.ts) |
| Мебель и инвентарь | `/api/templates`, `/api/furniture`, `/api/inventory/:id`, `/api/inventory/bulk-check` | [facility.ts](../apps/api/src/facility.ts), [continuation.ts](../apps/api/src/continuation.ts) |
| Парковка | `/api/parking`, `/api/parking/assignments`, `/api/parking-rates`, `/api/parking-costs` | [app.ts](../apps/api/src/app.ts), [facility.ts](../apps/api/src/facility.ts) |
| Тарифы | `/api/costs`, `/api/cost-rates`, `/api/cost-rates/:id/close` | [app.ts](../apps/api/src/app.ts), [continuation.ts](../apps/api/src/continuation.ts) |
| Аренда | `/api/tenants`, `/api/leases`, `/api/leases/preview` | [leases.ts](../apps/api/src/leases.ts) |
| Импорт | `/api/import-center`, `/api/import-center/preview`, `/api/import-center/apply` | [import-center.ts](../apps/api/src/import-center.ts) |
| Проверка данных | `/api/quality-queue` | [quality.ts](../apps/api/src/quality.ts) |
| Ответственные | `/api/managers` | [facility.ts](../apps/api/src/facility.ts) |
| Отчёты | `/api/reports/:id.csv` | [facility.ts](../apps/api/src/facility.ts) |

Это указатель по API, а не полный контракт запросов. Методы, обязательные поля и ограничения проверяются схемами в указанных файлах.

## Правила операций

- Перенос назначения закрывает старое и создаёт новое в одной транзакции.
- Бронь не снимает постоянное назначение сотрудника в другом месте. Постоянно занятое место бронировать нельзя.
- Массовая проверка инвентаря принимает 1–200 уникальных ID и проверяет права на каждую запись.
- Документальная и расчётная площади хранятся отдельно. Денежные суммы разделяются по валюте и периоду.
- Импорт сначала проверяется, затем применяется целиком. Предпросмотр связан с пользователем; повторное или устаревшее применение отклоняется.
- Восстановление планировки создаёт новую версию с проверками связанных объектов. Назначения и вся база к прошлой дате не возвращаются.
- Изменять ответственных за здания может администратор. Назначение ответственным не выдаёт роль АХО автоматически.
