# Запуск и эксплуатация

## Пилот

`.env.example` включает demo auth и синтетический seed. Compose привязывает web:8080 и PostgreSQL:5432 к localhost. Перед первым запуском сменить POSTGRES_PASSWORD (для прямого доступа с хоста также корректно закодировать его в DATABASE_URL). Внутри Compose пароль передаётся через PGPASSWORD, поэтому URL-спецсимволы не ломают соединение.

```sh
docker compose up --build -d
docker compose ps
docker compose logs --tail=100 api web
curl --fail http://127.0.0.1:8080/health
```

`/health` проверяет соединение с БД; не подтверждает состояние внешнего Bitrix.

## Production

- NODE_ENV=production, AUTH_MODE=oidc, SEED_DEMO=false. В web build VITE_DEMO_TOKEN должен быть пуст. Backend отказывается запускать demo auth в production.
- Настроить approved identity gateway, OIDC_JWKS_URL (HTTPS), OIDC_ISSUER, OIDC_AUDIENCE. Токен: exp/iat/sub, employee_id, office_role. Для imported employees ID имеет вид `e-<Bitrix ID>`. Frontend token-entry — пилотный механизм, не завершённый SSO клиент.
- Завести migration owner и отдельную API роль. Миграции выполнять `npm run db:migrate` отдельно, boot с RUN_MIGRATIONS=false. Runtime API нужны SELECT/INSERT/UPDATE на доменных таблицах, DELETE только building_managers; audit_log и layout_versions — SELECT/INSERT, без UPDATE/DELETE. У import job отдельные права на import_runs/quarantine.
- Для managed PostgreSQL использовать DATABASE_URL и проверку TLS через доверенный CA. Нельзя выставлять rejectUnauthorized=false. Конфигурация Compose — локальная отправная точка; для production адаптировать роли и secrets, не оставлять POSTGRES_USER API superuser.
- HTTPS/reverse proxy, network policy, резервное копирование/PITR, централизованный сбор логов, ротация ключей, мониторинг readiness/ошибок/размера БД и сроки хранения персональных данных согласуются с IT.
- Все изменения booking/assignment выполняются только через API. Они сериализуются row locks employee → resource; прямые записи в bookings обходят сервисную проверку пересечений. Поэтому доступ прямой записи выдаётся только сервису/миграциям. Встроенные FK/check/unique защищают структуру и постоянные назначения.

## Backup / restore (локальный пример)

```sh
mkdir -p work
docker compose exec -T db pg_dump -U office -d office -Fc > work/facility.backup
# Восстанавливать сначала в отдельную проверочную БД; не затирать рабочую.
docker compose exec db createdb -U office office_restore_check
docker compose exec -T db pg_restore -U office -d office_restore_check < work/facility.backup
```

Не хранить реальные дампы, staging, токены и .env в Git. Отчёты quarantine тоже внутренние данные. Проверять backup восстановлением, а не только наличием файла.

## Миграция

Начальная загрузка только в пустую доменную БД. При DATABASE_URL dry-run применяет schema migrations, но откатывает импортируемые данные; без DATABASE_URL работает в изолированной PGlite. `--apply` необходим для сохранения. После cutover OFFICE_MAP не перезаписывает новый master. Повтор того же snapshot hash идемпотентен.

SVG legacy file IDs сохраняются, сами файлы в SQL отсутствуют. До подтверждения масштаба расчётная площадь NULL. Размеры мебели неизвестны до сверки: сервер блокирует проверяемое перемещение, если не может доказать отсутствие столкновений. Для reconciliation можно передать batch layout с подтверждёнными размерами всех объектов этажа; UI позволяет править размеры отдельных объектов, но не заменяет такой массовый этап.

## Технические основания

Транзакционные проверки используют [row locks PostgreSQL](https://www.postgresql.org/docs/17/explicit-locking.html). SVG отображается только как изображение, с дополнительным серверным ограничением элементов/атрибутов; см. [SVG image context](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image).
