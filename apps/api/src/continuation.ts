import { version as saveVersion } from './facility.js';
import { recordArea } from './domain/area-history.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Database } from './repositories/database.js';
import { one } from './repositories/database.js';
import { floorAccess, buildingAccess } from './domain/access.js';
import { ensure } from './domain/errors.js';
import { manage } from './domain/permissions.js';
import { OfficeRepository } from './repositories/office.js';
import { OfficeService, audit } from './services/office.js';
import { layoutInput } from '@office/shared';
const key = z.string().min(1).max(128);
const geometry = (f: any) => ({id:f.id,x:f.x,y:f.y,rotation:f.rotation,width:f.width,depth:f.depth,room_id:f.room_id,active:f.active});
export function registerContinuation(app: FastifyInstance, db: Database) {
  app.get('/api/rooms/:id/area-history',async req=>{
    const {id}=z.object({id:key}).parse(req.params);
    const room=await one(db,'SELECT floor_id FROM rooms WHERE id=$1',[id]);ensure(room,404,'Room not found');
    await floorAccess(db,req.actor,room.floor_id);
    return (await db.query('SELECT id,area_m2,valid_from,valid_to,source FROM room_area_history WHERE room_id=$1 ORDER BY valid_from',[id])).rows;
  });
  app.post('/api/rooms/:id/area-history',async req=>{
    const {id}=z.object({id:key}).parse(req.params);
    const b=z.object({area_m2:z.number().finite().min(0).max(1e7).nullable(),valid_from:z.iso.date(),source:z.string().trim().min(1).max(500),expectedArea:z.number().nullable()}).strict().parse(req.body);
    return db.transaction(async tx=>{
      const location=await one(tx,'SELECT floor_id FROM rooms WHERE id=$1',[id]);ensure(location,404,'Room not found');
      await tx.query('SELECT id FROM floors WHERE id=$1 FOR UPDATE',[location.floor_id]);
      const room=await one(tx,'SELECT * FROM rooms WHERE id=$1 FOR UPDATE',[id]);ensure(room,404,'Room not found');await floorAccess(tx,req.actor,room.floor_id);
      ensure((room.area_m2===null?null:Number(room.area_m2))===b.expectedArea,409,'Area changed. Reload.');
      const today=(await one(tx,'SELECT CURRENT_DATE::text today')).today;
      ensure(b.valid_from<=today,400,'Future measurements are not supported');
      await recordArea(tx,id,b.area_m2,b.valid_from,b.source,req.actor.id);
      await tx.query('UPDATE rooms SET area_m2=$2 WHERE id=$1',[id,b.area_m2]);
      await saveVersion(tx,req.actor,room.floor_id,'New area measurement');
      await audit(tx,req.actor,'room.area',id,{before:room.area_m2,...b});return {id,area_m2:b.area_m2};
    });
  });
  app.post('/api/inventory/bulk-check' , async req => {
    manage(req.actor);
    const b=z.object({ids:z.array(key).min(1).max(200),condition:z.enum(['in_use','stored','repair','retired']),note:z.string().max(1000).default('')}).strict().parse(req.body);
    ensure(new Set(b.ids).size===b.ids.length,400,'Duplicate inventory IDs');
    return db.transaction(async tx=>{
      for(const id of [...b.ids].sort()) {
        const f=await one(tx,'SELECT * FROM furniture WHERE id=$1 FOR UPDATE',[id]);
        ensure(f,404,'Furniture not found');await floorAccess(tx,req.actor,f.floor_id);
        await tx.query('UPDATE furniture SET condition=$2,inventory_note=$3,checked_at=now(),checked_by=$4 WHERE id=$1',[id,b.condition,b.note,req.actor.id]);
        await audit(tx,req.actor,'inventory.bulk-check',id,{before:{condition:f.condition,note:f.inventory_note},after:{condition:b.condition,note:b.note}});
      }
      return {updated:b.ids.length};
    });
  });
  app.post('/api/cost-rates/:id/close',async req=>{
    manage(req.actor);
    const {id}=z.object({id:key}).parse(req.params);
    const b=z.object({valid_to:z.iso.date(),expectedValidTo:z.iso.date().nullable()}).strict().parse(req.body);
    return db.transaction(async tx=>{
      const rate=await one(tx,'SELECT * FROM cost_rates WHERE id=$1 FOR UPDATE',[id]);
      ensure(rate,404,'Rate not found');
      if(rate.building_id) await buildingAccess(tx,req.actor,rate.building_id);
      else if(rate.room_id){const room=await one(tx,'SELECT floor_id FROM rooms WHERE id=$1',[rate.room_id]);ensure(room,404,'Room not found');await floorAccess(tx,req.actor,room.floor_id);}
      else ensure(req.actor.role==='admin',403,'Global rates require admin');
      const date=(v:any)=>v==null?null:v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
      ensure(date(rate.valid_to)===b.expectedValidTo,409,'Rate changed. Reload.');
      ensure(b.valid_to>date(rate.valid_from)!,400,'Invalid validity period');
      ensure(!rate.valid_to||b.valid_to<=date(rate.valid_to)!,400,'Closing cannot extend a rate');
      await tx.query('UPDATE cost_rates SET valid_to=$2 WHERE id=$1',[id,b.valid_to]);
      await audit(tx,req.actor,'rate.close',id,{before:rate,valid_to:b.valid_to});return {id,valid_to:b.valid_to};
    });
  });
  app.get('/api/floors/:id/versions/:version',async req=>{
    const {id,version}=z.object({id:key,version:z.coerce.number().int().positive()}).parse(req.params);
    await floorAccess(db,req.actor,id);
    const saved=await one(db,'SELECT version,comment,created_at,snapshot FROM layout_versions WHERE floor_id=$1 AND version=$2',[id,version]);
    ensure(saved,404,'Layout version not found');
    const current=await new OfficeRepository(db).layout(id);
    const old=new Map<string,any>((saved.snapshot.furniture??[]).map((f:any)=>[f.id,geometry(f)]));
    const now=new Map<string,any>((current?.furniture??[]).map((f:any)=>[f.id,geometry(f)]));
    const diff=[...new Set([...old.keys(),...now.keys()])].sort().flatMap(id=>JSON.stringify(old.get(id))===JSON.stringify(now.get(id))?[]:[{id,before:old.get(id)??null,after:now.get(id)??null}]);
    const roomShape=(r:any)=>({name:r.name,shape:r.shape,area_m2:r.area_m2,space_type_id:r.space_type_id,active:r.active});
    const roomDiff=[...new Set<string>([...(saved.snapshot.rooms??[]).map((r:any)=>r.id),...current!.rooms.map((r:any)=>r.id)])].flatMap(id=>{
      const a=saved.snapshot.rooms?.find((r:any)=>r.id===id),b=current!.rooms.find((r:any)=>r.id===id);
      const before=a?roomShape(a):null,after=b?roomShape(b):null;
      return JSON.stringify(before)===JSON.stringify(after)?[]:[{id,before,after}];
    });
    const floorFields=['width','height','background_svg','meters_per_unit'];
    const floorChanged=floorFields.filter(k=>JSON.stringify(saved.snapshot.floor?.[k])!==JSON.stringify((current!.floor as any)[k]));
    return {version:saved.version,comment:saved.comment,created_at:saved.created_at,currentVersion:current!.floor.version,diff:diff.map(d=>({...d,kind:!d.before?'added':!d.after?'removed':d.before.room_id!==d.after.room_id?'room_changed':'moved'})),roomDiff,floorChanged};
  });
  app.post('/api/floors/:id/versions/:version/restore-geometry',async req=>{
    const {id,version}=z.object({id:key,version:z.coerce.number().int().positive()}).parse(req.params);
    const {expectedVersion}=z.object({expectedVersion:z.number().int().positive()}).strict().parse(req.body);
    await floorAccess(db,req.actor,id);
    const saved=await one(db,'SELECT snapshot FROM layout_versions WHERE floor_id=$1 AND version=$2',[id,version]);ensure(saved,404,'Layout version not found');
    const current=(await new OfficeRepository(db).layout(id))!;
    ensure(current.floor.version===expectedVersion,409,'Layout changed. Reload.');
    const previous=saved.snapshot.furniture.filter((f:any)=>f.active);
    const active=current.furniture.filter((f:any)=>f.active);
    ensure(previous.length===active.length&&previous.every((f:any)=>active.some((x:any)=>x.id===f.id)),409,'Furniture set changed; automatic geometry restore unavailable');
    const changes=previous.filter((f:any)=>JSON.stringify(geometry(f))!==JSON.stringify(geometry(active.find((x:any)=>x.id===f.id)))).map((f:any)=>{
      ensure(f.width>0&&f.depth>0,409,'Historical geometry has unknown dimensions');
      return {id:f.id,x:f.x,y:f.y,rotation:f.rotation,width:f.width,depth:f.depth,roomId:f.room_id};
    });
    ensure(changes.length>0,409,'Geometry is already current');
    return new OfficeService(db).layout(req.actor,id,layoutInput.parse({expectedVersion,comment:'Restore geometry from version '+version,changes}));
  });
}
