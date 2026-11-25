#!/usr/bin/env python3
"""Restore a handoff to a NEW isolated Compose project. Never runs migrations or seeds."""
import argparse, hashlib, json, os, pathlib, re, subprocess
p=argparse.ArgumentParser();p.add_argument('--directory',required=True);p.add_argument('--secrets',required=True);p.add_argument('--name',required=True);p.add_argument('--port',type=int,default=18080);a=p.parse_args()
os.umask(0o077)
root=pathlib.Path(a.directory).resolve();secret=pathlib.Path(a.secrets).resolve()
assert re.fullmatch(r'facility-restore-[a-z0-9-]{1,32}',a.name),'Name must start facility-restore-'
assert 1024<=a.port<=65535 and secret.is_file()
def run(args,**kw):return subprocess.check_output(args,**kw)
assert not run(['docker','ps','-aq','--filter','label=com.docker.compose.project='+a.name]).strip(),'Project already exists'
assert not run(['docker','volume','ls','-q','--filter','label=com.docker.compose.project='+a.name]).strip(),'Project volume already exists'
assert not (root/'restore-compose.json').exists(),'Use a fresh unpacked directory'
m=json.loads((root/'manifest.json').read_text())
for name,digest in m['files'].items():
    path=root/name
    assert path.resolve().is_relative_to(root)
    with path.open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==digest,name
run(['docker','load','-i',str(root/'images.tar')])
images=m['images'];db_env={'POSTGRES_USER':'${POSTGRES_USER:-facility}','POSTGRES_DB':'${POSTGRES_DB:-facility_staging}','POSTGRES_PASSWORD':'${POSTGRES_PASSWORD:?Missing database password}'}
api_env={'PGHOST':'db','PGPORT':'5432','PGUSER':'${POSTGRES_USER:-facility}','PGDATABASE':'${POSTGRES_DB:-facility_staging}','PGPASSWORD':'${POSTGRES_PASSWORD:?Missing database password}','NODE_ENV':'staging','AUTH_MODE':'demo','DEMO_EMPLOYEE_ID':'local-reviewer','DEMO_TOKEN':'${DEMO_TOKEN:?Missing access token}','HOST':'0.0.0.0','PORT':'3001'}
config={'name':a.name,'services':{
'db':{'image':images['db'],'environment':db_env,'volumes':['data:/var/lib/postgresql/data'],'networks':['database'],'healthcheck':{'test':['CMD-SHELL','pg_isready -U "$${POSTGRES_USER}" -d "$${POSTGRES_DB}"'],'interval':'2s','timeout':'3s','retries':60}},
'api':{'image':images['api'],'environment':api_env,'networks':['database','edge'],'healthcheck':{'test':['CMD','node','-e',"fetch('http://localhost:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"],'interval':'3s','timeout':'5s','retries':40}},
'web':{'image':images['web'],'networks':['edge']},
'gateway':{'image':images['caddy'],'networks':['edge'],'ports':[f'127.0.0.1:{a.port}:8080'],'volumes':[str(root/'Caddyfile.restore')+':/etc/caddy/Caddyfile:ro']}
},'networks':{'database':{'internal':True},'edge':{'internal':True}},'volumes':{'data':{}}}
(root/'Caddyfile.restore').write_text(':8080 {\n @api path /api /api/* /health\n handle @api { reverse_proxy api:3001 }\n handle { reverse_proxy web:8080 }\n}\n')
(root/'restore-compose.json').write_text(json.dumps(config,indent=2))
c=['docker','compose','--env-file',str(secret),'-f',str(root/'restore-compose.json')]
run(c+['up','-d','--wait','--wait-timeout','180','db'])
with (root/'database.dump').open('rb') as f:
    run(c+['exec','-T','db','sh','-c','exec pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --exit-on-error'],stdin=f)
# Compare every restored table/sequence to the dump before starting the application.
def digest(raw):
    result={}; lines=iter(raw.decode().splitlines())
    for line in lines:
        if line.startswith('COPY '):
            rows=[]
            for row in lines:
                if row=='\\.':break
                rows.append(row)
            result[line]=[len(rows),hashlib.sha256('\n'.join(sorted(rows)).encode()).hexdigest()]
        elif line.startswith('SELECT pg_catalog.setval('):result[line]=True
    assert result,'Empty dump';return result
with (root/'database.dump').open('rb') as f:expected=digest(run(c+['exec','-T','db','pg_restore','--data-only','--file=-'],stdin=f))
actual=digest(run(c+['exec','-T','db','sh','-c','pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --data-only']))
assert expected==actual,'Restored contents differ'
run(c+['up','-d','--wait','--wait-timeout','180','api','web','gateway'])
run(c+['exec','-T','api','node','-e',"Promise.all([fetch('http://127.0.0.1:3001/api/buildings').then(r=>{if(r.status!==401)throw Error('auth')}),fetch('http://127.0.0.1:3001/api/buildings',{headers:{Authorization:'Bearer '+process.env.DEMO_TOKEN+':facilities'}}).then(r=>{if(!r.ok)throw Error('directory')})]).catch(()=>process.exit(1))"])
report={'ok':True,'tables':sum(isinstance(v,list) for v in actual.values()),'rows':sum(v[0] for v in actual.values() if isinstance(v,list)),'table_counts':{k.split(' (')[0].removeprefix('COPY '):v[0] for k,v in actual.items() if isinstance(v,list)},'project':a.name,'url':f'http://127.0.0.1:{a.port}'}
(root/'restore-result.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
