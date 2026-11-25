import { resolve } from 'node:path';
import { embedded } from '../apps/api/src/repositories/database.js';
import { migrate } from './migrate.js';
import { buildApp } from '../apps/api/src/app.js';
import { identityFromEnv } from '../apps/api/src/adapters/identity.js';
if (process.env.NODE_ENV === 'production') throw Error('Local pilot only');
const path = process.argv[2];
if (!path) throw Error('Usage: npm run local -- local-db-directory');
process.env.AUTH_MODE = 'demo';
process.env.DEMO_TOKEN ??= 'local-demo-token-only';
const db = embedded(resolve(path));
await migrate(db);
const identity = identityFromEnv();
// Explicitly local synthetic identity, never impersonates an imported employee.
await db.query(
  "INSERT INTO employees_projection(id,display_name,position,active) VALUES('local-reviewer','Локальный проверяющий','Тестовая учётная запись',true) ON CONFLICT(id) DO NOTHING",
);
const app = await buildApp(
  db,
  {
    authenticate: async (header) => ({
      ...(await identity.authenticate(header)),
      employeeId: 'local-reviewer',
    }),
  },
  true,
);
await app.listen({ host: '127.0.0.1', port: Number(process.env.LOCAL_PORT ?? 3001) });
console.log(
  'LOCAL persistent staging DB; select Administrator to review all buildings. No live integration.',
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await app.close();
    await db.close();
    process.exit(0);
  });
