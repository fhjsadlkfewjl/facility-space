import { OfficeRepository } from './repositories/office.js';
import {randomUUID} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import type {Database} from './repositories/database.js';
import {one} from './repositories/database.js';
import {ensure} from './domain/errors.js';
import {floorAccess} from './domain/access.js';
import {manage} from './domain/permissions.js';
import {parseCsv} from './domain/csv-import.js';
import {audit} from './services/office.js';
export function registerBulk(app:FastifyInstance,db:Database){
 app.post('/api/rooms/import-preview',async req=>{
  manage(req.actor);const {csv}=z.object({csv:z.string().max(500000)}).strict().parse(req.body);
  const rows=parseCsv(csv),changes:any[]=[],errors:any[]=[];const ids=new Set<string>();
  for(const [i,row] of rows.entries()){
   if(Object.keys(row).some(k=>!['id','space_type_id'].includes(k))||!row.id||!row.space_type_id||ids.has(row.id)){errors.push({row:i+2,error:'Expected unique id and space_type_id only'});continue;}ids.add(row.id);
   const room=await one(db,'SELECT id,floor_id,space_type_id FROM rooms WHERE id=$1',[row.id]);
   if(!room){errors.push({row:i+2,error:'Room not found'});continue;}
   await floorAccess(db,req.actor,room.floor_id);
   if(!await one(db,'SELECT id FROM space_types WHERE id=$1',[row.space_type_id])){errors.push({row:i+2,error:'Unknown space type'});continue;}
   changes.push({id:room.id,floor_id:room.floor_id,before:room.space_type_id,after:row.space_type_id});
  }
  if(errors.length)return {previewId:null,errors,changes};
  const previewId=randomUUID();await db.query('INSERT INTO room_import_previews(id,actor_id,changes) VALUES($1,$2,$3)',[previewId,req.actor.id,JSON.stringify(changes)]);
  return {previewId,errors,changes};
 });
 app.post('/api/rooms/import-apply',async req=>{
  manage(req.actor);const {previewId}=z.object({previewId:z.uuid()}).strict().parse(req.body);
  return db.transaction(async tx=>{
   const preview=await one(tx,"SELECT * FROM room_import_previews WHERE id=$1 AND actor_id=$2 AND created_at>now()-interval '30 minutes' FOR UPDATE",[previewId,req.actor.id]);ensure(preview,404,'Preview unavailable or expired');ensure(!preview.applied_at,409,'Preview already applied');
   const changes=preview.changes.sort((a:any,b:any)=>a.id.localeCompare(b.id));
   const floors=[...new Set<string>(changes.map((c:any)=>c.floor_id))].sort();
   for(const floor of floors)await tx.query('SELECT id FROM floors WHERE id=$1 FOR UPDATE',[floor]);
   for(const c of changes){const room=await one(tx,'SELECT * FROM rooms WHERE id=$1 FOR UPDATE',[c.id]);ensure(room&&room.floor_id===c.floor_id&&room.space_type_id===c.before,409,'Room changed after preview. Preview again.');await floorAccess(tx,req.actor,room.floor_id);await tx.query('UPDATE rooms SET space_type_id=$2,auto_classified=false,classification_confidence=$3,needs_review=false WHERE id=$1',[c.id,c.after,'high']);await audit(tx,req.actor,'room.classification',c.id,{before:c.before,after:c.after,previewId});}
   for(const floor of floors){const v=await one(tx,'UPDATE floors SET version=version+1 WHERE id=$1 RETURNING version',[floor]);await tx.query('INSERT INTO layout_versions(id,floor_id,version,snapshot,comment,created_by) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),floor,v.version,JSON.stringify(await new OfficeRepository(tx).layout(floor)),'Bulk classification',req.actor.id]);}
   await tx.query('UPDATE room_import_previews SET applied_at=now() WHERE id=$1',[previewId]);return {updated:changes.length};
  });
 });
 app.post('/api/workplaces/bulk-status',async req=>{
  manage(req.actor);const b=z.object({ids:z.array(z.string().max(128)).min(1).max(200),status:z.enum(['available','disabled'])}).strict().parse(req.body);ensure(new Set(b.ids).size===b.ids.length,400,'Duplicate IDs');
  return db.transaction(async tx=>{
   for(const id of [...b.ids].sort()){
    const w=await one(tx,'SELECT w.*,f.floor_id FROM workplaces w JOIN furniture f ON f.id=w.furniture_id WHERE w.id=$1 FOR UPDATE OF w',[id]);ensure(w,404,'Workplace not found');await floorAccess(tx,req.actor,w.floor_id);
    if(b.status==='disabled')ensure(!(await one(tx,"SELECT id FROM workplace_assignments WHERE workplace_id=$1 AND valid_to IS NULL UNION ALL SELECT id FROM bookings WHERE workplace_id=$1 AND status='confirmed' AND ends_at>now()",[id])),409,'Occupied or reserved workplace cannot be disabled');
    await tx.query('UPDATE workplaces SET status=$2 WHERE id=$1',[id,b.status]);await audit(tx,req.actor,'workplace.bulk-status',id,{before:w.status,after:b.status});
   }return {updated:b.ids.length};
  });
 });
}
