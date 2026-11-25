#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ ! -e .env.staging ]] || { echo '.env.staging already exists; left unchanged'; exit 1; }
umask 077
password=$(openssl rand -hex 32)
token=$(openssl rand -hex 32)
(set -o noclobber; cat > .env.staging <<ENV
POSTGRES_DB=facility_staging
POSTGRES_USER=facility
POSTGRES_PASSWORD=$password
DEMO_TOKEN=$token
PUBLIC_ADDRESS=:80
IMAGE_TAG=current
HTTP_BIND=127.0.0.1
ENV
)
echo 'Created .env.staging (0600). Values are not printed.'
