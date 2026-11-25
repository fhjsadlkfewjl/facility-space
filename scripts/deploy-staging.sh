#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mode=${1:-update}
[[ "$mode" == init || "$mode" == update ]] || { echo 'Usage: bash scripts/deploy-staging.sh init|update'; exit 1; }
[[ -f .env.staging ]] || { echo 'Run bash scripts/staging-env.sh first'; exit 1; }
# Never source arbitrary environment files as shell code.
if grep -q 'REPLACE_WITH_' .env.staging; then echo 'Replace placeholder credentials first'; exit 1; fi
bind=$(sed -n 's/^HTTP_BIND=//p' .env.staging)
address=$(sed -n 's/^PUBLIC_ADDRESS=//p' .env.staging)
if [[ "$bind" != 127.0.0.1 && "$address" != https://* ]]; then echo 'Public staging requires HTTPS; refusing public HTTP with real office data'; exit 1; fi
compose=(docker compose --env-file .env.staging -f compose.staging.yaml)
"${compose[@]}" config --quiet
"${compose[@]}" build api web
if [[ "$mode" == update ]]; then
  test -x /usr/local/sbin/facility-ops || { echo 'Install deploy/ops first; unsafe legacy update refused'; exit 1; }
  # Resolve built tags, not running container IDs.
  api_tag=$("${compose[@]}" config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["services"]["api"]["image"])')
  web_tag=$("${compose[@]}" config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["services"]["web"]["image"])')
  api=$(docker image inspect --format '{{.Id}}' "$api_tag")
  web=$(docker image inspect --format '{{.Id}}' "$web_tag")
  exec /usr/local/sbin/facility-ops update --api "$api" --web "$web"
fi
"${compose[@]}" up -d --wait db
# Freeze writers before the backup so rollback does not lose intervening writes.
"${compose[@]}" stop caddy api
# No down -v, truncate, reset or auto-seed.
"${compose[@]}" run --rm --no-deps migrate
if [[ "$mode" == init ]]; then
  "${compose[@]}" --profile setup run --rm --no-deps init-data
fi
"${compose[@]}" up -d --wait --wait-timeout 180
"${compose[@]}" exec -T api node -e "fetch('http://127.0.0.1:3001/health').then(async r=>{if(!r.ok)process.exit(1);console.log(await r.text())})"
"${compose[@]}" ps
if [[ "$bind" == 127.0.0.1 ]]; then echo 'Private staging ready. Use an SSH tunnel; do not share the public IP.'; else echo 'Verify HTTPS and unauthenticated API rejection before sharing the URL.'; fi
