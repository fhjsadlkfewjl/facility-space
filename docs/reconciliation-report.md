# Office Map → Facility Space reconciliation

Verified 2026-11-11T10:10:45.280Z. Recovered October 2026 snapshots; no new live portal reads in this run.

Active floors: **58**; active floors with recovered editor snapshots: **58**; active floors with SVG: **58**. Inactive legacy floors: **19**. These are snapshot migration coverage figures, not a claim of current live synchronization.

Import counts: {"buildings":14,"floors":77,"rooms":1758,"furniture":4670,"workplaces":4130,"workplace_assignments":2338,"employees_projection":35649,"migration_quarantine":547}. Second import preserved counts.

Room and workplace counts come from the legacy database and imported database. Editor snapshots establish object geometry, not an independent live room or workplace census. All differences remain listed; no ambiguous occupant is guessed. Inactive floors are retained for legacy traceability and excluded from active floor navigation.

Active-floor object comparison: 4262/4294 live objects match legacy objects (99.25%). 32 live-only objects are not imported without authoritative legacy context. 90 imported legacy objects are absent from the live snapshot and are retained for review. This is not 100% object reconciliation.

|Building|Legacy floor|Active|Imported floor|Rooms legacy/import|Objects legacy/live/import|Workplaces legacy/import|SVG|Editor|Mismatches|
|---|---|---|---|---|---|---|---|---|---|
|БЦ «АЛЬФА»|108755 9|INACTIVE|fl-108755|30/30|3/unavailable/3|3/3|no|no|none in compared fields|
|БЦ «АЛЬФА»|108757 8|ACTIVE|fl-108757|31/31|153/145/153|134/134|yes|yes|legacy objects absent from live snapshot; live-only objects|
|БЦ «АЛЬФА»|108758 6|ACTIVE|fl-108758|30/30|158/157/158|147/147|yes|yes|legacy objects absent from live snapshot|
|БЦ «АЛЬФА»|108759 5|ACTIVE|fl-108759|30/30|224/222/224|143/143|yes|yes|legacy objects absent from live snapshot|
|БЦ «АЛЬФА»|108760 7|ACTIVE|fl-108760|30/30|144/143/144|142/142|yes|yes|legacy objects absent from live snapshot|
|БЦ «АЛЬФА»|108761 4|ACTIVE|fl-108761|28/28|149/148/149|128/128|yes|yes|legacy objects absent from live snapshot|
|БЦ «АЛЬФА»|108762 3|ACTIVE|fl-108762|27/27|164/163/164|158/158|yes|yes|legacy objects absent from live snapshot|
|БЦ «АЛЬФА»|108764 2|ACTIVE|fl-108764|19/19|67/66/67|66/66|yes|yes|legacy objects absent from live snapshot; live-only objects|
|БЦ «АЛЬФА»|108766 1|ACTIVE|fl-108766|24/24|48/48/48|47/47|yes|yes|none in compared fields|
|БЦ «АСТРА»|112362 1|ACTIVE|fl-112362|26/26|25/25/25|24/24|yes|yes|none in compared fields|
|БЦ «АСТРА»|112398 2|ACTIVE|fl-112398|38/38|147/147/147|124/124|yes|yes|none in compared fields|
|БЦ «АСТРА»|112437 3|ACTIVE|fl-112437|36/36|177/176/177|167/167|yes|yes|legacy objects absent from live snapshot|
|БЦ «АСТРА»|112474 4|ACTIVE|fl-112474|22/22|81/74/81|77/77|yes|yes|legacy objects absent from live snapshot; live-only objects|
|БЦ «АСТРА»|112497 5|ACTIVE|fl-112497|23/23|64/61/64|57/57|yes|yes|legacy objects absent from live snapshot|
|БЦ «АСТРА»|112519 6|ACTIVE|fl-112519|21/21|89/88/89|86/86|yes|yes|legacy objects absent from live snapshot|
|БЦ «АСТРА»|112541 7|INACTIVE|fl-112541|27/27|84/unavailable/84|77/77|no|no|none in compared fields|
|БЦ «АСТРА»|112570 8|ACTIVE|fl-112570|21/21|81/80/81|77/77|yes|yes|legacy objects absent from live snapshot|
|БЦ «АСТРА»|112592 10|INACTIVE|fl-112592|14/14|35/unavailable/35|31/31|no|no|none in compared fields|
|БЦ «АСТРА»|113029 9|ACTIVE|fl-113029|20/20|1/1/1|1/1|yes|yes|none in compared fields|
|БЦ «ТЕРРА»|113393 1 старая|INACTIVE|fl-113393|4/4|2/unavailable/2|1/1|no|no|none in compared fields|
|БЦ «ТЕРРА»|113398 2 старая |INACTIVE|fl-113398|2/2|15/unavailable/15|14/14|no|no|none in compared fields|
|БЦ «ТЕРРА»|113401 3|ACTIVE|fl-113401|9/9|1/1/1|1/1|yes|yes|none in compared fields|
|БЦ «ТЕРРА»|113402 4|ACTIVE|fl-113402|18/18|23/19/23|23/23|yes|yes|legacy objects absent from live snapshot|
|БЦ «ТЕРРА»|113403 5|ACTIVE|fl-113403|0/0|0/0/0|0/0|yes|yes|none in compared fields|
|БЦ «ТЕРРА»|113404 6|ACTIVE|fl-113404|11/11|84/67/84|74/74|yes|yes|legacy objects absent from live snapshot|
|БЦ «ТЕРРА»|113415 7 старая|INACTIVE|fl-113415|10/10|4/unavailable/4|2/2|no|no|none in compared fields|
|БЦ «ТЕРРА»|113426 8|ACTIVE|fl-113426|22/22|107/106/107|101/101|yes|yes|legacy objects absent from live snapshot; live-only objects|
|БЦ «ТЕРРА»|216862 1|ACTIVE|fl-216862|14/14|76/65/76|64/64|yes|yes|legacy objects absent from live snapshot; live-only objects|
|БЦ «ТЕРРА»|217114 2|ACTIVE|fl-217114|13/13|20/20/20|19/19|yes|yes|none in compared fields|
|БЦ «ТЕРРА»|217144 7|ACTIVE|fl-217144|13/13|59/59/59|55/55|yes|yes|legacy objects absent from live snapshot; live-only objects|
|БЦ «МОДУЛЬ»|231241 1|ACTIVE|fl-231241|4/4|59/59/59|53/53|yes|yes|none in compared fields|
|БЦ «МОДУЛЬ»|231245 2|ACTIVE|fl-231245|6/6|37/37/37|36/36|yes|yes|none in compared fields|
|БЦ «МОДУЛЬ»|231252 4|ACTIVE|fl-231252|10/10|69/69/69|57/57|yes|yes|none in compared fields|
|БЦ «МОДУЛЬ»|267538 5|INACTIVE|fl-267538|2/2|84/unavailable/84|76/76|no|no|none in compared fields|
|БЦ «СЕРВИС»|267576 Цоколь|ACTIVE|fl-267576|27/27|1/1/1|1/1|yes|yes|none in compared fields|
|БЦ «СЕРВИС»|267577 1|ACTIVE|fl-267577|15/15|79/87/79|57/57|yes|yes|legacy objects absent from live snapshot; live-only objects|
|БЦ «СЕРВИС»|267578 2|INACTIVE|fl-267578|22/22|30/unavailable/30|19/19|no|no|none in compared fields|
|БЦ «СЕРВИС»|267579 3|ACTIVE|fl-267579|23/23|72/75/72|44/44|yes|yes|live-only objects|
|БЦ «МОДУЛЬ»|279266 44|INACTIVE|fl-279266|10/10|0/unavailable/0|0/0|no|no|none in compared fields|
|БЦ «МОДУЛЬ»|279277 55старый|INACTIVE|fl-279277|5/5|0/unavailable/0|0/0|no|no|none in compared fields|
|БЦ «МОДУЛЬ»|280972 11|INACTIVE|fl-280972|3/3|0/unavailable/0|0/0|no|no|none in compared fields|
|БЦ «МОДУЛЬ»|280976 22|INACTIVE|fl-280976|6/6|0/unavailable/0|0/0|no|no|none in compared fields|
|БЦ «МОДУЛЬ»|280983 44|INACTIVE|fl-280983|10/10|0/unavailable/0|0/0|no|no|none in compared fields|
|БЦ «МОДУЛЬ»|280994 5|ACTIVE|fl-280994|10/10|67/63/67|61/61|yes|yes|legacy objects absent from live snapshot|
|БЦ «СЕРВИС»|281343 2|ACTIVE|fl-281343|22/22|83/86/83|57/57|yes|yes|legacy objects absent from live snapshot; live-only objects|
|БЦ "ФАКТУРА"|281804 3|ACTIVE|fl-281804|9/9|46/46/46|46/46|yes|yes|none in compared fields|
|БЦ «АСТРА»|281990 10|ACTIVE|fl-281990|14/14|33/33/33|29/29|yes|yes|none in compared fields|
|БЦ «АСТРА»|282464 7|ACTIVE|fl-282464|28/28|88/85/88|82/82|yes|yes|legacy objects absent from live snapshot|
|БЦ "С-КЛАССИК"|283788 1|ACTIVE|fl-283788|11/11|28/26/28|27/27|yes|yes|legacy objects absent from live snapshot|
|БЦ "С-КЛАССИК"|283799 2|ACTIVE|fl-283799|8/8|32/32/32|32/32|yes|yes|none in compared fields|
|БЦ "С-КЛАССИК"|283809 3|INACTIVE|fl-283809|11/11|26/unavailable/26|24/24|no|no|none in compared fields|
|БЦ «ТЕРРА»|296125 777|INACTIVE|fl-296125|9/9|0/unavailable/0|0/0|no|no|none in compared fields|
|БЦ «ТЕРРА»|296573 77|INACTIVE|fl-296573|10/10|0/unavailable/0|0/0|no|no|none in compared fields|
|БЦ «ТЕРРА»|303551 10|INACTIVE|fl-303551|19/19|35/unavailable/35|35/35|no|no|none in compared fields|
|БЦ «ТЕРРА»|306990 9|ACTIVE|fl-306990|5/5|51/51/51|51/51|yes|yes|none in compared fields|
|Штаб №1|310224 1|ACTIVE|fl-310224|83/83|160/160/160|139/139|yes|yes|none in compared fields|
|Штаб №2|310278 2|ACTIVE|fl-310278|87/87|120/120/120|93/93|yes|yes|none in compared fields|
|Штаб №1|310482 2|ACTIVE|fl-310482|144/144|150/150/150|102/102|yes|yes|none in compared fields|
|Штаб №2|310534 1|ACTIVE|fl-310534|122/122|124/124/124|112/112|yes|yes|none in compared fields|
|БЦ «АСТРА»|329451 11|INACTIVE|fl-329451|21/21|0/unavailable/0|0/0|no|no|none in compared fields|
|БЦ "Декабрист"|342751 3|ACTIVE|fl-342751|30/30|134/134/134|108/108|yes|yes|none in compared fields|
|БЦ «АСТРА»|359678 61|INACTIVE|fl-359678|48/48|0/unavailable/0|0/0|no|no|none in compared fields|
|БЦ "Декабрист"|370666 1|ACTIVE|fl-370666|12/12|61/59/61|61/61|yes|yes|legacy objects absent from live snapshot|
|БЦ "Декабрист"|370668 2|ACTIVE|fl-370668|0/0|0/0/0|0/0|yes|yes|none in compared fields|
|БЦ "Декабрист"|370669 4|ACTIVE|fl-370669|20/20|108/108/108|107/107|yes|yes|none in compared fields|
|БЦ "Декабрист"|370670 5|ACTIVE|fl-370670|21/21|116/116/116|115/115|yes|yes|none in compared fields|
|БЦ "Декабрист 2"|376386 1|ACTIVE|fl-376386|6/6|23/23/23|23/23|yes|yes|none in compared fields|
|БЦ "Декабрист 2"|376388 2|ACTIVE|fl-376388|7/7|17/17/17|17/17|yes|yes|none in compared fields|
|БЦ "Вега"|376412 1|ACTIVE|fl-376412|5/5|64/64/64|64/64|yes|yes|none in compared fields|
|БЦ «МОДУЛЬ»|407240 3 |ACTIVE|fl-407240|7/7|4/4/4|0/0|yes|yes|none in compared fields|
|Титул 7300|415371 1|ACTIVE|fl-415371|49/49|2/2/2|2/2|yes|yes|none in compared fields|
|Титул 7300|415373 2|ACTIVE|fl-415373|33/33|76/76/76|70/70|yes|yes|none in compared fields|
|Титул 7300|415374 3|ACTIVE|fl-415374|36/36|83/83/83|82/82|yes|yes|none in compared fields|
|Титул 7300|415375 4|ACTIVE|fl-415375|35/35|87/87/87|85/85|yes|yes|none in compared fields|
|Титул 7000|415697 1|ACTIVE|fl-415697|21/21|19/19/19|17/17|yes|yes|none in compared fields|
|Титул 7000|415698 2|ACTIVE|fl-415698|25/25|56/56/56|50/50|yes|yes|none in compared fields|
|Титул 7300|437395 5|ACTIVE|fl-437395|34/34|61/61/61|53/53|yes|yes|none in compared fields|

Machine-readable evidence: [reconciliation-evidence.json](reconciliation-evidence.json). It includes building mappings, snapshot hashes, per-floor counts and unmatched object IDs. Quarantine remains a separate unresolved business-data queue; workflow statuses do not remove quarantine records.

## Обновление 15 ноября 2026

Новый функционал не выполнял повторный импорт и не обращался с записью к старому порталу. Поэтажная таблица выше остаётся сверкой сохранённых исходных снимков, а не новым live-аудитом. Базовые 58 активных / 19 неактивных legacy-этажей не изменены.

В сохранённой локальной базе есть пользовательские дополнения: всего 15 зданий и 78 этажей против 14 и 77 в исходном импорте. Их нельзя считать дополнительно восстановленными legacy-этажами. Проверка резервной копии: 1758 помещений, 4670 предметов мебели, 4130 ресурсов рабочих мест, 35650 учётных записей (включая локальную проверочную личность), 2346 записей истории назначений и 547 записей карантина. Эти полные количества включают неактивные записи и историю; они не равны числу объектов на активных экранах.

Машинные данные проверки сохранности: [backup-restore.json](validation-20261115/backup-restore.json). Оригинальное поэтажное доказательство: [reconciliation-evidence.json](reconciliation-evidence.json).
