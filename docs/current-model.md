# Обновление 2026-10-15 — имеет приоритет над предыдущим описанием

Миграции 008–011: room_area_history (half-open date intervals), actor-bound room_import_previews, classification flags, индексы inventory/assignments, immutable audit/layout triggers. Snapshot restore реализован в restore.ts. Предыдущие утверждения об отсутствии этих возможностей заменены этим дополнением.

---

# Текущая модель, 15 октября 2026

Fastify API, React/Vite UI, PostgreSQL SQL migrations 001–007. Локальный импорт/тесты используют PGlite; native PostgreSQL нужен для независимых соединений и production deployment.

Иерархия: buildings → floors → rooms; furniture принадлежит этажу и опционально комнате; furniture_templates хранит is_workplace и геометрию; workplaces отделены от мебели. Employees/departments — проекции внешнего snapshot. Assignments имеют интервалы и историю; bookings — отдельные полуоткрытые интервалы со статусом отмены. Parking zones/spots и назначения/брони отделены от офисной мебели.

Official room area и calculated area раздельны. Floor meters_per_unit — только подтверждённый масштаб; scale_evidence — гипотеза с confidence и samples. TPL geometry basis/box/root — SVG units, не метры. Миграция 007 добавляет furniture.api_geometry_evidence: наблюдённые координаты, исходная legacy position, источник и отсутствие подтверждения физического масштаба.

SVG сохраняется в нормализованном виде: shapes/text/defs/clipPath/mask, локальные ссылки; без script/foreignObject/external refs. На карте мебель использует исходный bbox center, размер рисунка и basis. CSS преобразован в presentation attributes, use развёрнут только для простых локальных геометрических элементов.

Layout versions содержат snapshots. Geometry restore создаёт новую версию и проверяет expectedVersion, active furniture set и placement. Полного rollback всех сущностей нет. Inventory bulk-check атомарен для всех выбранных строк и проверяет building permissions для каждой.

Cost rates хранят scope и validity. Закрытие периода не меняет ставку, не продлевает конец и проверяет ожидаемый valid_to. Исторический расчёт использует текущую площадь.

Counts и источники — status.md. Quarantine и live reconciliation — разные множества, их нельзя складывать как число назначений.
