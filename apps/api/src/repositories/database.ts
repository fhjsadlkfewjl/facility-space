import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
export interface Connection {
  query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[] }>;
}
export interface Database extends Connection {
  transaction<T>(fn: (tx: Connection) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export function postgres(url?: string): Database {
  const pool = new pg.Pool({ connectionString: url, max: 10, statement_timeout: 15000 });
  return {
    query: async <T = any>(s: string, p?: any[]) => ({
      rows: (await pool.query(s, p)).rows as T[],
    }),
    transaction: async (fn) => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const r = await fn(c);
        await c.query('COMMIT');
        return r;
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
    },
    close: () => pool.end(),
  };
}
export function embedded(path?: string): Database {
  const db = new PGlite(path);
  return {
    query: async <T = any>(s: string, p?: any[]) => db.query<T>(s, p),
    transaction: (fn) =>
      db.transaction((tx) =>
        fn({ query: async <T = any>(s: string, p?: any[]) => tx.query<T>(s, p) }),
      ),
    close: () => db.close(),
  };
}
export async function one<T = any>(
  db: Connection,
  sql: string,
  params: any[] = [],
): Promise<T | undefined> {
  return (await db.query<T>(sql, params)).rows[0];
}
