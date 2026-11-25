import {randomUUID} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import type {Database} from './repositories/database.js';
import {one} from './repositories/database.js';
import {floorAccess} from './domain/access.js';
import {ensure} from './domain/errors.js';
import {safeSvg} from './domain/svg.js';
import {validPolygon,contained,corners,collision} from './domain/geometry.js';
import {OfficeRepository} from './repositories/office.js';
import {audit} from './services/office.js';
import {recordArea} from './domain/area-history.js';
export function registerRestore(app:FastifyInstance,db:Database){
 app.post('/api/floors/:id/versions/:version/restore',async req=>{
  const {id,version}=z.object({id:z.string().max(128),version:z.coerce.number().int().positive()}).parse(req.params);
  const {expectedVersion}=z.object({expectedVersion:z.number().int().positive()}).strict().parse(req.body);
  return db.transaction(async tx=>{
   await floorAccess(tx,req.actor,id);
   const floor=await one(tx,'SELECT * FROM floors WHERE id=$1 FOR UPDATE',[id]);ensure(floor.version===expectedVersion,409,'Layout changed. Reload.');
   const saved=await one(tx,'SELECT snapshot FROM layout_versions WHERE floor_id=$1 AND version=$2',[id,version]);ensure(saved,404,'Version not found');
   const s=saved.snapshot;ensure(s.floor?.id===id&&Array.isArray(s.rooms)&&Array.isArray(s.furniture),409,'Incomplete historical snapshot');
   ensure(Number.isFinite(s.floor.width)&&Number.isFinite(s.floor.height)&&s.floor.width>0&&s.floor.height>0,409,'Invalid historical floor');
   const bg=s.floor.background_svg?safeSvg(s.floor.background_svg):null;
   for(const r of s.rooms){ensure(r.floor_id===id,409,'Historical room belongs to another floor');if(r.active)ensure(Array.isArray(r.shape?.polygon)&&validPolygon(r.shape.polygon)&&r.shape.polygon.every((p:number[])=>p[0]>=0&&p[1]>=0&&p[0]<=s.floor.width&&p[1]<=s.floor.height),409,'Invalid historical room geometry');}
   for(const f of s.furniture){
    ensure(f.floor_id===id,409,'Historical furniture belongs to another floor');
    if(f.active){ensure([f.x,f.y,f.rotation].every(Number.isFinite),409,'Invalid historical furniture geometry');
     const r=s.rooms.find((r:any)=>r.id===f.room_id&&r.active);
     if(f.room_id)ensure(r,409,'Historical furniture has no active room');
     if(f.width&&f.depth){ensure(corners(f).every(p=>p[0]>=0&&p[1]>=0&&p[0]<=s.floor.width&&p[1]<=s.floor.height),409,'Historical furniture exceeds floor');if(r)ensure(contained(corners(f),r.shape.polygon),409,'Historical furniture exceeds room');}
     else {const old=await one(tx,'SELECT x,y,rotation,room_id,active FROM furniture WHERE id=$1',[f.id]);ensure(old&&old.active&&old.x===f.x&&old.y===f.y&&old.rotation===f.rotation&&old.room_id===f.room_id,409,'Cannot restore changed geometry with unknown dimensions');}
    }
   }
   const known=s.furniture.filter((f:any)=>f.active&&f.width&&f.depth);
   for(let i=0;i<known.length;i++)for(let j=i+1;j<known.length;j++)ensure(!collision(corners(known[i]),corners(known[j])),409,'Historical furniture overlaps; reconcile before restore');
   const current=(await new OfficeRepository(tx).layout(id))!;
   const removed=current.furniture.filter(f=>f.active&&!s.furniture.some((old:any)=>old.id===f.id&&old.active));
   for(const f of removed){const w=await one(tx,'SELECT id FROM workplaces WHERE furniture_id=$1 FOR UPDATE',[f.id]);if(w){ensure(!(await one(tx,"SELECT id FROM workplace_assignments WHERE workplace_id=$1 AND valid_to IS NULL UNION ALL SELECT id FROM bookings WHERE workplace_id=$1 AND status='confirmed' AND ends_at>now()",[w.id])),409,'Release assignments and future bookings before removing furniture');await tx.query("UPDATE workplaces SET status='disabled' WHERE id=$1",[w.id]);}}
   const today=(await one(tx,'SELECT CURRENT_DATE::text today')).today;
   // Deactivate additions without deleting identities or business history.
   await tx.query('UPDATE furniture SET active=false WHERE floor_id=$1',[id]);
   await tx.query('UPDATE rooms SET active=false WHERE floor_id=$1',[id]);
   for(const r of s.rooms){
    await tx.query('INSERT INTO rooms(id,floor_id,name,space_type_id,area_m2,shape,calculated_area_m2,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET name=$3,space_type_id=$4,area_m2=$5,shape=$6,calculated_area_m2=$7,active=$8',[r.id,id,r.name,r.space_type_id,r.area_m2,JSON.stringify(r.shape),r.calculated_area_m2,r.active]);
    await recordArea(tx,r.id,r.area_m2===null?null:Number(r.area_m2),today,'layout restore version '+version,req.actor.id);
   }
   for(const f of s.furniture){
    await tx.query('INSERT INTO furniture(id,floor_id,room_id,template_id,inventory_number,x,y,rotation,width,depth,geometry_verified,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(id) DO UPDATE SET room_id=$3,template_id=$4,x=$6,y=$7,rotation=$8,width=$9,depth=$10,geometry_verified=$11,active=$12',[f.id,id,f.room_id,f.template_id,f.inventory_number,f.x,f.y,f.rotation,f.width,f.depth,f.geometry_verified,f.active]);
    // Assignment, inventory condition and workplace availability are current business state.
   }
   await tx.query('UPDATE floors SET width=$2,height=$3,background_svg=$4,meters_per_unit=$5,scale_evidence=$6,background_provenance=$7,version=version+1 WHERE id=$1',[id,s.floor.width,s.floor.height,bg,s.floor.meters_per_unit,JSON.stringify(s.floor.scale_evidence??{}),JSON.stringify(s.floor.background_provenance??{})]);
   const snapshot=await new OfficeRepository(tx).layout(id);
   await tx.query('INSERT INTO layout_versions(id,floor_id,version,snapshot,comment,created_by) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),id,expectedVersion+1,JSON.stringify(snapshot),'Restore layout version '+version,req.actor.id]);
   await audit(tx,req.actor,'layout.restore',id,{sourceVersion:version,previousVersion:expectedVersion,version:expectedVersion+1});
   return {version:expectedVersion+1};
  });
 });
}
