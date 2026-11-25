import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { embedded } from "../apps/api/src/repositories/database.js";
import { migrate } from "../scripts/migrate.js";
import { seed } from "../scripts/seed.js";
import { buildApp } from "../apps/api/src/app.js";
import { identityFromEnv } from "../apps/api/src/adapters/identity.js";
import { calibrationScale } from "../apps/api/src/corporate.js";
const db = embedded();
let app: Awaited<ReturnType<typeof buildApp>>;
before(async () => {
  process.env.AUTH_MODE = "demo";
  process.env.DEMO_TOKEN = "corporate-test-token";
  await migrate(db);
  await seed(db);
  app = await buildApp(db, identityFromEnv());
  await db.query(
    "INSERT INTO tenants(id,name,kind,created_by) VALUES('tenant-test','Организация','external','test')",
  );
  await db.query(
    "INSERT INTO space_types(id,name,category) VALUES('office-test','Офис','OFFICE'),('common-test','Коридор','COMMON')",
  );
  await db.query(
    `INSERT INTO rooms(id,floor_id,name,area_m2,shape,space_type_id) VALUES('lease-office-a','demo-floor','Офис А',100,'{}','office-test'),('lease-office-b','demo-floor','Офис Б',100,'{}','office-test'),('lease-common','demo-floor','Коридор',40,'{}','common-test')`,
  );
});
after(async () => {
  await app?.close();
  await db.close();
});
const req = (method: any, url: string, payload?: any, role = "admin") =>
  app.inject({
    method,
    url,
    payload,
    headers: { authorization: "Bearer corporate-test-token:" + role },
  });
const input = (number: string) => ({
  tenant_id: "tenant-test",
  contract_number: number,
  start_date: "2030-01-01",
  end_date: "2031-01-01",
  currency: "RUB",
  room_ids: ["lease-office-a"],
  common_model: "none",
  office_rate: 2000,
  common_rate: 700,
});
test("calibration measures distance, rejects coincident points and preserves official area", async () => {
  assert.equal(
    calibrationScale(
      [
        [10, 10],
        [110, 10],
      ],
      6.4,
    ),
    0.064,
  );
  assert.throws(() =>
    calibrationScale(
      [
        [1, 1],
        [1, 1],
      ],
      10,
    ),
  );
  const floor = (await db.query("SELECT * FROM floors WHERE id='demo-floor'"))
    .rows[0];
  const official = (
    await db.query("SELECT area_m2 FROM rooms WHERE id='lease-office-a'")
  ).rows[0].area_m2;
  const r = await req("POST", "/api/floors/demo-floor/calibration", {
    points: [
      [10, 10],
      [110, 10],
    ],
    real_distance_m: 6.4,
    source: "Контрольный обмер",
    expectedVersion: floor.version,
  });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().meters_per_unit, 0.064);
  assert.equal(
    (await db.query("SELECT area_m2 FROM rooms WHERE id='lease-office-a'"))
      .rows[0].area_m2,
    official,
  );
  assert.equal(
    (
      await req("POST", "/api/floors/demo-floor/calibration", {
        points: [
          [1, 1],
          [20, 20],
        ],
        real_distance_m: 2,
        source: "Документ",
        expectedVersion: floor.version,
      })
    ).statusCode,
    409,
  );
});
test("lease preview does not create; apply once, overlap rejected, historic rates preserved", async () => {
  const p = await req("POST", "/api/leases/preview", input("A"));
  assert.equal(p.statusCode, 200, p.body);
  assert.equal(p.json().monthly, 200000);
  assert.equal(
    (await db.query("SELECT * FROM lease_agreements")).rows.length,
    0,
  );
  const applied = await req("POST", "/api/leases/apply", {
    previewId: p.json().previewId,
  });
  assert.equal(applied.statusCode, 200, applied.body);
  assert.equal(
    (await req("POST", "/api/leases/apply", { previewId: p.json().previewId }))
      .statusCode,
    409,
  );
  assert.equal(
    (await req("POST", "/api/leases/preview", input("B"))).statusCode,
    409,
  );
  const a = applied.json().id;
  const detail = (await req("GET", "/api/leases/" + a)).json();
  const change = await req("POST", "/api/leases/" + a + "/amend", {
    line_id: detail.lines[0].id,
    valid_from: "2030-07-01",
    area_m2: 100,
    rate: 2200,
    reason: "Дополнительное соглашение",
  });
  assert.equal(change.statusCode, 200, change.body);
  assert.equal(
    Number((await req("GET", "/api/leases?asOf=2030-06-01")).json()[0].monthly),
    200000,
  );
  assert.equal(
    Number((await req("GET", "/api/leases?asOf=2030-07-01")).json()[0].monthly),
    220000,
  );
  assert.equal(
    (await req("GET", "/api/leases?asOf=2030-12-01&status=expiring")).json()
      .length,
    1,
  );
});
test("selected and manual common-area models, proportional refuses incomplete source", async () => {
  const b = {
    ...input("COMMON"),
    room_ids: ["lease-office-b"],
    common_model: "selected",
    common_room_ids: ["lease-common"],
  };
  const p = await req("POST", "/api/leases/preview", b);
  assert.equal(p.statusCode, 200, p.body);
  assert.equal(p.json().common_area, 40);
  assert.equal(p.json().monthly, 228000);
  const m = await req("POST", "/api/leases/preview", {
    ...b,
    common_model: "manual",
    manual_area_m2: 17.5,
    manual_floor_id: "demo-floor",
  });
  assert.equal(m.statusCode, 200, m.body);
  assert.equal(m.json().monthly, 212250);
  await db.query(
    "INSERT INTO rooms(id,floor_id,name,shape,space_type_id) VALUES('unknown-area','demo-floor','Неизвестно','{}','office-test')",
  );
  assert.equal(
    (
      await req("POST", "/api/leases/preview", {
        ...b,
        common_model: "proportional",
      })
    ).statusCode,
    400,
  );
  await db.query("UPDATE rooms SET area_m2=50 WHERE id='unknown-area'");
  const proportion = await req("POST", "/api/leases/preview", {
    ...b,
    common_model: "proportional",
  });
  assert.equal(proportion.statusCode, 200, proportion.body);
  assert.ok(proportion.json().allocations[0].result > 0);
  assert.equal(
    proportion.json().allocations[0].formula,
    "common_area * leased_office_area / total_office_area",
  );
});
test("lease preview stale area rejected and employee cannot see commercial data", async () => {
  const p = await req("POST", "/api/leases/preview", {
    ...input("STALE"),
    room_ids: ["lease-office-b"],
  });
  assert.equal(p.statusCode, 200);
  await db.query("UPDATE rooms SET area_m2=105 WHERE id='lease-office-b'");
  assert.equal(
    (await req("POST", "/api/leases/apply", { previewId: p.json().previewId }))
      .statusCode,
    409,
  );
  for (const path of [
    "/api/leases",
    "/api/tenants",
    "/api/import-center",
    "/api/floors/demo-floor/leases",
  ])
    assert.equal(
      (await req("GET", path, undefined, "employee")).statusCode,
      403,
    );
  assert.equal(
    (await req("POST", "/api/leases/preview", input("X"), "employee"))
      .statusCode,
    403,
  );
});
test("physical furniture templates sanitize SVG and validate dimensions", async () => {
  const b = {
    name: "Стол 140",
    category: "desk",
    real_width_m: 1.4,
    real_depth_m: 0.7,
    is_workplace: true,
    resize_allowed: false,
    svg: '<svg viewBox="0 0 140 70"><rect width="140" height="70"/></svg>',
  };
  assert.equal((await req("POST", "/api/templates", b)).statusCode, 200);
  assert.equal(
    (
      await req("POST", "/api/templates", {
        ...b,
        svg: "<svg><script>alert(1)</script></svg>",
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (await req("POST", "/api/templates", { ...b, real_width_m: -1 }))
      .statusCode,
    400,
  );
  assert.equal(
    (await req("POST", "/api/templates", b, "employee")).statusCode,
    403,
  );
});
test("import preview has no side effects; apply once; stale updates cannot overwrite", async () => {
  const csv = "id,name,city,address\nimport-building,Новый офис,Иркутск,Адрес";
  const p = await req("POST", "/api/import-center/preview", {
    kind: "buildings",
    csv,
  });
  assert.equal(p.statusCode, 200, p.body);
  assert.equal(p.json().errors.length, 0, JSON.stringify(p.json()));
  assert.equal(
    (await db.query("SELECT * FROM buildings WHERE id='import-building'")).rows
      .length,
    0,
  );
  const apply = await req("POST", "/api/import-center/apply", {
    previewId: p.json().previewId,
  });
  assert.equal(apply.statusCode, 200, apply.body);
  assert.equal(apply.json().applied, 1);
  assert.equal(
    (
      await req("POST", "/api/import-center/apply", {
        previewId: p.json().previewId,
      })
    ).statusCode,
    409,
  );
  const p2 = await req("POST", "/api/import-center/preview", {
    kind: "buildings",
    csv: csv.replace("Новый офис", "Изменённый офис"),
  });
  await db.query(
    "UPDATE buildings SET name='Другой автор' WHERE id='import-building'",
  );
  assert.equal(
    (
      await req("POST", "/api/import-center/apply", {
        previewId: p2.json().previewId,
      })
    ).statusCode,
    409,
  );
  const bad = await req("POST", "/api/import-center/preview", {
    kind: "buildings",
    csv: csv.replace("Новый офис", "=SUM(1)"),
  });
  assert.ok(bad.json().errors.length);
  assert.equal(
    (
      await req(
        "POST",
        "/api/import-center/preview",
        { kind: "buildings", csv },
        "employee",
      )
    ).statusCode,
    403,
  );
});
test("map booking derives identity and returns interval occupancy", async () => {
  const startsAt = new Date(Date.now() + 86400000).toISOString(),
    endsAt = new Date(Date.now() + 90000000).toISOString();
  const b = { kind: "workplace", resourceId: "workplace-7", startsAt, endsAt };
  const invalid = await req(
    "POST",
    "/api/me/bookings",
    { ...b, employeeId: "employee-7" },
    "employee",
  );
  assert.equal(invalid.statusCode, 400);
  const a = await req(
    "GET",
    "/api/floors/demo-floor/booking-availability?" +
      new URLSearchParams({ startsAt, endsAt }),
    undefined,
    "employee",
  );
  assert.equal(a.statusCode, 200);
  assert.ok(a.json().some((x: any) => x.status === "occupied"));
  const made = await req("POST", "/api/me/bookings", b, "employee");
  assert.equal(made.statusCode, 200, made.body);
  const again = await req(
    "GET",
    "/api/floors/demo-floor/booking-availability?" +
      new URLSearchParams({ startsAt, endsAt }),
  );
  assert.equal(
    again.json().find((x: any) => x.workplace_id === "workplace-7").status,
    "booked",
  );
});
test("building wizard validates SVG and applies atomically without guessing scale", async () => {
  const b = {
    name: "Новый корпус",
    city: "Иркутск",
    address: "Адрес",
    floors: [
      {
        name: "1",
        number: 1,
        width: 1000,
        height: 800,
        svg: '<svg viewBox="0 0 1000 800"><rect x="0" y="0" width="1000" height="800"/></svg>',
        rooms: [{ name: "101", space_type_id: "office-test", area_m2: null }],
      },
    ],
  };
  const p = await req("POST", "/api/building-wizard/preview", b);
  assert.equal(p.statusCode, 200, p.body);
  assert.equal(
    (await db.query("SELECT id FROM buildings WHERE name='Новый корпус'")).rows
      .length,
    0,
  );
  const r = await req("POST", "/api/building-wizard/apply", {
    previewId: p.json().previewId,
  });
  assert.equal(r.statusCode, 200, r.body);
  const fl = (
    await db.query("SELECT * FROM floors WHERE id=$1", [r.json().floors[0].id])
  ).rows[0];
  assert.equal(fl.meters_per_unit, null);
  assert.equal(
    (
      await req("POST", "/api/building-wizard/apply", {
        previewId: p.json().previewId,
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (await req("POST", "/api/building-wizard/preview", b, "employee"))
      .statusCode,
    403,
  );
});
test("import leases preview is atomic and creates valid historic lines", async () => {
  const csv =
    "id,tenant_id,contract_number,start_date,end_date,currency,room_ids,common_model,common_room_ids,manual_area_m2,manual_floor_id,office_rate,common_rate,comment\nimport-lease,tenant-test,CSV-LEASE,2040-01-01,2041-01-01,RUB,lease-office-a,none,,,,2000,0,Договор";
  const p = await req("POST", "/api/import-center/preview", {
    kind: "leases",
    csv,
  });
  assert.equal(p.statusCode, 200, p.body);
  assert.deepEqual(p.json().errors, [], p.body);
  assert.equal(
    (await db.query("SELECT id FROM lease_agreements WHERE id='import-lease'"))
      .rows.length,
    0,
  );
  const a = await req("POST", "/api/import-center/apply", {
    previewId: p.json().previewId,
  });
  assert.equal(a.statusCode, 200, a.body);
  assert.equal(
    (await req("GET", "/api/leases/import-lease")).json().lines.length,
    1,
  );
});
