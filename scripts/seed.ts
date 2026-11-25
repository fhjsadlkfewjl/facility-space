import { OfficeRepository } from '../apps/api/src/repositories/office.js';
import { fileURLToPath } from 'node:url';
import type { Database } from '../apps/api/src/repositories/database.js';
import { postgres } from '../apps/api/src/repositories/database.js';
export async function seed(db: Database) {
  await db.transaction(async (tx) => {
    if ((await tx.query('SELECT id FROM buildings LIMIT 1')).rows.length)
      throw new Error('Seed requires an empty database; never merges demo and imported data');
    await tx.query(
      "INSERT INTO buildings(id,name,address,city) VALUES('demo-building','Северный кампус','Демонстрационный адрес, 12','Москва')",
    );
    await tx.query(
      "INSERT INTO floors(id,building_id,name,number,width,height) VALUES('demo-floor','demo-building','Этаж 3',3,1100,650)",
    );
    await tx.query(
      "INSERT INTO space_types(id,name) VALUES('office','Офис'),('meeting','Переговорная'),('common','Общие зоны'),('parking','Парковка')",
    );
    for (const [id, name, poly, area, type] of [
      [
        'room-a',
        '301 · Product',
        [
          [50, 60],
          [530, 60],
          [530, 360],
          [50, 360],
        ],
        72,
        'office',
      ],
      [
        'room-b',
        '302 · Engineering',
        [
          [570, 60],
          [1050, 60],
          [1050, 360],
          [570, 360],
        ],
        72,
        'office',
      ],
      [
        'room-c',
        '303 · Переговорная',
        [
          [50, 420],
          [400, 420],
          [400, 590],
          [50, 590],
        ],
        32,
        'meeting',
      ],
      [
        'room-d',
        '304 · Studio',
        [
          [440, 420],
          [1050, 420],
          [1050, 590],
          [440, 590],
        ],
        48,
        'office',
      ],
    ] as const)
      await tx.query(
        'INSERT INTO rooms(id,floor_id,name,area_m2,shape,space_type_id) VALUES($1,$2,$3,$4,$5,$6)',
        [id, 'demo-floor', name, area, JSON.stringify({ polygon: poly }), type],
      );
    await tx.query(
      "INSERT INTO furniture_templates(id,name,is_workplace,width,depth) VALUES('desk','Стол 140 × 70',true,70,40)",
    );
    await tx.query(
      "INSERT INTO departments_projection(id,name) VALUES('product','Продукт'),('engineering','Разработка'),('operations','Операции')",
    );
    const names = [
      'Анна Смирнова',
      'Михаил Волков',
      'Ирина Лебедева',
      'Алексей Ким',
      'Мария Орлова',
      'Денис Соколов',
      'Елена Петрова',
      'Артём Новиков',
    ];
    await tx.query("UPDATE space_types SET category='OFFICE' WHERE id IN ('office','meeting')");
    await tx.query("UPDATE space_types SET category='COMMON' WHERE id='common'");
    await tx.query(
      "UPDATE space_types SET subtype=CASE id WHEN 'office' THEN 'office' WHEN 'meeting' THEN 'meeting_room' WHEN 'parking' THEN 'parking' ELSE 'other' END WHERE id IN ('office','meeting','common','parking')",
    );
    await tx.query("UPDATE floors SET meters_per_unit=0.022360679775 WHERE id='demo-floor'");
    const seedRooms = (await tx.query('SELECT id,shape FROM rooms')).rows;
    for (const r of seedRooms) {
      const p = r.shape.polygon;
      const a =
        (Math.abs(
          p.reduce(
            (v: number, c: number[], i: number) =>
              v + c[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * c[1],
            0,
          ),
        ) /
          2) *
        0.0005;
      await tx.query('UPDATE rooms SET calculated_area_m2=$2 WHERE id=$1', [r.id, a]);
    }
    for (let i = 1; i <= 16; i++) {
      const left = i <= 8,
        index = (i - 1) % 8,
        x = (left ? 130 : 650) + (index % 4) * 110,
        y = 160 + Math.floor(index / 4) * 120,
        id = 'furniture-' + i;
      await tx.query(
        'INSERT INTO furniture(id,floor_id,room_id,template_id,inventory_number,x,y,width,depth,geometry_verified) VALUES($1,$2,$3,$4,$5,$6,$7,70,40,true)',
        [
          id,
          'demo-floor',
          left ? 'room-a' : 'room-b',
          'desk',
          'D-' + String(i).padStart(3, '0'),
          x,
          y,
        ],
      );
      await tx.query('INSERT INTO workplaces(id,furniture_id,code) VALUES($1,$2,$3)', [
        'workplace-' + i,
        id,
        'D-' + String(i).padStart(3, '0'),
      ]);
      if (i <= 8) {
        await tx.query(
          'INSERT INTO employees_projection(id,display_name,department_id,position) VALUES($1,$2,$3,$4)',
          [
            'employee-' + i,
            names[i - 1],
            i <= 4 ? 'product' : 'engineering',
            i <= 4 ? 'Product designer' : 'Software engineer',
          ],
        );
      }
    }
    await tx.query("INSERT INTO building_managers VALUES('demo-building','employee-1','manager')");
    for (let i = 1; i <= 6; i++)
      await tx.query(
        'INSERT INTO workplace_assignments(id,employee_id,workplace_id,created_by) VALUES($1,$2,$3,$4)',
        ['assignment-' + i, 'employee-' + i, 'workplace-' + (i <= 4 ? i : i + 4), 'seed'],
      );
    await tx.query(
      "INSERT INTO cost_rates(id,space_type_id,rate_per_m2,currency,period,valid_from) VALUES('demo-rate','office',2500,'RUB','month','2026-01-01')",
    );
    for (let i = 1; i <= 6; i++)
      await tx.query(
        'INSERT INTO parking_spots(id,building_id,number,area_m2) VALUES($1,$2,$3,12.5)',
        ['parking-' + i, 'demo-building', 'P-' + i],
      );
    await tx.query(
      "INSERT INTO layout_versions(id,floor_id,version,snapshot,comment,created_by) VALUES('initial','demo-floor',1,$1,'Demo baseline','seed')",
      [JSON.stringify(await new OfficeRepository(tx).layout('demo-floor'))],
    );
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = postgres(process.env.DATABASE_URL!);
  try {
    await seed(db);
    console.log('Demo seeded');
  } finally {
    await db.close();
  }
}
