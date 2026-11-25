import { embedded } from '../apps/api/src/repositories/database.js';
import { migrate } from './migrate.js';
import { seed } from './seed.js';
import { buildApp } from '../apps/api/src/app.js';
import { identityFromEnv } from '../apps/api/src/adapters/identity.js';
if (process.env.NODE_ENV === 'production') throw new Error('Demo forbidden in production');
process.env.AUTH_MODE = 'demo';
process.env.DEMO_TOKEN ??= 'local-demo-token-only';
const db = embedded();
await migrate(db);
await seed(db);
const app = await buildApp(db, identityFromEnv(), true, 10000);
await app.listen({ port: Number(process.env.PORT || 3001), host: '127.0.0.1' });
console.log(
  'DEMO: in-memory PostgreSQL engine, synthetic data, resets on restart. Web: VITE_DEMO_TOKEN=local-demo-token-only npm run dev -w @office/web',
);
for (const s of ['SIGINT', 'SIGTERM'])
  process.on(s, async () => {
    await app.close();
    await db.close();
    process.exit(0);
  });
