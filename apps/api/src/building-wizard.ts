import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Database } from "./repositories/database.js";
import { one } from "./repositories/database.js";
import { manage } from "./domain/permissions.js";
import { ensure } from "./domain/errors.js";
import { safeSvg } from "./domain/svg.js";
import { audit } from "./services/office.js";
import { recordArea } from "./domain/area-history.js";
import { version } from "./facility.js";
const name = z.string().trim().min(1).max(200);
const schema = z
  .object({
    name,
    city: z.string().max(200),
    address: z.string().max(500),
    responsible: z.string().min(1).max(128).optional(),
    floors: z
      .array(
        z
          .object({
            name,
            number: z.number().int().min(-100).max(1000),
            width: z.number().positive().max(100000),
            height: z.number().positive().max(100000),
            svg: z.string().max(3000000).nullable(),
            rooms: z
              .array(
                z.object({
                  name,
                  space_type_id: z.string().min(1).max(128),
                  area_m2: z.number().nonnegative().max(1e7).nullable(),
                }),
              )
              .max(500),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
export function registerBuildingWizard(app: FastifyInstance, db: Database) {
  app.post(
    "/api/building-wizard/preview",
    { bodyLimit: 12000000 },
    async (req) => {
      manage(req.actor);
      const b = schema.parse(req.body);
      ensure(
        new Set(b.floors.map((f) => f.name)).size === b.floors.length,
        400,
        "Названия этажей не должны повторяться",
      );
      for (const f of b.floors) {
        if (f.svg) f.svg = safeSvg(f.svg);
        ensure(
          new Set(f.rooms.map((r) => r.name)).size === f.rooms.length,
          400,
          "Названия помещений на этаже не должны повторяться",
        );
      }
      if (b.responsible)
        ensure(
          await one(
            db,
            "SELECT id FROM employees_projection WHERE id=$1 AND active",
            [b.responsible],
          ),
          400,
          "Ответственный не найден",
        );
      const types = new Set(
        (await db.query("SELECT id FROM space_types")).rows.map((r) => r.id),
      );
      ensure(
        b.floors.every((f) => f.rooms.every((r) => types.has(r.space_type_id))),
        400,
        "Неизвестный тип помещения",
      );
      const result = {
        name: b.name,
        floors: b.floors.length,
        plans: b.floors.filter((f) => f.svg).length,
        rooms: b.floors.reduce((s, f) => s + f.rooms.length, 0),
        warnings: [
          "Масштаб нужно подтвердить по контрольному расстоянию.",
          "Импортированные списком помещения нужно связать с контурами на плане.",
        ],
      };
      const key = randomUUID();
      await db.query(
        "INSERT INTO workflow_previews(id,kind,actor_id,payload,result) VALUES($1,'building',$2,$3,$4)",
        [key, req.actor.id, JSON.stringify(b), JSON.stringify(result)],
      );
      return { previewId: key, ...result };
    },
  );
  app.post("/api/building-wizard/apply", async (req) => {
    manage(req.actor);
    const { previewId } = z
      .object({ previewId: name })
      .strict()
      .parse(req.body);
    return db.transaction(async (tx) => {
      const p = await one(
        tx,
        "SELECT * FROM workflow_previews WHERE id=$1 AND kind='building' AND actor_id=$2 AND applied_at IS NULL AND created_at>now()-interval '30 minutes' FOR UPDATE",
        [previewId, req.actor.id],
      );
      ensure(p, 409, "Предпросмотр устарел или уже применён");
      const b = schema.parse(p.payload),
        buildingId = randomUUID(),
        floors: any[] = [];
      await tx.query(
        "INSERT INTO buildings(id,name,city,address) VALUES($1,$2,$3,$4)",
        [buildingId, b.name, b.city, b.address],
      );
      for (const employee of [
        ...new Set(
          [
            b.responsible,
            ...(req.actor.role === "facilities" ? [req.actor.employeeId] : []),
          ].filter(Boolean),
        ),
      ])
        await tx.query(
          "INSERT INTO building_managers(building_id,employee_id,role) VALUES($1,$2,'manager')",
          [buildingId, employee],
        );
      for (const f of b.floors) {
        const floorId = randomUUID();
        await tx.query(
          "INSERT INTO floors(id,building_id,name,number,width,height,background_svg) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [floorId, buildingId, f.name, f.number, f.width, f.height, f.svg],
        );
        for (const r of f.rooms) {
          const roomId = randomUUID();
          await tx.query(
            "INSERT INTO rooms(id,floor_id,name,space_type_id,area_m2,shape,needs_review) VALUES($1,$2,$3,$4,$5,'{}',true)",
            [roomId, floorId, r.name, r.space_type_id, r.area_m2],
          );
          await recordArea(
            tx,
            roomId,
            r.area_m2,
            (await one(tx, "SELECT CURRENT_DATE::text today")).today,
            "Building wizard",
            req.actor.id,
          );
        }
        await version(tx, req.actor, floorId, "New building wizard");
        floors.push({ id: floorId, name: f.name });
      }
      await tx.query(
        "UPDATE workflow_previews SET applied_at=now() WHERE id=$1",
        [p.id],
      );
      await audit(tx, req.actor, "building.wizard", buildingId, p.result);
      return { id: buildingId, floors };
    });
  });
}
