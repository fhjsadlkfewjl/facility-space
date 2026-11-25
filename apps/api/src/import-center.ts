import { OfficeRepository } from "./repositories/office.js";
import { validatePlacement } from "./domain/geometry.js";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Actor } from "@office/shared";
import type { Database, Connection } from "./repositories/database.js";
import { one } from "./repositories/database.js";
import { parseCsv } from "./domain/csv-import.js";
import { ensure } from "./domain/errors.js";
import { manage } from "./domain/permissions.js";
import { buildingAccess, floorAccess } from "./domain/access.js";
import { audit } from "./services/office.js";
import { recordArea } from "./domain/area-history.js";
import { version } from "./facility.js";
import { leaseInput, leasePreview, applyLease } from "./leases.js";
const text = z.string().trim().min(1).max(200),
  optional = z.string().max(500).default("");
const numeric = z
  .string()
  .regex(/^\d+(\.\d+)?$/)
  .transform(Number)
  .pipe(z.number().finite().max(1e7));
const area = z.union([z.literal("").transform(() => null), numeric]);
const kinds = {
  lease_lines: {
    table: "lease_lines",
    label: "Строки договоров аренды",
    schema: z
      .object({
        id: text,
        lease_id: text,
        floor_id: text,
        room_id: optional,
        label: text,
        kind: z.enum(["office", "common"]),
        space_type_id: optional,
        area_m2: numeric.pipe(z.number().positive()),
        rate: numeric,
        valid_from: z.iso.date(),
        valid_to: z.iso.date(),
      })
      .strict(),
  },
  furniture: {
    table: "furniture",
    label: "Мебель",
    schema: z
      .object({
        id: text,
        floor_id: text,
        template_id: text,
        inventory_number: optional,
        x: numeric,
        y: numeric,
        width: numeric.pipe(z.number().positive()),
        depth: numeric.pipe(z.number().positive()),
        rotation: z
          .string()
          .regex(/^-?\d+(\.\d+)?$/)
          .transform(Number),
      })
      .strict(),
  },
  workplaces: {
    table: "workplaces",
    label: "Рабочие места",
    schema: z.object({ id: text, furniture_id: text, code: text }).strict(),
  },
  leases: {
    table: "lease_agreements",
    label: "Договоры аренды",
    schema: z
      .object({
        id: text,
        tenant_id: text,
        contract_number: text,
        start_date: z.iso.date(),
        end_date: z.iso.date(),
        currency: z.string().regex(/^[A-Z]{3}$/),
        room_ids: text,
        common_model: z.enum(["none", "selected", "proportional", "manual"]),
        common_room_ids: optional,
        manual_area_m2: area,
        manual_floor_id: optional,
        office_rate: numeric,
        common_rate: numeric,
        comment: optional,
      })
      .strict(),
  },

  buildings: {
    table: "buildings",
    label: "Здания",
    schema: z
      .object({ id: text, name: text, city: optional, address: optional })
      .strict(),
  },
  floors: {
    table: "floors",
    label: "Этажи",
    schema: z
      .object({
        id: text,
        building_id: text,
        name: text,
        number: z
          .string()
          .regex(/^-?\d+$/)
          .transform(Number),
        width: numeric.pipe(z.number().positive()),
        height: numeric.pipe(z.number().positive()),
      })
      .strict(),
  },
  rooms: {
    table: "rooms",
    label: "Помещения",
    schema: z
      .object({
        id: text,
        floor_id: text,
        name: text,
        space_type_id: text,
        area_m2: area,
      })
      .strict(),
  },
  parking: {
    table: "parking_spots",
    label: "Парковочные места",
    schema: z
      .object({
        id: text,
        building_id: text,
        number: text,
        area_m2: area,
        zone: optional,
      })
      .strict(),
  },
  tenants: {
    table: "tenants",
    label: "Арендаторы",
    schema: z
      .object({
        id: text,
        name: text,
        kind: z.enum(["internal", "external"]),
        company_reference: optional,
      })
      .strict(),
  },
  rates: {
    table: "cost_rates",
    label: "Тарифы помещений",
    schema: z
      .object({
        id: text,
        building_id: text,
        space_type_id: text,
        rate_per_m2: numeric,
        currency: z.string().regex(/^[A-Z]{3}$/),
        period: z.enum(["month", "year"]),
        valid_from: z.iso.date(),
        valid_to: z.union([z.literal("").transform(() => null), z.iso.date()]),
      })
      .strict(),
  },
} as const;
type Kind = keyof typeof kinds;
async function authorize(tx: Connection, actor: Actor, kind: Kind, row: any) {
  manage(actor);
  if (kind === "buildings") {
    if (await one(tx, "SELECT id FROM buildings WHERE id=$1", [row.id]))
      await buildingAccess(tx, actor, row.id);
  } else if (kind === "floors" || kind === "parking" || kind === "rates")
    await buildingAccess(tx, actor, row.building_id);
  else if (kind === "rooms" || kind === "furniture" || kind === "lease_lines")
    await floorAccess(tx, actor, row.floor_id);
  else if (kind === "workplaces") {
    const f = await one(tx, "SELECT floor_id FROM furniture WHERE id=$1", [
      row.furniture_id,
    ]);
    ensure(f, 400, "Предмет мебели не найден");
    await floorAccess(tx, actor, f.floor_id);
  }
}
async function applyRow(
  tx: Connection,
  actor: Actor,
  kind: Kind,
  row: any,
  before: any,
) {
  await authorize(tx, actor, kind, row);
  const spec = kinds[kind];
  if (["furniture", "workplaces", "leases", "lease_lines"].includes(kind))
    ensure(
      !before,
      409,
      "Для этого объекта CSV поддерживает создание. Изменяйте существующий объект через его карточку.",
    );
  if (kind === "lease_lines") {
    await tx.query("SELECT id FROM floors WHERE id=$1 FOR UPDATE", [
      row.floor_id,
    ]);
    const agreement = await one(
      tx,
      "SELECT *,start_date::text start,end_date::text finish FROM lease_agreements WHERE id=$1 FOR UPDATE",
      [row.lease_id],
    );
    ensure(
      agreement?.status === "active",
      400,
      "Действующий договор не найден",
    );
    ensure(
      row.valid_from >= agreement.start &&
        row.valid_to <= agreement.finish &&
        row.valid_to > row.valid_from,
      400,
      "Период строки должен находиться внутри периода договора",
    );
    if (row.room_id) {
      const room = await one(
        tx,
        "SELECT r.*,s.category FROM rooms r JOIN space_types s ON s.id=r.space_type_id WHERE r.id=$1",
        [row.room_id],
      );
      ensure(
        room?.active && room.floor_id === row.floor_id,
        400,
        "Помещение не соответствует этажу",
      );
      ensure(
        room.category === (row.kind === "office" ? "OFFICE" : "COMMON"),
        400,
        "Класс помещения не соответствует строке",
      );
      ensure(
        row.kind !== "common" || agreement.common_model === "selected",
        400,
        "Для общих помещений договор должен использовать выбранные общие площади",
      );
      ensure(
        !(await one(
          tx,
          `SELECT l.id FROM lease_lines l JOIN lease_agreements a ON a.id=l.lease_id WHERE l.room_id=$1 AND a.status='active' AND l.valid_from<$3::date AND l.valid_to>$2::date`,
          [row.room_id, row.valid_from, row.valid_to],
        )),
        409,
        "Период аренды помещения пересекается с существующей строкой",
      );
    } else
      ensure(
        row.kind === "common" && agreement.common_model === "manual",
        400,
        "Строка без помещения разрешена для общей площади по договору",
      );
    await tx.query(
      "INSERT INTO lease_lines(id,lease_id,floor_id,room_id,label,kind,space_type_id,area_m2,rate,valid_from,valid_to) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      [
        row.id,
        row.lease_id,
        row.floor_id,
        row.room_id || null,
        row.label,
        row.kind,
        row.space_type_id || null,
        row.area_m2,
        row.rate,
        row.valid_from,
        row.valid_to,
      ],
    );
    await audit(tx, actor, "import.lease_line", row.id, row);
    return {
      monthly: Math.round(row.area_m2 * row.rate * 100) / 100,
      currency: agreement.currency,
    };
  }
  if (kind === "leases") {
    const { id: key, ...data } = row;
    const input = leaseInput.parse({
      ...data,
      room_ids: data.room_ids
        .split(";")
        .map((x: string) => x.trim())
        .filter(Boolean),
      common_room_ids: data.common_room_ids
        .split(";")
        .map((x: string) => x.trim())
        .filter(Boolean),
      manual_area_m2: data.manual_area_m2 ?? undefined,
      manual_floor_id: data.manual_floor_id || undefined,
    });
    const result = await leasePreview(tx, actor, input);
    await applyLease(tx, actor, input, result, key);
    return result;
  }
  if (kind === "furniture") {
    await tx.query("SELECT id FROM floors WHERE id=$1 FOR UPDATE", [
      row.floor_id,
    ]);
    const layout = (await new OfficeRepository(tx).layout(row.floor_id))!;
    const template = await one(
      tx,
      "SELECT * FROM furniture_templates WHERE id=$1",
      [row.template_id],
    );
    ensure(template, 400, "Неизвестный тип мебели");
    if (template.real_width_m) {
      ensure(
        layout.floor.meters_per_unit &&
          ["confirmed_by_measurement", "confirmed_by_reviewer"].includes(
            layout.floor.scale_evidence?.status,
          ),
        409,
        "Подтвердите масштаб этажа",
      );
      if (!template.resize_allowed)
        ensure(
          Math.abs(
            row.width - template.real_width_m / layout.floor.meters_per_unit,
          ) < 0.01 &&
            Math.abs(
              row.depth - template.real_depth_m / layout.floor.meters_per_unit,
            ) < 0.01,
          400,
          "Размеры типа мебели фиксированы",
        );
    }
    const room = validatePlacement(
      { ...row, active: true, geometry_verified: true },
      layout.furniture,
      layout.rooms,
    );
    await tx.query(
      "INSERT INTO furniture(id,floor_id,room_id,template_id,inventory_number,x,y,width,depth,rotation,geometry_verified) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)",
      [
        row.id,
        row.floor_id,
        room,
        row.template_id,
        row.inventory_number || null,
        row.x,
        row.y,
        row.width,
        row.depth,
        row.rotation,
      ],
    );
    await version(tx, actor, row.floor_id, "Furniture CSV import");
    await audit(tx, actor, "import.furniture", row.id, row);
    return;
  }
  if (kind === "workplaces") {
    const f = await one(
      tx,
      "SELECT f.*,t.is_workplace FROM furniture f JOIN furniture_templates t ON t.id=f.template_id WHERE f.id=$1 FOR UPDATE OF f",
      [row.furniture_id],
    );
    ensure(
      f?.active && f.is_workplace,
      400,
      "Этот предмет не может быть рабочим местом",
    );
    ensure(
      !(await one(tx, "SELECT id FROM workplaces WHERE furniture_id=$1", [
        row.furniture_id,
      ])),
      409,
      "У мебели уже есть рабочее место",
    );
  }

  if (before) {
    if (kind === "floors") {
      ensure(
        before.building_id === row.building_id &&
          Number(before.width) === row.width &&
          Number(before.height) === row.height,
        409,
        "Перенос и изменение размеров этажа выполняются в редакторе",
      );
    }
    if (kind === "rooms")
      ensure(
        before.floor_id === row.floor_id,
        409,
        "Перенос помещения на другой этаж через CSV запрещён",
      );
    if (kind === "parking")
      ensure(
        before.building_id === row.building_id,
        409,
        "Перенос парковки между зданиями запрещён",
      );
    ensure(
      kind !== "rates",
      409,
      "Тарифы исторические: используйте новый ID и непересекающийся период",
    );
  }
  if (kind === "rates") {
    ensure(
      !row.valid_to || row.valid_to > row.valid_from,
      400,
      "Окончание тарифа должно быть позже начала",
    );
    await tx.query("SELECT id FROM buildings WHERE id=$1 FOR UPDATE", [
      row.building_id,
    ]);
    ensure(
      !(await one(
        tx,
        `SELECT id FROM cost_rates WHERE building_id=$1 AND space_type_id=$2 AND currency=$3 AND period=$4 AND valid_from<coalesce($6::date,'infinity') AND coalesce(valid_to,'infinity')>$5::date`,
        [
          row.building_id,
          row.space_type_id,
          row.currency,
          row.period,
          row.valid_from,
          row.valid_to,
        ],
      )),
      409,
      "Периоды тарифов пересекаются",
    );
  }
  const entries = Object.entries(row),
    columns = entries.map(([k]) => k),
    values = entries.map(([, v]) => v);
  if (before)
    await tx.query(
      `UPDATE ${spec.table} SET ${columns
        .filter((k) => k !== "id")
        .map((k) => `${k}=$${columns.indexOf(k) + 1}`)
        .join(",")} WHERE id=$1`,
      values,
    );
  else {
    if (kind === "rooms") {
      columns.push("shape");
      values.push("{}");
    }
    if (kind === "tenants") {
      columns.push("created_by");
      values.push(actor.id);
    }
    await tx.query(
      `INSERT INTO ${spec.table}(${columns.join(",")}) VALUES(${columns.map((_, i) => "$" + (i + 1)).join(",")})`,
      values,
    );
    if (kind === "buildings" && actor.role === "facilities")
      await tx.query(
        "INSERT INTO building_managers(building_id,employee_id,role) VALUES($1,$2,'manager')",
        [row.id, actor.employeeId],
      );
  }
  if (kind === "rooms") {
    const today = (await one(tx, "SELECT CURRENT_DATE::text today")).today;
    if (
      !before ||
      Number(before.area_m2) !== row.area_m2 ||
      (before.area_m2 === null && row.area_m2 !== null)
    )
      await recordArea(tx, row.id, row.area_m2, today, "CSV import", actor.id);
    await version(tx, actor, row.floor_id, "Room CSV import");
  }
  await audit(tx, actor, "import." + kind, row.id, {
    before: before ?? null,
    after: row,
  });
}
export function registerImportCenter(app: FastifyInstance, db: Database) {
  app.get("/api/import-center", async (req) => {
    manage(req.actor);
    return Object.entries(kinds).map(([kind, s]) => ({
      kind,
      label: s.label,
      columns: Object.keys(s.schema.shape),
      template: Object.keys(s.schema.shape).join(",") + "\n",
      notes:
        kind === "leases"
          ? "Помещения — ID через точку с запятой. Только новые договоры. Все четыре модели общих площадей."
          : kind === "furniture"
            ? "Координаты и размеры в единицах плана. Проверяются контуры и пересечения. Только создание."
            : kind === "workplaces"
              ? "Только создание для мебели, допускающей рабочее место."
              : kind === "rates"
                ? "Только новые периоды. Исторические тарифы не перезаписываются."
                : kind === "rooms"
                  ? "Созданным помещениям нужно добавить контуры на карте. Пустая площадь означает «неизвестно»."
                  : "",
    }));
  });
  app.post("/api/import-center/preview", async (req) => {
    manage(req.actor);
    const b = z
        .object({
          kind: z.enum([
            "buildings",
            "floors",
            "rooms",
            "parking",
            "tenants",
            "rates",
            "furniture",
            "workplaces",
            "leases",
            "lease_lines",
          ]),
          csv: z.string().max(500000),
        })
        .strict()
        .parse(req.body),
      spec = kinds[b.kind];
    const parsed = parseCsv(b.csv);
    const errors: any[] = [],
      rows: any[] = [],
      ids = new Set<string>();
    for (let i = 0; i < parsed.length; i++) {
      try {
        const r = parsed[i];
        ensure(
          !Object.values(r).some((v) => /^[\s]*[=+@\t\r]/.test(v)),
          400,
          "Формулы в CSV запрещены",
        );
        const value = spec.schema.parse(r);
        ensure(!ids.has(value.id), 400, "Повторяющийся ID");
        ids.add(value.id);
        rows.push(value);
      } catch (e: any) {
        errors.push({
          row: i + 2,
          error:
            e instanceof z.ZodError
              ? e.issues
                  .map((x) => x.path.join(".") + ": " + x.message)
                  .join("; ")
              : e.message,
        });
      }
    }
    if (errors.length) return { errors, changes: [], previewId: null };
    const changes: any[] = [];
    const dry = {};
    try {
      await db.transaction(async (tx) => {
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const before = await one(
            tx,
            `SELECT * FROM ${spec.table} WHERE id=$1 FOR UPDATE`,
            [r.id],
          );
          const comparable = before
            ? Object.fromEntries(
                Object.keys(r).map((k) => [
                  k,
                  typeof r[k] === "number"
                    ? Number(before[k])
                    : before[k] instanceof Date
                      ? before[k].toISOString().slice(0, 10)
                      : before[k],
                ]),
              )
            : null;
          const action = isDeepStrictEqual(comparable, r)
            ? "unchanged"
            : before
              ? "update"
              : "create";
          await authorize(tx, req.actor, b.kind, r);
          changes.push({
            id: r.id,
            name: r.name ?? r.number ?? r.id,
            action,
            before: before ?? null,
            after: r,
          });
          if (action !== "unchanged")
            try {
              const calculation = await applyRow(
                tx,
                req.actor,
                b.kind,
                r,
                before,
              );
              if (calculation)
                changes[changes.length - 1].calculation = calculation;
            } catch (e: any) {
              throw { row: i + 2, error: e.message };
            }
        }
        throw dry;
      });
    } catch (e: any) {
      if (e !== dry)
        return {
          errors: [{ row: e.row ?? 0, error: e.error ?? e.message }],
          changes: [],
          previewId: null,
        };
    }
    const key = randomUUID();
    await db.query(
      "INSERT INTO workflow_previews(id,kind,actor_id,payload,result) VALUES($1,'import',$2,$3,$4)",
      [
        key,
        req.actor.id,
        JSON.stringify({ kind: b.kind }),
        JSON.stringify(changes),
      ],
    );
    return { previewId: key, errors: [], changes };
  });
  app.post("/api/import-center/apply", async (req) => {
    manage(req.actor);
    const { previewId } = z
      .object({ previewId: text })
      .strict()
      .parse(req.body);
    return db.transaction(async (tx) => {
      const p = await one(
        tx,
        "SELECT * FROM workflow_previews WHERE id=$1 AND kind='import' AND actor_id=$2 AND applied_at IS NULL AND created_at>now()-interval '30 minutes' FOR UPDATE",
        [previewId, req.actor.id],
      );
      ensure(p, 409, "Предпросмотр устарел или уже применён");
      const kind = p.payload.kind as Kind;
      const changes = p.result as any[];
      for (const c of [...changes].sort((a, b) => a.id.localeCompare(b.id))) {
        const current = await one(
          tx,
          `SELECT * FROM ${kinds[kind].table} WHERE id=$1 FOR UPDATE`,
          [c.id],
        );
        ensure(
          isDeepStrictEqual(
            JSON.parse(JSON.stringify(current ?? null)),
            c.before,
          ),
          409,
          "Данные изменились после предпросмотра. Проверьте CSV заново.",
        );
      }
      for (const c of changes) {
        await authorize(tx, req.actor, kind, c.after);
        if (c.action !== "unchanged") {
          const calculation = await applyRow(
            tx,
            req.actor,
            kind,
            c.after,
            c.before,
          );
          if (c.calculation)
            ensure(
              isDeepStrictEqual(calculation, c.calculation),
              409,
              "Расчёт изменился после предпросмотра. Проверьте CSV заново.",
            );
        }
      }
      await tx.query(
        "UPDATE workflow_previews SET applied_at=now() WHERE id=$1",
        [p.id],
      );
      await audit(tx, req.actor, "import.apply", p.id, {
        kind,
        count: changes.length,
      });
      return {
        applied: changes.filter((c) => c.action !== "unchanged").length,
        unchanged: changes.filter((c) => c.action === "unchanged").length,
      };
    });
  });
}
