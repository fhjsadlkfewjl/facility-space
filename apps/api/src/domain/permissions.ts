import type { Actor } from '@office/shared';
import { ensure } from './errors.js';
export function manage(a: Actor) {
  ensure(a.role === 'admin' || a.role === 'facilities', 403, 'Facilities permission required');
}
export function assign(a: Actor, employeeId: string) {
  ensure(
    a.role !== 'employee' || a.employeeId === employeeId,
    403,
    'Cannot change another employee assignment',
  );
}
// TODO IT: add building scopes from the approved identity adapter. Default V1: role-wide scope.
