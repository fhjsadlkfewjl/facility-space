import type { Actor } from '@office/shared';
import type { Connection } from '../repositories/database.js';
import { one } from '../repositories/database.js';
import { ensure } from './errors.js';
import { manage } from './permissions.js';
export async function buildingAccess(tx: Connection, actor: Actor, buildingId: string) {
  manage(actor);
  ensure(
    await one(tx, 'SELECT id FROM buildings WHERE id=$1 AND active', [buildingId]),
    404,
    'Active building not found',
  );
  if (actor.role === 'admin') return;
  ensure(
    await one(tx, 'SELECT 1 FROM building_managers WHERE building_id=$1 AND employee_id=$2', [
      buildingId,
      actor.employeeId,
    ]),
    403,
    'Building is outside your responsibility',
  );
}
export async function floorAccess(tx: Connection, actor: Actor, floorId: string) {
  const floor = await one(tx, 'SELECT * FROM floors WHERE id=$1 AND active', [floorId]);
  ensure(floor, 404, 'Active floor not found');
  await buildingAccess(tx, actor, floor.building_id);
  return floor;
}
export async function resourceBuilding(tx: Connection, kind: 'workplace' | 'parking', id: string) {
  const row = await one(
    tx,
    kind === 'parking'
      ? 'SELECT building_id FROM parking_spots WHERE id=$1'
      : 'SELECT fl.building_id FROM workplaces w JOIN furniture f ON f.id=w.furniture_id JOIN floors fl ON fl.id=f.floor_id WHERE w.id=$1',
    [id],
  );
  ensure(row, 404, 'Resource not found');
  return row.building_id as string;
}
