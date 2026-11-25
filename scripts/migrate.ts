import { sqlStatements } from './sql-statements.js';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import type { Database } from '../apps/api/src/repositories/database.js';
import { postgres } from '../apps/api/src/repositories/database.js';
export async function migrate(db: Database) {
  await db.transaction(async (tx) => {
    await tx.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
    );
    await tx.query('LOCK TABLE schema_migrations IN EXCLUSIVE MODE');
    const dir = new URL('../db/migrations/', import.meta.url);
    for (const name of (await readdir(dir)).filter((n) => n.endsWith('.sql')).sort()) {
      const sql = await readFile(new URL(name, dir), 'utf8'),
        hash = createHash('sha256').update(sql).digest('hex');
      const old = (await tx.query('SELECT checksum FROM schema_migrations WHERE name=$1', [name]))
        .rows[0];
      if (old) {
        if (old.checksum !== hash) throw new Error('Migration checksum changed: ' + name);
        continue;
      }
      for (const statement of sqlStatements(sql))
        await tx.query(statement);
      await tx.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [name, hash]);
    }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = postgres(process.env.DATABASE_URL!);
  try {
    await migrate(db);
    console.log('Migrations applied');
  } finally {
    await db.close();
  }
}
