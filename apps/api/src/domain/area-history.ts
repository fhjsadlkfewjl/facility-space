import { randomUUID } from 'node:crypto';
import type { Connection } from '../repositories/database.js';
import { one } from '../repositories/database.js';
import { ensure } from './errors.js';
// Call only while holding the room row lock. Intervals are [from, to).
export async function recordArea(tx: Connection, roomId: string, area: number|null, from: string, source: string, actor: string) {
  const last=await one(tx,'SELECT *,valid_from::text since FROM room_area_history WHERE room_id=$1 AND valid_to IS NULL FOR UPDATE',[roomId]);
  if(last && (last.area_m2===null?null:Number(last.area_m2))===area) return;
  ensure(!last||from>last.since,409,'A new measurement must start after the previous measurement date');
  if(last) await tx.query('UPDATE room_area_history SET valid_to=$2 WHERE id=$1',[last.id,from]);
  await tx.query('INSERT INTO room_area_history(id,room_id,area_m2,valid_from,source,created_by) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),roomId,area,from,source,actor]);
}
