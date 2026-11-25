import type { Shape, Point } from '@office/shared';
import { validPolygon } from '../domain/geometry.js';
export interface LegacyElement {
  id: string;
  iblock: number;
  name: string;
  active: boolean;
  properties: Record<string, string[]>;
}
export interface LegacyEmployee {
  id: string;
  name: string;
  active: boolean;
  position: string;
  table_num?: string | null;
  department_raw?: string | null;
}
export interface BitrixSnapshot {
  source: string;
  report: { sha256: string; [key: string]: unknown };
  elements: LegacyElement[];
  employees: LegacyEmployee[];
  departments?: {id:string;name:string}[];
}
export interface BitrixProjectionAdapter {
  snapshot(): Promise<BitrixSnapshot>;
}
export function parsePosition(value: string) {
  const parts = value.split(':');
  if (parts.length !== 3 || parts.some((p) => !p.trim() || !Number.isFinite(Number(p))))
    throw new Error('Invalid X:Y:R');
  return { x: Number(parts[0]), y: Number(parts[1]), rotation: Number(parts[2]) };
}
// Exact straight-line SVG subset only; curves/multiple subpaths are preserved for explicit review.
export function parseShape(raw: string): Shape {
  try {
    const value = JSON.parse(raw);
    const p = Array.isArray(value) ? value : value.polygon;
    if (p && validPolygon(p)) return { polygon: p };
  } catch {}
  const tokens = raw.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) ?? [];
  if (tokens.join('') !== raw.replace(/[\s,]/g, '')) return { path: raw, needsReview: true };
  let i = 0,
    cmd = '',
    x = 0,
    y = 0,
    closed = false;
  const points: Point[] = [];
  try {
    while (i < tokens.length) {
      if (/^[a-zA-Z]$/.test(tokens[i])) cmd = tokens[i++];
      const lower = cmd.toLowerCase(),
        relative = cmd === lower;
      if (!['m', 'l', 'h', 'v', 'z'].includes(lower) || closed) throw 0;
      if (lower === 'z') {
        closed = true;
        continue;
      }
      const num = () => {
        if (i >= tokens.length || /^[a-zA-Z]$/.test(tokens[i])) throw 0;
        const n = Number(tokens[i++]);
        if (!Number.isFinite(n)) throw 0;
        return n;
      };
      if (lower === 'm' || lower === 'l') {
        if (lower === 'm' && points.length) throw 0;
        const a = num(),
          b = num();
        x = relative ? x + a : a;
        y = relative ? y + b : b;
        if (lower === 'm') cmd = relative ? 'l' : 'L';
      } else if (lower === 'h') {
        const a = num();
        x = relative ? x + a : a;
      } else {
        const a = num();
        y = relative ? y + a : a;
      }
      points.push([x, y]);
    }
    if (
      points.length > 1 &&
      points[0][0] === points.at(-1)![0] &&
      points[0][1] === points.at(-1)![1]
    )
      points.pop();
    if (!closed || !validPolygon(points)) throw 0;
    return { polygon: points, path: raw };
  } catch {
    return { path: raw, needsReview: true };
  }
}
