# HTTPS по IP

Адрес: https://2.29.173.184. Домен для текущего сервера не нужен.

Используется сертификат Let's Encrypt для IP, профиль `shortlived`. Срок текущего сертификата смотрите командами ниже: даты первого выпуска уже не актуальны.

Экран входа публичный; офисные данные и SVG доступны после авторизации. Без токена API возвращает 401. HTTP перенаправляется на HTTPS, кроме запросов проверки сертификата. PostgreSQL и внутренние порты приложения наружу не опубликованы.

## Продление

`facility-cert-renew.timer` запускается в 00:00, 06:00, 12:00 и 18:00 UTC со случайной задержкой до 15 минут. Он вызывает `/usr/local/sbin/facility-cert-renew`: проверку Certbot, перезагрузку сертификата в Caddy и контроль срока. Ошибки записываются в журнал systemd.

Certbot закреплён в контейнере через `/usr/local/sbin/facility-certbot`. Сертификаты находятся в `/etc/letsencrypt`; Caddy читает их без права записи. Сценарий повторяет загрузку сертификата и при отсутствии нового выпуска, чтобы исправить прежний сбой перезагрузки.

## Проверка на сервере

```sh
openssl x509 -in /etc/letsencrypt/live/facility-ip/cert.pem -noout -issuer -dates -ext subjectAltName
systemctl list-timers facility-cert-renew.timer --all
systemctl status facility-cert-renew.timer --no-pager
journalctl -u facility-cert-renew.service -n 40 --no-pager
/usr/local/sbin/facility-certbot certificates
```

Запустить проверку продления вручную:

```sh
systemctl start facility-cert-renew.service
```

Проверить продление на тестовом сервере сертификатов:

```sh
/usr/local/sbin/facility-cert-renew --dry-run
```

Проверить внешний адрес:

```sh
curl -I https://2.29.173.184
curl -o /dev/null -s -w '%{http_code}\n' https://2.29.173.184/api/buildings
```

Ожидаются 200 и 401 соответственно. Для проверки отданного сертификата:

```sh
openssl s_client -connect 2.29.173.184:443 -servername 2.29.173.184 </dev/null 2>/dev/null | openssl x509 -noout -issuer -dates
```


Конфигурация: [Caddyfile](../deploy/staging/Caddyfile), [службы продления](../deploy/staging/ip-https), [Compose](../compose.staging.yaml).

При обновлении приложения сохраняйте `/etc/letsencrypt`, таймер и `.env.staging`. Повторное восстановление базы или выпуск сертификата для обычного обновления не нужны. Доступы выдаются отдельно; [корпоративный вход](auth-integration.md) настраивается с IT.
