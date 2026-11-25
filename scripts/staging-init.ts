import { postgres } from '../apps/api/src/repositories/database.js';
import { migrate } from './migrate.js';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const mode=process.argv[2];
if(process.env.NODE_ENV!=='staging'||process.env.AUTH_MODE!=='demo')throw Error('Staging only');
if(!['migrate','restore'].includes(mode))throw Error('Use migrate or restore');
const db=postgres(process.env.DATABASE_URL);
const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
function canonical(v:any):string{if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v);}
const digest=(rows:any[])=>createHash('sha256').update(rows.map(canonical).sort().join('\n')).digest('hex');
try{
 if(mode==='migrate'){await migrate(db);console.log('Migrations applied');}
 else{
  const raw=await readFile('/staging-data/snapshot.json','utf8'), manifest=JSON.parse(await readFile('/staging-data/manifest.json','utf8'));
  if(createHash('sha256').update(raw).digest('hex')!==manifest.sha256)throw Error('Snapshot checksum mismatch');
  const data=JSON.parse(raw);
  if(data.format!=='facility-space-exact-copy-v1'||!Array.isArray(data.tables))throw Error('Unsupported snapshot');
  await db.transaction(async tx=>{
   const columns=(await tx.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
   const known=new Set(columns.map(c=>c.table_name));
   if(data.tables.length!==known.size||new Set(data.tables.map((t:any)=>t.name)).size!==known.size)throw Error('Snapshot table set mismatch');
   const sourceMigrations=data.tables.find((t:any)=>t.name==='schema_migrations');
   const targetMigrations=(await tx.query('SELECT name,checksum FROM schema_migrations')).rows;
   if(canonical(sourceMigrations.rows.map((r:any)=>[r.name,r.checksum]).sort())!==canonical(targetMigrations.map(r=>[r.name,r.checksum]).sort()))throw Error('Migration versions differ: restore exact matching source first, then update');
   for(const t of data.tables){
    if(!known.has(t.name))throw Error('Unknown table');
    const schema=columns.filter(c=>c.table_name===t.name).map(c=>({name:c.column_name,type:c.data_type}));
    if(canonical(schema)!==canonical(t.columns))throw Error('Column mismatch: '+t.name);
    if(!['schema_migrations','space_types'].includes(t.name)&&Number((await tx.query('SELECT count(*) n FROM '+quote(t.name))).rows[0].n)!==0)throw Error('Restore requires an empty database; refuses to overwrite '+t.name);
   }
   // Initial load only; retains immutable audit/history rows and self-referencing directories.
   // All FK relationships and full table contents are verified before COMMIT.
   const baseline=(await tx.query('SELECT * FROM space_types')).rows;
   if(baseline.length!==14||baseline.some(r=>!r.id.startsWith('standard_')))throw Error('Unexpected reference data: refusing overwrite');
   await tx.query('SET LOCAL session_replication_role=replica');
   await tx.query('DELETE FROM space_types');
   for(const t of data.tables){
    if(t.name==='schema_migrations')continue;
    for(let offset=0;offset<t.rows.length;offset+=100){
     const rows=t.rows.slice(offset,offset+100),values:any[]=[];
     const tuples=rows.map((r:any)=>'('+t.columns.map((c:any)=>{const v=r[c.name];values.push(v!=null&&['json','jsonb'].includes(c.type)?JSON.stringify(v):v);return '$'+values.length;}).join(',')+')');
     await tx.query('INSERT INTO '+quote(t.name)+'('+t.columns.map((c:any)=>quote(c.name)).join(',')+') OVERRIDING SYSTEM VALUE VALUES '+tuples.join(','),values);
    }
   }
   await tx.query('SET LOCAL session_replication_role=origin');
   const fks=(await tx.query(`SELECT con.conname,con.conrelid::regclass::text child,con.confrelid::regclass::text parent,array_agg(ca.attname::text ORDER BY k.n) ck,array_agg(pa.attname::text ORDER BY k.n) pk FROM pg_constraint con CROSS JOIN LATERAL unnest(con.conkey,con.confkey) WITH ORDINALITY k(c,p,n) JOIN pg_attribute ca ON ca.attrelid=con.conrelid AND ca.attnum=k.c JOIN pg_attribute pa ON pa.attrelid=con.confrelid AND pa.attnum=k.p WHERE con.contype='f' AND con.connamespace='public'::regnamespace GROUP BY con.oid`)).rows;
   for(const fk of fks){const nonnull=fk.ck.map((c:string)=>'c.'+quote(c)+' IS NOT NULL').join(' AND '),matches=fk.ck.map((c:string,i:number)=>'p.'+quote(fk.pk[i])+'=c.'+quote(c)).join(' AND ');const invalid=await tx.query(`SELECT 1 FROM ${quote(fk.child)} c WHERE ${nonnull} AND NOT EXISTS(SELECT 1 FROM ${quote(fk.parent)} p WHERE ${matches}) LIMIT 1`);if(invalid.rows.length)throw Error('Broken relation: '+fk.conname);}
   for(const t of data.tables){
    if(t.name==='schema_migrations')continue;
    const numeric=t.columns.filter((c:any)=>c.type==='numeric');
    const casts=numeric.map((c:any)=>quote(c.name)+'::text AS '+quote(c.name));
    const rows=(await tx.query(`SELECT row_to_json(t) data${casts.length?', '+casts.join(', '):''} FROM ${quote(t.name)} t`)).rows.map(r=>{for(const c of numeric)r.data[c.name]=r[c.name];return r.data;});
    if(digest(rows)!==digest(t.rows))throw Error('Restored contents differ: '+t.name);
   }
   for(const seq of data.sequences||[]){
    const exists=(await tx.query('SELECT 1 FROM pg_sequences WHERE schemaname=$1 AND sequencename=$2',['public',seq.name])).rows;
    if(!exists.length)throw Error('Unknown sequence');
    await tx.query('SELECT setval($1::regclass,$2::bigint,$3::boolean)',[quote(seq.name),seq.last_value,seq.is_called]);
   }
   console.log('Exact copy verified: table hashes and foreign keys match; committing');
  });
 }
}finally{await db.close();}
