import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  // Without this a request waits indefinitely for a connection when the
  // database is unreachable or the pool is exhausted — including the health
  // check, which is then useless exactly when it matters.
  connectionTimeoutMillis: 5_000,
});

export default async function query<T extends pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}
