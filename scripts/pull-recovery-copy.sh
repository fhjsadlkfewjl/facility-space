#!/usr/bin/env bash
# Run only after approval of this local destination. Never places decrypted data on disk.
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
out="backups/ops-recovery/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$out"
chmod 700 backups/ops-recovery "$out"
openssl rand -hex 32 > "$out/recovery.key"
ssh_cmd=(ssh -o UseKeychain=yes -o BatchMode=yes root@2.29.173.184)
remote=$("${ssh_cmd[@]}" 'umask 077; mktemp -d /run/facility-offsite.XXXXXXXX')
[[ "$remote" =~ ^/run/facility-offsite\.[a-zA-Z0-9]+$ ]]
cleanup() { "${ssh_cmd[@]}" "rm -rf -- '$remote'" >/dev/null 2>&1 || true; }
trap cleanup EXIT
"${ssh_cmd[@]}" "cat > '$remote/key'; chmod 600 '$remote/key'" < "$out/recovery.key"
# Shell receives the small script as a command; tar/ciphertext streams through stdout only.
"${ssh_cmd[@]}" "python3 - '$remote/key'" > "$out/recovery.enc.tmp" <<'PY'
from pathlib import Path
import json, subprocess,sys
root=Path('/var/lib/facility-ops')
backup=Path(json.loads((root/'backup-status.json').read_text())['path'])
relative=backup.relative_to(root)
release=json.loads((backup/'manifest.json').read_text())['release']
assert len(release)==16 and all(c in '0123456789abcdef' for c in release)
tar=subprocess.Popen(['tar','-C',str(root),'-cf','-',str(relative),'releases/'+release],stdout=subprocess.PIPE)
try:
    subprocess.run(['openssl','enc','-aes-256-cbc','-salt','-pbkdf2','-iter','600000','-md','sha256','-pass','file:'+sys.argv[1]],stdin=tar.stdout,check=True)
finally:tar.stdout.close()
if tar.wait()!=0:raise SystemExit('Archive failed')
PY
mv "$out/recovery.enc.tmp" "$out/recovery.enc"
# Decrypt only through a pipe to check the archive, without unpacking personal data.
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 -pass "file:$out/recovery.key" -in "$out/recovery.enc" | tar -tf - > "$out/contents.txt"
(cd "$out" && shasum -a 256 recovery.enc > recovery.sha256)
echo "Encrypted recovery copy verified: $out"
