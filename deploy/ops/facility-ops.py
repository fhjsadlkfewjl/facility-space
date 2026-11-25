#!/usr/bin/env python3
"""Server-only operations. Never seed, truncate or restore the production database."""
import argparse, datetime as dt, fcntl, hashlib, json, os, pathlib, re, shutil, subprocess, sys, tarfile, time, uuid
ROOT = pathlib.Path('/opt/facility-space')
STATE = pathlib.Path('/var/lib/facility-ops')
COMPOSE = ['docker','compose','--env-file',str(ROOT/'.env.staging'),'-f',str(ROOT/'compose.staging.yaml')]
os.umask(0o077)

def run(args, data=None, timeout=900):
    p = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=ROOT, timeout=timeout)
    if p.returncode:
        # Tool output may contain SQL rows, env values or credentials. Keep diagnostics private.
        (STATE/'last-command-error.log').write_bytes(p.stderr)
        raise RuntimeError('Command failed: '+args[0]+' (private diagnostic: '+str(STATE/'last-command-error.log')+')')
    return p.stdout

def dc(*args, data=None): return run(COMPOSE+list(args),data)
def stamp(): return dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
def write(path, obj):
    tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n');tmp.replace(path)
def inspect(service):
    cid=dc('ps','-q',service).decode().strip()
    if not cid: raise RuntimeError('Missing service: '+service)
    return json.loads(run(['docker','inspect',cid]))[0]
def env_dict(info): return dict(x.split('=',1) for x in info['Config']['Env'] if '=' in x)
def dbcmd(*args,data=None): return dc('exec','-T','db',*args,data=data)
def dbinfo():
    e=env_dict(inspect('db'));return e['POSTGRES_USER'],e['POSTGRES_DB']
def schema_hash(container, user, database):
    raw=run(['docker','exec',container,'pg_dump','-U',user,'-d',database,'--schema-only','--no-owner','--no-privileges']).decode()
    stable='\n'.join(l for l in raw.splitlines() if l and not l.startswith(('--','\\restrict','\\unrestrict')))
    return hashlib.sha256(stable.encode()).hexdigest()

def file_hash(path):
    with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()

def checkpoint():
    images={s:inspect(s)['Image'] for s in ('api','web','db','caddy')}
    u,d=dbinfo(); schema=schema_hash(inspect('db')['Id'],u,d)
    key=hashlib.sha256(json.dumps({'images':images,'schema':schema},sort_keys=True).encode()).hexdigest()[:16]
    dest=STATE/'releases'/key;dest.mkdir(parents=True,exist_ok=True)
    for s,image in images.items():
        tag='facility-ops-'+s+':'+key
        run(['docker','tag',image,tag])
    if not (dest/'images.tar').exists():
        run(['docker','save','-o',str(dest/'images.tmp'),*images.values()])
        (dest/'images.tmp').rename(dest/'images.tar')
    if not (dest/'images.sha256').exists():
        (dest/'images.sha256').write_text(file_hash(dest/'images.tar')+'  images.tar\n')
    u,d=dbinfo()
    manifest={'id':key,'created':stamp(),'images':images,'schema':schema}
    write(dest/'release.json',manifest)
    return manifest

def backup():
    release=checkpoint(); dest=STATE/'backups'/(stamp()+'-'+uuid.uuid4().hex[:6]);dest.mkdir(parents=True)
    u,d=dbinfo()
    try:
        dump=dbcmd('pg_dump','-U',u,'-d',d,'-Fc')
        dbcmd('pg_restore','--list',data=dump)
        (dest/'database.dump').write_bytes(dump)
        # Includes secrets for disaster recovery, readable by root only, never shipped to clients.
        with tarfile.open(dest/'application.tar.gz','w:gz') as tar:
            for n in ['.env.staging','compose.staging.yaml','deploy','scripts','apps/api/src','apps/web/src','apps/api/package.json','apps/web/package.json','apps/web/index.html','apps/web/vite.config.ts','packages/shared','db/migrations','package.json','package-lock.json','tsconfig.json','tsconfig.staging.json','.dockerignore']:
                p=ROOT/n
                if p.exists():tar.add(p,arcname=n,filter=lambda t: None if '/node_modules/' in t.name else t)
        manifest={'created':time.time(),'release':release['id'],'database':d,'user':u,'files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in dest.iterdir() if p.is_file()}}
        write(dest/'manifest.json',manifest);write(STATE/'backup-status.json',{'ok':True,'at':time.time(),'path':str(dest)})
        # Keep 14 days of successful six-hourly backups; incomplete directories never count as success.
        for old in (STATE/'backups').iterdir():
            m=old/'manifest.json'
            if old!=dest and m.exists() and time.time()-json.loads(m.read_text())['created']>14*86400:shutil.rmtree(old)
        print('Backup complete: '+str(dest),flush=True)
        return dest
    except Exception:
        shutil.rmtree(dest);raise

def latest_backup():
    paths=sorted(p.parent for p in (STATE/'backups').glob('*/manifest.json'))
    if not paths:raise RuntimeError('No completed backup')
    return max(paths,key=lambda p:json.loads((p/'manifest.json').read_text())['created'])

def copy_digest(raw):
    result={}; lines=iter(raw.decode().splitlines())
    for line in lines:
        if line.startswith('COPY '):
            rows=[]
            for row in lines:
                if row=='\\.':break
                rows.append(row)
            result[line]={'rows':len(rows),'sha256':hashlib.sha256('\n'.join(sorted(rows)).encode()).hexdigest()}
        elif line.startswith('SELECT pg_catalog.setval('):result[line]=True
    if not result:raise RuntimeError('No COPY data in dump')
    return result

def wait_db(name,u,d):
    for _ in range(60):
        try:run(['docker','exec',name,'pg_isready','-U',u,'-d',d],timeout=5);return
        except RuntimeError:time.sleep(1)
    raise RuntimeError('Restore database did not start')

def verify(rehearse=False, candidate_api=None, candidate_web=None):
    src=latest_backup();m=json.loads((src/'manifest.json').read_text())
    for n,h in m['files'].items():
        if hashlib.sha256((src/n).read_bytes()).hexdigest()!=h:raise RuntimeError('Backup checksum mismatch: '+n)
    release_dir=STATE/'releases'/m['release']
    release=json.loads((release_dir/'release.json').read_text())
    if file_hash(release_dir/'images.tar')!=(release_dir/'images.sha256').read_text().split()[0]:
        raise RuntimeError('Saved image archive checksum mismatch')
    name='facility-drill-'+uuid.uuid4().hex[:12];net=name+'-net';api=name+'-api';web=name+'-web'
    u=m['user'];d='restore_check';report={'at':time.time(),'backup':str(src),'ok':False}
    run(['docker','network','create','--internal',net])
    try:
        run(['docker','run','-d','--name',name,'--network',net,'--memory','512m','--tmpfs','/var/lib/postgresql/data:rw,size=512m','-e','POSTGRES_USER='+u,'-e','POSTGRES_DB='+d,'-e','POSTGRES_PASSWORD='+uuid.uuid4().hex,release['images']['db']])
        wait_db(name,u,d)
        raw=(src/'database.dump').read_bytes()
        run(['docker','exec','-i',name,'pg_restore','-U',u,'-d',d,'--exit-on-error'],raw)
        expected=copy_digest(run(['docker','exec','-i',name,'pg_restore','--data-only','--file=-'],raw))
        actual=copy_digest(run(['docker','exec',name,'pg_dump','-U',u,'-d',d,'--data-only']))
        if expected!=actual:raise RuntimeError('Restored table/sequence hashes differ')
        report.update(tables=sum(isinstance(v,dict) for v in actual.values()),rows=sum(v['rows'] for v in actual.values() if isinstance(v,dict)))
        if rehearse:
            e=env_dict(inspect('api')); e.pop('DATABASE_URL',None)
            e.update(PGHOST=name,PGDATABASE=d,PGUSER=u,PGPASSWORD=env_dict(json.loads(run(['docker','inspect',name]))[0])['POSTGRES_PASSWORD'])
            envfile=STATE/(name+'.env');envfile.write_text('\n'.join(k+'='+v for k,v in e.items())+'\n')
            try:
                # Candidate migration executes only in the throwaway database.
                image=candidate_api or release['images']['api']
                run(['docker','run','--rm','--network',net,'--env-file',str(envfile),image,'node','scripts/staging-init.js','migrate'])
                if schema_hash(name,u,d)!=release['schema']:
                    raise RuntimeError('Schema-changing release requires a separate reviewed migration/rollback plan; live update refused')
                for label,ai,wi in [('candidate',image,candidate_web or release['images']['web']),('rollback',release['images']['api'],release['images']['web'])]:
                    run(['docker','run','-d','--name',api,'--network',net,'--env-file',str(envfile),'--memory','512m',ai])
                    run(['docker','run','-d','--name',web,'--network',net,'--memory','128m',wi])
                    for attempt in range(40):
                        try:
                            run(['docker','exec',api,'node','-e',"Promise.all([fetch('http://127.0.0.1:3001/health').then(r=>{if(!r.ok)throw Error('health')}),fetch('http://127.0.0.1:3001/api/buildings').then(r=>{if(r.status!==401)throw Error('auth')}),fetch('http://127.0.0.1:3001/api/buildings',{headers:{Authorization:'Bearer '+process.env.DEMO_TOKEN+':facilities'}}).then(r=>{if(!r.ok)throw Error('directory')}),fetch('http://"+web+":8080').then(r=>{if(!r.ok)throw Error('web')})]).catch(()=>process.exit(1))"],timeout=15)
                            break
                        except RuntimeError:
                            if attempt==39:raise
                            time.sleep(1)
                    run(['docker','rm','-f',api,web]);report[label]='passed'
                after=copy_digest(run(['docker','exec',name,'pg_dump','-U',u,'-d',d,'--data-only']))
                if actual!=after:raise RuntimeError('Rehearsal changed database contents')
            finally:envfile.unlink(missing_ok=True)
        report.update(ok=True,finished=time.time());write(STATE/('rehearsal-status.json' if rehearse else 'restore-status.json'),report)
        if rehearse:write(STATE/'restore-status.json',report)
        print(json.dumps(report),flush=True)
    finally:
        for c in [api,web,name]:
            subprocess.run(['docker','rm','-f',c],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        run(['docker','network','rm',net])

def monitor():
    problems=[]
    def check(label,fn):
        try:fn()
        except Exception:problems.append(label)
    def services():
        for s in ['db','api','web','caddy']:
            i=inspect(s)
            if not i['State']['Running'] or i['State'].get('Health',{}).get('Status','healthy')!='healthy':raise RuntimeError(s)
        if inspect('db')['HostConfig']['PortBindings']:raise RuntimeError('Database published')
    check('Container health / database isolation',services)
    check('HTTPS health',lambda:run(['curl','--fail','--silent','--show-error','--max-time','15','https://2.29.173.184/health'],timeout=20))
    def auth():
        code=run(['curl','--silent','--show-error','--max-time','15','-o','/dev/null','-w','%{http_code}','https://2.29.173.184/api/buildings'],timeout=20)
        if code!=b'401':raise RuntimeError('Authentication')
    check('Unauthenticated API rejection',auth)
    check('TLS expiry under 24 hours',lambda:run(['openssl','x509','-checkend','86400','-noout','-in','/etc/letsencrypt/live/facility-ip/fullchain.pem']))
    check('Certificate renewal timer',lambda:run(['systemctl','is-active','--quiet','facility-cert-renew.timer']))
    for job in ['backup','verify','cert-renew']:
        def job_ok(job=job):
            result=run(['systemctl','show','--property=Result','--value','facility-'+job+'.service']).decode().strip()
            if result not in ('success',''):raise RuntimeError(job)
        check(job+' scheduled job failure',job_ok)
    def sql():
        u,d=dbinfo();dbcmd('psql','-U',u,'-d',d,'-v','ON_ERROR_STOP=1','-Atc','SELECT 1')
    check('Database read',sql)
    for name,age in [('backup',8*3600),('restore',8*86400)]:
        try:
            j=json.loads((STATE/(name+'-status.json')).read_text())
            if not j['ok'] or time.time()-j['at']>age:raise ValueError()
        except Exception:problems.append(name+' missing or overdue')
    disk=shutil.disk_usage(STATE)
    if disk.free<5*1024**3 or disk.free/disk.total<.15:problems.append('Disk space low')
    result={'at':time.time(),'ok':not problems,'problems':problems,'disk_free_gb':round(disk.free/1024**3,1)}
    write(STATE/'health-status.json',result);print(json.dumps(result),flush=True)
    if problems:raise RuntimeError('Monitoring checks failed; see health-status.json')

def persist_images(images):
    key='ops-'+hashlib.sha256(json.dumps(images,sort_keys=True).encode()).hexdigest()[:16]
    for service in ['api','web']:
        run(['docker','tag',images[service],'facility-space-staging-'+service+':'+key])
    path=ROOT/'.env.staging'
    lines=[l for l in path.read_text().splitlines() if not l.startswith('IMAGE_TAG=')]
    tmp=ROOT/'.env.staging.ops-tmp';tmp.write_text('\n'.join(lines+['IMAGE_TAG='+key])+'\n');tmp.chmod(0o600);tmp.replace(path)

def switch_images(images):
    override=STATE/'image-override.json'
    write(override,{'services':{s:{'image':images[s]} for s in ['api','web']}})
    run(COMPOSE+['-f',str(override),'up','-d','--no-deps','--wait','--wait-timeout','180','api','web'])

def update(api,web):
    # Existing DB remains in place. Refuse migrations; this is deliberately a data-preserving code release.
    backup();verify(True,api,web)
    old=checkpoint();u,d=dbinfo()
    if schema_hash(inspect('db')['Id'],u,d)!=old['schema']:raise RuntimeError('Schema changed during preflight')
    try:
        switch_images({'api':api,'web':web});monitor()
    except Exception:
        switch_images(old['images']);persist_images(old['images']);raise
    persist_images({'api':api,'web':web})
    write(STATE/'rollback-target.json',old)
    write(STATE/'active-release.json',{'at':time.time(),'api':api,'web':web,'previous':old['id']})
    print('Code release healthy. Previous images retained. No production migrations executed.')

def rollback():
    old=json.loads((STATE/'rollback-target.json').read_text());u,d=dbinfo()
    if schema_hash(inspect('db')['Id'],u,d)!=old['schema']:raise RuntimeError('Schema differs; refusing unsafe code rollback')
    current=checkpoint();backup()
    try:
        switch_images(old['images']);monitor();persist_images(old['images'])
    except Exception:
        switch_images(current['images']);persist_images(current['images']);raise
    write(STATE/'active-release.json',{'at':time.time(),'rollback_to':old['id']})
    print('Previous code restored; current database preserved.')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['backup','verify','rehearse','monitor','checkpoint','update','rollback']);p.add_argument('--api');p.add_argument('--web');a=p.parse_args()
    STATE.mkdir(mode=0o700,parents=True,exist_ok=True);(STATE/'backups').mkdir(exist_ok=True);(STATE/'releases').mkdir(exist_ok=True)
    lock=open(STATE/('monitor.lock' if a.action=='monitor' else 'operations.lock'),'w')
    try:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        if a.action=='update':
            if not a.api or not a.web:p.error('update requires --api and --web immutable image IDs')
            if not all(re.fullmatch(r'sha256:[a-f0-9]{64}',v) for v in [a.api,a.web]):p.error('Use immutable image IDs')
            update(a.api,a.web)
        elif a.action=='rehearse':verify(True,a.api,a.web)
        elif a.action=='checkpoint':print(json.dumps(checkpoint()))
        else:globals()[a.action]()
    except BlockingIOError:
        print('Another operation is running',file=sys.stderr);sys.exit(75)
    except Exception as exc:
        print(str(exc),file=sys.stderr);sys.exit(1)
