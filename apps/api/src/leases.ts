import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Actor } from "@office/shared";
import type { Connection, Database } from "./repositories/database.js";
import { one } from "./repositories/database.js";
import { floorAccess } from "./domain/access.js";
import { manage } from "./domain/permissions.js";
import { ensure } from "./domain/errors.js";
import { audit } from "./services/office.js";
const id = z.string().min(1).max(128),
  money = z.number().finite().min(0).max(1e9);
export const leaseInput = z
  .object({
    tenant_id: id,
    contract_number: z.string().trim().min(1).max(120),
    start_date: z.iso.date(),
    end_date: z.iso.date(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    room_ids: z.array(id).min(1).max(200),
    common_model: z.enum(["none", "selected", "proportional", "manual"]),
    common_room_ids: z.array(id).max(200).default([]),
    manual_area_m2: z.number().finite().positive().max(1e7).optional(),
    manual_floor_id: id.optional(),
    office_rate: money,
    common_rate: money,
    comment: z.string().max(2000).default(""),
  })
  .strict();
const date = (v: any) =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export async function leasePreview(
  tx: Connection,
  actor: Actor,
  b: z.infer<typeof leaseInput>,
) {
  manage(actor);
  ensure(
    b.start_date >= new Date().toISOString().slice(0, 10),
    400,
    "Для нового договора выберите сегодняшнюю или будущую дату. Заведение договоров задним числом с текущими площадями не поддерживается; требуется отдельная сверка истории.",
  );
  ensure(
    b.end_date > b.start_date,
    400,
    "Дата окончания должна быть позже начала. Дата окончания не включается.",
  );
  ensure(
    await one(tx, "SELECT id FROM tenants WHERE id=$1 AND active", [
      b.tenant_id,
    ]),
    400,
    "Выберите действующего арендатора",
  );
  const ids = [
    ...b.room_ids,
    ...(b.common_model === "selected" ? b.common_room_ids : []),
  ];
  ensure(new Set(ids).size === ids.length, 400, "Помещение указано повторно");
  let rooms = (
    await tx.query(
      `SELECT r.*,s.category FROM rooms r LEFT JOIN space_types s ON s.id=r.space_type_id WHERE r.id=ANY($1::text[]) ORDER BY r.id`,
      [ids],
    )
  ).rows;
  ensure(
    rooms.length === ids.length && rooms.every((r) => r.active),
    400,
    "Одно из помещений не найдено или отключено",
  );
  const floors = [...new Set<string>(rooms.map((r) => r.floor_id))].sort();
  for (const floor of floors) {
    await floorAccess(tx, actor, floor);
    await tx.query("SELECT id FROM floors WHERE id=$1 FOR UPDATE", [floor]);
  }
  rooms = (
    await tx.query(
      `SELECT r.*,s.category FROM rooms r LEFT JOIN space_types s ON s.id=r.space_type_id WHERE r.id=ANY($1::text[]) ORDER BY r.id`,
      [ids],
    )
  ).rows;
  ensure(
    rooms.every((r) => r.active && floors.includes(r.floor_id)),
    409,
    "Состав помещений изменился",
  );
  // The same floor locks serialize competing lease previews/applications.
  const conflict = await one(
    tx,
    `SELECT l.label,a.contract_number FROM lease_lines l JOIN lease_agreements a ON a.id=l.lease_id WHERE a.status='active' AND l.room_id=ANY($1::text[]) AND l.valid_from<$3::date AND l.valid_to>$2::date LIMIT 1`,
    [ids, b.start_date, b.end_date],
  );
  ensure(!conflict, 409, "Помещение уже включено в договор на этот период");
  ensure(
    !(await one(
      tx,
      "SELECT id FROM lease_agreements WHERE tenant_id=$1 AND contract_number=$2",
      [b.tenant_id, b.contract_number],
    )),
    409,
    "Номер договора этого арендатора уже существует",
  );
  const lines: any[] = [],
    allocations: any[] = [];
  for (const r of rooms) {
    const office = b.room_ids.includes(r.id);
    ensure(
      r.category === (office ? "OFFICE" : "COMMON"),
      400,
      `Помещение ${r.name}: подтвердите ${office ? "офисный" : "общий"} класс`,
    );
    ensure(
      r.area_m2 != null && Number(r.area_m2) > 0,
      400,
      `Помещение ${r.name}: нужна площадь по документам`,
    );
    lines.push({
      room_id: r.id,
      floor_id: r.floor_id,
      label: r.name,
      kind: office ? "office" : "common",
      space_type_id: r.space_type_id,
      area_m2: Number(r.area_m2),
      rate: office ? b.office_rate : b.common_rate,
    });
  }
  if (b.common_model === "proportional")
    for (const floor of floors) {
      const pool = (
        await tx.query(
          `SELECT r.id,r.name,r.area_m2,s.category FROM rooms r JOIN space_types s ON s.id=r.space_type_id WHERE r.floor_id=$1 AND r.active AND s.category IN ('OFFICE','COMMON') ORDER BY r.id`,
          [floor],
        )
      ).rows;
      ensure(
        pool.every((r) => r.area_m2 != null && Number(r.area_m2) > 0),
        400,
        "Для пропорционального распределения нужны подтверждённые площади всех офисных и общих помещений этажа",
      );
      const denominator = pool
          .filter((r) => r.category === "OFFICE")
          .reduce((s, r) => s + Number(r.area_m2), 0),
        common = pool
          .filter((r) => r.category === "COMMON")
          .reduce((s, r) => s + Number(r.area_m2), 0),
        office = lines
          .filter((l) => l.floor_id === floor && l.kind === "office")
          .reduce((s, l) => s + l.area_m2, 0);
      ensure(
        denominator > 0 && common > 0,
        400,
        "На этаже нужны офисные и общие помещения с площадями",
      );
      const area = round((common * office) / denominator);
      ensure(area > 0, 400, "Распределённая площадь меньше 0,01 м²");
      allocations.push({
        floor_id: floor,
        formula: "common_area * leased_office_area / total_office_area",
        common_area: common,
        leased_office_area: office,
        total_office_area: denominator,
        result: area,
        source_rooms: pool,
      });
      lines.push({
        room_id: null,
        floor_id: floor,
        label: "Доля общих площадей",
        kind: "common",
        space_type_id: null,
        area_m2: area,
        rate: b.common_rate,
      });
    }
  if (b.common_model === "manual") {
    ensure(
      b.manual_area_m2 &&
        b.manual_floor_id &&
        floors.includes(b.manual_floor_id),
      400,
      "Укажите площадь и этаж ручного распределения среди выбранных офисов",
    );
    lines.push({
      room_id: null,
      floor_id: b.manual_floor_id,
      label: "Общая площадь по договору",
      kind: "common",
      space_type_id: null,
      area_m2: b.manual_area_m2,
      rate: b.common_rate,
    });
    allocations.push({
      floor_id: b.manual_floor_id,
      formula: "manual",
      result: b.manual_area_m2,
    });
  }
  return {
    lines: lines.map((l) => ({ ...l, monthly: round(l.area_m2 * l.rate) })),
    allocations,
    office_area: round(
      lines
        .filter((l) => l.kind === "office")
        .reduce((s, l) => s + l.area_m2, 0),
    ),
    common_area: round(
      lines
        .filter((l) => l.kind === "common")
        .reduce((s, l) => s + l.area_m2, 0),
    ),
    monthly: round(lines.reduce((s, l) => s + round(l.area_m2 * l.rate), 0)),
    currency: b.currency,
  };
}
export async function applyLease(
  tx: Connection,
  actor: Actor,
  b: z.infer<typeof leaseInput>,
  result: any,
  key = randomUUID(),
) {
  await tx.query(
    `INSERT INTO lease_agreements(id,tenant_id,contract_number,start_date,end_date,status,currency,common_model,allocation_snapshot,comment,created_by) VALUES($1,$2,$3,$4,$5,'active',$6,$7,$8,$9,$10)`,
    [
      key,
      b.tenant_id,
      b.contract_number,
      b.start_date,
      b.end_date,
      b.currency,
      b.common_model,
      JSON.stringify(result.allocations),
      b.comment,
      actor.id,
    ],
  );
  for (const l of result.lines)
    await tx.query(
      "INSERT INTO lease_lines(id,lease_id,room_id,floor_id,label,kind,space_type_id,area_m2,rate,valid_from,valid_to) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      [
        randomUUID(),
        key,
        l.room_id,
        l.floor_id,
        l.label,
        l.kind,
        l.space_type_id,
        l.area_m2,
        l.rate,
        b.start_date,
        b.end_date,
      ],
    );
  await audit(tx, actor, "lease.create", key, { input: b, result });
  return { id: key };
}
export function registerLeases(app: FastifyInstance, db: Database) {
  app.get("/api/tenants", async (req) => {
    manage(req.actor);
    return (await db.query("SELECT * FROM tenants ORDER BY name LIMIT 500"))
      .rows;
  });
  app.post("/api/tenants", async (req) => {
    manage(req.actor);
    const b = z
      .object({
        name: z.string().trim().min(1).max(200),
        kind: z.enum(["internal", "external"]),
        company_reference: z.string().max(200).default(""),
      })
      .strict()
      .parse(req.body);
    return db.transaction(async (tx) => {
      const key = randomUUID();
      await tx.query(
        "INSERT INTO tenants(id,name,kind,company_reference,created_by) VALUES($1,$2,$3,$4,$5)",
        [key, b.name, b.kind, b.company_reference, req.actor.id],
      );
      await audit(tx, req.actor, "tenant.create", key, b);
      return { id: key };
    });
  });
  app.post("/api/leases/preview", async (req) => {
    manage(req.actor);
    const b = leaseInput.parse(req.body);
    return db.transaction(async (tx) => {
      const result = await leasePreview(tx, req.actor, b),
        key = randomUUID();
      await tx.query(
        "INSERT INTO workflow_previews(id,kind,actor_id,payload,result) VALUES($1,'lease',$2,$3,$4)",
        [key, req.actor.id, JSON.stringify(b), JSON.stringify(result)],
      );
      return { previewId: key, ...result };
    });
  });
  app.post("/api/leases/apply", async (req) => {
    manage(req.actor);
    const b = z.object({ previewId: id }).strict().parse(req.body);
    return db.transaction(async (tx) => {
      const p = await one(
        tx,
        "SELECT * FROM workflow_previews WHERE id=$1 AND kind='lease' AND actor_id=$2 AND applied_at IS NULL AND created_at>now()-interval '30 minutes' FOR UPDATE",
        [b.previewId, req.actor.id],
      );
      ensure(
        p,
        409,
        "Предпросмотр устарел или уже применён. Рассчитайте заново.",
      );
      const current = await leasePreview(tx, req.actor, p.payload);
      ensure(
        isDeepStrictEqual(current, p.result),
        409,
        "Площади или условия изменились. Пересчитайте договор.",
      );
      const result = await applyLease(tx, req.actor, p.payload, current);
      await tx.query(
        "UPDATE workflow_previews SET applied_at=now() WHERE id=$1",
        [p.id],
      );
      return result;
    });
  });
  app.get("/api/leases", async (req) => {
    manage(req.actor);
    const q = z
      .object({
        asOf: z.iso.date().default(new Date().toISOString().slice(0, 10)),
        status: z
          .enum(["", "active", "expiring", "expired", "future"])
          .default(""),
        floorId: z.string().default(""),
        q: z.string().max(120).default(""),
        offset: z.coerce.number().int().min(0).max(100000).default(0),
      })
      .parse(req.query);
    return (
      await db.query(
        `SELECT a.*,t.name tenant_name,CASE WHEN a.status='cancelled' THEN 'cancelled' WHEN a.start_date>$1::date THEN 'future' WHEN a.end_date<=$1::date THEN 'expired' WHEN a.end_date<=$1::date+90 THEN 'expiring' ELSE 'active' END phase,a.end_date-$1::date days_left,(SELECT sum(round(l.area_m2*l.rate,2)) FROM lease_lines l WHERE l.lease_id=a.id AND l.valid_from<=$1::date AND l.valid_to>$1::date) monthly FROM lease_agreements a JOIN tenants t ON t.id=a.tenant_id WHERE (a.contract_number ILIKE $4 OR t.name ILIKE $4) AND ($3='' OR EXISTS(SELECT 1 FROM lease_lines l WHERE l.lease_id=a.id AND l.floor_id=$3)) AND ($2='' OR a.status='active' AND (($2='active' AND a.start_date<=$1::date AND a.end_date>$1::date) OR ($2='expiring' AND a.start_date<=$1::date AND a.end_date>$1::date AND a.end_date<=$1::date+90) OR ($2='expired' AND a.end_date<=$1::date) OR ($2='future' AND a.start_date>$1::date))) ORDER BY a.end_date,a.id LIMIT 100 OFFSET $5`,
        [q.asOf, q.status, q.floorId, "%" + q.q + "%", q.offset],
      )
    ).rows;
  });
  app.get("/api/leases/:id", async (req) => {
    manage(req.actor);
    const key = z.object({ id }).parse(req.params).id;
    const a = await one(
      db,
      "SELECT a.*,t.name tenant_name FROM lease_agreements a JOIN tenants t ON t.id=a.tenant_id WHERE a.id=$1",
      [key],
    );
    ensure(a, 404, "Договор не найден");
    return {
      ...a,
      lines: (
        await db.query(
          "SELECT * FROM lease_lines WHERE lease_id=$1 ORDER BY valid_from,label,id",
          [key],
        )
      ).rows,
    };
  });
  app.post("/api/leases/:id/amend", async (req) => {
    manage(req.actor);
    const key = z.object({ id }).parse(req.params).id;
    const b = z
      .object({
        line_id: id,
        valid_from: z.iso.date(),
        area_m2: z.number().positive().max(1e7),
        rate: money,
        reason: z.string().trim().min(5).max(1000),
      })
      .strict()
      .parse(req.body);
    return db.transaction(async (tx) => {
      const a = await one(
        tx,
        "SELECT * FROM lease_agreements WHERE id=$1 FOR UPDATE",
        [key],
      );
      ensure(a?.status === "active", 409, "Договор недоступен");
      const l = await one(
        tx,
        "SELECT * FROM lease_lines WHERE id=$1 AND lease_id=$2 FOR UPDATE",
        [b.line_id, key],
      );
      ensure(l, 404, "Строка не найдена");
      await floorAccess(tx, req.actor, l.floor_id);
      ensure(
        b.valid_from > date(l.valid_from) && b.valid_from < date(l.valid_to),
        400,
        "Новая ставка должна начинаться внутри периода строки; предыдущий период сохраняется",
      );
      await tx.query("UPDATE lease_lines SET valid_to=$2 WHERE id=$1", [
        l.id,
        b.valid_from,
      ]);
      const next = randomUUID();
      await tx.query(
        "INSERT INTO lease_lines(id,lease_id,room_id,floor_id,label,kind,space_type_id,area_m2,rate,valid_from,valid_to) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        [
          next,
          key,
          l.room_id,
          l.floor_id,
          l.label,
          l.kind,
          l.space_type_id,
          b.area_m2,
          b.rate,
          b.valid_from,
          date(l.valid_to),
        ],
      );
      await audit(tx, req.actor, "lease.amend", key, {
        before: l,
        after: b,
        newLineId: next,
      });
      return { id: next };
    });
  });
  app.get("/api/floors/:id/leases", async (req) => {
    manage(req.actor);
    const key = z.object({ id }).parse(req.params).id;
    const { asOf } = z
      .object({
        asOf: z.iso.date().default(new Date().toISOString().slice(0, 10)),
      })
      .parse(req.query);
    return (
      await db.query(
        `SELECT l.*,a.tenant_id,a.contract_number,a.start_date,a.end_date,a.currency,t.name tenant_name FROM lease_lines l JOIN lease_agreements a ON a.id=l.lease_id JOIN tenants t ON t.id=a.tenant_id WHERE l.floor_id=$1 AND a.status='active' AND l.valid_from<=$2::date AND l.valid_to>$2::date`,
        [key, asOf],
      )
    ).rows;
  });
}
