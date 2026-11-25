import type { Point, Furniture, Room } from '@office/shared';
import { ensure } from './errors.js';
const EPS = 1e-7;
const cross = (a: Point, b: Point, c: Point) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function on(p: Point, a: Point, b: Point) {
  return (
    Math.abs(cross(a, b, p)) < EPS &&
    p[0] >= Math.min(a[0], b[0]) - EPS &&
    p[0] <= Math.max(a[0], b[0]) + EPS &&
    p[1] >= Math.min(a[1], b[1]) - EPS &&
    p[1] <= Math.max(a[1], b[1]) + EPS
  );
}
export function inside(p: Point, poly: Point[]) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (on(p, a, b)) return true;
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      hit = !hit;
  }
  return hit;
}
function properIntersect(a: Point, b: Point, c: Point, d: Point) {
  return cross(a, b, c) * cross(a, b, d) < -EPS && cross(c, d, a) * cross(c, d, b) < -EPS;
}
export function validPolygon(p: Point[]) {
  if (p.length < 3 || p.some((a) => a.length !== 2 || a.some((v) => !Number.isFinite(v))))
    return false;
  let area = 0;
  for (let i = 0; i < p.length; i++) {
    let a = p[i],
      b = p[(i + 1) % p.length];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < EPS) return false;
    area += a[0] * b[1] - a[1] * b[0];
    for (let j = i + 2; j < p.length; j++) {
      if (i === 0 && j === p.length - 1) continue;
      const c = p[j],
        d = p[(j + 1) % p.length];
      if (properIntersect(a, b, c, d) || on(c, a, b) || on(d, a, b) || on(a, c, d) || on(b, c, d))
        return false;
    }
  }
  return Math.abs(area) > EPS;
}
export function corners(f: Pick<Furniture, 'x' | 'y' | 'rotation' | 'width' | 'depth'>): Point[] {
  ensure(f.width && f.depth, 422, 'Missing verified furniture dimensions');
  let r = (f.rotation * Math.PI) / 180;
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([x, y]) => [
    f.x + ((x * f.width!) / 2) * Math.cos(r) - ((y * f.depth!) / 2) * Math.sin(r),
    f.y + ((x * f.width!) / 2) * Math.sin(r) + ((y * f.depth!) / 2) * Math.cos(r),
  ]);
}
export function contained(rect: Point[], poly: Point[]) {
  if (!validPolygon(poly) || !rect.every((p) => inside(p, poly))) return false;
  for (let i = 0; i < 4; i++) {
    const a = rect[i],
      b = rect[(i + 1) % 4];
    const cuts = [0, 1];
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    for (let j = 0; j < poly.length; j++) {
      const c = poly[j],
        d = poly[(j + 1) % poly.length];
      if (properIntersect(a, b, c, d)) return false;
      for (const v of [c, d])
        if (on(v, a, b))
          cuts.push(Math.abs(dx) > Math.abs(dy) ? (v[0] - a[0]) / dx : (v[1] - a[1]) / dy);
    }
    cuts.sort((x, y) => x - y);
    for (let k = 1; k < cuts.length; k++) {
      const t = (cuts[k] + cuts[k - 1]) / 2;
      if (!inside([a[0] + t * dx, a[1] + t * dy], poly)) return false;
    }
  }
  return true;
}
export function collision(a: Point[], b: Point[]) {
  for (const p of [a, b])
    for (let i = 0; i < p.length; i++) {
      const n: Point = [p[(i + 1) % p.length][1] - p[i][1], p[i][0] - p[(i + 1) % p.length][0]];
      const pa = a.map((v) => v[0] * n[0] + v[1] * n[1]),
        pb = b.map((v) => v[0] * n[0] + v[1] * n[1]);
      if (Math.max(...pa) <= Math.min(...pb) + EPS || Math.max(...pb) <= Math.min(...pa) + EPS)
        return false;
    }
  return true;
}
export function validatePlacement(
  item: Furniture,
  all: Furniture[],
  rooms: Room[],
  requested?: string | null,
) {
  const rect = corners(item);
  const candidates = rooms.filter(
    (r) => r.active && r.shape.polygon && contained(rect, r.shape.polygon),
  );
  let room = requested
    ? candidates.find((r) => r.id === requested)
    : candidates.length === 1
      ? candidates[0]
      : undefined;
  ensure(room, 422, 'Furniture must fit exactly one validated room (or specify a containing room)');
  for (const other of all) {
    if (other.id === item.id || !other.active) continue;
    ensure(
      other.width && other.depth,
      422,
      'Floor has furniture with unknown dimensions; reconcile before editing',
    );
    ensure(!collision(rect, corners(other)), 422, `Furniture collision: ${other.id}`);
  }
  return room.id;
}

// Strict interior overlap for simple polygons; a shared wall/vertex is allowed.
export function polygonsOverlap(a: Point[], b: Point[]) {
  const interior=(p:Point, poly:Point[])=>inside(p,poly)&&!poly.some((v,i)=>on(p,v,poly[(i+1)%poly.length]));
  for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++)if(properIntersect(a[i],a[(i+1)%a.length],b[j],b[(j+1)%b.length]))return true;
  if(a.some(p=>interior(p,b))||b.some(p=>interior(p,a)))return true;
  for(const poly of [a,b])for(let i=0;i<poly.length;i++){
    const p=poly[i],q=poly[(i+1)%poly.length],length=Math.hypot(q[0]-p[0],q[1]-p[1]);
    for(const side of [-1,1]){
      const sample:Point=[(p[0]+q[0])/2+side*(q[1]-p[1])/length*1e-4,(p[1]+q[1])/2-side*(q[0]-p[0])/length*1e-4];
      if(interior(sample,a)&&interior(sample,b))return true;
    }
  }
  return false;
}
