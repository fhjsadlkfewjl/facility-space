import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { embedded } from "../apps/api/src/repositories/database.js";
import { migrate } from "../scripts/migrate.js";
import { seed } from "../scripts/seed.js";
import { buildApp } from "../apps/api/src/app.js";
import { polygonsOverlap } from "../apps/api/src/domain/geometry.js";
const db = embedded();
let app: Awaited<ReturnType<typeof buildApp>>;
before(async () => {
  await migrate(db);
  await seed(db);
  app = await buildApp(db, {
    authenticate: async (h) => ({
      id: "editor-test",
      employeeId: h === "facilities" ? "employee-2" : "employee-1",
      role:
        h === "employee"
          ? "employee"
          : h === "facilities"
            ? "facilities"
            : "admin",
    }),
  });
});
after(async () => {
  await app.close();
  await db.close();
});
const version = async () =>
  Number(
    (await db.query("SELECT version FROM floors WHERE id='demo-floor'")).rows[0]
      .version,
  );
const save = async (body: any, role = "admin") =>
  app.inject({
    method: "PUT",
    url: "/api/floors/demo-floor/editor",
    headers: { authorization: role },
    payload: body,
  });
const create = (id: string, polygon: number[][]) => ({
  id,
  action: "create",
  name: id,
  spaceTypeId: "office",
  polygon,
});
const p = [
  [10, 10],
  [40, 10],
  [40, 40],
  [10, 40],
];
test("single transaction creates rooms, validates types and records exactly one version; roles rejected", async () => {
  const v = await version();
  const versions = Number(
    (await db.query("SELECT count(*) n FROM layout_versions")).rows[0].n,
  );
  assert.equal(
    (
      await save(
        { expectedVersion: v, rooms: [create("draft-room", p)] },
        "employee",
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await save(
        { expectedVersion: v, rooms: [create("draft-room", p)] },
        "facilities",
      )
    ).statusCode,
    403,
  );
  const result = await save({
    expectedVersion: v,
    rooms: [
      create("draft-room", p),
      {
        ...create("bad-type", [
          [10, 50],
          [30, 50],
          [30, 70],
          [10, 70],
        ]),
        spaceTypeId: "missing",
      },
    ],
  });
  assert.equal(result.statusCode, 400, result.body);
  assert.equal(
    (await db.query("SELECT id FROM rooms WHERE id='draft-room'")).rows.length,
    0,
  );
  assert.equal(await version(), v);
  assert.equal(
    (await save({ expectedVersion: v, rooms: [create("draft-room", p)] }))
      .statusCode,
    200,
  );
  assert.equal(await version(), v + 1);
  assert.equal(
    Number(
      (await db.query("SELECT count(*) n FROM layout_versions")).rows[0].n,
    ),
    versions + 1,
  );
  assert.equal(
    (
      await save({
        expectedVersion: v,
        rooms: [{ id: "draft-room", action: "clear" }],
      })
    ).statusCode,
    409,
  );
});
test("clearing a contour preserves occupied rooms, assignments and official area; archive blocked", async () => {
  const f = (
    await db.query(
      "SELECT f.room_id FROM furniture f JOIN workplaces w ON w.furniture_id=f.id JOIN workplace_assignments a ON a.workplace_id=w.id WHERE a.valid_to IS NULL LIMIT 1",
    )
  ).rows[0];
  const room = (await db.query("SELECT * FROM rooms WHERE id=$1", [f.room_id]))
    .rows[0];
  const before = (
    await db.query("SELECT * FROM workplace_assignments ORDER BY id")
  ).rows;
  assert.equal(
    (
      await save({
        expectedVersion: await version(),
        rooms: [{ id: room.id, action: "archive" }],
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await save({
        expectedVersion: await version(),
        rooms: [{ id: room.id, action: "clear" }],
      })
    ).statusCode,
    200,
  );
  const now = (await db.query("SELECT * FROM rooms WHERE id=$1", [room.id]))
    .rows[0];
  assert.equal(now.active, true);
  assert.equal(now.area_m2, room.area_m2);
  assert.equal(now.calculated_area_m2, null);
  assert.deepEqual(now.shape, { needsReview: true });
  assert.deepEqual(
    (await db.query("SELECT * FROM workplace_assignments ORDER BY id")).rows,
    before,
  );
  assert.equal(
    (
      await save({
        expectedVersion: await version(),
        rooms: [{ id: room.id, action: "shape", polygon: room.shape.polygon }],
      })
    ).statusCode,
    200,
  );
});
test("shape edits reject lost furniture, self intersections, overlaps, wrong floor and roll back valid changes", async () => {
  const v = await version();
  const result = await save({
    expectedVersion: v,
    rooms: [
      { id: "draft-room", action: "clear" },
      {
        id: "room-a",
        action: "shape",
        polygon: [
          [50, 60],
          [60, 60],
          [60, 70],
          [50, 70],
        ],
      },
    ],
  });
  assert.equal(result.statusCode, 422, result.body);
  assert.equal(await version(), v);
  assert.ok(
    (await db.query("SELECT shape FROM rooms WHERE id='draft-room'")).rows[0]
      .shape.polygon,
  );
  for (const polygon of [
    [
      [1, 1],
      [20, 20],
      [1, 20],
      [20, 1],
    ],
    [
      [1090, 640],
      [1200, 640],
      [1200, 700],
    ],
    [
      [60, 70],
      [100, 70],
      [100, 100],
      [60, 100],
    ],
  ])
    assert.equal(
      (await save({ expectedVersion: v, rooms: [create("invalid", polygon)] }))
        .statusCode,
      422,
    );
  assert.equal(
    (
      await save({
        expectedVersion: v,
        rooms: [{ id: "wrong-floor", action: "clear" }],
      })
    ).statusCode,
    404,
  );
});
test("one save archives an empty room and creates furniture/workplace; nothing assigned implicitly", async () => {
  const assignments = (
    await db.query("SELECT * FROM workplace_assignments ORDER BY id")
  ).rows;
  const result = await save({
    expectedVersion: await version(),
    rooms: [
      { id: "draft-room", action: "archive" },
      create("new-area", [
        [10, 370],
        [300, 370],
        [300, 410],
        [10, 410],
      ]),
    ],
    additions: [
      {
        id: "b853d072-0de4-48e9-85d6-4ead0e9e1732",
        templateId: "desk",
        x: 100,
        y: 390,
        width: 70,
        depth: 30,
        rotation: 0,
        workplaceCode: "draft-place",
      },
    ],
  });
  assert.equal(result.statusCode, 200, result.body);
  assert.equal(
    (await db.query("SELECT active FROM rooms WHERE id='draft-room'")).rows[0]
      .active,
    false,
  );
  assert.equal(
    (
      await db.query(
        "SELECT room_id FROM furniture WHERE id='b853d072-0de4-48e9-85d6-4ead0e9e1732'",
      )
    ).rows[0].room_id,
    "new-area",
  );
  assert.deepEqual(
    (await db.query("SELECT * FROM workplace_assignments ORDER BY id")).rows,
    assignments,
  );
});
test("room overlap accepts shared walls and rejects equal/contained contours", () => {
  assert.equal(
    polygonsOverlap(
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      [
        [10, 0],
        [20, 0],
        [20, 10],
        [10, 10],
      ],
    ),
    false,
  );
  assert.equal(
    polygonsOverlap(
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
    ),
    true,
  );
  assert.equal(
    polygonsOverlap(
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      [
        [2, 2],
        [3, 2],
        [3, 3],
        [2, 3],
      ],
    ),
    true,
  );
});
