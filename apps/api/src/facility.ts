import { recordArea } from './domain/area-history.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { Actor, Point } from '@office/shared';
import type { Database, Connection } from './repositories/database.js';
import { one } from './repositories/database.js';
import { OfficeRepository } from './repositories/office.js';
import { audit } from './services/office.js';
import { BookingService, bookingInput } from './services/booking.js';
import { ensure } from './domain/errors.js';
import { manage } from './domain/permissions.js';
import { buildingAccess, floorAccess, resourceBuilding } from './domain/access.js';
import { validPolygon, validatePlacement, contained, corners } from './domain/geometry.js';
import { safeSvg } from './domain/svg.js';
const id = z.string().min(1).max(128),
  name = z.string().trim().min(1).max(160),
  num = z.number().finite();
const polygon = z
  .array(z.tuple([num.min(0).max(100000), num.min(0).max(100000)]))
  .min(3)
  .max(300);
const pid = (req: any) => id.parse(req.params.id);
export function polygonArea(p: Point[], scale: number) {
  return (
    (Math.abs(
      p.reduce((a, v, i) => {
        const w = p[(i + 1) % p.length];
        return a + v[0] * w[1] - w[0] * v[1];
      }, 0),
    ) /
      2) *
    scale *
    scale
  );
}
export async function version(tx: Connection, actor: Actor, floorId: string, comment: string) {
  const f = await one(tx, 'UPDATE floors SET version=version+1 WHERE id=$1 RETURNING version', [
    floorId,
  ]);
  const layout = await new OfficeRepository(tx).layout(floorId);
  await tx.query(
    'INSERT INTO layout_versions(id,floor_id,version,snapshot,comment,created_by) VALUES($1,$2,$3,$4,$5,$6)',
    [randomUUID(), floorId, f.version, JSON.stringify(layout), comment, actor.id],
  );
  return f.version;
}
const inventorySql = `SELECT f.*,t.name template_name,r.name room_name,fl.name floor_name,fl.building_id,b.name building_name,(f.inventory_number IS NULL OR btrim(f.inventory_number)='') missing_inventory,(SELECT count(*)::int FROM furniture dup WHERE nullif(btrim(dup.inventory_number),'')=nullif(btrim(f.inventory_number),'')) inventory_copies FROM furniture f JOIN furniture_templates t ON t.id=f.template_id JOIN floors fl ON fl.id=f.floor_id JOIN buildings b ON b.id=fl.building_id LEFT JOIN rooms r ON r.id=f.room_id`;
export function csv(rows: Record<string, unknown>[]) {
  const cols = Object.keys(rows[0] ?? {}),
    cell = (v: unknown) =>
      '"' +
      String(v ?? '')
        .replace(/^[\s]*[=+@-]/, "'$&")
        .replaceAll('"', '""') +
      '"';
  return (
    '\ufeff' +
    [cols.map(cell).join(','), ...rows.map((r) => cols.map((k) => cell(r[k])).join(','))].join(
      '\r\n',
    )
  );
}
export function registerFacility(app: FastifyInstance, db: Database) {
  const bookings = new BookingService(db);
  for (const kind of ['workplace', 'parking'] as const) {
    app.patch(
      '/api/' + (kind === 'workplace' ? 'workplaces' : 'parking') + '/:id/status',
      async (req) => {
        const body = z
          .object({ status: z.enum(['available', 'disabled']) })
          .strict()
          .parse(req.body);
        return db.transaction(async (tx) => {
          const table = kind === 'workplace' ? 'workplaces' : 'parking_spots';
          const field = kind === 'workplace' ? 'workplace_id' : 'parking_spot_id';
          const old = await one(tx, `SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`, [pid(req)]);
          ensure(old, 404, 'Resource not found');
          await buildingAccess(tx, req.actor, await resourceBuilding(tx, kind, old.id));
          if (body.status === 'disabled') {
            ensure(
              !(await one(
                tx,
                `SELECT id FROM ${kind === 'workplace' ? 'workplace_assignments' : 'parking_assignments'} WHERE ${field}=$1 AND valid_to IS NULL`,
                [old.id],
              )),
              409,
              'Release assignment before disabling',
            );
            ensure(
              !(await one(
                tx,
                `SELECT id FROM bookings WHERE ${field}=$1 AND status='confirmed' AND ends_at>now()`,
                [old.id],
              )),
              409,
              'Cancel future bookings before disabling',
            );
          }
          if (old.status !== body.status) {
            await tx.query(`UPDATE ${table} SET status=$2 WHERE id=$1`, [old.id, body.status]);
            await audit(tx, req.actor, kind + '.status', old.id, {
              before: old.status,
              after: body.status,
            });
          }
          return { id: old.id, status: body.status };
        });
      },
    );
  }
  app.get('/api/availability', async (req) => {
    const q = z
      .object({
        kind: z.enum(['workplace', 'parking']),
        startsAt: z.iso.datetime({ offset: true }),
        endsAt: z.iso.datetime({ offset: true }),
        building: z.string().default(''),
      })
      .parse(req.query);
    const start = Date.parse(q.startsAt),
      end = Date.parse(q.endsAt);
    ensure(
      end > start && end - start <= 90 * 86400000 && start >= Date.now() - 60000,
      400,
      'Выберите будущий интервал длительностью до 90 дней',
    );
    const workplace = q.kind === 'workplace',
      field = workplace ? 'workplace_id' : 'parking_spot_id';
    const from = workplace
      ? `workplaces x JOIN furniture f ON f.id=x.furniture_id JOIN floors fl ON fl.id=f.floor_id JOIN buildings b ON b.id=fl.building_id LEFT JOIN rooms r ON r.id=f.room_id`
      : `parking_spots x JOIN buildings b ON b.id=x.building_id`;
    const extra = workplace ? `AND f.active AND fl.active AND (r.id IS NULL OR r.active)` : '';
    return (
      await db.query(
        `SELECT x.id,${workplace ? 'x.code' : 'x.number'} code,b.name building_name,b.id building_id,${workplace ? 'fl.name floor_name,fl.id floor_id,f.id furniture_id,r.name room_name' : 'x.zone'} FROM ${from} WHERE x.status='available' AND b.active ${extra} AND ($3='' OR b.id=$3) AND NOT EXISTS(SELECT 1 FROM ${workplace ? 'workplace_assignments' : 'parking_assignments'} a WHERE a.${field}=x.id AND a.valid_to IS NULL) AND NOT EXISTS(SELECT 1 FROM bookings bk WHERE bk.${field}=x.id AND bk.status='confirmed' AND bk.starts_at<$2::timestamptz AND bk.ends_at>$1::timestamptz) ORDER BY b.name,${workplace ? 'x.code' : 'x.number'}`,
        [q.startsAt, q.endsAt, q.building],
      )
    ).rows;
  });
  app.post('/api/bookings', (req) => bookings.create(req.actor, bookingInput.parse(req.body)));
  app.post('/api/bookings/:id/cancel', (req) => bookings.cancel(req.actor, pid(req)));
  app.get('/api/bookings', async (req) => {
    const q = z
      .object({
        q:z.string().max(200).default(''),building:z.string().max(200).default(''),floor:z.string().max(100).default(''),date:z.union([z.literal(''),z.iso.date()]).default(''),
        offset: z.coerce.number().int().nonnegative().default(0),
        status: z.enum(['', 'confirmed', 'cancelled', 'future', 'past']).default(''),
      })
      .parse(req.query);
    return (
      await db.query(
        `SELECT bk.*,coalesce(w.code,p.number) resource_name,e.display_name,f.id furniture_id,fl.id floor_id,coalesce(fl.building_id,p.building_id) building_id,b.name building_name,fl.name floor_name,r.name room_name FROM bookings bk LEFT JOIN workplaces w ON w.id=bk.workplace_id LEFT JOIN parking_spots p ON p.id=bk.parking_spot_id JOIN employees_projection e ON e.id=bk.employee_id LEFT JOIN furniture f ON f.id=w.furniture_id LEFT JOIN floors fl ON fl.id=f.floor_id LEFT JOIN buildings b ON b.id=coalesce(fl.building_id,p.building_id) LEFT JOIN rooms r ON r.id=f.room_id WHERE ($1::text IS NULL OR bk.employee_id=$1) AND ($3='' OR bk.status=$3 OR ($3='future' AND bk.status='confirmed' AND bk.ends_at>now()) OR ($3='past' AND bk.ends_at<=now())) AND ($4='' OR coalesce(w.code,p.number,'') ILIKE $4 OR e.display_name ILIKE $4 OR coalesce(r.name,'') ILIKE $4) AND ($5='' OR coalesce(fl.building_id,p.building_id)=$5) AND ($6='' OR fl.name=$6) AND ($7::date IS NULL OR (bk.starts_at<($7::date+1)::timestamptz AND bk.ends_at>$7::date::timestamptz)) ORDER BY bk.starts_at DESC,bk.id DESC LIMIT 200 OFFSET $2`,
        [req.actor.role === 'employee' ? req.actor.employeeId : null, q.offset, q.status,q.q?'%'+q.q+'%':'',q.building,q.floor,q.date||null],
      )
    ).rows;
  });
  app.get('/api/data-quality', async (req) => {
    manage(req.actor);
    const floors = (
      await db.query(
        `SELECT fl.id,fl.name,fl.legacy_bg_file_id,b.name building_name,fl.meters_per_unit,fl.scale_evidence,fl.background_svg IS NOT NULL AND fl.background_svg<>'' has_svg FROM floors fl JOIN buildings b ON b.id=fl.building_id ORDER BY b.name,fl.name`,
      )
    ).rows;
    const templates = (
      await db.query(
        'SELECT id,name,legacy_svg_file_id,default_width,default_depth,dimensions_evidence FROM furniture_templates ORDER BY name',
      )
    ).rows;
    const quarantine = (
      await db.query(
        'SELECT reason,count(*)::int count FROM migration_quarantine q WHERE NOT EXISTS(SELECT 1 FROM quarantine_resolutions x WHERE x.quarantine_id=q.id) GROUP BY reason ORDER BY count(*) DESC',
      )
    ).rows;
    return { floors, templates, quarantine };
  });
  app.get('/api/dashboard', async (req) => {
    manage(req.actor);
    const summary = await one(
      db,
      `SELECT (SELECT count(*)::int FROM buildings WHERE active) buildings,(SELECT count(*)::int FROM workplaces w JOIN furniture f ON f.id=w.furniture_id JOIN floors fl ON fl.id=f.floor_id JOIN buildings b ON b.id=fl.building_id WHERE f.active AND fl.active AND b.active) total_workplaces,(SELECT count(*)::int FROM workplace_assignments a JOIN workplaces w ON w.id=a.workplace_id JOIN furniture f ON f.id=w.furniture_id JOIN floors fl ON fl.id=f.floor_id JOIN buildings b ON b.id=fl.building_id WHERE a.valid_to IS NULL AND f.active AND fl.active AND b.active) total_occupied,(SELECT count(*)::int FROM employees_projection WHERE active) employees,(SELECT count(*)::int FROM parking_spots WHERE status='available') parking_spots,(SELECT count(*)::int FROM parking_assignments WHERE valid_to IS NULL) parking_assigned,(SELECT count(*)::int FROM bookings WHERE status='confirmed' AND starts_at<=now() AND ends_at>now()) active_bookings`,
    );
    const rooms = (
      await db.query(
        `SELECT r.id,r.name,r.space_type_id,r.floor_id,fl.name floor_name,fl.building_id,b.name building_name,st.name type_name,coalesce(st.category,'OTHER') category,coalesce(st.subtype,'other') subtype,r.area_m2 official_area_m2,r.calculated_area_m2,coalesce(r.area_m2,r.calculated_area_m2) effective_area_m2,coalesce(stats.workplaces,0)::int workplaces,coalesce(stats.occupants,0)::int occupants FROM rooms r LEFT JOIN (SELECT f.room_id,count(*) FILTER(WHERE w.status='available') workplaces,count(a.id) occupants FROM furniture f JOIN workplaces w ON w.furniture_id=f.id LEFT JOIN workplace_assignments a ON a.workplace_id=w.id AND a.valid_to IS NULL WHERE f.active GROUP BY f.room_id) stats ON stats.room_id=r.id JOIN floors fl ON fl.id=r.floor_id JOIN buildings b ON b.id=fl.building_id LEFT JOIN space_types st ON st.id=r.space_type_id WHERE r.active AND fl.active AND b.active ORDER BY b.name,fl.number,r.name`,
      )
    ).rows;
    const enriched = rooms.map((r) => {
      const area = r.effective_area_m2 === null ? null : Number(r.effective_area_m2);
      const flags = [];
      if (r.official_area_m2 === null) flags.push('missing_official_area');
      if (r.calculated_area_m2 === null && r.official_area_m2 === null) flags.push('missing_calculated_area');
      if (
        r.official_area_m2 !== null &&
        r.calculated_area_m2 !== null &&
        Math.abs(Number(r.official_area_m2) - Number(r.calculated_area_m2)) >
          Math.max(1, Number(r.official_area_m2) * 0.1)
      )
        flags.push('area_mismatch');
      if (r.type_name === null || r.type_name === 'Требует классификации')
        flags.push('unclassified');
      return {
        ...r,
        flags,
        area_per_person: area !== null && r.occupants > 0 ? area / r.occupants : null,
        area_per_workplace: area !== null && r.workplaces > 0 ? area / r.workplaces : null,
      };
    });
    const aggregate = (key: string) => {
      const groups = new Map<string, any>();
      for (const r of enriched) {
        const g = groups.get(r[key]) ?? {
          id: r[key],
          building_name: r.building_name,
          floor_name: key === 'floor_id' ? r.floor_name : null,
          rooms: 0,
          official_area_m2: 0,
          calculated_area_m2: 0,
          effective_area_m2: 0,
          missing_effective: 0,
          missing_official: 0,
          missing_calculated: 0,
          occupants: 0,
          workplaces: 0,
        };
        g.rooms++;
        for (const k of [
          'official_area_m2',
          'calculated_area_m2',
          'effective_area_m2',
          'occupants',
          'workplaces',
        ])
          g[k] += Number(r[k] ?? 0);
        g.missing_effective += Number(r.effective_area_m2 === null);
        g.missing_official += Number(r.official_area_m2 === null);
        g.missing_calculated += Number(r.calculated_area_m2 === null);
        groups.set(r[key], g);
      }
      return [...groups.values()].map((g) => ({
        ...g,
        area_per_person: !g.missing_effective && g.occupants ? g.effective_area_m2 / g.occupants : null,
        area_per_workplace: !g.missing_effective && g.workplaces ? g.effective_area_m2 / g.workplaces : null,
      }));
    };
    return {
      summary,
      rooms: enriched,
      floors: aggregate('floor_id'),
      buildings: aggregate('building_id'),
    };
  });
  app.get('/api/inventory', async (req) => {
    manage(req.actor);
    const q = z
      .object({
        id:z.string().max(200).default(''),
        q: z.string().max(120).default(''),
        building: z.string().default(''),
        condition: z.enum(['', 'in_use', 'stored', 'repair', 'retired']).default(''),
        unchecked: z.enum(['', 'yes']).default(''),
        quality: z.enum(['', 'missing', 'duplicate']).default(''),
        floor: z.string().default(''),
        room: z.string().default(''),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);
    return (
      await db.query(
        inventorySql +
          ` WHERE (f.inventory_number ILIKE $1 OR t.name ILIKE $1 OR r.name ILIKE $1) AND ($3='' OR b.id=$3) AND ($4='' OR f.condition=$4) AND ($5='' OR f.checked_at IS NULL) AND ($6='' OR ($6='missing' AND nullif(btrim(f.inventory_number),'') IS NULL) OR ($6='duplicate' AND EXISTS(SELECT 1 FROM furniture dup WHERE dup.id<>f.id AND nullif(btrim(dup.inventory_number),'')=nullif(btrim(f.inventory_number),'')))) AND ($7='' OR fl.id=$7) AND ($8='' OR r.id=$8) AND ($9='' OR f.id=$9) ORDER BY f.inventory_number,f.id LIMIT 200 OFFSET $2`,
        [
          '%' + q.q + '%',
          q.offset,
          q.building,
          q.condition,
          q.unchecked,
          q.quality,
          q.floor,
          q.room,q.id,
        ],
      )
    ).rows;
  });
  app.patch('/api/inventory/:id', async (req) => {
    const b = z
      .object({
        inventory_number: z.string().max(120).nullable(),
        condition: z.enum(['in_use', 'stored', 'repair', 'retired']),
        note: z.string().max(1000).default(''),
      })
      .strict()
      .parse(req.body);
    return db.transaction(async (tx) => {
      const f = await one(tx, 'SELECT * FROM furniture WHERE id=$1 FOR UPDATE', [pid(req)]);
      ensure(f, 404, 'Furniture not found');
      await floorAccess(tx, req.actor, f.floor_id);
      await tx.query(
        'UPDATE furniture SET inventory_number=$2,condition=$3,inventory_note=$4,checked_at=now(),checked_by=$5 WHERE id=$1',
        [f.id, b.inventory_number, b.condition, b.note, req.actor.id],
      );
      await audit(tx, req.actor, 'inventory.check', f.id, { before: f, after: b });
      return { id: f.id };
    });
  });
  app.get(
    '/api/templates',
    async () =>
      (
        await db.query(
          "SELECT id,name,width,depth,is_workplace,category,coalesce(api_geometry_evidence->>'renderSvg',svg) svg,real_width_m,real_depth_m,resize_allowed,default_properties FROM furniture_templates ORDER BY name",
        )
      ).rows,
  );
  app.post('/api/templates', async (req) => {
    manage(req.actor);
    const b = z
      .object({
        name,
        width: num.positive().max(100000).nullable().default(null),
        depth: num.positive().max(100000).nullable().default(null),
        is_workplace: z.boolean(),
        category: z.enum(['desk','chair','cabinet','pedestal','sofa','meeting_table','storage','sanitary','equipment','other']).default('other'),
        svg: z.string().max(500000).nullable().default(null),
        real_width_m: num.positive().max(100).nullable().default(null),
        real_depth_m: num.positive().max(100).nullable().default(null),
        resize_allowed: z.boolean().default(true),
        default_properties: z.record(z.string().max(80),z.string().max(500)).default({}),
      })
      .strict()
      .parse(req.body);
    return db.transaction(async (tx) => {
      ensure((b.real_width_m===null)===(b.real_depth_m===null),400,'Укажите оба физических размера');
      ensure((b.width&&b.depth)||(b.real_width_m&&b.real_depth_m),400,'Укажите ширину и глубину в метрах');
      const key = randomUUID();
      await tx.query(
        'INSERT INTO furniture_templates(id,name,width,depth,is_workplace,category,svg,real_width_m,real_depth_m,resize_allowed,default_properties) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
        [key,b.name,b.width,b.depth,b.is_workplace,b.category,b.svg?safeSvg(b.svg):null,b.real_width_m,b.real_depth_m,b.resize_allowed,JSON.stringify(b.default_properties)],
      );
      await audit(tx, req.actor, 'template.create', key, b);
      return { id: key };
    });
  });
  app.post('/api/buildings', async (req) => {
    ensure(req.actor.role === 'admin', 403, 'Admin required');
    const b = z
      .object({
        name,
        city: z.string().max(120).default(''),
        address: z.string().max(300).default(''),
      })
      .strict()
      .parse(req.body);
    return db.transaction(async (tx) => {
      const key = randomUUID();
      await tx.query('INSERT INTO buildings(id,name,city,address) VALUES($1,$2,$3,$4)', [
        key,
        b.name,
        b.city,
        b.address,
      ]);
      await audit(tx, req.actor, 'building.create', key, b);
      return { id: key };
    });
  });
  app.patch('/api/buildings/:id', async (req) => {
    const b = z
      .object({ name, city: z.string().max(120), address: z.string().max(300) })
      .strict()
      .parse(req.body);
    return db.transaction(async (tx) => {
      await buildingAccess(tx, req.actor, pid(req));
      const old = await one(tx, 'SELECT * FROM buildings WHERE id=$1 FOR UPDATE', [pid(req)]);
      await tx.query('UPDATE buildings SET name=$2,city=$3,address=$4 WHERE id=$1', [
        pid(req),
        b.name,
        b.city,
        b.address,
      ]);
      await audit(tx, req.actor, 'building.update', pid(req), { before: old, after: b });
      return { id: pid(req) };
    });
  });
  app.post('/api/floors', async (req) => {
    const b = z
      .object({
        building_id: id,
        name,
        number: num.int(),
        width: num.positive().max(100000),
        height: num.positive().max(100000),
        meters_per_unit: num.positive().max(9999).nullable().default(null),
      })
      .strict()
      .parse(req.body);
    return db.transaction(async (tx) => {
      await buildingAccess(tx, req.actor, b.building_id);
      const key = randomUUID();
      await tx.query(
        'INSERT INTO floors(id,building_id,name,number,width,height,meters_per_unit) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [key, b.building_id, b.name, b.number, b.width, b.height, b.meters_per_unit],
      );
      await audit(tx, req.actor, 'floor.create', key, b);
      return { id: key };
    });
  });
  app.put('/api/floors/:id/background', {bodyLimit: 4000000}, async (req) => {
    const b = z
      .object({ svg: z.string(), expectedVersion: num.int().positive() })
      .strict()
      .parse(req.body);
    const svg = safeSvg(b.svg);
    return db.transaction(async (tx) => {
      await floorAccess(tx, req.actor, pid(req));
      const f = await one(tx, 'SELECT version FROM floors WHERE id=$1 FOR UPDATE', [pid(req)]);
      ensure(f.version === b.expectedVersion, 409, 'Layout changed. Reload.');
      await tx.query("UPDATE floors SET background_svg=$2,meters_per_unit=NULL,scale_evidence='{\"status\":\"needs_recalibration\"}' WHERE id=$1", [pid(req), svg]);
      await tx.query('UPDATE rooms SET calculated_area_m2=NULL WHERE floor_id=$1',[pid(req)]);
      const v = await version(tx, req.actor, pid(req), 'SVG upload');
      await audit(tx, req.actor, 'floor.background', pid(req), { version: v, bytes: svg.length });
      return { version: v };
    });
  });
  app.patch('/api/floors/:id/scale', async (req) => {
    const b = z
      .object({ meters_per_unit: num.positive().max(9999), expectedVersion: num.int().positive() })
      .strict()
      .parse(req.body);
    return db.transaction(async (tx) => {
      await floorAccess(tx, req.actor, pid(req));
      const f = await one(tx, 'SELECT * FROM floors WHERE id=$1 FOR UPDATE', [pid(req)]);
      ensure(f.version === b.expectedVersion, 409, 'Layout changed. Reload.');
      await tx.query('UPDATE floors SET meters_per_unit=$2 WHERE id=$1', [
        pid(req),
        b.meters_per_unit,
      ]);
      const rooms = (await tx.query('SELECT * FROM rooms WHERE floor_id=$1', [pid(req)])).rows;
      for (const r of rooms)
        await tx.query('UPDATE rooms SET calculated_area_m2=$2 WHERE id=$1', [
          r.id,
          r.shape.polygon && validPolygon(r.shape.polygon)
            ? polygonArea(r.shape.polygon, b.meters_per_unit)
            : null,
        ]);
      const v = await version(tx, req.actor, pid(req), 'Scale updated');
      await audit(tx, req.actor, 'floor.scale', pid(req), {
        before: f.meters_per_unit,
        after: b.meters_per_unit,
      });
      return { version: v };
    });
  });
  const roomInput = z
    .object({
      floor_id: id,
      name,
      space_type_id: id,
      area_m2: num.nonnegative().max(1e7).nullable().default(null),
      polygon,
      expectedVersion: num.int().positive(),
    })
    .strict();
  for (const method of ['POST', 'PUT'] as const)
    app.route({
      method,
      url: method === 'POST' ? '/api/rooms' : '/api/rooms/:id',
      handler: async (req) => {
        const b = roomInput.parse(req.body);
        ensure(validPolygon(b.polygon), 422, 'Polygon must be simple and nonzero');
        return db.transaction(async (tx) => {
          const floor = await floorAccess(tx, req.actor, b.floor_id);
          const f = await one(tx, 'SELECT version FROM floors WHERE id=$1 FOR UPDATE', [
            b.floor_id,
          ]);
          ensure(f.version === b.expectedVersion, 409, 'Layout changed. Reload.');
          ensure(
            b.polygon.every((p) => p[0] <= floor.width && p[1] <= floor.height),
            422,
            'Room exceeds floor bounds',
          );
          const key = method === 'POST' ? randomUUID() : pid(req),
            old = await one(tx, 'SELECT * FROM rooms WHERE id=$1 FOR UPDATE', [key]);
          if (method === 'PUT') {
            ensure(old && old.floor_id === b.floor_id, 404, 'Room not found on floor');
            const items = (
              await tx.query('SELECT * FROM furniture WHERE room_id=$1 AND active', [key])
            ).rows;
            ensure(
              items.every((f) => f.width && f.depth && contained(corners(f), b.polygon)),
              422,
              'New room contour excludes furniture or dimensions are unknown',
            );
          }
          const area = floor.meters_per_unit ? polygonArea(b.polygon, floor.meters_per_unit) : null;
          await tx.query(
            'INSERT INTO rooms(id,floor_id,name,space_type_id,area_m2,shape,calculated_area_m2) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET name=$3,space_type_id=$4,area_m2=$5,shape=$6,calculated_area_m2=$7',
            [
              key,
              b.floor_id,
              b.name,
              b.space_type_id,
              b.area_m2,
              JSON.stringify({ polygon: b.polygon }),
              area,
            ],
          );
          await recordArea(tx,key,b.area_m2,(await one(tx,'SELECT CURRENT_DATE::text today')).today,'room editor',req.actor.id);
          const v = await version(tx, req.actor, b.floor_id, 'Room contour');
          await audit(tx, req.actor, 'room.save', key, { before: old ?? null, after: b });
          return { id: key, version: v };
        });
      },
    });
  app.post('/api/furniture', async (req) => {
    const b = z
      .object({
        floor_id: id,
        template_id: id,
        inventory_number: z.string().max(120).nullable().default(null),
        x: num.min(0).max(100000),
        y: num.min(0).max(100000),
        rotation: num.min(-360).max(360).default(0),
        width: num.positive().max(100000),
        depth: num.positive().max(100000),
        workplace_code: z.string().min(1).max(100).optional(),
        expectedVersion: num.int().positive(),
      })
      .strict()
      .parse(req.body);
    return db.transaction(async (tx) => {
      await floorAccess(tx, req.actor, b.floor_id);
      const f = await one(tx, 'SELECT version FROM floors WHERE id=$1 FOR UPDATE', [b.floor_id]);
      ensure(f.version === b.expectedVersion, 409, 'Layout changed. Reload.');
      const template=await one(tx,'SELECT * FROM furniture_templates WHERE id=$1',[b.template_id]);
      ensure(template,404,'Template not found');
      ensure(!b.workplace_code||template.is_workplace,400,'Этот тип мебели не предназначен для рабочего места');
      if(template.real_width_m&&template.real_depth_m){
        const floor=await one(tx,'SELECT meters_per_unit,scale_evidence FROM floors WHERE id=$1',[b.floor_id]);
        ensure(floor.meters_per_unit&&['confirmed_by_measurement','confirmed_by_reviewer'].includes(floor.scale_evidence?.status),409,'Для мебели с размерами в метрах сначала подтвердите масштаб этажа');
        if(!template.resize_allowed)ensure(Math.abs(b.width-template.real_width_m/floor.meters_per_unit)<0.01&&Math.abs(b.depth-template.real_depth_m/floor.meters_per_unit)<0.01,400,'Изменение размеров этого типа мебели запрещено');
      }
      const key = randomUUID(),
        l = (await new OfficeRepository(tx).layout(b.floor_id))!,
        item = { ...b, id: key, room_id: null, geometry_verified: true, active: true };
      const room = validatePlacement(item, l.furniture, l.rooms);
      await tx.query(
        'INSERT INTO furniture(id,floor_id,room_id,template_id,inventory_number,x,y,rotation,width,depth,geometry_verified) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)',
        [
          key,
          b.floor_id,
          room,
          b.template_id,
          b.inventory_number,
          b.x,
          b.y,
          b.rotation,
          b.width,
          b.depth,
        ],
      );
      if (b.workplace_code)
        await tx.query('INSERT INTO workplaces(id,furniture_id,code) VALUES($1,$2,$3)', [
          randomUUID(),
          key,
          b.workplace_code,
        ]);
      const v = await version(tx, req.actor, b.floor_id, 'Furniture added');
      await audit(tx, req.actor, 'furniture.create', key, b);
      return { id: key, version: v };
    });
  });
  app.post('/api/furniture/:id/archive', async (req) => {
    const b = z.object({ expectedVersion: num.int().positive() }).strict().parse(req.body);
    return db.transaction(async (tx) => {
      const item = await one(tx, 'SELECT * FROM furniture WHERE id=$1', [pid(req)]);
      ensure(item, 404, 'Furniture not found');
      await floorAccess(tx, req.actor, item.floor_id);
      const floor = await one(tx, 'SELECT version FROM floors WHERE id=$1 FOR UPDATE', [
        item.floor_id,
      ]);
      ensure(floor.version === b.expectedVersion, 409, 'Layout changed. Reload.');
      // Lock every attached resource before checking assignment/booking invariants.
      await tx.query('SELECT id FROM workplaces WHERE furniture_id=$1 ORDER BY id FOR UPDATE', [
        item.id,
      ]);
      ensure(
        !(await one(
          tx,
          'SELECT a.id FROM workplace_assignments a JOIN workplaces w ON w.id=a.workplace_id WHERE w.furniture_id=$1 AND a.valid_to IS NULL',
          [item.id],
        )),
        409,
        'Release assignments before archiving',
      );
      ensure(
        !(await one(
          tx,
          "SELECT bk.id FROM bookings bk JOIN workplaces w ON w.id=bk.workplace_id WHERE w.furniture_id=$1 AND bk.status='confirmed' AND bk.ends_at>now()",
          [item.id],
        )),
        409,
        'Cancel bookings before archiving',
      );
      await tx.query('UPDATE furniture SET active=false WHERE id=$1', [item.id]);
      const v = await version(tx, req.actor, item.floor_id, 'Furniture archived');
      await audit(tx, req.actor, 'furniture.archive', item.id, { before: item });
      return { version: v };
    });
  });
  app.post('/api/workplaces', async (req) => {
    const b = z.object({ furniture_id: id, code: name }).strict().parse(req.body);
    return db.transaction(async (tx) => {
      const f = await one(tx, 'SELECT * FROM furniture WHERE id=$1 AND active FOR UPDATE', [
        b.furniture_id,
      ]);
      ensure(f, 404, 'Active furniture not found');
      await floorAccess(tx, req.actor, f.floor_id);
      const key = randomUUID();
      await tx.query('INSERT INTO workplaces(id,furniture_id,code) VALUES($1,$2,$3)', [
        key,
        b.furniture_id,
        b.code,
      ]);
      await audit(tx, req.actor, 'workplace.create', key, b);
      return { id: key };
    });
  });
  app.get('/api/managers', async (req) => {
    manage(req.actor);
    return (
      await db.query(
        'SELECT m.*,e.display_name,b.name building_name FROM building_managers m JOIN employees_projection e ON e.id=m.employee_id JOIN buildings b ON b.id=m.building_id ORDER BY b.name,e.display_name',
      )
    ).rows;
  });
  app.put('/api/managers', async (req) => {
    ensure(req.actor.role === 'admin', 403, 'Only admin can grant building access');
    const b = z
      .object({ building_id: id, employee_id: id, role: z.enum(['manager', 'deputy']) })
      .strict()
      .parse(req.body);
    return db.transaction(async (tx) => {
      ensure(
        await one(tx, 'SELECT id FROM employees_projection WHERE id=$1 AND active', [
          b.employee_id,
        ]),
        404,
        'Active employee not found',
      );
      await tx.query(
        'INSERT INTO building_managers VALUES($1,$2,$3) ON CONFLICT(building_id,employee_id) DO UPDATE SET role=$3',
        [b.building_id, b.employee_id, b.role],
      );
      await audit(tx, req.actor, 'manager.grant', b.building_id, b);
      return b;
    });
  });
  app.delete('/api/managers', async (req) => {
    ensure(req.actor.role === 'admin', 403, 'Only admin can revoke access');
    const b = z.object({ building_id: id, employee_id: id }).strict().parse(req.body);
    return db.transaction(async (tx) => {
      await tx.query('DELETE FROM building_managers WHERE building_id=$1 AND employee_id=$2', [
        b.building_id,
        b.employee_id,
      ]);
      await audit(tx, req.actor, 'manager.revoke', b.building_id, b);
      return { ok: true };
    });
  });
  app.get(
    '/api/parking/assignments',
    async (req) =>
      (
        await db.query(
          'SELECT * FROM parking_assignments WHERE ($1::text IS NULL OR employee_id=$1) ORDER BY valid_from DESC LIMIT 500',
          [req.actor.role === 'employee' ? req.actor.employeeId : null],
        )
      ).rows,
  );
  app.patch('/api/parking/:id/details', async (req) => {
    const b = z
      .object({ zone: z.string().max(100) })
      .strict()
      .parse(req.body);
    return db.transaction(async (tx) => {
      const p = await one(tx, 'SELECT * FROM parking_spots WHERE id=$1 FOR UPDATE', [pid(req)]);
      ensure(p, 404, 'Parking not found');
      await buildingAccess(tx, req.actor, p.building_id);
      await tx.query('UPDATE parking_spots SET zone=$2 WHERE id=$1', [p.id, b.zone]);
      await audit(tx, req.actor, 'parking.zone', p.id, { before: p.zone, after: b.zone });
      return b;
    });
  });
  app.post('/api/parking-rates', async (req) => {
    const b = z
      .object({
        building_id: id,
        rate_per_spot: num.nonnegative().max(1e9),
        currency: z.string().regex(/^[A-Z]{3}$/),
        valid_from: z.iso.date(),
        valid_to: z.iso.date().nullable().default(null),
      })
      .strict()
      .parse(req.body);
    ensure(!b.valid_to || b.valid_to > b.valid_from, 400, 'Invalid period');
    return db.transaction(async (tx) => {
      await buildingAccess(tx, req.actor, b.building_id);
      await tx.query('SELECT id FROM buildings WHERE id=$1 FOR UPDATE', [b.building_id]);
      ensure(
        !(await one(
          tx,
          "SELECT id FROM parking_rates WHERE building_id=$1 AND valid_from<coalesce($3::date,'infinity'::date) AND coalesce(valid_to,'infinity'::date)>$2::date",
          [b.building_id, b.valid_from, b.valid_to],
        )),
        409,
        'Overlapping parking rate',
      );
      const key = randomUUID();
      await tx.query('INSERT INTO parking_rates VALUES($1,$2,$3,$4,$5,$6)', [
        key,
        b.building_id,
        b.rate_per_spot,
        b.currency,
        b.valid_from,
        b.valid_to,
      ]);
      await audit(tx, req.actor, 'parking_rate.create', key, b);
      return { id: key };
    });
  });
  app.get('/api/parking-costs', async (req) => {
    manage(req.actor);
    return (
      await db.query(
        "SELECT p.building_id,b.name building_name,count(*)::int spots,c.currency,c.rate_per_spot,(count(*)*c.rate_per_spot)::numeric(24,2) monthly_cost FROM parking_spots p JOIN buildings b ON b.id=p.building_id LEFT JOIN parking_rates c ON c.building_id=p.building_id AND c.valid_from<=CURRENT_DATE AND (c.valid_to IS NULL OR c.valid_to>CURRENT_DATE) WHERE p.status='available' AND b.active GROUP BY p.building_id,b.name,c.currency,c.rate_per_spot",
      )
    ).rows;
  });
  app.get('/api/reports/:id.csv', async (req, reply) => {
    manage(req.actor);
    const kind = pid(req);
    let rows;
    if (kind === 'inventory')
      rows = (await db.query(inventorySql + ' ORDER BY f.inventory_number LIMIT 50000')).rows;
    else if (kind === 'workplaces') rows = await new OfficeRepository(db).workplaces();
    else if (kind === 'room-classification') rows=(await db.query('SELECT id,space_type_id FROM rooms ORDER BY id')).rows;
    else if (kind === 'space') rows=(await db.query(`SELECT b.name building,fl.name floor,r.id room_id,r.name room,st.category class,st.subtype type,r.area_m2 official_area,r.calculated_area_m2 calculated_area,coalesce(w.n,0) workplaces,coalesce(w.people,0) employees,CASE WHEN w.people>0 THEN r.area_m2/w.people END m2_per_person,r.auto_classified,r.classification_confidence,r.needs_review FROM rooms r JOIN floors fl ON fl.id=r.floor_id JOIN buildings b ON b.id=fl.building_id LEFT JOIN space_types st ON st.id=r.space_type_id LEFT JOIN LATERAL (SELECT count(*) n,count(a.id) people FROM furniture f JOIN workplaces wp ON wp.furniture_id=f.id LEFT JOIN workplace_assignments a ON a.workplace_id=wp.id AND a.valid_to IS NULL WHERE f.room_id=r.id AND f.active) w ON true ORDER BY b.name,fl.name,r.name`)).rows;
    else if (kind === 'rooms')
      rows = (
        await db.query(
          'SELECT r.id,r.name,fl.building_id,r.floor_id,r.space_type_id,st.category,st.subtype,r.area_m2 official_area_m2,r.calculated_area_m2 FROM rooms r JOIN floors fl ON fl.id=r.floor_id LEFT JOIN space_types st ON st.id=r.space_type_id ORDER BY r.id LIMIT 50000',
        )
      ).rows;
    else {
      ensure(false, 404, 'Unknown report');
    }
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${kind}.csv"`)
      .send(csv(rows));
  });
}
