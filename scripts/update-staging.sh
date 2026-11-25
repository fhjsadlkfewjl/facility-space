#!/usr/bin/env bash
# Code-only update of the EXISTING VPS. Never copies data, credentials or TLS config.
set -euo pipefail
cd "$(dirname "$0")/.."
release="pilot-$(date -u +%Y%m%dT%H%M%SZ)"
ssh_cmd=(ssh -o UseKeychain=yes -o BatchMode=yes root@2.29.173.184)
npm run build
package=$(mktemp -d /tmp/facility-code.XXXXXX)
python3 - "$package" <<'PY'
from pathlib import Path
import shutil,sys,hashlib,json
out=Path(sys.argv[1]); files=['package.json','package-lock.json','tsconfig.json','tsconfig.staging.json','apps/api/package.json','apps/web/package.json','apps/web/index.html','apps/web/vite.config.ts','packages/shared/package.json','scripts/migrate.ts','scripts/sql-statements.ts','scripts/staging-init.ts','scripts/deploy-staging.sh','deploy/staging/Dockerfile.api','deploy/staging/Dockerfile.web','deploy/staging/nginx.conf','.dockerignore']
for d in ['apps/api/src','apps/web/src','packages/shared/src','db/migrations']:
 files += [str(p) for p in Path(d).rglob('*') if p.is_file()]
manifest={}
for name in files:
 p=Path(name)
 if p.is_symlink():raise SystemExit('Symlinks are not supported: '+name)
 q=out/p;q.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,q);q.chmod(0o644);manifest[name]=hashlib.sha256(q.read_bytes()).hexdigest()
(out/'code-checksums.json').write_text(json.dumps(manifest))
PY
"${ssh_cmd[@]}" "test -f /opt/facility-space/.env.staging && install -d -m 700 /opt/facility-space/incoming/$release"
rsync -az -e 'ssh -o UseKeychain=yes -o BatchMode=yes' "$package/" "root@2.29.173.184:/opt/facility-space/incoming/$release/"
# The remote script is a file: Docker commands cannot consume SSH script stdin.
cat > "$package/apply.sh" <<'REMOTE'
#!/usr/bin/env bash
set -euo pipefail
release=$1
[[ "$release" =~ ^pilot-[0-9]{8}T[0-9]{6}Z$ ]]
cd /opt/facility-space
exec 9>/run/lock/facility-staging-update.lock
flock -n 9 || { echo "Another code update is running"; exit 1; }
umask 077
export RELEASE="$release"
test -x /usr/local/sbin/facility-ops
python3 - <<'PYVERIFY'
from pathlib import Path
import os,json,hashlib
inc=Path('incoming')/os.environ['RELEASE'];m=json.loads((inc/'code-checksums.json').read_text())
for n,h in m.items():
 p=Path(n)
 assert not p.is_absolute() and '..' not in p.parts
 assert hashlib.sha256((inc/p).read_bytes()).hexdigest()==h,n
PYVERIFY
# Build in a separate directory. Existing source, images and database stay in place.
incoming="/opt/facility-space/incoming/$release"
docker build -f "$incoming/deploy/staging/Dockerfile.api" -t "facility-space-staging-api:$release" "$incoming"
docker build -f "$incoming/deploy/staging/Dockerfile.web" -t "facility-space-staging-web:$release" "$incoming"
api=$(docker image inspect --format '{{.Id}}' "facility-space-staging-api:$release")
web=$(docker image inspect --format '{{.Id}}' "facility-space-staging-web:$release")
/usr/local/sbin/facility-ops update --api "$api" --web "$web"
python3 - <<'PY'
from pathlib import Path
import os,json,shutil
root=Path.cwd();inc=root/'incoming'/os.environ['RELEASE'];m=json.loads((inc/'code-checksums.json').read_text())
# Synchronise only source directories, including removal of obsolete source files.
for n in ['apps/api/src','apps/web/src','packages/shared/src','db/migrations']:
 shutil.rmtree(root/n)
for n in m:
 p=root/n;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(inc/n,p);p.chmod(0o644)
 for parent in p.parents:
  if parent==root:break
  parent.chmod(0o755)
PY
curl --fail --silent --show-error https://2.29.173.184/health
status=$(curl --silent --show-error -o /dev/null -w '%{http_code}' https://2.29.173.184/api/buildings)
[[ "$status" == 401 ]]
echo "Updated $release. HTTPS health OK; anonymous API denied. Data and TLS credentials preserved."
REMOTE
scp -o UseKeychain=yes -o BatchMode=yes "$package/apply.sh" "root@2.29.173.184:/opt/facility-space/incoming/$release/apply.sh"
"${ssh_cmd[@]}" "bash /opt/facility-space/incoming/$release/apply.sh $release"
echo "Local code package: $package"
