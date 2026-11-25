import test from 'node:test';
import assert from 'node:assert/strict';
import { postgres } from '../apps/api/src/repositories/database.js';
import { migrate } from '../scripts/migrate.js';
import { seed } from '../scripts/seed.js';
import { BookingService } from '../apps/api/src/services/booking.js';
import { OfficeService } from '../apps/api/src/services/office.js';
// Creates/drops only a uniquely named disposable schema in the explicitly provided test DB.
test(
  'native PostgreSQL: independent connections, race safety, rollback and persistence',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    const admin = postgres(url.toString());
    const schema = 'office_test_' + Date.now();
    await admin.query(`CREATE SCHEMA ${schema}`);
    url.searchParams.set('options', '-c search_path=' + schema);
    const db = postgres(url.toString());
    try {
      await migrate(db);
      await seed(db);
      const service = new OfficeService(db),
        actor = { id: 'test', employeeId: 'employee-1', role: 'admin' as const };
      const outcomes = await Promise.allSettled([
        service.reassign(actor, 'employee-7', 'workplace-7'),
        service.reassign(actor, 'employee-8', 'workplace-7'),
      ]);
      assert.equal(outcomes.filter((o) => o.status === 'fulfilled').length, 1);
      assert.equal(
        (
          await db.query(
            "SELECT * FROM workplace_assignments WHERE workplace_id='workplace-7' AND valid_to IS NULL",
          )
        ).rows.length,
        1,
      );
      await assert.rejects(() => service.reassign(actor, 'employee-1', 'workplace-2'));
      assert.equal(
        (
          await db.query(
            "SELECT workplace_id FROM workplace_assignments WHERE employee_id='employee-1' AND valid_to IS NULL",
          )
        ).rows[0].workplace_id,
        'workplace-1',
      );
      const edits = await Promise.allSettled([
        service.layout(actor, 'demo-floor', {
          expectedVersion: 1,
          comment: 'a',
          changes: [{ id: 'furniture-1', x: 140, y: 170, rotation: 0 }],
        }),
        service.layout(actor, 'demo-floor', {
          expectedVersion: 1,
          comment: 'b',
          changes: [{ id: 'furniture-2', x: 245, y: 170, rotation: 0 }],
        }),
      ]);
      assert.equal(edits.filter((o) => o.status === 'fulfilled').length, 1);
      assert.equal(
        (await db.query("SELECT version FROM floors WHERE id='demo-floor'")).rows[0].version,
        2,
      );
      const bookingService = new BookingService(db),
        window = {
          startsAt: new Date(Date.now() + 86400000).toISOString(),
          endsAt: new Date(Date.now() + 90000000).toISOString(),
          vehicle: '',
        };
      const bookingRace = await Promise.allSettled([
        bookingService.create(actor, {
          ...window,
          kind: 'workplace',
          resourceId: 'workplace-15',
          employeeId: 'employee-2',
        }),
        bookingService.create(actor, {
          ...window,
          kind: 'workplace',
          resourceId: 'workplace-15',
          employeeId: 'employee-3',
        }),
      ]);
      assert.equal(bookingRace.filter((o) => o.status === 'fulfilled').length, 1);
      const mixedRace = await Promise.allSettled([
        bookingService.create(actor, {
          ...window,
          kind: 'parking',
          resourceId: 'parking-6',
          employeeId: 'employee-4',
        }),
        service.reassign(actor, 'employee-5', 'parking-6', 'parking'),
      ]);
      assert.equal(mixedRace.filter((o) => o.status === 'fulfilled').length, 1);
      const workplaceMixed=await Promise.allSettled([
        bookingService.create(actor,{...window,kind:'workplace',resourceId:'workplace-16',employeeId:'employee-6'}),
        service.reassign(actor,'employee-1','workplace-16'),
      ]);
      assert.equal(workplaceMixed.filter(x=>x.status==='fulfilled').length,1);
      const db2 = postgres(url.toString());
      try {
        assert.equal((await db2.query('SELECT * FROM audit_log')).rows.length, 5);
      } finally {
        await db2.close();
      }
    } finally {
      await db.close();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.close();
    }
  },
);
