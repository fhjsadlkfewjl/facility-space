import test from 'node:test';
import assert from 'node:assert/strict';
import {
  corners,
  inside,
  collision,
  contained,
  validPolygon,
  validatePlacement,
} from '../apps/api/src/domain/geometry.js';
import { parsePosition, parseShape } from '../apps/api/src/adapters/bitrix.js';
import type { Point, Furniture, Room } from '@office/shared';
const square: Point[] = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
];
const f = (x = 20, y = 20, rotation = 0): Furniture => ({
  id: 'one',
  floor_id: 'fl',
  room_id: 'r',
  x,
  y,
  rotation,
  width: 20,
  depth: 10,
  geometry_verified: true,
  active: true,
});
test('boundary, rotation and containment', () => {
  assert(inside([0, 50], square));
  assert(!inside([-1, 50], square));
  assert(contained(corners(f()), square));
  assert(!contained(corners(f(1, 1, 45)), square));
});
test('SAT collision includes rotated rectangles, allows touching edges', () => {
  assert(collision(corners(f()), corners(f(22, 22, 45))));
  assert(!collision(corners(f()), corners(f(40, 20))));
});
test('concave rooms reject edges crossing outside even if all corners inside', () => {
  const p: Point[] = [
    [0, 0],
    [100, 0],
    [100, 100],
    [60, 100],
    [60, 40],
    [40, 40],
    [40, 100],
    [0, 100],
  ];
  assert(
    !contained(
      [
        [20, 20],
        [80, 20],
        [80, 80],
        [20, 80],
      ],
      p,
    ),
  );
});
test('reject bowtie, zero area and repeated vertices', () => {
  assert(
    !validPolygon([
      [0, 0],
      [100, 100],
      [0, 100],
      [100, 0],
    ]),
  );
  assert(
    !validPolygon([
      [0, 0],
      [0, 0],
      [10, 0],
    ]),
  );
  assert(
    !validPolygon([
      [0, 0],
      [10, 0],
      [20, 0],
    ]),
  );
});
test('derive room and reject ambiguous overlapping rooms', () => {
  const r: Room = {
    id: 'r',
    floor_id: 'fl',
    name: 'Room',
    area_m2: '20',
    shape: { polygon: square },
    space_type_id: null,
    active: true,
  };
  assert.equal(validatePlacement(f(), [f()], [r]), 'r');
  assert.throws(() => validatePlacement(f(), [f()], [r, { ...r, id: 'r2' }]));
  assert.equal(validatePlacement(f(), [f()], [r, { ...r, id: 'r2' }], 'r2'), 'r2');
});
test('SQL geometry normalization preserves unsupported curves', () => {
  assert.deepEqual(parsePosition('510:1080:180'), { x: 510, y: 1080, rotation: 180 });
  assert.throws(() => parsePosition('1::0'));
  assert.throws(() => parsePosition('1:2:NaN'));
  assert.deepEqual(parseShape('M0 0h100v100h-100z').polygon, square);
  assert(parseShape('M0 0C1 2 3 4 5 6z').needsReview);
  assert(parseShape('M0 0L10 10M20 20L30 30z').needsReview);
});
