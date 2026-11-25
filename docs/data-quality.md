# Data quality и UAT

Очередь в «Обзор АХО»: missing SVG, unverified scale, rooms without area, invalid geometry, missing/duplicate inventory, furniture outside room, quarantine. Фильтры здания/категории, counts, пагинация 200, map drill-down, CSV. Все записи сейчас needs_review; постоянного workflow resolution нет. Quarantine виден только admin без PII payload; facilities видит управляемые здания.

Классы OFFICE/COMMON/TECHNICAL/OTHER и 14 subtypes поддержаны. Rule-based классификация не изменяет source names. 17 high / 849 medium / 892 unknown. auto_classified=true, needs_review=true; ручной CSV apply отмечает решение пользователя. Числовой номер + workplace даёт medium office; это предположение для проверки.

Quarantine 547 сохранён: 518 employee conflicts в 240 группах; 11 inventory; 17 floor links; 1 inactive. Source employee IDs исключены из переносимого отчёта; регенерировать внутри разрешённого контура. Legacy room/inventory IDs и поля доказательств доступны в evidence/*.json. UF_OFFICE_ID — связь с комнатой; не использовать как building ID или доказательство единственного рабочего места.

Официальные area и meters_per_unit не заменяются inferred scale. Для неизвестного масштаба не выдавать площадь по контуру как официальную. Подтверждённых физических габаритов мебели нет.
