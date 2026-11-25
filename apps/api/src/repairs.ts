import { scalePreview } from './domain/scale-preview.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Database } from './repositories/database.js';
import { one } from './repositories/database.js';
import { ensure } from './domain/errors.js';
import { manage } from './domain/permissions.js';
import { floorAccess } from './domain/access.js';
import { recordArea } from './domain/area-history.js';
import { OfficeService, audit } from './services/office.js';
import { version, polygonArea } from './facility.js';
import { validPolygon } from './domain/geometry.js';
import { parseShape } from './adapters/bitrix.js';
const id=z.string().min(1).max(128);
const area=z.number().finite().nonnegative().max(1e7).nullable();
export function registerRepairs(app:FastifyInstance,db:Database){
 app.patch('/api/rooms/:id/parameters',async req=>{
  manage(req.actor);
  const key=z.object({id}).parse(req.params).id;
  const b=z.object({area_m2:area,space_type_id:id,name:z.string().trim().min(1).max(200).optional(),expectedName:z.string().optional(),expectedArea:area,expectedType:id.nullable(),source:z.string().trim().min(3).max(1000)}).strict().parse(req.body);
  return db.transaction(async tx=>{
   const location=await one(tx,'SELECT floor_id FROM rooms WHERE id=$1',[key]);ensure(location,404,'Помещение не найдено');
   await tx.query('SELECT id FROM floors WHERE id=$1 FOR UPDATE',[location.floor_id]);
   const room=await one(tx,'SELECT * FROM rooms WHERE id=$1 FOR UPDATE',[key]);
   await floorAccess(tx,req.actor,room.floor_id);
   ensure(b.expectedName===undefined||room.name===b.expectedName,409,'Название изменено другим пользователем. Откройте помещение заново.');
   ensure((room.area_m2===null?null:Number(room.area_m2))===b.expectedArea&&room.space_type_id===b.expectedType,409,'Параметры изменены другим пользователем. Откройте помещение заново.');
   ensure(await one(tx,'SELECT id FROM space_types WHERE id=$1',[b.space_type_id]),400,'Выберите существующий тип помещения');
   const today=(await one(tx,'SELECT CURRENT_DATE::text today')).today;
   const last=await one(tx,'SELECT *,valid_from::text since FROM room_area_history WHERE room_id=$1 AND valid_to IS NULL FOR UPDATE',[key]);
   if(b.area_m2!==b.expectedArea){
    if(last?.since===today){
     await tx.query('INSERT INTO room_area_corrections(room_id,before_value,after_value,reason,actor_id) VALUES($1,$2,$3,$4,$5)',[key,JSON.stringify(last),JSON.stringify({area_m2:b.area_m2,valid_from:today}),b.source,req.actor.id]);
     await tx.query('UPDATE room_area_history SET area_m2=$2,source=$3,created_by=$4 WHERE id=$1',[last.id,b.area_m2,b.source,req.actor.id]);
    }else await recordArea(tx,key,b.area_m2,today,b.source,req.actor.id);
   }
   await tx.query('UPDATE rooms SET area_m2=$2,space_type_id=$3,name=coalesce($4,name),auto_classified=false,needs_review=false WHERE id=$1',[key,b.area_m2,b.space_type_id,b.name??null]);
   await version(tx,req.actor,room.floor_id,'Confirmed room parameters');
   await audit(tx,req.actor,'room.parameters.confirm',key,{before:room,after:b});
   return {id:key};
  });
 });
 app.post('/api/departments/restore-names',async req=>{
  ensure(req.actor.role==='admin',403,'Требуется администратор');
  const b=z.object({sourceSha256:z.string().regex(/^[a-f0-9]{64}$/),departments:z.array(z.object({sourceId:z.string().regex(/^[0-9]+$/),name:z.string().trim().min(1).max(1000)}).strict()).min(1).max(100)}).strict().parse(req.body);
  ensure(new Set(b.departments.map(d=>d.sourceId)).size===b.departments.length,400,'Повторяющийся ID');
  return db.transaction(async tx=>{
   let updated=0;
   for(const d of [...b.departments].sort((a,b)=>a.sourceId.localeCompare(b.sourceId))){
    const key='d-'+d.sourceId;
    const row=await one(tx,'SELECT * FROM departments_projection WHERE id=$1 FOR UPDATE',[key]);ensure(row,404,'Подразделение не найдено');
    if(row.name===d.name)continue;
    ensure(row.name==='Bitrix department '+d.sourceId,409,'Название уже изменено: требуется сверка');
    await tx.query('UPDATE departments_projection SET name=$2,synced_at=now() WHERE id=$1',[key,d.name]);
    await audit(tx,req.actor,'department.name.restore',key,{before:row.name,after:d.name,sourceId:d.sourceId,sourceSha256:b.sourceSha256});updated++;
   }
   return {updated};
  });
 });
 app.get('/api/floors/:id/scale-preview',async req=>{
  const key=z.object({id}).parse(req.params).id;
  const floor=await floorAccess(db,req.actor,key);
  return {...scalePreview((await db.query('SELECT * FROM rooms WHERE floor_id=$1',[key])).rows),version:floor.version};
 });
 app.post('/api/floors/:id/scale-confirm',async req=>{
  const key=z.object({id}).parse(req.params).id;
  const b=z.object({expectedVersion:z.number().int().positive(),confirmed:z.literal(true),evidence:z.string().trim().min(10).max(2000)}).strict().parse(req.body);
  return db.transaction(async tx=>{
   await floorAccess(tx,req.actor,key);
   const floor=await one(tx,'SELECT * FROM floors WHERE id=$1 FOR UPDATE',[key]);
   ensure(floor.version===b.expectedVersion,409,'План или площади изменились. Откройте предварительный расчёт заново.');
   const rooms=(await tx.query('SELECT * FROM rooms WHERE floor_id=$1 ORDER BY id FOR UPDATE',[key])).rows;
   const p=scalePreview(rooms);
   ensure(p.consistent&&p.candidate,409,'Нужны не менее трёх комнат с известной площадью и согласованными контурами. Проверьте расхождения.');
   const evidence={status:'confirmed_by_reviewer',method:'median_known_room_areas',candidate:p.candidate,sampleCount:p.sampleCount,confirmedBy:req.actor.id,source:b.evidence};
   await tx.query('UPDATE floors SET meters_per_unit=$2,scale_evidence=$3 WHERE id=$1',[key,p.candidate,JSON.stringify(evidence)]);
   for(const room of rooms){const calculated=room.shape?.polygon&&validPolygon(room.shape.polygon)?polygonArea(room.shape.polygon,p.candidate):null;await tx.query('UPDATE rooms SET calculated_area_m2=$2 WHERE id=$1',[room.id,calculated]);}
   const v=await version(tx,req.actor,key,'Scale confirmed against known room areas');
   await audit(tx,req.actor,'floor.scale.confirm',key,{before:floor.meters_per_unit,after:p.candidate,evidence,preview:p});
   return {version:v,recovered:p.recoverable};
  });
 });
 app.get('/api/quarantine-decisions',async req=>{
  ensure(req.actor.role==='admin',403,'Требуется администратор');
  return (await db.query(`SELECT x.*,q.reason,coalesce(e.display_name,q.payload->>'name',q.source_id) object_name FROM quarantine_resolutions x JOIN migration_quarantine q ON q.id=x.quarantine_id LEFT JOIN employees_projection e ON e.id='e-'||(q.payload->>'employeeId') ORDER BY x.resolved_at DESC LIMIT 500`)).rows;
 });
 app.get('/api/quarantine/:id/decision',async req=>{
  ensure(req.actor.role==='admin',403,'Требуется администратор для нераспределённых данных импорта');
  const key=z.object({id}).parse(req.params).id;
  const q=await one(db,'SELECT * FROM migration_quarantine WHERE id=$1',[key]);ensure(q,404,'Запись не найдена');
  const employee=q.payload.employeeId?await one(db,'SELECT id,display_name,active FROM employees_projection WHERE id=$1',['e-'+q.payload.employeeId]):null;
  const current=employee?await one(db,'SELECT id,workplace_id FROM workplace_assignments WHERE employee_id=$1 AND valid_to IS NULL',[employee.id]):null;
  return {id:q.id,reason:q.reason,name:q.payload.name,code:q.payload.code,employee,current:current??null,resolution:await one(db,'SELECT * FROM quarantine_resolutions WHERE quarantine_id=$1',[key])??null};
 });
 app.post('/api/quarantine/:id/resolve',async req=>{
  ensure(req.actor.role==='admin',403,'Требуется администратор для нераспределённых данных импорта');
  const key=z.object({id}).parse(req.params).id;
  const b=z.object({action:z.enum(['assign','unassigned','recover_room','exclude']),evidence:z.string().trim().min(10).max(4000),workplaceId:id.nullable().default(null),expectedAssignmentId:id.nullable().default(null),floorId:id.optional(),spaceTypeId:id.optional(),area_m2:area.optional()}).strict().parse(req.body);
  return db.transaction(async tx=>{
   const q=await one(tx,'SELECT * FROM migration_quarantine WHERE id=$1 FOR UPDATE',[key]);ensure(q,404,'Запись не найдена');
   ensure(!await one(tx,'SELECT quarantine_id FROM quarantine_resolutions WHERE quarantine_id=$1',[key]),409,'Решение уже применено');
   let result:any={};
   if(b.action==='assign'||b.action==='unassigned'){
    ensure(q.payload.employeeId,400,'Это не конфликт размещения сотрудника');
    ensure(b.action!=='assign'||b.workplaceId,400,'Выберите подтверждённое рабочее место');
    result=await new OfficeService(db).reassign(req.actor,'e-'+q.payload.employeeId,b.action==='assign'?b.workplaceId:null,'workplace','',b.expectedAssignmentId,tx);
   }else if(b.action==='recover_room'){
    ensure(q.reason==='Missing floor'&&q.payload.iblock===135,400,'Это не помещение без этажа');
    ensure(b.floorId&&b.spaceTypeId,400,'Выберите этаж и тип помещения');
    const floor=await one(tx,'SELECT fl.id,fl.meters_per_unit FROM floors fl JOIN buildings b ON b.id=fl.building_id WHERE fl.id=$1 AND fl.active AND b.active FOR UPDATE OF fl',[b.floorId]);ensure(floor,400,'Выберите действующий этаж');
    ensure(await one(tx,'SELECT id FROM space_types WHERE id=$1',[b.spaceTypeId]),400,'Выберите тип помещения');
    const roomId='r-'+q.source_id;
    const shape=parseShape(q.payload.properties?.SHAPE?.[0]??'');
    await tx.query('INSERT INTO rooms(id,legacy_bitrix_id,floor_id,name,area_m2,shape,space_type_id,active,needs_review) VALUES($1,$2,$3,$4,$5,$6,$7,true,true)',[roomId,q.source_id,b.floorId,q.payload.name,b.area_m2??null,JSON.stringify(shape),b.spaceTypeId]);
    if(floor.meters_per_unit&&shape.polygon&&validPolygon(shape.polygon)) await tx.query('UPDATE rooms SET calculated_area_m2=$2 WHERE id=$1',[roomId,polygonArea(shape.polygon,Number(floor.meters_per_unit))]);
    await recordArea(tx,roomId,b.area_m2??null,(await one(tx,'SELECT CURRENT_DATE::text today')).today,b.evidence,req.actor.id);
    await version(tx,req.actor,b.floorId!,'Recovered room with confirmed floor');
    result={roomId,floorId:b.floorId};
   }else{
    ensure(!q.payload.employeeId,400,'Для сотрудника подтвердите место или отсутствие постоянного места');
    result={excluded:true,sourcePreserved:true};
   }
   await tx.query('INSERT INTO quarantine_resolutions(quarantine_id,action,evidence,result,resolved_by) VALUES($1,$2,$3,$4,$5)',[key,b.action,b.evidence,JSON.stringify(result),req.actor.id]);
   await tx.query(`INSERT INTO quality_reviews(category,entity_id,status,comment,reviewed_by,resolution_note,resolved_at) VALUES('quarantine',$1,'RESOLVED','',$2,$3,now()) ON CONFLICT(category,entity_id) DO UPDATE SET status='RESOLVED',reviewed_by=$2,resolution_note=$3,resolved_at=now(),updated_at=now(),revision=quality_reviews.revision+1`,[key,req.actor.id,b.evidence]);
   await audit(tx,req.actor,'quarantine.resolve',key,{action:b.action,evidence:b.evidence,result,sourceId:q.source_id});
   return result;
  });
 });
}
