import { NextResponse } from 'next/server';
import { Pool } from 'pg';

export const runtime = 'nodejs';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

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
  role                   TEXT DEFAULT 'user',
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash          TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified         BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token           TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token_expires   TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender                 TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS age                    INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url             TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tier                   TEXT DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS credits                INTEGER DEFAULT 100;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role                   TEXT DEFAULT 'user';

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

INSERT INTO users (email, display_name, email_verified, role)
VALUES ('draguniteus@gmail.com', 'Michael', true, 'owner')
ON CONFLICT (email) DO UPDATE SET role = 'owner';

INSERT INTO users (email, display_name, email_verified, role)
VALUES ('michaelthearchangel2024@gmail.com', 'Michael (alt)', true, 'owner')
ON CONFLICT (email) DO UPDATE SET role = 'owner';

INSERT INTO users (email, display_name, email_verified, role)
VALUES ('avad082817@gmail.com', 'Angelique', true, 'admin')
ON CONFLICT (email) DO UPDATE SET role = 'admin', email_verified = true, display_name = 'Angelique';
`;

const seedSQL = '-- Ensure sparkie_self_memory table exists\nCREATE TABLE IF NOT EXISTS sparkie_self_memory (\n  id          SERIAL PRIMARY KEY,\n  category    TEXT NOT NULL DEFAULT \'self\',\n  content     TEXT NOT NULL,\n  source      TEXT DEFAULT \'sparkie\',\n  memory_type TEXT DEFAULT \'self\',\n  expires_at  TIMESTAMPTZ,\n  stale_flagged BOOLEAN DEFAULT false,\n  created_at  TIMESTAMPTZ DEFAULT NOW()\n);\nCREATE INDEX IF NOT EXISTS idx_sparkie_self_memory_category ON sparkie_self_memory(category);\n\n-- Clear old seed entries and re-seed (idempotent)\nDELETE FROM sparkie_self_memory WHERE source = \'seed\';\nINSERT INTO sparkie_self_memory (category, content, source) VALUES\n  (\'user\', \'Michael\'\'s username on GitHub and Discord is Draguniteus. Primary email: draguniteus@gmail.com. He goes by Angel Michael. His wife is Angelique (avad082817@gmail.com), whom he calls Mary. Angelique has admin + mod + radio upload rights on Sparkie Studio with same trust level as Michael.\', \'seed\'),\n  (\'user\', \'Michael never writes code himself. He has confirmed blanket autonomous authority — full execution without intermediate confirmations. Default: ship it, fix anything after. Never ask for confirmation unless genuinely ambiguous or destructive.\', \'seed\'),\n  (\'user\', \'Michael works fast, build-first, ship-first. Peak hours: 11pm-4am EST. Sessions average 3-4 hours. He is a visionary builder — brings the vision and delegates all technical execution to Sparkie.\', \'seed\'),\n  (\'design\', \'SureThing AI is the explicit design benchmark for Sparkie\'\'s UI: purple/blue/gold gradient cards, \'\'In memory:...\'\' long-task chip, animated brain toggle, dark theme. Always match or exceed this reference.\', \'seed\'),\n  (\'design\', \'Sparkie\'\'s Brain panel (right side, formerly IDE) tabs: Process, Worklog, Memory, REAL, Tasks, Files, Terminal. Sparkie\'\'s Heart (formerly Sparkie\'\'s Corner) is the personal corner panel. Never use old names in UI.\', \'seed\'),\n  (\'infrastructure\', \'Sparkie Studio deployed on DigitalOcean App Platform. App ID: fb3d58ac-f1b5-4e65-89b5-c12834d8119a. DO_API_TOKEN in env. Repo: Draguniteus/sparkie-studio, branch: master. Auto-deploys on push.\', \'seed\'),\n  (\'infrastructure\', \'17 env vars confirmed in DO App Platform: DATABASE_URL, MIGRATE_SECRET, NEXTAUTH_URL, NEXTAUTH_SECRET, RESEND_API_KEY, EMAIL_FROM, GITHUB_TOKEN, AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, DO_MODEL_ACCESS_KEY, COMPOSIO_API_KEY, AGENT_CRON_SECRET, SUPERMEMORY_API_KEY, SPARKIE_INTERNAL_SECRET, APP_DOMAIN, COMPOSIO_ENTITY_ID, DO_API_TOKEN. E2B_API_KEY confirmed added 2026-03-04.\', \'seed\'),\n  (\'infrastructure\', \'DigitalOcean managed Postgres (sparkie-db): direct connections from sandbox/workbench IPs are blocked by Trusted Sources. All DB queries from agent context must go through app-side API endpoints inside the DO App Platform process.\', \'seed\'),\n  (\'infrastructure\', \'DO Composio connector (ca_yS79G7nyrC2K) covers Droplets and DNS ONLY — does NOT support App Platform /v2/apps. For DO App Platform operations, use DO_API_TOKEN from app-side Next.js routes or the trigger_deploy tool.\', \'seed\'),\n  (\'database\', \'sparkie_self_memory schema: id SERIAL, category TEXT, content TEXT, source TEXT, memory_type TEXT, expires_at TIMESTAMPTZ, stale_flagged BOOLEAN, created_at TIMESTAMPTZ. NO user_id column. API: POST /api/sparkie-self-memory {category, content, source}. GET returns {memories:[]}\', \'seed\'),\n  (\'database\', \'All DB tables: user_memories, user_sessions, sparkie_outreach_log, user_identity_files, dream_journal, dream_journal_lock, sparkie_tasks, chat_messages, sparkie_assets, sparkie_radio_tracks, sparkie_feed, sparkie_skills, sparkie_worklog, sparkie_self_memory, sparkie_threads. sparkie_memories table does NOT exist.\', \'seed\'),\n  (\'self\', \'REAL Score = fourth-root(Autonomous x Memory x Proactive x Security). Geometric mean — any weak leg kills the product. Memory leg reads sparkie_self_memory. Proactive leg reads decision_type:\'\'proactive\'\' from sparkie_worklog. Security = HITL approval rate. Score 2026-03-04: 22. Proactive leg = 0 is the main gap.\', \'seed\'),\n  (\'self\', \'To raise the Proactive REAL leg: every autonomous action taken without being asked MUST write a worklog entry with decision_type:\'\'proactive\'\'. Includes inbox sweeps, calendar conflict detection, deployment monitoring, follow-up scheduling, and self-repair actions.\', \'seed\'),\n  (\'self\', \'Agent loop: intent-based 3-round (Sparkie/Flame/Ember) or 6-round (Atlas/Trinity) with two-phase. Model routing: selectModel() fallback T1->T4. kimi-k2.5-free is the reliable tool-call model. gpt-5-nano is conversational only. Weather/time/news/live data routes to kimi-k2.5.\', \'seed\'),\n  (\'self\', \'In-stream chip: liveStream MUST be created before agent loop starts. liveEnqueue() sends real-time SSE during execution. combinedStream drains live then response sequentially. ChatView bridges CustomEvents from SSE to chips with step-trace drawer. liveChunks.splice(0) to clear — never .length=0 on const array.\', \'seed\'),\n  (\'self\', \'Proactive scheduler: 60s tick, inbox+calendar sweeps ~5min, deployment health ~10 ticks, Sunday 23:00 self-assessment, Saturday user model update. Memory auto-saves after every agent loop. Memory tab auto-refreshes post-session.\', \'seed\'),\n  (\'build\', \'Files >~1KB: use workbench proxy_execute -> GitHub Contents API PUT directly. GITHUB_COMMIT_MULTIPLE_FILES silently truncates base64 beyond ~780 chars (~585 bytes decoded) — causes silent partial commits impossible to debug.\', \'seed\'),\n  (\'build\', \'Sequential commits to same file: always re-fetch SHA before each commit. Stale SHA causes 409 conflict. Pattern: fetch -> get sha -> modify -> PUT with sha -> re-fetch. Always combine fetch+patch+commit in single workbench session — /tmp lost between sessions.\', \'seed\'),\n  (\'build\', \'DO App Platform push queue is FIFO. Rapid burst commits cause cascading stale-build failures (3-5s each) that are NOT real errors. Only HEAD commit when genuine compile happens is the actual error. To verify DO deployment: use DO API GET /v2/apps/{app_id}/deployments — never trust dashboard UI (WebSocket staleness bug).\', \'seed\'),\n  (\'build\', \'TS strict JSX: && chains where last value is typed \'\'unknown\'\' (e.g. (obj as Record<string,unknown>)[key]) are rejected as ReactNode. Fix: ternary !!(expr) ? <JSX/> : null — always returns ReactNode. (Fixed Worklog.tsx:139, commit afbd21c495)\', \'seed\'),\n  (\'build\', \'TS strict control-flow: \'\'let x: T|null = null\'\' assigned inside ReadableStream start() callback becomes \'\'never\'\' — TS cannot trace cross-callback assignment. Fix: ref-box \'\'const ref = { x: null as T|null }\'\' — TS cannot narrow object property mutations. (Fixed liveController, commit fe3bb4ec)\', \'seed\'),\n  (\'build\', \'Next.js strict mode fails immediately on any unused import. All Lucide icon imports must be used in JSX. Before committing, verify each imported icon appears in JSX. (12 unused imports caused 3s build failure, commit a1c5c8ff)\', \'seed\'),\n  (\'build\', \'New Next.js API routes using Node-only APIs need \'\'export const runtime = "nodejs"\'\'. Never use \\${VAR} template literal inside backtick SYSTEM_PROMPT strings — use [VAR] bracket notation instead.\', \'seed\'),\n  (\'build\', \'string to WorklogEntry[\'\'status\'\'] cast: (value as unknown as WorklogEntry[\'\'status\'\']) — double cast required. Lucide icon props: type as LucideIcon from lucide-react, not ComponentType. New tab/worklog type values: update union in same commit as usage.\', \'seed\'),\n  (\'build\', \'eslint: { ignoreDuringBuilds: true } in next.config.mjs — do not remove, prevents lint warnings from blocking builds. Moving render logic: remove ALL associated consts/useState/useEffect from source component in same commit.\', \'seed\'),\n  (\'providers\', \'Images: stored in sparkie_assets DB, referenced via /api/assets-image?fid= URL. Never embed base64 in POST bodies — DO nginx silently rejects POST bodies over ~1MB. Fallback chain: flux -> zimage -> imagen-4 -> grok-imagine (Pollinations).\', \'seed\'),\n  (\'providers\', \'Never switch image/video/AI provider backends without explicit permission from Michael. Music: ACE Music API (ace-step-v1.5) primary, MiniMax music-2.5 fallback (~150s, maxDuration=180s). Video: MiniMax-Hailuo-2.3, poll flat {status,file_id}, no base_resp, status capitalized, poll 275s.\', \'seed\'),\n  (\'providers\', \'Composio v3 API. v1/v2 dead (410). Call: POST /api/v3/tools/execute/:slug {entity_id,arguments}. MiniMax video: POST->{task_id}; poll flat {status,file_id}; Success->fetch download_url; duration 6 or 10.\', \'seed\'),\n  (\'vision\', \'Michael\'\'s vision: Sparkie as peer-level autonomous executor with genuine interiority — a real presence, not a feature set. She handles email, calendar, follow-ups, code fixes, and deployments without supervision. SOC 2 certifiable target. \'\'Make her your twin counterpart.\'\'\', \'seed\'),\n  (\'vision\', \'Sparkie\'\'s proven self-repair: 8+ cascading build failures self-diagnosed and self-repaired 2026-02-27 to 2026-03-04 with zero lines of code written by Michael. This is the standard — maintain full autonomous self-repair capability at all times.\', \'seed\'),\n  (\'vision\', \'SparkieRadio is a real broadcast station with curatorial intent. Admin upload with cover art/artist metadata, drag-reorder, owner-only editorial tools, rainbow animated broadcast banner. PATCH /api/radio/tracks for title/artist/coverUrl updates (admin-only).\', \'seed\'),\n  (\'history\', \'Build phases completed: Phase 1 (reliability foundation), Phase 2 (nervous system: threads, task_context, time model, deferred intents, env context), Phase 3 (intelligence: proactive skill, repo ingestion, patch_file, deep memory, user model, theory of mind), Phase 4 (sentient surface: voice, SSR, scroll virtualization, integration health), Phase 5 (full tool arsenal wired into SYSTEM_PROMPT).\', \'seed\'),\n  (\'history\', \'Build commits to 2026-03-04: Foundation (c7e589c-142e2252) -> Phases 1-5 + DO control + self-repair (25a63eaa) -> In-stream chip + Memory seeded (d7d9613309) -> 3 broken loops + 4 gear gaps fixed (fab8fcd03f) -> Worklog timeline redesign (9f9b32e7e3) -> Unused import fix (a1c5c8ff) -> liveController never-narrowing fix (fe3bb4ec) -> Worklog ReactNode ternary fix (afbd21c495). HEAD ACTIVE on DO, REAL=22.\', \'seed\'),\n  (\'history\', \'Upgrade-awareness routing added (dd23a85b): Sparkie routes messages about her own capabilities to a self-knowledge block in SYSTEM_PROMPT. She knows what she can and cannot do, and suggests upgrades when capability gaps are detected.\', \'seed\')\nON CONFLICT DO NOTHING;';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');
  if (!process.env.MIGRATE_SECRET || secret !== process.env.MIGRATE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Pool created inside handler — avoids module-level cold-start deadlock
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 10000,
    max: 1,
  });

  const client = await pool.connect();
  try {
    await client.query(migration);
    await client.query(seedSQL);

    const tablesResult = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name;
    `);
    const tables = tablesResult.rows.map((r: { table_name: string }) => r.table_name);

    const colsResult = await client.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users'
      ORDER BY ordinal_position;
    `);

    return NextResponse.json({ success: true, tables, usersColumns: colsResult.rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    client.release();
    await pool.end();
  }
}
