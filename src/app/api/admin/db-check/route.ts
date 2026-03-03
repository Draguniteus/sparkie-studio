import { NextResponse } from 'next/server';
import { Pool } from 'pg';

export const runtime = 'nodejs';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');
  if (!process.env.MIGRATE_SECRET || secret !== process.env.MIGRATE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 10000,
    max: 1,
  });

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, email, display_name, role, email_verified, created_at FROM users ORDER BY created_at ASC`
    );
    return NextResponse.json({ success: true, users: result.rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    client.release();
    await pool.end();
  }
}
