import { postgres } from '../apps/api/src/repositories/database.js';
import { migrate } from './migrate.js';
import { seed } from './seed.js';
const db = postgres(process.env.DATABASE_URL!);
try {
  if (process.env.RUN_MIGRATIONS !== 'false') await migrate(db);
  if (process.env.SEED_DEMO === 'true') {
    if (process.env.AUTH_MODE !== 'demo' || process.env.NODE_ENV === 'production')
      throw new Error('Demo seed requires non-production demo mode');
    if (!(await db.query('SELECT id FROM buildings LIMIT 1')).rows.length) await seed(db);
  }
} finally {
  await db.close();
}
await import('../apps/api/src/server.js');
