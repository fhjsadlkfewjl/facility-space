# Обновление 2026-10-15 — имеет приоритет над предыдущим описанием

Изолированный replay одного snapshot подтверждён. Классификация/area history не дают права перезаписывать ручные данные при новом snapshot. Для changed snapshot нужен explicit reconciliation, conflicts review и transactional apply. Live Bitrix write sync не реализован и не выполнялся.

---

# Синхронизация

Текущий режим — локальный snapshot import. SQL извлекается офлайн; getEditorData и SVG читаются последовательно в авторизованной браузерной сессии. Защитные механизмы браузера не обходятся. Генератор `scripts/editor-requests.mjs` работает offline и создаёт dry-run collector. `collectEditorData({execute:true,authorized:true,skipMissing:true})` может пропускать только точный ответ «Этаж не найден»; остальные ошибки останавливают сбор. Export сохраняется до закрытия вкладки. Owner/popup поля исключаются из новых collector exports.

Нормализация сохранённого RESULT: `python3 scripts/extract-editor-snapshot.py capture.json staging.json evidence-output --assets assets.json`. Это offline преобразование, не live API connector. Полученные файлы проверяются harSchema/safeSvg при импорте. Скрипт `reconcile-evidence.ts` выдаёт различия по legacy IDs без сотрудников.

Идемпотентный replay одинакового SQL snapshot проверен. Автоматического merge нового SQL, soft delete не наблюдавшихся объектов и синхронизации employees нет. Capture от 15 октября новее SQL snapshot: назначения остаются snapshot-проекцией и не объявляются текущей рассадкой.

Целевой sync: IT предоставляет согласованный read-only источник сотрудников/оргструктуры и справочников; staging diff → review conflicts → явное применение → audit. Локальные manual overrides, deletion/tombstone и shared-seat правила должны быть согласованы. До этого источник не перезаписывает runtime правки. Никакие Bitrix endpoints, SSO claims или тарифы не придуманы.
