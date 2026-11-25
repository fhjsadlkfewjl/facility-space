# Исходный код Facility Space

Закрытый репозиторий текущего приложения: интерфейс сотрудников и АХО, сервер, миграции базы, тесты, развёртывание и резервирование.

**Рабочая база, сотрудники, реальные SVG-планы, снимки старого портала, пароли и резервные копии не входят в Git.** Сайт на сервере продолжает использовать свои данные. Клонирование репозитория не копирует рабочий сервер.

Для разработчика: Node.js 24, Python 3, `npm ci`, `npm run build`, `npm run test:source`. Локальный запуск на тестовых данных описан ниже. `npm test` включает четыре дополнительные группы проверок, которым нужны отдельно передаваемые исходные данные `evidence/`.

Эксплуатация и резервирование: [инструкция](docs/operations-ru.md). Инструкция пользователям: [сотрудники и АХО](docs/user-guide/facility-space-guide-ru.md). Корпоративный вход: [интеграция](docs/auth-integration.md).

Ниже сохранены предыдущие заметки проекта; упоминаемые в них приватные данные и отчёты могут отсутствовать в репозитории.

---

> Обновление 15.11.2026: [реализовано и оставшиеся задачи](docs/corporate-update-20261115.md), [проверки](docs/validation-20261115/environment.md). Прочитайте этот статус перед оценкой готовности к эксплуатации.

# Facility Space

Продолжен существующий Fastify + React + PostgreSQL проект. Актуальный статус: **11 ноября 2026** — [одна страница](docs/project-status-one-page.md), [проверки](docs/validation-final.md), [чеклист](docs/master-project-checklist.md), [демонстрация](docs/demo-script-father.md).

Восстановлен последний архив `facility-space-2026-10-15-continuation.zip` из iCloud-копии предыдущего Work-чата «Продолжить Facility Space». SHA-256 исходного архива: `564eec8b5b6d2d4c1cc294cc99bdae16c5694e802cd4494ba53cf8564367f415`.

Сверены 58 активных этажей с 58 SVG и 58 editor snapshots; 19 этажей неактивны. Среди 4 294 объектов live snapshot сопоставлены 4 262; 32 live-only и 90 legacy-only объектов требуют сверки. Это не утверждение о 100% совпадении объектов и не live sync. [Построчный отчёт](docs/reconciliation-report.md).

Добавлены отдельные employee self-service endpoints, явное подтверждение переноса, сохраняемая обработка Data Quality, история классификации, сортировка таблиц, переходы на карту и bulk enable/disable рабочих мест. Quarantine остаётся 547. Проект готов к ограниченной демонстрации; оставшиеся инженерные и внешние задачи перечислены честно.

## Быстрый запуск на синтетических данных

Нужны Node >=22.12 и Python 3.

```sh
npm ci
npm run build
npm run test:source
npm run test:python
npm run demo
```

Во втором терминале:

```sh
VITE_DEMO_TOKEN=local-demo-token-only npm run dev -w @office/web
```

Открыть http://127.0.0.1:5173 и выбрать «Администратор». Демо хранится в памяти и сбрасывается после остановки. Вход локального пилота не является корпоративным SSO; не публиковать этот режим наружу. `.env.example` и `compose.yaml` содержат только локальные демонстрационные настройки.

## Импорт своей redacted staging

В ZIP нет исходного SQL, staging, БД и проекций сотрудников. Нормализованные SVG/геометрия и обезличенные reconciliation IDs находятся в `evidence/` и `docs/recovery/`.

```sh
mkdir -p work
python3 scripts/extract_bitrix.py /path/portal_prod_redacted.sql work/staging.json
npm run import:local -- work/staging.json work/import-db --har-evidence evidence/har-renderable-data.json
npm run verify:local-import -- work/staging.json work/import-db
npm run local -- work/import-db
```

Выбирать новый пустой каталог БД для нового snapshot. Frontend запускается как выше. `local` добавляет synthetic local-reviewer и не выдаёт его за импортированного сотрудника. Импорт не обращается к production. Запуск `assets:prepare` воспроизводит нормализацию сохранённых SVG; повторный сбор не требуется.

## Проверки

`npm run build`; `npm test`; `npm run test:python`. Для полного browser suite: остановить локальные серверы, `npx playwright install chromium`, `npm run test:e2e`. Native concurrency требует отдельной тестовой PostgreSQL: `TEST_DATABASE_URL=... npm test`. Тест создаёт собственную временную схему. Не использовать production credentials. Docker/CI: `.github/workflows/ci.yml`.

В этой сессии 53 теста приложения PASS, 1 native SKIP; 5 Python PASS; build и реальный идемпотентный импорт PASS. Chromium блокируется macOS MachPortRendezvous; native PostgreSQL — shmget; Docker отсутствует. Встроенный браузер проверил массовый inventory и select/rotation/undo/redo/discard на реальной карте. Это не заменяет полный E2E.

## Основные сценарии

- Помещения: классы/subtypes, учётные и расчётные площади, room/floor/building summaries, м²/человека и м²/место, data quality.
- Inventory: поиск, фильтры, missing/duplicate codes, одиночная и массовая проверка до 200 строк, CSV.
- Workplaces: назначить/перенести/освободить, история, доступность, брони/конфликты/отмена.
- Parking: zones/spots/vehicles/assignment/booking/pricing на synthetic data.
- Costs: scopes, периоды, закрытие ставки с аудитом, расчёт на дату. История площадей и расчёт на дату реализованы; история размещения/типа комнаты ещё не моделируется.
- Editor: SVG background/furniture, pan/zoom/select/drag/resize/rotate, UI snap30, произвольный backend angle, duplicate/archive, containment/collision, undo/redo, save/discard, optimistic versioning, full-layout diff/restore как новая версия с проверками конфликтов.

Документы: [current model](docs/current-model.md), [target model](docs/target-model.md), [migration map](docs/migration-map.md), [sync](docs/sync-strategy.md), [scope](docs/product-scope.md), [assumptions](docs/assumptions.md). Исторические отчёты остаются в исходной рабочей копии; переносимый архив включает актуальные документы.

Новые разделы: [legacy API](docs/legacy-api.md), [auth](docs/auth-integration.md), [security](docs/security.md), [data quality](docs/data-quality.md), [UAT](docs/uat-checklist.md). Незавершённая инженерная работа перечислена отдельно в gap-list; весь backlog закрытым не объявляется.

## Продолжение этого локального пилота

В текущем рабочем каталоге рядом с исходниками сохранена отдельная приватная БД `../private-pilot-db` с реальным импортом. Она **не входит в ZIP**. Для просмотра на этом компьютере:

```sh
npm run local -- ../private-pilot-db
```

Затем запустите frontend по инструкции выше. Для переносимого ZIP по умолчанию доступны синтетическое демо и реальные SVG/evidence; персональная проекция сотрудников и локальные БД не распространяются. Для нового импорта используйте разрешённый staging и новый пустой каталог БД.

Дополнительная проверка реальной карты после подготовки приватной БД:

```sh
PW_CHROMIUM_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npx playwright test -c playwright.real.config.ts
```

Основные self-service endpoints: `GET /api/me/workplace`, `POST /api/me/workplace`, `POST /api/me/workplace/release`. Они не принимают employeeId. Общий `/api/assignments` предназначен для Facilities/Admin. Операция переноса требует ожидаемый assignment ID и явное подтверждение.
