import { postgres } from './repositories/database.js';
import { identityFromEnv } from './adapters/identity.js';
import { buildApp } from './app.js';
if (
  !process.env.DATABASE_URL &&
  !(process.env.PGHOST && process.env.PGDATABASE && process.env.PGUSER)
)
  throw new Error('Configure DATABASE_URL or PGHOST, PGDATABASE and PGUSER');
const db = postgres(process.env.DATABASE_URL),
  app = await buildApp(db, identityFromEnv(), true);
await app.listen({ port: Number(process.env.PORT ?? 3001), host: process.env.HOST ?? '127.0.0.1' });
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, async () => {
    await app.close();
    await db.close();
    process.exit(0);
  });
