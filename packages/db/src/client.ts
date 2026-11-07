import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

export function createDb(databaseUrl: string, poolConfig: pg.PoolConfig = {}) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10, ...poolConfig });
  const db: Database = drizzle(pool, { schema });
  return { db, pool };
}
