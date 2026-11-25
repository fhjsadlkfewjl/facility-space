Продолжи существующий проект **Facility Space** из последней рабочей версии.

НЕ начинай проект заново.  
НЕ делай новый прототип.  
НЕ переписывай существующую архитектуру без необходимости.

Используй уже реализованные:

- React frontend;
- Fastify / TypeScript backend;
- PostgreSQL data model;
- импорт legacy Office Map;
- реальные здания / этажи / комнаты;
- реальные SVG этажей;
- мебель;
- workplaces;
- assignments;
- booking;
- parking engine;
- inventory;
- cost analytics;
- Data Quality;
- audit/history;
- layout versions;
- employee / facilities / admin roles.

## Главная цель

Сделать из текущего Facility Space **максимально простой, мощный и законченный корпоративный продукт**:

1. для обычных сотрудников — современная интерактивная карта офисов;
2. для АХО / facilities — полноценная система управления помещениями, площадями, мебелью, рабочими местами, арендой, парковкой, стоимостью и качеством данных.

Продукт должен быть настолько простым, чтобы сотрудник АХО смог разобраться практически без инструкции.

Главный UX-принцип:

> **Карта — для пространственных действий. Таблицы — для массовой учётной работы. Импорт — для большого объёма данных.**

---

# 1. ROLE-BASED PRODUCT

Один продукт, одна БД, один backend, одна карта.

## Employee

Employee должен видеть только:

- карту;
- здания / этажи;
- поиск человека;
- поиск помещения;
- поиск рабочего места;
- своё рабочее место;
- свои бронирования;
- parking, если разрешено.

Employee может:

- найти сотрудника и увидеть его место на карте;
- найти комнату;
- найти workplace;
- посмотреть свободные / занятые места;
- назначить ТОЛЬКО СЕБЯ на свободное место;
- если уже есть место — явно подтвердить перенос на другое;
- освободить ТОЛЬКО своё рабочее место;
- забронировать свободное место прямо на карте.

Employee НЕ может:

- назначать другого человека;
- освобождать чужое место;
- редактировать комнаты;
- редактировать layout;
- двигать мебель;
- видеть inventory admin;
- видеть стоимость;
- видеть Data Quality;
- видеть admin/AHO инструменты.

Эти ограничения должны быть server-side.

---

# 2. FACILITIES / AHO

Facilities/AHO получает полный функционал:

- здания;
- этажи;
- помещения;
- типы помещений;
- площади;
- SVG планы;
- мебель;
- inventory;
- workplaces;
- assignments;
- booking;
- parking;
- аренда;
- стоимость;
- тарифы;
- отчёты;
- Data Quality;
- audit/history;
- layout editor;
- responsables / managers;
- импорт.

---

# 3. MAP-FIRST EXPERIENCE

Карта должна стать главным рабочим экраном продукта.

Сделай её максимально интерактивной и удобной.

## Top controls

На карте:

- Building selector;
- Floor selector;
- Global search;
- date/time selector для booking;
- layer selector;
- Map / Table toggle.

## Map layers

Реализовать удобные режимы:

- Occupancy;
- Space types;
- Departments;
- Inventory;
- Area;
- Cost;
- Lease / Tenant;
- Data Quality.

Не обязательно показывать всё одновременно.

---

# 4. BOOKING DIRECTLY ON THE MAP

Booking должен быть пространственным workflow.

Employee выбирает:

- дату;
- время;

например:

`15 Nov 2026 · 09:00–18:00`

После этого карта сама показывает:

- available;
- occupied;
- booked;
- disabled.

Клик по свободному desk:

- workplace;
- room;
- availability for selected interval;
- `Book`.

Backend должен окончательно проверять conflict transactionally.

Нельзя полагаться только на frontend state.

Если место уже permanently assigned или booking пересекается — booking запрещён.

---

# 5. PERFECT INSPECTORS

## Room inspector

При клике на room показывать:

- room name/number;
- class;
- subtype;
- building;
- floor;
- official area;
- calculated area;
- discrepancy;
- employees;
- workplaces;
- free workplaces;
- m²/person;
- m²/workplace;
- responsible person;
- tenant / lease if exists;
- cost where permitted;
- Data Quality warnings.

Actions для AHO:

- open workplaces;
- open furniture;
- edit classification;
- open lease;
- open history;
- open Data Quality issue.

Employee видит только безопасную часть.

## Workplace inspector

Показывать:

- normal human-friendly workplace name;
- room;
- building/floor;
- free/occupied/booked;
- employee if occupied;
- future bookings.

Employee:

- Assign myself;
- Move myself;
- Release my workplace;
- Book.

AHO:

- Assign employee;
- Release;
- Inventory;
- History;
- Open in Layout Editor.

Не показывать `LEGACY-...` как главный пользовательский label, если можно построить нормальное имя.

Legacy ID должен быть secondary metadata.

---

# 6. MAP ↔ TABLE SYNCHRONIZATION

Для AHO Map View и Table View должны быть двумя видами одной и той же информации.

Клик в таблице:

→ select + focus + zoom на карте.

Клик на объекте карты:

→ select corresponding table row.

Нужны таблицы:

- Spaces;
- Furniture / Inventory;
- Workplaces;
- Bookings;
- Parking;
- Leases;
- Data Quality.

---

# 7. SIMPLE AHO NAVIGATION

Упростить sidebar.

Предлагаемая структура:

## Пространства
- Обзор
- Карта
- Помещения
- Рабочие места

## Управление
- Инвентаризация
- Бронирования
- Парковка
- Аренда
- Ответственные

## Аналитика
- Площади и стоимость
- Качество данных
- История

## Администрирование
- Редактор планировки
- Настройки объектов
- Импорт

Для employee sidebar значительно проще:

- Карта
- Поиск
- Моё место
- Бронирования
- Парковка

---

# 8. FURNITURE LIBRARY

Сделать полноценную библиотеку мебели.

Furniture template должен поддерживать:

- name;
- category;
- SVG;
- real width;
- real depth;
- resize allowed;
- workplace-capable;
- default properties.

Категории минимум:

- desk;
- chair;
- cabinet;
- pedestal;
- sofa;
- meeting table;
- storage;
- sanitary;
- equipment;
- other.

AHO должен иметь:

`+ Новый тип мебели`

Workflow:

1. название;
2. категория;
3. реальные размеры;
4. загрузить SVG;
5. is_workplace;
6. resize allowed;
7. save.

После этого новый тип сразу доступен в Layout Editor.

---

# 9. FURNITURE ON THE MAP

В Layout Editor:

- library panel;
- drag furniture onto map;
- move;
- resize;
- rotate;
- duplicate;
- delete/archive;
- inventory number;
- room assignment;
- collision;
- containment.

Rotation UI:

- snap 30°;
- backend хранит arbitrary numeric rotation.

---

# 10. SVG SCALE CALIBRATION

Сейчас SVG units и physical meters не должны смешиваться.

Добавить **Scale Calibration Wizard**.

Workflow:

1. открыть floor;
2. `Настроить масштаб`;
3. пользователь выбирает две точки на SVG;
4. вводит реальное расстояние, например `6.40 m`;
5. система рассчитывает `meters_per_unit`.

Хранить:

- calibration points;
- real distance;
- meters_per_unit;
- calibrated_by;
- calibrated_at;
- source;
- confidence.

Не считать inferred scale официальным.

---

# 11. AUTOMATIC AREA ENGINE

После calibration система должна автоматически считать площади помещений.

Для каждого room polygon:

`polygon SVG area × scale² = calculated_area_m2`

Хранить отдельно:

- `official_area_m2`;
- `calculated_area_m2`.

Никогда автоматически не заменять official area calculated value.

## Batch action

Добавить:

`Пересчитать площади этажа`

Результат:

- calculated successfully;
- missing geometry;
- invalid polygon;
- discrepancy threshold exceeded.

Пример:

| Room | Official | Calculated | Difference | Status |
|---|---:|---:|---:|---|
| 712 | 73.7 | 72.97 | -1.0% | OK |
| 713 | 42.0 | 38.1 | -9.3% | Review |

Добавить Data Quality warnings.

---

# 12. NEW BUILDING WIZARD

AHO должен легко добавлять новые здания без программиста.

`+ Добавить здание`

Wizard:

## Step 1 — Building
- name;
- city;
- address;
- responsible.

## Step 2 — Floors
Options:
- add manually;
- CSV import.

## Step 3 — SVG plans
For every floor:
- upload SVG;
- multiple drag-and-drop supported.

## Step 4 — Rooms
Options:
- draw rooms;
- CSV import;
- existing structured import.

## Step 5 — Furniture
Options:
- manually place;
- CSV import.

## Step 6 — Review
Show counts and validation before apply.

---

# 13. IMPORT CENTER

Добавить отдельный понятный раздел:

`Импорт данных`

Типы импорта:

- Buildings;
- Floors;
- Rooms;
- Furniture;
- Workplaces;
- Parking;
- Rates;
- Tenants;
- Leases.

Каждый импорт:

1. Download CSV template.
2. Upload file.
3. Parse.
4. Validate.
5. Preview.
6. Show diff.
7. Apply.

Preview должен показывать:

- create;
- update;
- unchanged;
- skip;
- error.

Никаких silent overwrite.

Добавить CSV formula injection protection.

---

# 14. LEASE / OCCUPANCY MANAGEMENT

Добавить полноценный модуль аренды помещений.

Это не просто поле tenant у room.

## Tenant

Entity:

- id;
- name;
- internal/external;
- company reference where relevant;
- contact metadata only if business actually requires it;
- active.

## LeaseAgreement

Fields:

- tenant;
- contract number;
- start date;
- end date;
- status;
- currency;
- comment;
- created/updated metadata.

## Lease composition

Lease содержит набор chargeable spaces / lease lines.

Это нужно потому что правила разные.

---

# 15. DIFFERENT LEASE MODELS

Поддержать минимум:

## A. Office only

Tenant арендует только конкретные офисы.

Example:

- Room 712
- Room 713

## B. Office + selected common areas

Например:

- Room 712;
- Room 713;
- Corridor C7;
- Kitchen K2.

## C. Office + proportional common area allocation

Например:

Tenant занимает 20% office area этажа.

→ ему автоматически распределяется 20% общей площади этажа.

Формула должна быть прозрачной и сохраняться.

## D. Manual allocated common area

AHO может явно указать:

`Allocated common area = 17.5 m²`

Это нужно для договоров, которые не соответствуют геометрической доле.

---

# 16. LEASE LINES

Lease line должна хранить:

- space or allocation type;
- room reference where applicable;
- space class/type;
- area used for billing;
- rate;
- unit;
- valid_from;
- valid_to.

Пример:

| Space | Type | Area | Rate | Monthly |
|---|---|---:|---:|---:|
| 712 | Office | 73.7 | 2000 ₽/m² | 147400 |
| Corridor allocation | Common | 18.5 | 700 ₽/m² | 12950 |

---

# 17. RATE HISTORY

Тарифы обязательно исторические.

Example:

01 Jan – 30 Jun  
`2000 ₽ / m² / month`

01 Jul – ...  
`2200 ₽ / m² / month`

Historical cost calculation должен использовать тариф и площадь, действовавшие на нужную дату.

---

# 18. LEASE EXPIRATION

Dashboard AHO должен показывать:

`Аренды заканчиваются`

- Tenant A — 18 days;
- Tenant B — 42 days;
- Tenant C — 67 days.

Добавить фильтр:

- Active;
- Expiring;
- Expired;
- Future.

---

# 19. LEASE MAP LAYER

Добавить Layer:

`Аренда`

Rooms colouring by tenant.

Click room → Inspector:

- Tenant;
- Contract;
- Start;
- End;
- billed area;
- rate;
- monthly cost;
- `Open agreement`.

---

# 20. CREATE LEASE FROM MAP

`+ Создать аренду`

Workflow:

1. select tenant;
2. start/end dates;
3. select rooms directly on map;
4. common area rule:
   - none;
   - select manually;
   - proportional allocation;
   - manual area;
5. rates;
6. preview;
7. confirm.

Preview:

- Office area;
- Common allocated area;
- Monthly charge.

---

# 21. IMPORT LEASES

Import Center должен поддерживать:

- Tenants CSV;
- Lease CSV;
- Lease lines CSV;
- Rates CSV.

С обязательным preview / validation / diff / apply.

---

# 22. GLOBAL SEARCH

Один search bar:

`Найти человека, помещение, рабочее место или инвентарник`

Search types:

- employee;
- room;
- workplace;
- inventory;
- building;
- parking;
- tenant;
- lease.

Search result → open inspector + focus map where spatial.

Keyboard shortcut:
- `Cmd+K`;
- `Ctrl+K`.

---

# 23. AHO DASHBOARD

Dashboard должен отвечать на вопросы, а не просто показывать KPI.

Sections:

## Today / Attention
- rooms requiring review;
- inventory overdue;
- ambiguous assignments;
- expired/expiring leases;
- booking conflicts if any.

## Spaces
- buildings;
- active floors;
- rooms;
- office/common/technical area.

## Workplaces
- total;
- occupied;
- available;
- bookings today.

## Commercial
- active leases;
- leased area;
- monthly charge;
- expiring leases.

## Quality
- open DQ issues.

Все карточки clickable.

---

# 24. DATA QUALITY

Продолжить текущую систему DQ.

Statuses:

- OPEN;
- IN_REVIEW;
- RESOLVED;
- IGNORED.

Categories:

- missing area;
- calculated/official discrepancy;
- invalid geometry;
- scale unconfirmed;
- missing inventory;
- duplicate inventory;
- ambiguous assignment;
- missing floor;
- missing SVG;
- furniture outside room;
- lease inconsistency.

Добавить layer Data Quality на map.

---

# 25. RECONCILIATION

Сохранить уже существующую задачу reconciliation.

Для каждого building/floor сравнить:

- live/legacy;
- imported;
- active/inactive;
- rooms;
- objects;
- workplaces;
- SVG;
- editor snapshot;
- mismatches.

Цель:

дать точный statement о том, насколько current active Office Map перенесён.

---

# 26. EMPLOYEE EXPERIENCE

Employee UI должен быть очень простым.

Homepage:

- search;
- map;
- my workplace;
- booking.

No AHO clutter.

### My Workplace

Show:
- building;
- floor;
- room;
- workplace.

Actions:
- show on map;
- release.

### Free desk

Actions:
- Assign myself;
- Book.

Backend self-service MUST use authenticated current user.

No arbitrary employee_id.

---

# 27. UX PRINCIPLES

Интерфейс должен быть максимально простым.

AHO НЕ должны видеть technical terms:

- ZONE_ID;
- TEMPLATE_ID;
- geometry JSON;
- legacy property IDs.

Technical metadata спрятать в secondary details.

Primary labels должны быть human-readable.

Use:
- progressive disclosure;
- sensible defaults;
- large clear actions;
- simple terminology;
- clear empty/error states;
- confirmations only where destructive/important.

Не делать интерфейс «для программиста».

---

# 28. FINAL NAVIGATION

Recommended:

## Employee
- Map
- Search
- My Workplace
- Bookings
- Parking

## Facilities
- Overview
- Map
- Spaces
- Workplaces
- Inventory
- Bookings
- Parking
- Leases
- Areas & Cost
- Data Quality
- History

## Administration
- Buildings
- Import Center
- Responsible Users
- Layout Editor
- Furniture Templates
- Settings

---

# 29. TESTING

Добавить тесты для нового функционала.

## Geometry
- scale calibration;
- polygon area;
- invalid polygon;
- discrepancy calculation.

## Furniture
- custom template creation;
- SVG safety;
- dimensions;
- map placement.

## Lease
- office-only;
- office + common;
- proportional common allocation;
- manual common area;
- overlapping lease periods where invalid;
- rate history;
- historical area/rate calculation;
- expiry status.

## Import
- preview;
- validation;
- diff;
- apply;
- rollback where applicable;
- CSV security.

## Permissions
Employee cannot:
- edit lease;
- edit cost;
- edit furniture;
- edit layout;
- import;
- assign someone else.

AHO/admin permissions as designed.

---

# 30. PERFORMANCE

Use realistic imported data.

Ensure responsive performance for:

- floor map;
- large tables;
- global search;
- inventory;
- workplaces;
- booking availability;
- leases;
- DQ.

Do not load everything into browser unnecessarily.

Use pagination/server filters/indexes where appropriate.

---

# 31. PRESENTATION POLISH

Before finalizing:

- remove obvious developer/debug UI from normal presentation;
- clearly mark local/demo data where necessary;
- use real recovered floor plans where available;
- use human-readable names;
- capture polished screenshots;
- prepare father demo flow.

Update:

- `docs/demo-script-father.md`;
- `docs/project-status-one-page.md`;
- `docs/master-project-checklist.md`;
- `docs/it-questions-final.md`;
- `docs/aho-questions-final.md`;
- `docs/reconciliation-report.md`.

---

# 32. IMPORTANT CONSTRAINTS

Do NOT:

- start over;
- rewrite backend because of hypothetical future stack;
- invent real company parking data;
- invent tariffs;
- invent tenant data;
- invent official area;
- treat inferred scale as confirmed;
- resolve ambiguous legacy assignments by guessing;
- perform production write operations on old portal.

Synthetic/demo data must be clearly marked.

---

# 33. FINAL QUALITY BAR

The final product should feel like:

> a modern internal workplace/facility operating system that an AHO employee can understand without technical training.

Success means:

### Employee
can find people, navigate office, assign/release themselves, book a place.

### AHO
can manage spaces, areas, furniture, inventory, workplaces, parking, leases, costs and quality without Excel for the core workflow.

### Management
can understand occupancy, area, costs and leases.

### Admin
can import new buildings/floors/rooms/furniture and configure the system without changing code.

---

# FINAL RESPONSE

At completion report:

1. what was implemented;
2. screenshots / visual changes;
3. new map interactions;
4. booking-on-map status;
5. furniture library status;
6. calibration/area engine status;
7. Import Center status;
8. new-building workflow;
9. lease module status;
10. common-area allocation models implemented;
11. tests/build results;
12. performance results;
13. remaining engineering gaps;
14. remaining IT dependencies;
15. remaining AHO/business data;
16. final ZIP;
17. whether it is ready to present;
18. whether it is ready for AHO UAT.

Do not call it complete if there are still substantial engineering gaps.