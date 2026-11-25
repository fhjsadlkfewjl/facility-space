import type { Connection } from './database.js';
export const workplaceSelect = `SELECT a.id assignment_id,w.id,w.code,w.code_provenance,w.status,EXISTS(SELECT 1 FROM bookings future WHERE future.workplace_id=w.id AND future.status='confirmed' AND future.ends_at>now()) future_reserved,b.name building_name,fl.name floor_name,EXISTS(SELECT 1 FROM bookings bk WHERE bk.workplace_id=w.id AND bk.status='confirmed' AND bk.starts_at<=now() AND bk.ends_at>now()) reserved,f.floor_id,f.room_id,f.id furniture_id,r.name room_name,fl.building_id,e.id employee_id,e.display_name,e.department_id,(SELECT d.name FROM departments_projection d WHERE d.id=e.department_id) department_name FROM workplaces w JOIN furniture f ON f.id=w.furniture_id JOIN floors fl ON fl.id=f.floor_id JOIN buildings b ON b.id=fl.building_id LEFT JOIN rooms r ON r.id=f.room_id LEFT JOIN workplace_assignments a ON a.workplace_id=w.id AND a.valid_to IS NULL LEFT JOIN employees_projection e ON e.id=a.employee_id WHERE f.active AND fl.active AND b.active AND (r.id IS NULL OR r.active)`;
export class OfficeRepository {
  constructor(readonly db: Connection) {}
  async buildings() {
    return (
      await this.db.query(
        `SELECT b.*, (SELECT count(*)::int FROM bookings bk JOIN workplaces w ON w.id=bk.workplace_id JOIN furniture f ON f.id=w.furniture_id JOIN floors fl ON fl.id=f.floor_id WHERE fl.building_id=b.id AND bk.status='confirmed' AND bk.starts_at<=now() AND bk.ends_at>now()) reserved, (SELECT count(*)::int FROM floors fl WHERE fl.building_id=b.id AND fl.active) floors,(SELECT count(*)::int FROM workplaces w JOIN furniture f ON f.id=w.furniture_id JOIN floors fl ON fl.id=f.floor_id WHERE fl.building_id=b.id AND f.active AND fl.active) workplaces,(SELECT count(*)::int FROM workplace_assignments a JOIN workplaces w ON w.id=a.workplace_id JOIN furniture f ON f.id=w.furniture_id JOIN floors fl ON fl.id=f.floor_id WHERE fl.building_id=b.id AND a.valid_to IS NULL AND f.active AND fl.active) occupied FROM buildings b WHERE b.active ORDER BY b.name`,
      )
    ).rows;
  }
  async floors(building?: string) {
    return (
      await this.db.query(
        'SELECT id,building_id,name,number,width,height,version,active FROM floors WHERE active AND ($1::text IS NULL OR building_id=$1) ORDER BY number,name',
        [building ?? null],
      )
    ).rows.sort((a, b) => a.building_id.localeCompare(b.building_id) || a.name.localeCompare(b.name, 'ru', { numeric: true, sensitivity: 'base' }) || a.id.localeCompare(b.id));
  }
  async layout(id: string) {
    const floor = (
      await this.db.query(
        'SELECT id,building_id,name,width,height,version,active,background_svg,meters_per_unit,scale_evidence,background_provenance FROM floors WHERE id=$1',
        [id],
      )
    ).rows[0];
    if (!floor) return null;
    return {
      floor,
      rooms: (await this.db.query('SELECT * FROM rooms WHERE floor_id=$1 ORDER BY name', [id]))
        .rows,
      furniture: (
        await this.db.query(
          `SELECT a.id assignment_id,f.*,coalesce(t.api_geometry_evidence->>'renderSvg',t.svg) template_svg,t.api_geometry_evidence template_geometry,t.resize_allowed,t.name template_name,EXISTS(SELECT 1 FROM bookings bk WHERE bk.workplace_id=w.id AND bk.status='confirmed' AND bk.starts_at<=now() AND bk.ends_at>now()) reserved,w.id workplace_id,w.code,w.status,e.id employee_id,e.display_name,e.position,e.department_id FROM furniture f JOIN furniture_templates t ON t.id=f.template_id LEFT JOIN LATERAL (SELECT * FROM workplaces WHERE furniture_id=f.id ORDER BY id LIMIT 1) w ON true LEFT JOIN workplace_assignments a ON a.workplace_id=w.id AND a.valid_to IS NULL LEFT JOIN employees_projection e ON e.id=a.employee_id WHERE f.floor_id=$1 ORDER BY f.id`,
          [id],
        )
      ).rows,
    };
  }
  async workplaces(floor?: string) {
    return (
      await this.db.query(
        workplaceSelect + ' AND ($1::text IS NULL OR f.floor_id=$1) ORDER BY w.code LIMIT 10000',
        [floor ?? null],
      )
    ).rows;
  }
  async people(q: string, offset: number, scope: 'all'|'assigned'|'missing_name' = 'all') {
    return (
      await this.db.query(
        `SELECT a.id assignment_id,e.id,e.display_name,e.department_id,e.position,e.active,d.name department_name,w.id workplace_id,w.code,f.floor_id,fl.building_id,fl.name floor_name,b.name building_name,r.name room_name FROM employees_projection e LEFT JOIN departments_projection d ON d.id=e.department_id LEFT JOIN workplace_assignments a ON a.employee_id=e.id AND a.valid_to IS NULL LEFT JOIN workplaces w ON w.id=a.workplace_id LEFT JOIN furniture f ON f.id=w.furniture_id LEFT JOIN floors fl ON fl.id=f.floor_id LEFT JOIN buildings b ON b.id=fl.building_id LEFT JOIN rooms r ON r.id=f.room_id WHERE e.active AND ($3='all' OR ($3='assigned' AND a.id IS NOT NULL) OR ($3='missing_name' AND e.display_name ~ '^Employee [0-9]+$')) AND (e.display_name ILIKE $1 OR e.position ILIKE $1 OR w.code ILIKE $1 OR d.name ILIKE $1) ORDER BY e.display_name,e.id LIMIT 50 OFFSET $2`,
        ['%' + q + '%', offset, scope],
      )
    ).rows;
  }
}
