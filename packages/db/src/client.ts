import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export function createDb(databaseUrl = process.env.DATABASE_URL): { db: ReturnType<typeof drizzle<typeof schema>>; pool: Pool } {
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const pool = new Pool({
    connectionString: databaseUrl,
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 30_000),
    connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 5_000),
    statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS ?? 30_000),
    query_timeout: Number(process.env.DB_QUERY_TIMEOUT_MS ?? 30_000),
    ssl: process.env.DATABASE_SSL === 'require'
      ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
      : undefined,
  });
  return { db: drizzle(pool, { schema }), pool };
}
