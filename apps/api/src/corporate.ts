import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Database, Connection } from "./repositories/database.js";
import { one } from "./repositories/database.js";
import { floorAccess } from "./domain/access.js";
import { ensure } from "./domain/errors.js";
import { manage } from "./domain/permissions.js";
import { validPolygon } from "./domain/geometry.js";
import { polygonArea, version } from "./facility.js";
import { audit } from "./services/office.js";
import { BookingService, bookingInput } from "./services/booking.js";
const id = z.string().min(1).max(128),
  point = z.tuple([
    z.number().finite().min(0).max(100000),
    z.number().finite().min(0).max(100000),
  ]);
export function calibrationScale(points: [number, number][], distance: number) {
  const length = Math.hypot(
    points[1][0] - points[0][0],
    points[1][1] - points[0][1],
  );
  ensure(
    length >= 1,
    400,
    "Выберите две разные точки на плане на расстоянии не менее одной единицы",
  );
  const scale = distance / length;
  ensure(scale > 0 && scale < 10000, 400, "Некорректный масштаб");
  return scale;
}
export async function recalculate(
  tx: Connection,
  floorId: string,
  scale: number,
) {
  const rows = (
    await tx.query(
      "SELECT * FROM rooms WHERE floor_id=$1 AND active ORDER BY name,id",
      [floorId],
    )
  ).rows;
  const results = [];
  for (const r of rows) {
    const p = r.shape?.polygon;
    const calculated = p && validPolygon(p) ? polygonArea(p, scale) : null;
    const difference =
      calculated !== null && Number(r.area_m2) > 0
        ? ((calculated - Number(r.area_m2)) / Number(r.area_m2)) * 100
        : null;
    await tx.query("UPDATE rooms SET calculated_area_m2=$2 WHERE id=$1", [
      r.id,
      calculated,
    ]);
    results.push({
      id: r.id,
      name: r.name,
      official: r.area_m2 == null ? null : Number(r.area_m2),
      calculated,
      difference,
      status: !p
        ? "missing_geometry"
        : calculated === null
          ? "invalid_polygon"
          : difference !== null && Math.abs(difference) > 10
            ? "review"
            : "ok",
    });
  }
  return results;
}
export function registerCorporate(app: FastifyInstance, db: Database) {
  app.get('/api/me/profile',async req=>await one(db,'SELECT display_name,position FROM employees_projection WHERE id=$1',[req.actor.employeeId])??{display_name:'Мой профиль'});

  const bookings = new BookingService(db);
  app.get("/api/spaces", async (req) => {
    manage(req.actor);
    const q = z
      .object({
        q: z.string().max(120).default(""),
        building: z.string().default(""),
        floor: z.string().default(""),
        offset: z.coerce.number().int().min(0).max(100000).default(0),
      })
      .parse(req.query);
    return (
      await db.query(
        `SELECT r.*,s.name type_name,s.category,s.subtype,fl.name floor_name,fl.building_id,b.name building_name,count(*) OVER()::int total_count,coalesce(stats.workplaces,0)::int workplaces,coalesce(stats.occupants,0)::int occupants FROM rooms r LEFT JOIN (SELECT f.room_id,count(*) workplaces,count(a.id) occupants FROM furniture f JOIN workplaces w ON w.furniture_id=f.id LEFT JOIN workplace_assignments a ON a.workplace_id=w.id AND a.valid_to IS NULL WHERE f.active GROUP BY f.room_id) stats ON stats.room_id=r.id JOIN floors fl ON fl.id=r.floor_id JOIN buildings b ON b.id=fl.building_id LEFT JOIN space_types s ON s.id=r.space_type_id WHERE r.active AND fl.active AND b.active AND ($1='' OR b.id=$1) AND ($2='' OR fl.id=$2) AND (r.name ILIKE $3 OR b.name ILIKE $3 OR s.name ILIKE $3) ORDER BY b.name,fl.number,r.name,r.id LIMIT 100 OFFSET $4`,
        [q.building, q.floor, "%" + q.q + "%", q.offset],
      )
    ).rows;
  });
  app.get("/api/rooms/:id/summary", async (req) => {
    const key = z.object({ id }).parse(req.params).id;
    const r = await one(
      db,
      `SELECT r.id,r.name,r.area_m2,r.calculated_area_m2,r.floor_id,s.name type_name,s.category,s.subtype,fl.name floor_name,fl.building_id,b.name building_name FROM rooms r JOIN floors fl ON fl.id=r.floor_id JOIN buildings b ON b.id=fl.building_id LEFT JOIN space_types s ON s.id=r.space_type_id WHERE r.id=$1 AND r.active AND fl.active AND b.active`,
      [key],
    );
    ensure(r, 404, "Помещение не найдено");
    const counts = await one(
      db,
      `SELECT count(*)::int workplaces,count(a.id)::int occupants,count(*) FILTER(WHERE w.status='available' AND a.id IS NULL AND NOT EXISTS(SELECT 1 FROM bookings bk WHERE bk.workplace_id=w.id AND bk.status='confirmed' AND bk.starts_at<=now() AND bk.ends_at>now()))::int free FROM furniture f JOIN workplaces w ON w.furniture_id=f.id LEFT JOIN workplace_assignments a ON a.workplace_id=w.id AND a.valid_to IS NULL WHERE f.room_id=$1 AND f.active`,
      [key],
    );
    const area = r.area_m2 ?? r.calculated_area_m2;
    return {
      ...r,
      ...counts,
      area_per_person:
        area != null && counts.occupants
          ? Number(area) / counts.occupants
          : null,
      area_per_workplace:
        area != null && counts.workplaces
          ? Number(area) / counts.workplaces
          : null,
      ...(req.actor.role === "employee"
        ? {}
        : {
            responsible: (
              await db.query(
                "SELECT e.display_name FROM building_managers m JOIN employees_projection e ON e.id=m.employee_id WHERE m.building_id=$1",
                [r.building_id],
              )
            ).rows,
          }),
    };
  });

  app.post("/api/me/bookings", (req) => {
    const b = bookingInput.omit({ employeeId: true }).strict().parse(req.body);
    return bookings.create(req.actor, {
      ...b,
      employeeId: req.actor.employeeId,
    });
  });
  app.get("/api/floors/:id/booking-availability", async (req) => {
    const key = z.object({ id }).parse(req.params).id,
      b = z
        .object({
          startsAt: z.iso.datetime({ offset: true }),
          endsAt: z.iso.datetime({ offset: true }),
        })
        .strict()
        .parse(req.query);
    ensure(
      Date.parse(b.endsAt) > Date.parse(b.startsAt) &&
        Date.parse(b.endsAt) - Date.parse(b.startsAt) <= 90 * 86400000,
      400,
      "Выберите период от нескольких минут до 90 дней",
    );
    return (
      await db.query(
        `SELECT w.id workplace_id,f.id furniture_id,CASE WHEN w.status='disabled' OR NOT f.active OR NOT fl.active OR NOT bu.active OR r.active=false THEN 'disabled' WHEN EXISTS(SELECT 1 FROM workplace_assignments a WHERE a.workplace_id=w.id AND a.valid_to IS NULL) THEN 'occupied' WHEN EXISTS(SELECT 1 FROM bookings bk WHERE bk.workplace_id=w.id AND bk.status='confirmed' AND bk.starts_at<$3::timestamptz AND bk.ends_at>$2::timestamptz) THEN 'booked' ELSE 'available' END status FROM workplaces w JOIN furniture f ON f.id=w.furniture_id JOIN floors fl ON fl.id=f.floor_id JOIN buildings bu ON bu.id=fl.building_id LEFT JOIN rooms r ON r.id=f.room_id WHERE f.floor_id=$1`,
        [key, b.startsAt, b.endsAt],
      )
    ).rows;
  });
  app.get("/api/workplaces/:id/booking-windows", async (req) => {
    const key = z.object({ id }).parse(req.params).id;
    return (
      await db.query(
        `SELECT starts_at,ends_at,(employee_id=$2::text) is_mine,bool_or(employee_id IS DISTINCT FROM $2::text) OVER () has_other FROM bookings WHERE workplace_id=$1 AND status='confirmed' AND ends_at>now() ORDER BY starts_at LIMIT 100`,
        [key, req.actor.employeeId ?? null],
      )
    ).rows;
  });
  app.post("/api/floors/:id/calibration", async (req) => {
    const key = z.object({ id }).parse(req.params).id,
      b = z
        .object({
          points: z.tuple([point, point]),
          real_distance_m: z.number().finite().positive().max(10000),
          source: z.string().trim().min(5).max(1000),
          expectedVersion: z.number().int().positive(),
        })
        .strict()
        .parse(req.body);
    return db.transaction(async (tx) => {
      await floorAccess(tx, req.actor, key);
      const floor = await one(
        tx,
        "SELECT * FROM floors WHERE id=$1 FOR UPDATE",
        [key],
      );
      ensure(
        floor.version === b.expectedVersion,
        409,
        "План изменился. Выберите точки заново.",
      );
      ensure(
        b.points.every((p) => p[0] <= floor.width && p[1] <= floor.height),
        400,
        "Точки должны находиться в границах плана",
      );
      const scale = calibrationScale(b.points, b.real_distance_m),
        calibrationId = randomUUID();
      await tx.query(
        "INSERT INTO floor_calibrations(id,floor_id,points,real_distance_m,meters_per_unit,source,created_by,confidence) VALUES($1,$2,$3,$4,$5,$6,$7,'measured')",
        [
          calibrationId,
          key,
          JSON.stringify(b.points),
          b.real_distance_m,
          scale,
          b.source,
          req.actor.id,
        ],
      );
      await tx.query(
        "UPDATE floors SET meters_per_unit=$2,scale_evidence=$3 WHERE id=$1",
        [
          key,
          scale,
          JSON.stringify({
            status: "confirmed_by_measurement",
            calibrationId,
            source: b.source,
            confidence: "measured",
            points: b.points,
            realDistance: b.real_distance_m,
            calibratedBy: req.actor.id,
            calibratedAt: new Date().toISOString(),
          }),
        ],
      );
      const results = await recalculate(tx, key, scale),
        v = await version(
          tx,
          req.actor,
          key,
          "Scale calibrated by measurement",
        );
      await audit(tx, req.actor, "floor.calibrate", key, {
        ...b,
        meters_per_unit: scale,
        results,
      });
      return { version: v, meters_per_unit: scale, results };
    });
  });
  app.post("/api/floors/:id/recalculate-areas", async (req) => {
    const key = z.object({ id }).parse(req.params).id,
      b = z
        .object({ expectedVersion: z.number().int().positive() })
        .strict()
        .parse(req.body);
    return db.transaction(async (tx) => {
      await floorAccess(tx, req.actor, key);
      const f = await one(tx, "SELECT * FROM floors WHERE id=$1 FOR UPDATE", [
        key,
      ]);
      ensure(
        f.version === b.expectedVersion,
        409,
        "План изменился. Обновите страницу.",
      );
      ensure(
        f.meters_per_unit &&
          ["confirmed_by_measurement", "confirmed_by_reviewer"].includes(
            f.scale_evidence?.status,
          ),
        409,
        "Сначала подтвердите масштаб этажа",
      );
      const results = await recalculate(tx, key, Number(f.meters_per_unit)),
        v = await version(tx, req.actor, key, "Recalculated room areas");
      await audit(tx, req.actor, "floor.recalculate", key, { results });
      return { version: v, results };
    });
  });
}
