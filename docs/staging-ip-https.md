# Доступ к Facility Space по IP — 15.11.2026

Адрес: https://2.29.173.184

Вход: существующий экран Access token → Войти. Готовый ключ администратора сохранён только в локальном `backups/staging-owner-access.txt` (0600, исключён из пакета/git). Владелец этого ключа имеет полный доступ к staging. На VPS исходный ключ находится в `/opt/facility-space/.env.staging`, поле DEMO_TOKEN; для входа добавляется `:admin`, для АХО `:facilities`, для сотрудника `:employee`. Не добавлять ключ в URL.

Публично доступен экран входа; данные зданий, сотрудников и SVG требуют авторизации. Без ключа API возвращает 401. HTTP перенаправляется на HTTPS, кроме ACME challenge. PostgreSQL, API:3001 и frontend:8080 не опубликованы. Продукт и прикладные данные не менялись.

## Сертификат и продление

Публично доверенный Let's Encrypt IP certificate, issuer YE1, SAN IP Address:2.29.173.184. Первый сертификат действителен до 21.11.2026 23:49:25 UTC. Chromium встроенного браузера открыл экран входа без предупреждений; curl и системный TLS trust прошли без insecure-флагов.

Certbot 5.10.0 закреплён по Docker digest в `/usr/local/sbin/facility-certbot`. Использованы production ACME endpoint и профиль `shortlived`, webroot `/var/www/certbot`. Приватный ключ остаётся на VPS в `/etc/letsencrypt`, Caddy подключает директорию только для чтения. Caddy не выпускает собственный сертификат: auto_https off, явные пути сертификата и ключа, default_sni для доступа по IP через Docker NAT.

`facility-cert-renew.timer`: каждый день в 00:00, 06:00, 12:00, 18:00 UTC плюс случайная задержка до 15 минут, Persistent=true. Запускает `/usr/local/sbin/facility-cert-renew`: certbot renew, затем обязательный `caddy reload --force` и проверку остатка срока. Reload выполняется также при успешной проверке без нового выпуска, чтобы повторить предыдущую неудачную загрузку. Ошибки отмечаются как failed в systemd journal. Тест `--dry-run` успешно выпустил тестовый сертификат и выполнил reload, не заменяя действующий production-сертификат.

## Команды на VPS (root)

```sh
openssl x509 -in /etc/letsencrypt/live/facility-ip/cert.pem -noout -issuer -dates -ext subjectAltName
systemctl list-timers facility-cert-renew.timer --all
systemctl status facility-cert-renew.timer --no-pager
journalctl -u facility-cert-renew.service -n 40 --no-pager
/usr/local/sbin/facility-certbot certificates
```

Ручная проверка/продление, только если пора:

```sh
systemctl start facility-cert-renew.service
```

Проверка полного механизма на тестовом ACME:

```sh
/usr/local/sbin/facility-cert-renew --dry-run
```

Проверка внешнего адреса без отключения доверия:

```sh
curl -I https://2.29.173.184
curl -o /dev/null -s -w '%{http_code}\n' https://2.29.173.184/api/buildings
```

Ожидаются 200 и 401 соответственно. Для проверки отданного сертификата:

```sh
openssl s_client -connect 2.29.173.184:443 -servername 2.29.173.184 </dev/null 2>/dev/null | openssl x509 -noout -issuer -dates
```

Рабочие конфигурации скопированы обратно в проект: compose.staging.yaml, deploy/staging/Caddyfile и deploy/staging/ip-https/. Обновление приложения не требует повторного выпуска сертификата. Сохранять /etc/letsencrypt, systemd timer и .env.staging. Не запускать заново восстановление базы.

Официальный способ: https://letsencrypt.org/2026/03/11/shorter-certs-certbot.html
