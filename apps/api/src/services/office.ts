import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Actor, Furniture } from '@office/shared';
import { layoutInput, rateInput } from '@office/shared';
import type { Database, Connection } from '../repositories/database.js';
import { one } from '../repositories/database.js';
import { OfficeRepository } from '../repositories/office.js';
import { ensure } from '../domain/errors.js';
import { buildingAccess, floorAccess, resourceBuilding } from '../domain/access.js';
import { assign, manage } from '../domain/permissions.js';
import { validatePlacement } from '../domain/geometry.js';
export async function audit(
  tx: Connection,
  actor: Actor,
  action: string,
  id: string,
  details: unknown,
) {
  await tx.query(
    'INSERT INTO audit_log(id,actor_id,action,entity_id,details) VALUES($1,$2,$3,$4,$5)',
    [randomUUID(), actor.id, action, id, JSON.stringify(details)],
  );
}
export class OfficeService {
  constructor(readonly db: Database) {}
  async reassign(
    actor: Actor,
    employeeId: string,
    target: string | null,
    kind: 'workplace' | 'parking' = 'workplace',
    vehicle = '',
    expectedAssignmentId?: string | null,
    connection?: Connection,
  ) {
    assign(actor, employeeId);
    const run = async (tx: Connection) => {
      // Serialize per employee first, then target row. Unique partial indexes remain the final guard.
      const employee = await one(
        tx,
        'SELECT id,active FROM employees_projection WHERE id=$1 FOR UPDATE',
        [employeeId],
      );
      ensure(employee?.active, 404, 'Active employee not found');
      const table = kind === 'workplace' ? 'workplace_assignments' : 'parking_assignments',
        field = kind === 'workplace' ? 'workplace_id' : 'parking_spot_id',
        targets = kind === 'workplace' ? 'workplaces' : 'parking_spots';
      if (target) {
        const row = await one(tx, `SELECT * FROM ${targets} WHERE id=$1 FOR UPDATE`, [target]);
        ensure(row, 404, 'Target not found');
        ensure(row.status === 'available', 409, 'Target disabled');
        if (kind === 'workplace') {
          const valid = await one(
            tx,
            `SELECT f.id FROM furniture f JOIN floors fl ON fl.id=f.floor_id JOIN buildings b ON b.id=fl.building_id LEFT JOIN rooms r ON r.id=f.room_id WHERE f.id=$1 AND f.active AND fl.active AND b.active AND (r.id IS NULL OR r.active)`,
            [row.furniture_id],
          );
          ensure(valid, 409, 'Workplace inactive');
        } else
          ensure(
            await one(tx, 'SELECT id FROM buildings WHERE id=$1 AND active', [row.building_id]),
            409,
            'Building inactive',
          );
        if (actor.role === 'facilities')
          await buildingAccess(tx, actor, await resourceBuilding(tx, kind, target));
        ensure(
          !(await one(
            tx,
            `SELECT id FROM bookings WHERE ${field}=$1 AND status='confirmed' AND ends_at>now()`,
            [target],
          )),
          409,
          'Resource has active or future bookings',
        );
        const occupied = await one(
          tx,
          `SELECT employee_id FROM ${table} WHERE ${field}=$1 AND valid_to IS NULL`,
          [target],
        );
        ensure(!occupied || occupied.employee_id === employeeId, 409, 'Target already occupied');
      }
      const previous = await one(
        tx,
        `SELECT * FROM ${table} WHERE employee_id=$1 AND valid_to IS NULL`,
        [employeeId],
      );
      if (expectedAssignmentId !== undefined)
        ensure((previous?.id ?? null) === expectedAssignmentId, 409, 'Your workplace changed. Reload and confirm the move.');
      if (previous && actor.role === 'facilities')
        await buildingAccess(tx, actor, await resourceBuilding(tx, kind, previous[field]));
      if (previous?.[field] === target) {
        if (kind === 'parking' && previous.vehicle !== vehicle) {
          await tx.query('UPDATE parking_assignments SET vehicle=$2 WHERE id=$1', [
            previous.id,
            vehicle,
          ]);
          await audit(tx, actor, 'parking.vehicle', previous.id, {
            before: previous.vehicle,
            after: vehicle,
          });
        }
        return previous;
      }
      await tx.query(
        `UPDATE ${table} SET valid_to=now() WHERE employee_id=$1 AND valid_to IS NULL`,
        [employeeId],
      );
      const id = randomUUID();
      if (target)
        await tx.query(
          `INSERT INTO ${table}(id,employee_id,${field},created_by) VALUES($1,$2,$3,$4)`,
          [id, employeeId, target, actor.id],
        );
      if (target && kind === 'parking')
        await tx.query('UPDATE parking_assignments SET vehicle=$2 WHERE id=$1', [id, vehicle]);
      await audit(tx, actor, kind + '.reassign', employeeId, {
        previous: previous?.[field] ?? null,
        target,
      });
      return { id: target ? id : null, employeeId, target };
    };
    return connection ? run(connection) : this.db.transaction(run);
  }
  async layout(actor: Actor, floorId: string, input: z.infer<typeof layoutInput>) {
    manage(actor);
    return this.db.transaction(async (tx) => {
      await floorAccess(tx, actor, floorId);
      const locked = await one(tx, 'SELECT version,active FROM floors WHERE id=$1 FOR UPDATE', [
        floorId,
      ]);
      ensure(locked?.active, 404, 'Active floor not found');
      ensure(
        locked.version === input.expectedVersion,
        409,
        'Layout changed. Reload before saving.',
      );
      const layout = (await new OfficeRepository(tx).layout(floorId))!;
      const before = structuredClone(layout);
      const ids = new Set(input.changes.map((c) => c.id));
      ensure(ids.size === input.changes.length, 400, 'Duplicate furniture changes');
      for (const change of input.changes) {
        const item = layout.furniture.find((f) => f.id === change.id);
        ensure(item?.active, 404, 'Furniture not found on floor');
        ensure((item as any).resize_allowed!==false||((change.width===undefined||change.width===item.width)&&(change.depth===undefined||change.depth===item.depth)),400,'Изменение размеров этого типа мебели запрещено');
        Object.assign(item, {
          x: change.x,
          y: change.y,
          rotation: ((change.rotation % 360) + 360) % 360,
          ...(change.width === undefined ? {} : { width: change.width }),
          ...(change.depth === undefined ? {} : { depth: change.depth }),
        });
      }
      for (const change of input.changes) {
        const item = layout.furniture.find((f) => f.id === change.id)!;
        item.room_id = validatePlacement(
          item as Furniture,
          layout.furniture,
          layout.rooms,
          change.roomId,
        );
        await tx.query(
          'UPDATE furniture SET x=$1,y=$2,rotation=$3,room_id=$4,geometry_verified=true,width=$6,depth=$7 WHERE id=$5',
          [item.x, item.y, item.rotation, item.room_id, item.id, item.width, item.depth],
        );
      }
      const version = locked.version + 1;
      await tx.query('UPDATE floors SET version=$1 WHERE id=$2', [version, floorId]);
      const after = await new OfficeRepository(tx).layout(floorId);
      await tx.query(
        'INSERT INTO layout_versions(id,floor_id,version,snapshot,comment,created_by) VALUES($1,$2,$3,$4,$5,$6)',
        [randomUUID(), floorId, version, JSON.stringify(after), input.comment, actor.id],
      );
      await audit(tx, actor, 'layout.save', floorId, {
        version,
        before: before.furniture.filter((f) => ids.has(f.id)),
        after: after?.furniture.filter((f) => ids.has(f.id)),
        changes: input.changes,
      });
      return { version };
    });
  }
  async rate(actor: Actor, input: z.infer<typeof rateInput>) {
    manage(actor);
    ensure(!(input.room_id && input.building_id), 400, 'Choose room or building scope');
    ensure(!input.valid_to || input.valid_to > input.valid_from, 400, 'Invalid validity period');
    return this.db.transaction(async (tx) => {
      if (actor.role === 'facilities') {
        if (input.building_id) await buildingAccess(tx, actor, input.building_id);
        else if (input.room_id) {
          const r = await one(tx, 'SELECT floor_id FROM rooms WHERE id=$1', [input.room_id]);
          ensure(r, 404, 'Room not found');
          await floorAccess(tx, actor, r.floor_id);
        } else ensure(false, 403, 'Global rates require admin');
      }
      // Lock common parent to make overlap validation safe across concurrent saves.
      ensure(
        await one(tx, 'SELECT id FROM space_types WHERE id=$1 FOR UPDATE', [input.space_type_id]),
        404,
        'Space type not found',
      );
      if (input.room_id)
        ensure(
          await one(tx, 'SELECT id FROM rooms WHERE id=$1 AND space_type_id=$2', [
            input.room_id,
            input.space_type_id,
          ]),
          400,
          'Room space type mismatch',
        );
      const overlap = await one(
        tx,
        `SELECT id FROM cost_rates WHERE space_type_id=$1 AND building_id IS NOT DISTINCT FROM $2 AND room_id IS NOT DISTINCT FROM $3 AND valid_from<COALESCE($5::date,'infinity'::date) AND COALESCE(valid_to,'infinity'::date)>$4::date`,
        [input.space_type_id, input.building_id, input.room_id, input.valid_from, input.valid_to],
      );
      ensure(!overlap, 409, 'Overlapping rate for this scope');
      const id = randomUUID();
      await tx.query(
        'INSERT INTO cost_rates(id,space_type_id,building_id,room_id,rate_per_m2,currency,period,valid_from,valid_to) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          id,
          input.space_type_id,
          input.building_id,
          input.room_id,
          input.rate_per_m2,
          input.currency,
          input.period,
          input.valid_from,
          input.valid_to,
        ],
      );
      await audit(tx, actor, 'cost_rate.create', id, input);
      return { id };
    });
  }
  async costs(asOf?: string) {
    return (
      await this.db.query(
        `SELECT r.id,r.name,r.floor_id,fl.building_id,fl.name floor_name,b.name building_name,CASE WHEN $1::date IS NULL THEN coalesce(r.area_m2,r.calculated_area_m2) ELSE ah.area_m2 END area_m2,c.currency,c.period,c.rate_per_m2,(CASE WHEN $1::date IS NULL THEN coalesce(r.area_m2,r.calculated_area_m2) ELSE ah.area_m2 END*c.rate_per_m2)::numeric(24,2) total_cost,coalesce(oc.occupants,0)::int occupants FROM rooms r LEFT JOIN LATERAL (SELECT area_m2 FROM room_area_history WHERE room_id=r.id AND valid_from<=coalesce($1::date,CURRENT_DATE) AND (valid_to IS NULL OR valid_to>coalesce($1::date,CURRENT_DATE)) ORDER BY valid_from DESC LIMIT 1) ah ON true LEFT JOIN (SELECT f.room_id,count(*) occupants FROM workplace_assignments a JOIN workplaces w ON w.id=a.workplace_id JOIN furniture f ON f.id=w.furniture_id WHERE a.valid_from<=coalesce($1::date::timestamptz,now()) AND (a.valid_to IS NULL OR a.valid_to>coalesce($1::date::timestamptz,now())) GROUP BY f.room_id) oc ON oc.room_id=r.id JOIN floors fl ON fl.id=r.floor_id LEFT JOIN LATERAL (SELECT * FROM cost_rates cr WHERE cr.space_type_id=CASE WHEN $1::date IS NULL THEN r.space_type_id ELSE (SELECT ch.space_type_id FROM room_classification_history ch WHERE ch.room_id=r.id AND ch.valid_from<=$1::date::timestamptz ORDER BY ch.valid_from DESC,ch.id DESC LIMIT 1) END AND (cr.room_id=r.id OR cr.room_id IS NULL AND (cr.building_id=fl.building_id OR cr.building_id IS NULL)) AND cr.valid_from<=coalesce($1::date,CURRENT_DATE) AND (cr.valid_to IS NULL OR cr.valid_to>coalesce($1::date,CURRENT_DATE)) ORDER BY (cr.room_id IS NOT NULL) DESC,(cr.building_id IS NOT NULL) DESC LIMIT 1) c ON true JOIN buildings b ON b.id=fl.building_id WHERE r.active AND fl.active AND b.active`,
        [asOf ?? null],
      )
    ).rows;
  }
}
