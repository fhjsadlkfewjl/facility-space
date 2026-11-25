import { z } from 'zod';
export type Role = 'employee' | 'facilities' | 'admin';
export type Actor = { id: string; employeeId: string; role: Role };
export type Point = [number, number];
export type Shape = { polygon?: Point[]; path?: string; needsReview?: boolean };
export type Furniture = {
  inventory_number?: string | null;
  id: string;
  floor_id: string;
  room_id: string | null;
  x: number;
  y: number;
  rotation: number;
  width: number | null;
  depth: number | null;
  geometry_verified: boolean;
  template_svg?: string | null;
  template_geometry?: {box?:{cx?:number;cy?:number};geometry?:{root?:{width?:number;height?:number};basis?:{width?:number;height?:number}[]}};
  active: boolean;
  code?: string;
  workplace_id?: string;
  employee_id?: string;
  reserved?: boolean;
  display_name?: string;
  department_id?: string;
  status?: string;
  room_name?: string;
  department_name?: string;
};
export type Room = {
  id: string;
  floor_id: string;
  name: string;
  area_m2: string | null;
  shape: Shape;
  space_type_id: string | null;
  active: boolean;
};
export type Floor = {
  id: string;
  building_id: string;
  name: string;
  width: number;
  height: number;
  version: number;
  background_svg?: string;
  meters_per_unit?: number;
  scale_evidence?: {
    status?: string;
    confidence?: string;
    candidate?: number | null;
    samples?: unknown[];
  };
  background_provenance?: string;
  active: boolean;
};
export type Building = {
  id: string;
  name: string;
  city: string;
  address: string;
  floors: number;
  workplaces: number;
  occupied: number;
  reserved?: number;
};
export type Employee = {
  id: string;
  display_name: string;
  position: string;
  department_id: string | null;
  department_name?: string;
  room_name?: string;
  workplace_id?: string;
  code?: string;
  floor_id?: string;
  building_id?: string;
  active: boolean;
};
export type Layout = { floor: Floor; rooms: Room[]; furniture: Furniture[] };
const id = z.string().min(1).max(128);
export const assignmentInput = z.object({ employeeId: id, workplaceId: id.nullable(), expectedAssignmentId: id.nullable().optional() }).strict();
export const parkingAssignmentInput = z
  .object({ employeeId: id, parkingSpotId: id.nullable(), expectedAssignmentId: id.nullable().optional(), vehicle: z.string().max(80).default('') })
  .strict();
export const layoutInput = z
  .object({
    expectedVersion: z.number().int().positive(),
    comment: z.string().max(500).default(''),
    changes: z
      .array(
        z
          .object({
            id,
            x: z.number().finite().min(-100000).max(100000),
            y: z.number().finite().min(-100000).max(100000),
            rotation: z.number().finite(),
            roomId: id.nullable().optional(),
            width: z.number().finite().positive().max(100000).optional(),
            depth: z.number().finite().positive().max(100000).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict();
export const rateInput = z
  .object({
    space_type_id: id,
    building_id: id.nullable().default(null),
    room_id: id.nullable().default(null),
    rate_per_m2: z.number().finite().nonnegative().max(1e9),
    currency: z.string().regex(/^[A-Z]{3}$/),
    period: z.enum(['month', 'year']),
    valid_from: z.iso.date(),
    valid_to: z.iso.date().nullable().default(null),
  })
  .strict();
