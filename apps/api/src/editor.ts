import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Database } from "./repositories/database.js";
import { one } from "./repositories/database.js";
import { OfficeRepository } from "./repositories/office.js";
import { floorAccess } from "./domain/access.js";
import { manage } from "./domain/permissions.js";
import { ensure } from "./domain/errors.js";
import {
  validPolygon,
  contained,
  corners,
  validatePlacement,
  polygonsOverlap,
} from "./domain/geometry.js";
import { audit } from "./services/office.js";
import { layoutInput } from "@office/shared";
const id = z.string().min(1).max(128),
  num = z.number().finite();
const polygon = z
  .array(z.tuple([num.min(0).max(100000), num.min(0).max(100000)]))
  .min(3)
  .max(500);
const input = z
  .object({
    expectedVersion: num.int().positive(),
    rooms: z
      .array(
        z
          .object({
            id,
            action: z.enum(["create", "shape", "clear", "archive"]),
            name: z.string().trim().min(1).max(200).optional(),
            spaceTypeId: id.optional(),
            polygon: polygon.optional(),
          })
          .strict(),
      )
      .max(500)
      .default([]),
    changes: layoutInput.shape.changes.optional(),
    additions: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            templateId: id,
            x: num.min(0).max(100000),
            y: num.min(0).max(100000),
            width: num.positive().max(100000),
            depth: num.positive().max(100000),
            rotation: num.min(-360).max(360),
            workplaceCode: z.string().trim().min(1).max(100).optional(),
          })
          .strict(),
      )
      .max(100)
      .default([]),
  })
  .strict();
// A single transaction and floor version for the entire editor draft. No hard deletes.
export function registerEditor(app: FastifyInstance, db: Database) {
  app.put("/api/floors/:id/editor", async (req) => {
    manage(req.actor);
    const floorId = id.parse((req.params as any).id),
      b = input.parse(req.body),
      changes = b.changes ?? [];
    ensure(
      b.rooms.length + changes.length + b.additions.length > 0,
      400,
      "Нет изменений для сохранения",
    );
    return db.transaction(async (tx) => {
      await floorAccess(tx, req.actor, floorId);
      const floor = await one(
        tx,
        "SELECT * FROM floors WHERE id=$1 FOR UPDATE",
        [floorId],
      );
      ensure(floor?.active, 404, "Этаж недоступен");
      ensure(
        floor.version === b.expectedVersion,
        409,
        "Планировка уже изменена. Ваш черновик сохранён на экране; загрузите актуальную версию перед повторным редактированием.",
      );
      const before = (await new OfficeRepository(tx).layout(floorId))!;
      const l = structuredClone(before);
      ensure(
        new Set(b.rooms.map((r) => r.id)).size === b.rooms.length,
        400,
        "Повтор помещения в запросе",
      );
      ensure(
        new Set([...changes, ...b.additions].map((r) => r.id)).size ===
          changes.length + b.additions.length,
        400,
        "Повтор мебели в запросе",
      );
      for (const r of b.rooms) {
        const old = l.rooms.find((x) => x.id === r.id);
        if (r.action === "create") {
          ensure(
            !(await one(tx, "SELECT id FROM rooms WHERE id=$1", [r.id])),
            409,
            "Помещение с этим ID уже существует",
          );
          ensure(
            r.name && r.spaceTypeId && r.polygon,
            400,
            "Укажите название, тип и контур нового помещения",
          );
          l.rooms.push({
            id: r.id,
            floor_id: floorId,
            name: r.name,
            space_type_id: r.spaceTypeId,
            area_m2: null,
            shape: { polygon: r.polygon },
            active: true,
          });
        } else {
          ensure(old?.active, 404, "Помещение не найдено на этом этаже");
          if (r.action === "archive") {
            // Keep all historical references and block deleting any room with live objects/contracts.
            const linked = await one(
              tx,
              `SELECT (SELECT count(*) FROM furniture WHERE room_id=$1 AND active)::int furniture,(SELECT count(*) FROM lease_lines WHERE room_id=$1 AND valid_to>CURRENT_DATE)::int leases,(SELECT count(*) FROM cost_rates WHERE room_id=$1 AND (valid_to IS NULL OR valid_to>CURRENT_DATE))::int rates`,
              [r.id],
            );
            ensure(
              !linked.furniture && !linked.leases && !linked.rates,
              409,
              "Нельзя удалить помещение: в нём есть мебель, рабочие места, действующие договоры или тарифы. Сначала разберите связи. Можно убрать только контур, сохранив помещение.",
            );
            old.active = false;
          } else if (r.action === "clear") {
            old.shape = { needsReview: true };
          } else {
            ensure(r.polygon, 400, "Укажите новый контур");
            old.shape = { polygon: r.polygon };
          }
        }
        if (r.action === "create" || r.action === "shape") {
          const p = r.polygon!;
          ensure(
            validPolygon(p),
            422,
            "Контур должен иметь минимум три разные точки и не пересекать сам себя",
          );
          ensure(
            p.every(([x, y]) => x <= floor.width && y <= floor.height),
            422,
            "Контур выходит за границы этажа",
          );
        }
      }
      for (const r of b.rooms.filter(
        (x) => x.action === "create" || x.action === "shape",
      )) {
        for (const other of l.rooms.filter(
          (x) =>
            x.active &&
            x.id !== r.id &&
            x.shape.polygon &&
            validPolygon(x.shape.polygon),
        ))
          ensure(
            !polygonsOverlap(r.polygon!, other.shape.polygon!),
            422,
            `Контур пересекает помещение «${other.name}». Общая стена допустима, наложение площадей — нет.`,
          );
      }
      for (const c of changes) {
        const f = l.furniture.find((x) => x.id === c.id);
        ensure(f?.active, 404, "Мебель не найдена на этаже");
        ensure(
          f.resize_allowed !== false ||
            ((c.width === undefined || c.width === f.width) &&
              (c.depth === undefined || c.depth === f.depth)),
          400,
          "Размер этого типа мебели нельзя менять",
        );
        Object.assign(f, {
          x: c.x,
          y: c.y,
          rotation: ((c.rotation % 360) + 360) % 360,
          ...(c.width === undefined ? {} : { width: c.width }),
          ...(c.depth === undefined ? {} : { depth: c.depth }),
        });
      }
      for (const a of b.additions) {
        ensure(
          !(await one(tx, "SELECT id FROM furniture WHERE id=$1", [a.id])),
          409,
          "Предмет уже существует",
        );
        const t = await one(
          tx,
          "SELECT * FROM furniture_templates WHERE id=$1",
          [a.templateId],
        );
        ensure(t, 404, "Шаблон мебели не найден");
        ensure(
          !a.workplaceCode || t.is_workplace,
          400,
          "Этот тип не поддерживает рабочее место",
        );
        if (t.real_width_m && t.real_depth_m) {
          ensure(
            floor.meters_per_unit &&
              ["confirmed_by_measurement", "confirmed_by_reviewer"].includes(
                floor.scale_evidence?.status,
              ),
            409,
            "Для этого шаблона сначала подтвердите масштаб этажа",
          );
          if (!t.resize_allowed)
            ensure(
              Math.abs(a.width - t.real_width_m / floor.meters_per_unit) <
                0.01 &&
                Math.abs(a.depth - t.real_depth_m / floor.meters_per_unit) <
                  0.01,
              400,
              "Размер этого типа мебели нельзя менять",
            );
        }
        l.furniture.push({
          ...a,
          template_id: a.templateId,
          room_id: null,
          floor_id: floorId,
          active: true,
          geometry_verified: true,
        });
      }
      for (const c of [...changes, ...b.additions]) {
        const f = l.furniture.find((x) => x.id === c.id)!;
        ensure(
          corners(f).every(
            ([x, y]) =>
              x >= 0 && y >= 0 && x <= floor.width && y <= floor.height,
          ),
          422,
          "Мебель выходит за границы этажа",
        );
        f.room_id = validatePlacement(
          f,
          l.furniture,
          l.rooms,
          "roomId" in c ? c.roomId : undefined,
        );
      }
      // Validate only changed contours; unrelated imported imperfections do not block room edits.
      for (const r of b.rooms.filter((x) => x.action === "shape")) {
        const items = l.furniture.filter((f) => f.active && f.room_id === r.id);
        ensure(
          items.every(
            (f) => f.width && f.depth && contained(corners(f), r.polygon!),
          ),
          422,
          "Новый контур исключает связанную мебель или её размеры неизвестны. Исправьте контур; назначения не изменены.",
        );
      }
      for (const r of b.rooms) {
        const room = l.rooms.find((x) => x.id === r.id)!;
        let area: number | null = null;
        if (
          room.shape.polygon &&
          floor.meters_per_unit &&
          ["confirmed_by_measurement", "confirmed_by_reviewer"].includes(
            floor.scale_evidence?.status,
          )
        ) {
          const p = room.shape.polygon;
          area =
            (Math.abs(
              p.reduce(
                (sum: number, [x, y]: number[], i: number) =>
                  sum +
                  x * p[(i + 1) % p.length][1] -
                  p[(i + 1) % p.length][0] * y,
                0,
              ),
            ) /
              2) *
            floor.meters_per_unit ** 2;
        }
        if (r.action === "create")
          await tx.query(
            "INSERT INTO rooms(id,floor_id,name,space_type_id,shape,calculated_area_m2) VALUES($1,$2,$3,$4,$5,$6)",
            [
              room.id,
              floorId,
              room.name,
              room.space_type_id,
              JSON.stringify(room.shape),
              area,
            ],
          );
        else if (r.action === "archive")
          await tx.query("UPDATE rooms SET active=false WHERE id=$1", [r.id]);
        else
          await tx.query(
            "UPDATE rooms SET shape=$2,calculated_area_m2=$3 WHERE id=$1",
            [r.id, JSON.stringify(room.shape), area],
          );
      }
      for (const c of changes) {
        const f = l.furniture.find((x) => x.id === c.id)!;
        await tx.query(
          "UPDATE furniture SET x=$2,y=$3,rotation=$4,width=$5,depth=$6,room_id=$7,geometry_verified=true WHERE id=$1",
          [f.id, f.x, f.y, f.rotation, f.width, f.depth, f.room_id],
        );
      }
      for (const a of b.additions) {
        const f = l.furniture.find((x) => x.id === a.id)!;
        await tx.query(
          "INSERT INTO furniture(id,floor_id,room_id,template_id,x,y,rotation,width,depth,geometry_verified) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true)",
          [
            f.id,
            floorId,
            f.room_id,
            a.templateId,
            f.x,
            f.y,
            f.rotation,
            f.width,
            f.depth,
          ],
        );
        if (a.workplaceCode)
          await tx.query(
            "INSERT INTO workplaces(id,furniture_id,code) VALUES($1,$2,$3)",
            [randomUUID(), f.id, a.workplaceCode],
          );
      }
      const v = floor.version + 1;
      await tx.query("UPDATE floors SET version=$2 WHERE id=$1", [floorId, v]);
      const after = await new OfficeRepository(tx).layout(floorId);
      await tx.query(
        "INSERT INTO layout_versions(id,floor_id,version,snapshot,comment,created_by) VALUES($1,$2,$3,$4,$5,$6)",
        [
          randomUUID(),
          floorId,
          v,
          JSON.stringify(after),
          "Редактор: единое сохранение",
          req.actor.id,
        ],
      );
      await audit(tx, req.actor, "layout.save", floorId, {
        version: v,
        roomChanges: b.rooms,
        changes,
        additions: b.additions,
        before,
        after,
      });
      return { version: v };
    });
  });
}
