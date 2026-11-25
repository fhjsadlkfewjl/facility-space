# UAT АХО

- [ ] Подтвердить назначения ответственных и scope зданий для facilities.
- [ ] Сверить 19 неактивных этажей и реальные планы; не удалять их по одному FAIL API.
- [ ] Проверить classification 1758 помещений, особенно 892 unknown и medium office.
- [ ] Проверить по каждой группе seating актуальность источника и shared-seat правила; не назначать победителя по department/office совпадению.
- [ ] Подтвердить площади/масштабы с документами и датами; проверить стоимость до первого известного периода (неизвестна).
- [ ] CSV: неверный ID/тип, duplicate строка, preview diff, конкурентное изменение, просроченный preview, повторный apply, отказ без частичного сохранения.
- [ ] Layout: undo/redo/discard/save, два редактора, diff, restore old-as-new; отказ удалить занятое или забронированное место; целостность аудита.
- [ ] Проверить DQ filters/count/export/drill-down и границы доступа.
- [ ] Search→map/focus, подписи комнат, режимы карты, большая реальная подложка.
- [ ] Inventory check/status, workplace enable/disable, booking conflict, parking на согласованных business fixtures.
- [ ] CSV space/inventory/workplace/DQ, formula injection; отсутствие PII в публичных отчётах.
- [ ] Запустить native PostgreSQL + Chromium + Docker/restart/backup restore; записать реальные результаты.
