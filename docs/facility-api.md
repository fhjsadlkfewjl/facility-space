# Обновление 2026-10-15 — имеет приоритет над предыдущим описанием

Rooms CSV preview/apply и classification export: /api/rooms/import-preview, /api/rooms/import-apply, /api/reports/room-classification.csv. Space report /api/reports/space.csv; queue CSV /api/quality-queue?format=csv. History периода [valid_from,valid_to); ошибки конфликтов возвращаются без частичного apply.

---

# Facility API

Все `/api/*` требуют Bearer token. `/health` публичный readiness endpoint. Форматы ошибок `{error:string}`; 400 — входные данные/FK, 401 — auth, 403 — права, 404 — ресурс, 409 — занятость/версия/конфликт, 422 — геометрия. Размер тела до 1 MiB. ISO timestamps с timezone, хранение timestamptz UTC.

| Method | Route | Вход / назначение |
|---|---|---|
| GET | /api/dashboard | summary + комнаты с official/calculated/effective area, occupancy, категориями |
| POST | /api/buildings | name, city?, address?; admin |
| PATCH | /api/buildings/:id | name, city, address |
| POST | /api/floors | building_id, name, number, width, height, meters_per_unit? |
| PUT | /api/floors/:id/background | svg, expectedVersion; безопасная подложка |
| PATCH | /api/floors/:id/scale | meters_per_unit, expectedVersion; пересчёт calculated area |
| POST / PUT | /api/rooms[/:id] | floor_id, name, space_type_id, area_m2 (nullable), polygon: [[x,y],…], expectedVersion |
| POST | /api/space-types | id (lowercase code), name, category: OFFICE/COMMON/TECHNICAL/OTHER |
| GET / POST | /api/templates | POST: name,width,depth,is_workplace; размеры в единицах плана |
| POST | /api/furniture | floor_id,template_id,inventory_number?,x,y,width,depth,rotation?,workplace_code?,expectedVersion |
| POST | /api/furniture/:id/archive | expectedVersion; запрещён при назначениях/будущих бронях |
| PUT | /api/floors/:id/layout | expectedVersion, comment?, changes:[{id,x,y,rotation,width?,depth?,roomId?}] |
| POST | /api/workplaces | furniture_id,code; несколько мест на предмете |
| POST | /api/assignments | employeeId,workplaceId (null = release) |
| GET | /api/inventory?q=&offset= | поиск по inventory number/template; 200 на страницу |
| PATCH | /api/inventory/:id | inventory_number nullable, condition:in_use/stored/repair/retired, note? |
| POST | /api/bookings | kind:workplace/parking,resourceId,employeeId,startsAt,endsAt,vehicle? |
| GET | /api/bookings?offset= | 200 на страницу; employee видит свои брони |
| POST | /api/bookings/:id/cancel | пустое тело {}; идемпотентная отмена |
| GET / PUT / DELETE | /api/managers | PUT building_id,employee_id,role:manager/deputy; DELETE building_id,employee_id; изменение admin only |
| POST | /api/parking | building_id,number,area_m2? |
| PATCH | /api/parking/:id/details | zone |
| POST | /api/parking/assignments | employeeId,parkingSpotId nullable,vehicle? |
| GET | /api/parking/assignments | история; employee только свои |
| POST | /api/parking-rates | building_id,rate_per_spot,currency,valid_from,valid_to?; за месяц |
| GET | /api/parking-costs | действующая месячная стоимость по зданиям |
| GET | /api/reports/:id.csv | inventory / rooms / workplaces; CSV с UTF-8 BOM и защитой formula injection |
| GET | /api/audit | последние 100 событий; admin/facilities |

Базовые read routes и тарифы описаны в [api.md](api.md). Термин `area_m2` означает учётную площадь. Вычисленная площадь не округляется при хранении; UI округляет отображение. Стоимости хранятся/считаются PostgreSQL numeric, суммы разделяются по валюте и периоду.

Перенос assignments закрывает предыдущий интервал и открывает новый одной транзакцией. Booking не освобождает постоянное место сотрудника в другом месте; запрещено бронировать сам постоянно закреплённый ресурс. Одновременно возможна одна бронь каждого вида на сотрудника. Для assignments нет будущей даты начала, поэтому любое неистёкшее бронирование ресурса блокирует постоянное назначение.

Facilities edit scopes берутся из building_managers, JWT задаёт только роль. Запись manager не превращает employee в facilities автоматически. Admin — полный доступ. Employee — собственные назначения/брони. Доступ на чтение по зданиям не ограничивается в MVP; manager grants не дают права менять JWT роли.

## Дополнения 15 октября 2026

- `POST /api/inventory/bulk-check`: `{ids, condition, note}`; 1–200 уникальных ID, condition `in_use|stored|repair|retired`. Атомарно проверяет доступ ко всем этажам и пишет audit для каждой строки. Ответ `{updated}`.
- `POST /api/cost-rates/:id/close`: `{valid_to: YYYY-MM-DD, expectedValidTo: YYYY-MM-DD|null}`. Закрывает период, запрещает продление, требует актуальную границу. Глобальные ставки — admin, локальные — с доступом к scope. Конфликт — 409.
- `GET /api/floors/:id/versions/:version`: версия, комментарий, дата, currentVersion и diff `{id,before,after}` геометрии; требуется доступ к этажу.
- `POST /api/floors/:id/versions/:version/restore-geometry`: `{expectedVersion}`. Создаёт новую версию через обычную проверку layout. Требует неизменный состав активной мебели и известные размеры. Не восстанавливает комнаты, подложки или назначения; конфликт — 409.
