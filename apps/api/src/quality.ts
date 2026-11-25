import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Database } from './repositories/database.js';
import { one } from './repositories/database.js';
import { floorAccess } from './domain/access.js';
import { ensure } from './domain/errors.js';
import { audit } from './services/office.js';
import { manage } from './domain/permissions.js';
import { validPolygon, contained, corners } from './domain/geometry.js';
import { csv } from './facility.js';
export function registerQuality(app:FastifyInstance,db:Database){
 app.get('/api/quality-queue',async(req,reply)=>{
  manage(req.actor);
  const q=z.object({q:z.string().max(200).default(''),status:z.enum(['','OPEN','IN_REVIEW','RESOLVED','IGNORED']).default(''),priority:z.enum(['','critical','review','info']).default(''),category:z.string().default(''),building:z.string().default(''),offset:z.coerce.number().int().min(0).max(100000).default(0),format:z.enum(['json','csv']).default('json')}).parse(req.query);
  const scope=req.actor.role==='admin'?null:req.actor.employeeId;
  const floors=(await db.query(`SELECT fl.*,b.name building_name FROM floors fl JOIN buildings b ON b.id=fl.building_id WHERE fl.active AND b.active AND ($1::text IS NULL OR EXISTS(SELECT 1 FROM building_managers bm WHERE bm.building_id=b.id AND bm.employee_id=$1)) AND ($2='' OR b.id=$2)`,[scope,q.building])).rows;
  const rows:any[]=[];const add=(category:string,kind:string,id:string,label:string,fl:any)=>rows.push({category,kind,id,label,floor_id:fl.id,building_id:fl.building_id,building_name:fl.building_name,floor_name:fl.name,status:'OPEN'});
  const floorIds=floors.map(f=>f.id);
  const rooms=(await db.query('SELECT * FROM rooms WHERE floor_id=ANY($1::text[])',[floorIds])).rows;
  const furniture=(await db.query(`SELECT f.*,t.name template_name,coalesce(n.copies,0) copies FROM furniture f LEFT JOIN furniture_templates t ON t.id=f.template_id LEFT JOIN (SELECT btrim(inventory_number) number,count(*) copies FROM furniture WHERE nullif(btrim(inventory_number),'') IS NOT NULL GROUP BY btrim(inventory_number)) n ON n.number=btrim(f.inventory_number) WHERE f.floor_id=ANY($1::text[])`,[floorIds])).rows;
  for(const fl of floors){
   if(!fl.background_svg)add('missing_svg','floor',fl.id,fl.name,fl);
   if(!fl.meters_per_unit)add('unverified_scale','floor',fl.id,fl.name,fl);
   const rr=rooms.filter(r=>r.floor_id===fl.id&&r.active),ff=furniture.filter(f=>f.floor_id===fl.id&&f.active);
   for(const r of rr){
    if(r.area_m2===null)add('rooms_without_area','room',r.id,r.name,fl);
    if(Number(r.area_m2)>0&&r.calculated_area_m2!==null&&Math.abs(Number(r.calculated_area_m2)-Number(r.area_m2))/Number(r.area_m2)>.1)add('area_discrepancy','room',r.id,r.name,fl);
    if(!Array.isArray(r.shape?.polygon)||!validPolygon(r.shape.polygon))add('invalid_geometry','room',r.id,r.name,fl);
   }
   for(const f of ff){
    if(!f.inventory_number?.trim())add('missing_inventory','furniture',f.id,f.inventory_number||f.template_name||'Предмет мебели',fl);
    if(Number(f.copies)>1)add('duplicate_inventory','furniture',f.id,f.inventory_number,fl);
    const room=rr.find(r=>r.id===f.room_id);
    if(room&&f.width&&f.depth&&Array.isArray(room.shape?.polygon)&&!contained(corners(f),room.shape.polygon))add('furniture_outside_room','furniture',f.id,f.inventory_number||f.template_name||'Предмет мебели',fl);
   }
  }
  // Legacy quarantine cannot be scoped safely by inferred building. Admin only, no payload/PII.
  if(scope===null&&!q.building)for(const r of (await db.query('SELECT id,reason FROM migration_quarantine q WHERE NOT EXISTS(SELECT 1 FROM quarantine_resolutions x WHERE x.quarantine_id=q.id)')).rows)rows.push({category:'quarantine',kind:'quarantine',id:r.id,label:r.reason,floor_id:null,building_id:null,status:'OPEN'});
  const reviews=(await db.query('SELECT * FROM quality_reviews')).rows;
  const reviewMap=new Map(reviews.map(r=>[JSON.stringify([r.category,r.entity_id]),r]));
  for(const row of rows){const review=reviewMap.get(JSON.stringify([row.category,row.id]));Object.assign(row,{revision:0},review||{});row.issue_present=true;}
  for(const row of rows)row.priority=['quarantine','duplicate_inventory','invalid_geometry'].includes(row.category)?'critical':row.category==='missing_inventory'?'info':'review';
  const statusRows=rows.filter(r=>[r.label,r.building_name,r.floor_name].join(' ').toLocaleLowerCase('ru').includes(q.q.toLocaleLowerCase('ru'))&&(!q.status||r.status===q.status)&&(!q.priority||r.priority===q.priority));
  const counts=Object.fromEntries([...new Set(statusRows.map(r=>r.category))].map(c=>[c,statusRows.filter(r=>r.category===c).length]));
  const selected=statusRows.filter(r=>!q.category||r.category===q.category);
  if(q.format==='csv')return reply.type('text/csv; charset=utf-8').header('Content-Disposition','attachment; filename="data-quality.csv"').send(csv(selected));
  return {counts,total:selected.length,rows:selected.slice(q.offset,q.offset+200)};
 });
 app.post('/api/quality-review',async req=>{
  manage(req.actor);
  const b=z.object({category:z.enum(['missing_svg','unverified_scale','rooms_without_area','area_discrepancy','invalid_geometry','missing_inventory','duplicate_inventory','furniture_outside_room','quarantine']),id:z.string().min(1).max(128),status:z.enum(['OPEN','IN_REVIEW','RESOLVED','IGNORED']),comment:z.string().max(4000).default(''),resolutionNote:z.string().max(4000).default(''),assignToMe:z.boolean().default(false),expectedRevision:z.number().int().nonnegative()}).strict().parse(req.body);
  ensure(!['RESOLVED','IGNORED'].includes(b.status)||b.resolutionNote.trim().length>0,400,'Resolution note required');
  return db.transaction(async tx=>{
   if(b.category==='quarantine'){
    ensure(req.actor.role==='admin',403,'Admin required for unscoped legacy issues');
    ensure(await one(tx,'SELECT id FROM migration_quarantine WHERE id=$1 FOR UPDATE',[b.id]),404,'Issue not found');
    ensure(b.status!=='RESOLVED',409,'Legacy quarantine requires deterministic import evidence; review cannot resolve it');
   }else{
    const table=['missing_svg','unverified_scale'].includes(b.category)?'floors':['rooms_without_area','area_discrepancy','invalid_geometry'].includes(b.category)?'rooms':'furniture';
    const entity=await one(tx,`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`,[b.id]);ensure(entity,404,'Entity not found');
    await floorAccess(tx,req.actor,table==='floors'?entity.id:entity.floor_id);
   }
   const before=await one(tx,'SELECT * FROM quality_reviews WHERE category=$1 AND entity_id=$2 FOR UPDATE',[b.category,b.id]);
   ensure((before?.revision??0)===b.expectedRevision,409,'Review changed; reload');
   const row=await one(tx,`INSERT INTO quality_reviews(category,entity_id,status,comment,assigned_to,reviewed_by,resolved_at,resolution_note)
    VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $3 IN ('RESOLVED','IGNORED') THEN now() ELSE NULL END,$7)
    ON CONFLICT(category,entity_id) DO UPDATE SET status=EXCLUDED.status,comment=EXCLUDED.comment,assigned_to=EXCLUDED.assigned_to,reviewed_by=EXCLUDED.reviewed_by,resolved_at=EXCLUDED.resolved_at,resolution_note=EXCLUDED.resolution_note,revision=quality_reviews.revision+1,updated_at=now() RETURNING *`,[b.category,b.id,b.status,b.comment,b.assignToMe?req.actor.id:before?.assigned_to??null,req.actor.id,b.resolutionNote]);
   await audit(tx,req.actor,'quality.review',b.id,{before,after:row});return row;
  });
 });
 app.get('/api/unified-search',async req=>{
  const {q}=z.object({q:z.string().trim().min(2).max(120)}).parse(req.query);
  const pattern='%'+q.replace(/[\\%_]/g,'\\$&')+'%';
  return (await db.query(`SELECT hits.*, hb.name building_name,hf.name floor_name,hr.name room_name,hw.code workplace_code,he.position,hd.name department_name FROM (
   SELECT 'room' kind,r.id,r.name label,r.floor_id,f.building_id,NULL::text furniture_id FROM rooms r JOIN floors f ON f.id=r.floor_id WHERE r.active AND f.active AND r.name ILIKE $1
   UNION ALL SELECT 'inventory',x.id,coalesce(x.inventory_number,x.id),x.floor_id,f.building_id,x.id FROM furniture x JOIN floors f ON f.id=x.floor_id WHERE x.active AND f.active AND x.inventory_number ILIKE $1
   UNION ALL SELECT 'workplace',w.id,w.code,x.floor_id,f.building_id,x.id FROM workplaces w JOIN furniture x ON x.id=w.furniture_id JOIN floors f ON f.id=x.floor_id WHERE x.active AND f.active AND w.code ILIKE $1
   UNION ALL SELECT 'tenant',id,name,NULL,NULL,NULL FROM tenants WHERE active AND name ILIKE $1
   UNION ALL SELECT 'lease',a.id,a.contract_number||' · '||t.name,NULL,NULL,NULL FROM lease_agreements a JOIN tenants t ON t.id=a.tenant_id WHERE a.contract_number ILIKE $1 OR t.name ILIKE $1
   UNION ALL SELECT 'building',id,name,NULL,id,NULL FROM buildings WHERE active AND name ILIKE $1
   UNION ALL SELECT 'parking',p.id,p.number,NULL,p.building_id,NULL FROM parking_spots p JOIN buildings b ON b.id=p.building_id WHERE b.active AND p.number ILIKE $1
   UNION ALL SELECT 'employee',e.id,e.display_name,x.floor_id,f.building_id,x.id FROM employees_projection e LEFT JOIN workplace_assignments a ON a.employee_id=e.id AND a.valid_to IS NULL LEFT JOIN workplaces w ON w.id=a.workplace_id LEFT JOIN furniture x ON x.id=w.furniture_id LEFT JOIN floors f ON f.id=x.floor_id WHERE e.active AND e.display_name ILIKE $1
  ) hits LEFT JOIN buildings hb ON hb.id=hits.building_id LEFT JOIN floors hf ON hf.id=hits.floor_id LEFT JOIN furniture hx ON hx.id=hits.furniture_id LEFT JOIN rooms hr ON hr.id=CASE WHEN hits.kind='room' THEN hits.id ELSE hx.room_id END LEFT JOIN workplaces hw ON hw.furniture_id=hx.id LEFT JOIN employees_projection he ON hits.kind='employee' AND he.id=hits.id LEFT JOIN departments_projection hd ON hd.id=he.department_id WHERE ($2::boolean OR kind IN ('employee','room','workplace')) ORDER BY kind,label,hits.id LIMIT 100`,[pattern,req.actor.role!=='employee'])).rows;
 });
}
