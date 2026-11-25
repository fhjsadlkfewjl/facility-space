# Product scope

Основной пользователь — АХО: обзор здания/этажа/помещения, классификация и площади, рабочие места и инвентарь, бронирования, доступность, качество миграции, стоимость, редактор, аудит и CSV. Employee-facing возможности сохранены в прежнем объёме.

Доступны: official/calculated area, m²/person/workplace, missing/duplicate inventory, assignment/reassign/release/history, booking conflicts/cancel, synthetic parking/vehicle/rates, cost scopes/validity/date, layout versions и geometry restore. Массовая проверка инвентаря ограничена 200 выбранными строками; атомарная операция с аудитом.

Реальные floor SVG и мебель показаны по captured evidence. Unknown geometry/scale остаются неизвестными. Данные live и SQL имеют разные даты: карта не доказывает актуальность назначений сотрудников.

Не включены: полноценная историческая финансовая модель площадей, recurrence/meeting-room booking, общий bulk editor всех справочников, полный rollback topology, автоматический двусторонний Bitrix sync и корпоративный SSO без контракта. Точный остаток — gap-list.md.
