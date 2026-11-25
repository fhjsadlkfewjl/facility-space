# Security review: подтверждённый объём

Legacy: только getEditorData/searchUser/getPopupData, последовательные same-origin запросы текущей авторизованной сессии. Ни один production write action не вызывался. Cookies/tokens не экспортировались. Сохранены schema-only evidence.

Приложение: параметризованные SQL, Zod validation, bounded JSON и SVG/polygon, sanitizer SVG, CSV escaping/formula protection, role/building checks, optimistic version checks и транзакционные блокировки. CSV preview привязан к actor, имеет TTL и одноразовый apply; изменившиеся данные отклоняются. Audit/layout history DB triggers отклоняют UPDATE/DELETE/TRUNCATE. Superuser/владелец БД может изменить схему: это не WORM-хранилище.

Тесты включают SQL-like search input, unsafe SVG, CSV injection, malformed JSON/oversize, permissions и попытки изменить историю. Тесты не доказывают отсутствие всех XSS/IDOR/concurrency bugs. Полный pentest, external auth review и native concurrent verification остаются.

Local demo credentials предназначены только для synthetic local demo. Для production нужны отдельный runtime DB role без DDL, secret management, TLS, проверенный SSO adapter, policy доступа и retention. Текущая identity adapter не является готовой корпоративной интеграцией.

Архив собирается allowlist: без SQL/HAR/staging/DB/node_modules/raw employee reports/.env. Проверяются исходные ФИО, credential signatures и чувствительные поля evidence. Synthetic demo имена в seed/tests сохранены и не являются сотрудниками источника.
