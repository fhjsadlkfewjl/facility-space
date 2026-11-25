# Обновление 2026-10-15 — имеет приоритет над предыдущим описанием

При импорте rooms получают auto_classified/confidence/needs_review. Baseline area_history начинается в дату импорта, не в прошлом. Повтор того же source hash не добавляет новых записей. 547 unresolved сохранены без эвристических победителей; source employee records исключены из ZIP.

---

# Migration map — актуально 15 октября 2026

| Источник | Назначение | Правило |
|---|---|---|
| BUILDINGS 133 | buildings | legacy ID, active, name |
| LEVELS 134.BUILDING_ID | floors | Проверенный родитель; нет выдуманного этажа |
| LEVELS.BG + captured canvas | floors.background_svg/api_geometry_evidence | Только полученный и нормализованный SVG; ширина/высота canvas в SVG units |
| ZONES 135.LEVEL_ID/SHAPE | rooms.floor_id/shape | Exact straight polygon где возможно; неподдерживаемый path сохраняется с needsReview |
| ZONES.AREA | rooms.area_m2 | Decimal comma поддержана; неизвестное значение NULL |
| TPL 132.IS_TABLE | templates.is_workplace | Enum 225=Y из supplied dump; наблюдённый API is_table сохраняется отдельно |
| captured template box/root/basis/SVG | templates.api_geometry_evidence | ID match, иначе только unique normalized name; конфликт наблюдений не повышается до подтверждения |
| OBJECTS 136.LEVEL_ID/TEMPLATE_ID/ZONE_ID | furniture FKs | FK checks; cross-floor room не назначается |
| OBJECTS.POSITION | furniture.x/y/rotation | Строгий X:Y:R; исходное значение сохраняется в provenance |
| captured item id/floor/template/x/y/r | furniture geometry | Обновление только при совпадении трёх ID; 4 262 совпадения, 104 изменения position/rotation |
| captured template single basis | furniture.width/depth | Положительные размеры SVG body; не физические размеры; placement не считается проверенным |
| OBJECTS.INV | inventory_number/workplace code | Оригинал сохранён; missing/duplicate INV получает internal LEGACY-ID, не разрешает seating |
| employees + table_num | projections/assignments | Только однозначный активный сотрудник/код/ресурс; иначе quarantine |
| live-only / legacy-not-observed | reconciliation report | Без автоматического создания/удаления/назначения |

`recovery/live-reconciliation.json`: все 77 floor IDs и статусы, 32 live-only object IDs, 90 legacy IDs не наблюдались, список 104 изменённых позиций. `recovery/quarantine.json`: 547 записей с sourceId/category/action. На 58 подложках и 21 шаблоне сохранены hash/provenance. Official scale не подменяется.

Одинаковый snapshot повторно не меняет counts, audit_log и import_runs. Новый capture для того же SQL не применяется как автоматический runtime merge: использовать новую изолированную БД и reconciliation.
