#!/usr/bin/env python3
"""Allowlisted deployment package. Contains original corporate data: keep private."""
from pathlib import Path
import shutil, hashlib, json, os
root=Path(__file__).resolve().parent.parent
out=root/'staging-package'
if out.exists():
    raise SystemExit('staging-package already exists; move it aside before creating a new package')
os.umask(0o077)
out.mkdir(mode=0o700)
files=['package.json','package-lock.json','tsconfig.json','tsconfig.staging.json','.dockerignore','.env.staging.example','compose.staging.yaml','apps/api/package.json','apps/web/package.json','apps/web/index.html','apps/web/vite.config.ts','packages/shared/package.json','scripts/migrate.ts','scripts/sql-statements.ts','scripts/staging-init.ts','scripts/staging-env.sh','scripts/deploy-staging.sh','staging-data/snapshot.json','staging-data/manifest.json','docs/staging-deployment.md','docs/staging-ip-https.md','scripts/update-staging.sh']
for folder in ['apps/api/src','apps/web/src','packages/shared/src','db/migrations','deploy/staging']:
    files += [str(p.relative_to(root)) for p in (root/folder).rglob('*') if p.is_file()]
manifest={}
for name in sorted(set(files)):
    src=root/name
    if src.is_symlink(): raise SystemExit('Refusing symlink: '+name)
    dest=out/name;dest.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(src,dest);dest.chmod(0o600 if name.startswith('staging-data/') else 0o644)
    manifest[name]=hashlib.sha256(dest.read_bytes()).hexdigest()
(out/'package-checksums.json').write_text(json.dumps(manifest,indent=2))
print(f'Prepared {len(manifest)} files in {out}; real employee and office data included, no environment secrets.')
