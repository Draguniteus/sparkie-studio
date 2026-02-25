import { NextResponse } from 'next/server';
import { Pool } from 'pg';

export const runtime = 'nodejs';

// DO managed PostgreSQL uses a self-signed cert chain
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const migration = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                  TEXT UNIQUE NOT NULL,
  display_name           TEXT,
  avatar_url             TEXT,
  password_hash          TEXT,
  email_verified         BOOLEAN DEFAULT false,
  verify_token           TEXT,
  verify_token_expires   TIMESTAMPTZ,
  gender                 TEXT,
  age                    INTEGER,
  tier                   TEXT DEFAULT 'free',
  credits                INTEGER DEFAULT 100,
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now()
);

-- Idempotent column additions for existing tables
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash          TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified         BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token           TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token_expires   TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender                 TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS age                    INTEGER;

CREATE TABLE IF NOT EXISTS agents (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,
  short_desc           TEXT,
  full_instructions    TEXT,
  workflow             TEXT,
  capabilities         TEXT[],
  icon_url             TEXT,
  creator_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  is_official          BOOLEAN DEFAULT false,
  views                INTEGER DEFAULT 0,
  credit_cost          INTEGER DEFAULT 1,
  categories           TEXT[],
  visibility           TEXT DEFAULT 'public',
  forked_from          UUID REFERENCES agents(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_starters (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID REFERENCES agents(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  sort_order  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS generations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  type          TEXT NOT NULL,
  model         TEXT,
  prompt        TEXT,
  output_url    TEXT,
  duration_sec  INTEGER,
  credits_used  INTEGER DEFAULT 1,
  metadata      JSONB,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  amount      INTEGER NOT NULL,
  reason      TEXT,
  ref_id      UUID,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  tier                 TEXT NOT NULL,
  status               TEXT DEFAULT 'active',
  current_period_end   TIMESTAMPTZ,
  stripe_sub_id        TEXT,
  created_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generations_user_id ON generations(user_id);
CREATE INDEX IF NOT EXISTS idx_generations_type ON generations(type);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_agents_creator_id ON agents(creator_id);
CREATE INDEX IF NOT EXISTS idx_agents_visibility ON agents(visibility);
CREATE INDEX IF NOT EXISTS idx_users_verify_token ON users(verify_token);
`;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');
  if (!process.env.MIGRATE_SECRET || secret !== process.env.MIGRATE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    await client.query(migration);
    const result = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name;
    `);
    const tables = result.rows.map((r: { table_name: string }) => r.table_name);
    return NextResponse.json({ success: true, tables });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    client.release();
  }
}
