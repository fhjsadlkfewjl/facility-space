import {registerEditor} from './editor.js';
import { registerBuildingWizard } from './building-wizard.js';
import { registerImportCenter } from './import-center.js';
import { registerCorporate } from './corporate.js';
import { registerLeases } from './leases.js';
import { registerRepairs } from './repairs.js';
import { registerBulk } from './bulk.js';
import { registerRestore } from './restore.js';
import { registerQuality } from './quality.js';
import Fastify from 'fastify';
import { registerContinuation } from './continuation.js';
import { recordArea } from './domain/area-history.js';
import { registerFacility, version } from './facility.js';
import { buildingAccess, floorAccess } from './domain/access.js';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { z, ZodError } from 'zod';
import type { Actor } from '@office/shared';
import { assignmentInput, parkingAssignmentInput, layoutInput, rateInput } from '@office/shared';
import type { Database } from './repositories/database.js';
import { one } from './repositories/database.js';
import { OfficeRepository } from './repositories/office.js';
import { OfficeService, audit } from './services/office.js';
import type { IdentityAdapter } from './adapters/identity.js';
import { ensure } from './domain/errors.js';
import { manage } from './domain/permissions.js';
import { randomUUID } from 'node:crypto';
declare module 'fastify' {
  interface FastifyRequest {
    actor: Actor;
  }
}
export async function buildApp(db: Database, identity: IdentityAdapter, logger = false, rateLimitMax = 300) {
  const app = Fastify({
    logger: logger ? { redact: ['req.headers.authorization'] } : false,
    bodyLimit: 1024 * 1024,
  });
  await app.register(helmet);
  await app.register(rateLimit, { max: rateLimitMax, timeWindow: '1 minute' });
  app.setErrorHandler((e, req, reply) => {
    const error = e as any;
    const code =
      e instanceof ZodError
        ? 400
        : ['23505', '40001', '40P01'].includes(error.code)
          ? 409
          : error.code === '23503'
            ? 400
            : (error.statusCode ?? 500);
    if (code >= 500) req.log.error(e);
    reply.code(code).send({
      error:
        code >= 500
          ? 'Internal server error'
          : e instanceof ZodError
            ? 'Invalid request: ' +
              e.issues.map((i) => i.path.join('.') + ' ' + i.message).join(';')
            : code === 409 && error.code
              ? 'Concurrent conflict; reload and retry'
              : error.message,
    });
  });
  app.addHook('onRequest', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (req.url.split('?')[0] !== '/health')
      req.actor = await identity.authenticate(req.headers.authorization);
  });
  app.get('/health', async () => {
    await db.query('SELECT 1');
    return { status: 'ok' };
  });
  const repo = new OfficeRepository(db),
    service = new OfficeService(db);
  const pathId = (req: any) => z.object({ id: z.string().min(1).max(128) }).parse(req.params).id;
  app.get('/api/me', async (req) => req.actor);
  app.get('/api/offices', () => repo.buildings());
  app.get('/api/buildings', () => repo.buildings());
  app.get('/api/buildings/:id', async (req) => {
    const row = (await repo.buildings()).find((b) => b.id === pathId(req));
    ensure(row, 404, 'Building not found');
    return { ...row, floors: await repo.floors(row.id) };
  });
  app.get('/api/floors', async (req) =>
    repo.floors(z.object({ buildingId: z.string().optional() }).parse(req.query).buildingId),
  );
  app.get('/api/floors/:id/layout', async (req) => {
    const l = await repo.layout(pathId(req));
    ensure(l, 404, 'Floor not found');
    return l;
  });
  app.put('/api/floors/:id/layout', async (req) => {
    manage(req.actor);
    return service.layout(req.actor, pathId(req), layoutInput.parse(req.body));
  });
  app.get('/api/floors/:id/versions', async (req) => {
    await floorAccess(db, req.actor, pathId(req));
    return (
      await db.query(
        'SELECT id,version,comment,created_at,created_by FROM layout_versions WHERE floor_id=$1 ORDER BY version DESC LIMIT 100',
        [pathId(req)],
      )
    ).rows;
  });
  app.get('/api/rooms', async (req) => {
    const q = z.object({ floorId: z.string() }).parse(req.query);
    return (await db.query('SELECT * FROM rooms WHERE floor_id=$1', [q.floorId])).rows;
  });
  app.get('/api/rooms/:id', async (req) => {
    const r = await one(db, 'SELECT * FROM rooms WHERE id=$1', [pathId(req)]);
    ensure(r, 404, 'Room not found');
    return r;
  });
  app.get('/api/workplaces', (req) =>
    repo.workplaces(z.object({ floorId: z.string().optional() }).parse(req.query).floorId),
  );
  app.get('/api/workplaces/:id', async (req) => {
    const row = (await repo.workplaces()).find((w) => w.id === pathId(req));
    ensure(row, 404, 'Workplace not found');
    return row;
  });
  app.get('/api/search', (req) => {
    const q = z
      .object({
        q: z.string().max(120).default(''),
        scope: z.enum(['all','assigned','missing_name']).default('all'),
        offset: z.coerce.number().int().min(0).max(100000).default(0),
      })
      .parse(req.query);
    return repo.people(q.q, q.offset, q.scope);
  });
  app.get(
    '/api/departments',
    async () =>
      (
        await db.query(
          `SELECT d.*,count(e.id)::int headcount FROM departments_projection d LEFT JOIN employees_projection e ON e.department_id=d.id AND e.active GROUP BY d.id ORDER BY d.name`,
        )
      ).rows,
  );
  app.post('/api/assignments', (req) => {
    const i = assignmentInput.parse(req.body);
    manage(req.actor);
    return service.reassign(req.actor, i.employeeId, i.workplaceId, 'workplace', '', i.expectedAssignmentId);
  });
  app.get('/api/me/workplace', async (req) => {
    return await one(db, `SELECT a.id assignment_id,w.id workplace_id,w.code,f.id furniture_id,
      f.room_id,r.name room_name,f.floor_id,fl.name floor_name,fl.building_id,b.name building_name
      FROM workplace_assignments a JOIN workplaces w ON w.id=a.workplace_id
      JOIN furniture f ON f.id=w.furniture_id JOIN floors fl ON fl.id=f.floor_id
      JOIN buildings b ON b.id=fl.building_id LEFT JOIN rooms r ON r.id=f.room_id
      WHERE a.employee_id=$1 AND a.valid_to IS NULL`, [req.actor.employeeId]) ?? null;
  });
  app.post('/api/me/workplace', async (req) => {
    const input=z.object({workplaceId:z.string().min(1).max(128),
      expectedAssignmentId:z.string().min(1).max(128).nullable(),
      confirmMove:z.boolean().default(false)}).strict().parse(req.body);
    ensure(input.expectedAssignmentId===null || input.confirmMove,409,'Confirm moving from your current workplace');
    return service.reassign(req.actor,req.actor.employeeId,input.workplaceId,'workplace','',input.expectedAssignmentId);
  });
  app.post('/api/me/workplace/release', async (req) => {
    const input=z.object({expectedAssignmentId:z.string().min(1).max(128)}).strict().parse(req.body);
    return service.reassign(req.actor,req.actor.employeeId,null,'workplace','',input.expectedAssignmentId);
  });
  app.get('/api/assignments', async (req) => {
    const employeeId = req.actor.role === 'employee' ? req.actor.employeeId : null;
    return (
      await db.query(
        'SELECT * FROM workplace_assignments WHERE ($1::text IS NULL OR employee_id=$1) ORDER BY valid_from DESC LIMIT 500',
        [employeeId],
      )
    ).rows;
  });
  app.get(
    '/api/space-types',
    async () => (await db.query('SELECT * FROM space_types ORDER BY name')).rows,
  );
  app.post('/api/space-types', async (req) => {
    manage(req.actor);
    const b = z
      .object({
        id: z.string().regex(/^[a-z_]{2,40}$/),
        name: z.string().min(1).max(100),
        category: z.enum(['OFFICE', 'COMMON', 'TECHNICAL', 'OTHER']).default('OTHER'),
        subtype: z
          .enum([
            'office',
            'open_space',
            'meeting_room',
            'corridor',
            'restroom',
            'kitchen',
            'break_room',
            'lobby',
            'storage',
            'server_room',
            'technical',
            'parking',
            'outdoor',
            'other',
          ])
          .default('other'),
      })
      .strict()
      .parse(req.body);
    return db.transaction(async (tx) => {
      await tx.query('INSERT INTO space_types(id,name,category,subtype) VALUES($1,$2,$3,$4)', [
        b.id,
        b.name,
        b.category,
        b.subtype,
      ]);
      await audit(tx, req.actor, 'space_type.create', b.id, b);
      return b;
    });
  });
  app.patch('/api/rooms/:id/space', async (req) => {
    manage(req.actor);
    const b = z
      .object({
        space_type_id: z.string().min(1),
        area_m2: z.number().finite().nonnegative().max(1e7),
      })
      .strict()
      .parse(req.body);
    return db.transaction(async (tx) => {
      const location=await one(tx,'SELECT floor_id FROM rooms WHERE id=$1',[pathId(req)]);ensure(location,404,'Room not found');
      await tx.query('SELECT id FROM floors WHERE id=$1 FOR UPDATE',[location.floor_id]);
      const before = await one(tx, 'SELECT * FROM rooms WHERE id=$1 FOR UPDATE', [pathId(req)]);
      ensure(before, 404, 'Room not found');
      await floorAccess(tx, req.actor, before.floor_id);
      const room = await one(
        tx,
        'UPDATE rooms SET space_type_id=$1,area_m2=$2 WHERE id=$3 RETURNING *',
        [b.space_type_id, b.area_m2, pathId(req)],
      );
      ensure(room, 404, 'Room not found');
      await recordArea(tx,room.id,b.area_m2,(await one(tx,'SELECT CURRENT_DATE::text today')).today,'room area editor',req.actor.id);
      await version(tx,req.actor,room.floor_id,'Room area/classification');
      await audit(tx, req.actor, 'room.space', room.id, { before, after: b });
      return room;
    });
  });
  app.get('/api/costs', (req) => {
    manage(req.actor);
    const q = z.object({ asOf: z.iso.date().optional() }).parse(req.query);
    return service.costs(q.asOf);
  });
  app.get('/api/cost-rates', async (req) => {
    manage(req.actor);
    return (await db.query('SELECT * FROM cost_rates ORDER BY valid_from DESC')).rows;
  });
  app.post('/api/cost-rates', (req) => service.rate(req.actor, rateInput.parse(req.body)));
  app.get(
    '/api/parking',
    async () =>
      (
        await db.query(
          `SELECT p.*,a.id assignment_id,a.employee_id,a.vehicle,e.display_name,b.active building_active,EXISTS(SELECT 1 FROM bookings bk WHERE bk.parking_spot_id=p.id AND bk.status='confirmed' AND bk.ends_at>now()) future_reserved,EXISTS(SELECT 1 FROM bookings bk WHERE bk.parking_spot_id=p.id AND bk.status='confirmed' AND bk.starts_at<=now() AND bk.ends_at>now()) reserved FROM parking_spots p JOIN buildings b ON b.id=p.building_id LEFT JOIN parking_assignments a ON a.parking_spot_id=p.id AND a.valid_to IS NULL LEFT JOIN employees_projection e ON e.id=a.employee_id ORDER BY p.number`,
        )
      ).rows,
  );
  app.post('/api/parking', async (req) => {
    manage(req.actor);
    const b = z
      .object({
        building_id: z.string(),
        number: z.string().min(1).max(30),
        area_m2: z.number().nonnegative().nullable().default(null),
      })
      .strict()
      .parse(req.body);
    return db.transaction(async (tx) => {
      await buildingAccess(tx, req.actor, b.building_id);
      const id = randomUUID();
      await tx.query(
        'INSERT INTO parking_spots(id,building_id,number,area_m2) VALUES($1,$2,$3,$4)',
        [id, b.building_id, b.number, b.area_m2],
      );
      await audit(tx, req.actor, 'parking.create', id, b);
      return { id };
    });
  });
  app.post('/api/parking/assignments', (req) => {
    const i = parkingAssignmentInput.parse(req.body);
    return service.reassign(req.actor, i.employeeId, i.parkingSpotId, 'parking', i.vehicle, i.expectedAssignmentId);
  });
  app.get('/api/audit', async (req) => {
    manage(req.actor);
    const q = z
      .object({
        offset: z.coerce.number().int().nonnegative().default(0),
        q: z.string().max(120).default(''),
      })
      .parse(req.query);
    return (
      await db.query(
        `SELECT a.*,e.display_name actor_name,coalesce(ep.display_name,r.name,w.code,bw.code,fu.inventory_number,ft.name,et.name,b.name,fl.name,la.contract_number,ps.number) entity_name,oldw.code before_place,neww.code after_place FROM audit_log a LEFT JOIN employees_projection ep ON ep.id=a.entity_id LEFT JOIN bookings bk ON bk.id=a.entity_id LEFT JOIN workplaces bw ON bw.id=bk.workplace_id LEFT JOIN workplaces oldw ON oldw.id=a.details->>'previous' LEFT JOIN workplaces neww ON neww.id=a.details->>'target' LEFT JOIN employees_projection e ON e.id=a.actor_id LEFT JOIN rooms r ON r.id=a.entity_id LEFT JOIN workplaces w ON w.id=a.entity_id LEFT JOIN furniture fu ON fu.id=a.entity_id LEFT JOIN furniture_templates ft ON ft.id=fu.template_id LEFT JOIN furniture_templates et ON et.id=a.entity_id LEFT JOIN buildings b ON b.id=a.entity_id LEFT JOIN floors fl ON fl.id=a.entity_id LEFT JOIN lease_agreements la ON la.id=a.entity_id LEFT JOIN parking_spots ps ON ps.id=a.entity_id WHERE a.action ILIKE $1 OR a.entity_id ILIKE $1 OR a.actor_id ILIKE $1 OR e.display_name ILIKE $1 OR r.name ILIKE $1 ORDER BY a.created_at DESC,a.id DESC LIMIT 100 OFFSET $2`,
        ['%' + q.q + '%', q.offset],
      )
    ).rows;
  });
  registerEditor(app, db);
  registerFacility(app, db);
  registerContinuation(app, db);
  registerQuality(app, db);
  registerRepairs(app, db);
  registerRestore(app, db);
  registerBulk(app, db);
  registerCorporate(app, db);
  registerBuildingWizard(app, db);
  registerImportCenter(app, db);
  registerLeases(app, db);
  return app;
}
