import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Actor } from '@office/shared';
import type { Database } from '../repositories/database.js';
import { one } from '../repositories/database.js';
import { ensure } from '../domain/errors.js';
import { assign } from '../domain/permissions.js';
import { buildingAccess, resourceBuilding } from '../domain/access.js';
import { audit } from './office.js';
export const bookingInput = z
  .object({
    kind: z.enum(['workplace', 'parking']),
    resourceId: z.string().min(1).max(128),
    employeeId: z.string().min(1).max(128),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    vehicle: z.string().max(80).default(''),
  })
  .strict();
export class BookingService {
  constructor(readonly db: Database) {}
  async create(actor: Actor, i: z.infer<typeof bookingInput>) {
    assign(actor, i.employeeId);
    const start = new Date(i.startsAt),
      end = new Date(i.endsAt);
    ensure(
      start.getTime() < end.getTime() && end.getTime() - start.getTime() <= 90 * 86400000,
      400,
      'Booking must be between 0 and 90 days',
    );
    ensure(start.getTime() >= Date.now() - 60000, 400, 'Booking cannot start in the past');
    return this.db.transaction(async (tx) => {
      // All reservations and assignments use employee -> resource locks in this order.
      ensure(
        (
          await one(tx, 'SELECT active FROM employees_projection WHERE id=$1 FOR UPDATE', [
            i.employeeId,
          ])
        )?.active,
        404,
        'Active employee not found',
      );
      const workplace = i.kind === 'workplace',
        table = workplace ? 'workplaces' : 'parking_spots',
        field = workplace ? 'workplace_id' : 'parking_spot_id';
      const resource = await one(tx, `SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`, [
        i.resourceId,
      ]);
      ensure(resource?.status === 'available', 409, 'Resource unavailable');
      const building = await resourceBuilding(tx, i.kind, i.resourceId);
      ensure(
        await one(tx, 'SELECT id FROM buildings WHERE id=$1 AND active', [building]),
        409,
        'Building inactive',
      );
      if (actor.role === 'facilities') await buildingAccess(tx, actor, building);
      if (workplace)
        ensure(
          await one(
            tx,
            `SELECT f.id FROM furniture f JOIN floors fl ON fl.id=f.floor_id LEFT JOIN rooms r ON r.id=f.room_id WHERE f.id=$1 AND f.active AND fl.active AND (r.id IS NULL OR r.active)`,
            [resource.furniture_id],
          ),
          409,
          'Workplace inactive',
        );
      ensure(
        !(await one(
          tx,
          `SELECT id FROM ${workplace ? 'workplace_assignments' : 'parking_assignments'} WHERE ${field}=$1 AND valid_to IS NULL`,
          [i.resourceId],
        )),
        409,
        'Resource has a permanent assignment',
      );
      ensure(
        !(await one(
          tx,
          `SELECT id FROM bookings WHERE status='confirmed' AND ${field}=$1 AND starts_at<$3::timestamptz AND ends_at>$2::timestamptz`,
          [i.resourceId, i.startsAt, i.endsAt],
        )),
        409,
        'Booking overlaps an existing reservation',
      );
      ensure(
        !(await one(
          tx,
          `SELECT id FROM bookings WHERE status='confirmed' AND employee_id=$1 AND ${field} IS NOT NULL AND starts_at<$3::timestamptz AND ends_at>$2::timestamptz`,
          [i.employeeId, i.startsAt, i.endsAt],
        )),
        409,
        'Employee already has a booking of this kind',
      );
      const id = randomUUID();
      await tx.query(
        `INSERT INTO bookings(id,${field},employee_id,starts_at,ends_at,vehicle,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [id, i.resourceId, i.employeeId, i.startsAt, i.endsAt, i.vehicle, actor.id],
      );
      await audit(tx, actor, 'booking.create', id, i);
      return { id };
    });
  }
  async cancel(actor: Actor, id: string) {
    return this.db.transaction(async (tx) => {
      const b = await one(tx, 'SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [id]);
      ensure(b, 404, 'Booking not found');
      assign(actor, b.employee_id);
      if (actor.role === 'facilities')
        await buildingAccess(
          tx,
          actor,
          await resourceBuilding(
            tx,
            b.workplace_id ? 'workplace' : 'parking',
            b.workplace_id ?? b.parking_spot_id,
          ),
        );
      if (b.status === 'cancelled') return b;
      await tx.query("UPDATE bookings SET status='cancelled' WHERE id=$1", [id]);
      await audit(tx, actor, 'booking.cancel', id, { before: b });
      return { id, status: 'cancelled' };
    });
  }
}
