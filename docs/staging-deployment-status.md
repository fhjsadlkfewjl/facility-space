> Обновление 15.11.2026: HTTPS по IP уже включён, домен не нужен. Актуальная инструкция: [staging-ip-https.md](staging-ip-https.md). Прежние указания о необходимости домена и закрытом loopback-запуске ниже — исторические.

# VPS deployment — 15 November 2026

Deployed the prepared exact snapshot to root@2.29.173.184:/opt/facility-space using SSH/rsync. All 82 allowlisted file hashes verified before build. No anonymization, synthetic seed or business-data edits.

API/web Docker images built on VPS. PostgreSQL migrations and initial restore succeeded; full application-table hashes and foreign-key relationships matched the snapshot. Original 58 floor SVGs, employee directory, assignments, 4 bookings and history retained. Only migration application timestamps describe the new installation.

API, web and PostgreSQL healthy; Caddy running. Host bindings are 127.0.0.1:80 and 127.0.0.1:443 only. API and PostgreSQL have no published ports. Firewall unchanged. Secrets generated on VPS in .env.staging (0600), not printed or uploaded from Mac.

Read-only HTTP checks: frontend/health 200, unauthenticated buildings/layout 401; admin/facilities/employee authenticate as existing local-reviewer and load an original imported floor. No test assignment/booking mutations performed.

Pending: user registers a domain, adds an A record pointing to 2.29.173.184, then HTTPS can be configured and access verified before sharing the link. No publicly accessible owner URL yet.
