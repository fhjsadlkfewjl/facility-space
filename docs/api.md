# Обновление 2026-10-15 — имеет приоритет над предыдущим описанием

Новые routes: GET quality-queue (category/building/offset/format=csv), GET unified-search?q; GET/POST rooms/:id/area-history; POST rooms/import-preview {csv}, POST rooms/import-apply {previewId}; POST workplaces/bulk-status; POST floors/:id/versions/:version/restore {expectedVersion}. Точные схемы Zod — bulk.ts/continuation.ts/restore.ts. Legacy actions отдельно в legacy-api.md.

---

> Расширения Facility и актуальные ограничения прав: [facility-api.md](facility-api.md).

# REST API V1

Base `/api`; JSON. `Authorization: Bearer <approved gateway JWT>`. Для локального демо `Bearer <DEMO_TOKEN>:employee|facilities|admin`; в production этот режим запрещён. `/health` без auth выполняет SELECT 1, остальные пути требуют identity.

| Метод / путь | Доступ | Назначение |
|---|---|---|
| GET /me | любой | Проверенный actor/роль |
| GET /offices, /buildings | любой | Активные здания и счётчики |
| GET /buildings/:id | любой | Обзор здания + этажи |
| GET /floors?buildingId= | любой | Активные этажи |
| GET /floors/:id/layout | любой | floor, rooms, furniture + сотрудник/место; без финансов |
| PUT /floors/:id/layout | facilities/admin | Атомарное перемещение/поворот мебели + версия |
| GET /floors/:id/versions | facilities/admin | Метаданные последних 100 версий |
| GET /rooms?floorId= | любой | Помещения этажа |
| GET /rooms/:id | любой | Инспектор помещения |
| PATCH /rooms/:id/space | facilities/admin | Учётная площадь и тип |
| GET /workplaces?floorId= | любой | Рабочие места, максимум 10 000 |
| GET /workplaces/:id | любой | Инспектор рабочего места |
| GET /search?q=&offset= | любой | Поиск человека, команды, должности или номера места; 50 записей на страницу |
| GET /departments | любой | Проекция подразделений и headcount |
| GET /assignments | любой | Последние 500; сотруднику только собственная история |
| POST /assignments | self / facilities / admin | Назначение, перевод или освобождение |
| GET /space-types | любой | Нефинансовый справочник |
| POST /space-types | facilities/admin | Создать тип площади |
| GET /costs | facilities/admin | Действующий тариф/стоимость по помещениям |
| GET /cost-rates | facilities/admin | Тарифы с периодами действия |
| POST /cost-rates | facilities/admin | Создать непересекающийся тариф |
| GET /parking | любой | Места и текущие назначения |
| POST /parking | facilities/admin | Создать парковочное место |
| POST /parking/assignments | self / facilities / admin | Назначить/переназначить/освободить |
| GET /audit | facilities/admin | Последние 100 событий |

Employee никогда не получает rates/total_cost через общие ответы. `area_m2` — нефинансовая информация. Имена/подразделения доступны аутентифицированным сотрудникам в пределах согласуемого корпоративного каталога.

## Примеры

```json
POST /api/assignments
{"employeeId":"employee-1","workplaceId":"workplace-7"}
```

Передайте `workplaceId: null` для освобождения. Переназначение не вытесняет другого сотрудника с занятого целевого места. Повтор на то же место возвращает существующее назначение. Сроки/будущие бронирования/несколько одновременных мест V1 не поддерживает.

```json
PUT /api/floors/demo-floor/layout
{"expectedVersion":1,"comment":"Перестановка","changes":[{"id":"furniture-1","x":140,"y":170,"rotation":0}]}
```

`roomId` опционален: сервер выводит комнату из конечной геометрии. IDs только с текущего этажа, дубликаты отклоняются. До 500 изменений; координаты конечные в пределах ±100000, поворот ±360. Ответ `{"version":2}`. При 409 сохраните draft отдельно, загрузите текущую версию и примените изменения осознанно. В UI конфликт не переотправляется автоматически.

```json
POST /api/cost-rates
{"space_type_id":"office","building_id":"demo-building","room_id":null,"rate_per_m2":2800,"currency":"RUB","period":"month","valid_from":"2027-01-01","valid_to":null}
```

При room_id building_id должен быть null; тип комнаты обязан совпадать. Для одного scope нельзя создавать перекрывающиеся периоды. В V1 нет UI изменения/закрытия старого тарифа; новые ставки можно добавлять для другого scope или неперекрывающегося периода. Для изменения открытого тарифа требуется следующая административная операция (зафиксировано в assumptions), не прямое редактирование production DB.

## Ошибки и ограничения

400 — невалидное тело/параметр; 401 — нет/невалидная identity; 403 — нет прав; 404 — нет сущности; 409 — место занято/версия устарела/конкурентная операция/перекрывающийся тариф; 422 — геометрия невалидна или не хватает исходных размеров. JSON: `{"error":"..."}`. 500 не раскрывает стек/SQL. Есть rate limiting 300 запросов/мин на клиент и body limit 1 MiB; в production за proxy необходимо согласовать trustProxy и IP policy. Audit и rate endpoints не возвращают секреты identity.

Каталог зданий/этажей/комнат/мебели в MVP создаётся importer/seed; произвольный каталоговый CRUD, рисование новых комнат и добавление/удаление мебели через UI не реализованы. Layout editor V1 работает с размещением существующей мебели. Это граница MVP, не обещание полного CAD.
