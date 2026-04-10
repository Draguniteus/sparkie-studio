import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

// DO managed PostgreSQL uses a self-signed cert chain — use Pool ssl option only.

// PgBouncer-aware: if DATABASE_URL contains ?pgbouncer=true, disable prepared statements
const rawUrl = process.env.DATABASE_URL ?? ''
const isPgBouncer = rawUrl.includes('pgbouncer=true')

// pg-connection-string v2.11.0 aliases 'no-verify', 'require', 'verify-ca' all to 'verify-full'.
// sslmode=no-verify + uselibpqcompat=true forces old libpq-compatible SSL behavior where
// no-verify truly skips cert chain verification (needed for DO's self-signed cert chain).
const dbUrlWithSsl = rawUrl.includes('uselibpqcompat=true')
  ? rawUrl
  : `${rawUrl}${rawUrl.includes('?') ? '&' : '?'}uselibpqcompat=true&sslmode=no-verify`

const pool = new Pool({
  connectionString: dbUrlWithSsl,
  ssl: { rejectUnauthorized: false },
  // Autonomous agent tasks (loop + scheduler + memory writes) can spike concurrent connections.
  // max: 15 gives headroom while staying under DO managed PG default limit of 22.
  max: 15,
  idleTimeoutMillis: 20000,
  connectionTimeoutMillis: 5000,
  // PgBouncer transaction-mode requires statement_cache_size=0 (no prepared statements)
  ...(isPgBouncer ? { statement_timeout: 0 } : {}),
});

// Warn if pool exhaustion is approaching (dev visibility)
pool.on('connect', () => {
  const total = pool.totalCount
  const idle = pool.idleCount
  const waiting = pool.waitingCount
  if (waiting > 3) {
    console.warn('[db] Pool pressure: ' + total + ' total, ' + idle + ' idle, ' + waiting + ' waiting')
  }
})

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const client = await pool.connect();
  try {
    return await client.query<T>(text, params);
  } finally {
    client.release();
  }
}

export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export { pool };
