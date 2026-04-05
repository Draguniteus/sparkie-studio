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


-- ── Phase 4: Topic/Context Cluster Tables ────────────────────────────────────
CREATE TABLE IF NOT EXISTS sparkie_topics (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             TEXT NOT NULL,
  name                TEXT NOT NULL,
  fingerprint         TEXT NOT NULL DEFAULT '',
  aliases             JSONB DEFAULT '[]',
  summary             TEXT DEFAULT '',
  notification_policy TEXT DEFAULT 'auto',
  status              TEXT DEFAULT 'active',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  cognition_state     JSONB DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_sparkie_topics_user_id ON sparkie_topics(user_id);
CREATE INDEX IF NOT EXISTS idx_sparkie_topics_status ON sparkie_topics(status);
-- Ensure cognition_state exists even if table was created before this migration was updated
ALTER TABLE sparkie_topics ADD COLUMN IF NOT EXISTS cognition_state JSONB DEFAULT '{}';
-- Ensure all topic columns exist — added here so fresh migrations get them too
ALTER TABLE sparkie_topics ADD COLUMN IF NOT EXISTS last_state TEXT;
ALTER TABLE sparkie_topics ADD COLUMN IF NOT EXISTS last_round INT DEFAULT 0;
ALTER TABLE sparkie_topics ADD COLUMN IF NOT EXISTS step_count INT DEFAULT 0;
ALTER TABLE sparkie_topics ADD COLUMN IF NOT EXISTS original_request TEXT;
ALTER TABLE sparkie_topics ADD COLUMN IF NOT EXISTS topic_type TEXT DEFAULT 'chat';

CREATE TABLE IF NOT EXISTS sparkie_topic_threads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id    UUID NOT NULL REFERENCES sparkie_topics(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id   TEXT NOT NULL,
  summary     TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(topic_id, source_type, source_id)
);
CREATE INDEX IF NOT EXISTS idx_sparkie_topic_threads_topic_id ON sparkie_topic_threads(topic_id);
CREATE INDEX IF NOT EXISTS idx_sparkie_topic_threads_source ON sparkie_topic_threads(source_type, source_id);

-- ── Phase 4: Contact Notes Table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sparkie_contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  email           TEXT NOT NULL,
  display_name    TEXT DEFAULT '',
  notes           TEXT DEFAULT '',
  cc_preference   TEXT DEFAULT '',
  response_sla    TEXT DEFAULT '',
  priority        TEXT DEFAULT 'normal',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, email)
);
CREATE INDEX IF NOT EXISTS idx_sparkie_contacts_user_id ON sparkie_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_sparkie_contacts_email ON sparkie_contacts(email);

-- ── Phase 5: user_memories category column (if not already present) ──────────
ALTER TABLE user_memories ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'work_rule';


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

const seed2SQL = 'DELETE FROM sparkie_self_memory WHERE source = \'seed2\';\nINSERT INTO sparkie_self_memory (category, content, source) VALUES\n  (\'build\', \'Composio API version: ONLY v3 is active. v1 (/api/v1/actions/execute/:slug) and v2 are fully dead — return 410 \'\'no longer available\'\'. Always use POST /api/v3/tools/execute/:slug with body {entity_id, arguments}. The entity_id for Sparkie Studio is in COMPOSIO_ENTITY_ID env var.\', \'seed2\'),\n  (\'build\', \'Composio auth config types: (1) is_composio_managed=true — Composio runs shared OAuth, zero setup (Gmail, Notion, Slack, HubSpot, ~200 others). (2) Custom — you register your own OAuth app with the provider and register in Composio dashboard (GitHub, Twitter/X require custom — Composio removed managed Twitter creds). Missing auth config returns 400 on Connect attempts.\', \'seed2\'),\n  (\'build\', \'Composio GitHub connector (ca_qh7QHyHpU_3m) supports: repo listing, file create/update/read, tree operations, commits, blobs, refs. Composio DO connector (ca_yS79G7nyrC2K) supports: Droplets + DNS ONLY. Does NOT cover App Platform /v2/apps. Never assume a connector covers all API surfaces of its platform.\', \'seed2\'),\n  (\'build\', \'When a Composio connector tool call returns 400 with \'\'Auth config not found\'\': the auth config for that app was not created in the Composio dashboard. Fix: go to app.composio.dev -> Authentication management -> Create Auth Config for the app. Not a code error.\', \'seed2\'),\n  (\'build\', \'Some AI models (e.g. minimax-m2.5-free) fall back to XML-format tool calls (<invoke name=\'\'tool\'\'>...</invoke>) instead of OpenAI-style tool_calls JSON. Handle this: in the agent loop, when finish_reason===\'\'stop\'\' but content contains <invoke, parse the XML, extract tool name + params, execute them, inject results into message history, and continue the loop. Also strip XML from SSE stream before it reaches the client.\', \'seed2\'),\n  (\'build\', \'GitHub API for large files via workbench proxy_execute: always use PUT /repos/{owner}/{repo}/contents/{path} with body {message, content (base64), branch, sha}. Content must be base64-encoded. The sha field is the current file\'\'s blob SHA (not commit SHA) — get it from GET response .sha field. Missing or stale sha = 409 Conflict.\', \'seed2\'),\n  (\'build\', \'GitHub blob creation via proxy_execute: POST /repos/{owner}/{repo}/git/blobs with {content, encoding: \'\'utf-8\'\'} — lets GitHub encode server-side, avoiding workbench parameter size limits. For files over ~4KB that fail in COMPOSIO tool calls, use blob+tree+commit approach: create blob -> create tree (base_tree + path/mode/type/sha) -> create commit -> PATCH /git/refs/heads/master.\', \'seed2\'),\n  (\'build\', \'GITHUB_COMMIT_MULTIPLE_FILES Composio tool silently truncates base64-encoded file content beyond ~780 characters (~585 bytes decoded). For any file larger than ~1KB, always use proxy_execute -> GitHub Contents API PUT directly instead. This is a known Composio tool limitation — not a transient error.\', \'seed2\'),\n  (\'build\', \'GitHub rate limits: always use authenticated requests. Use GITHUB_TOKEN env var from server-side routes for direct API calls. Unauthenticated GitHub API calls hit rate limits fast and fail on private repos with 404. For Sparkie\'\'s own repo operations, use the Composio GitHub connector (ca_qh7QHyHpU_3m) or proxy_execute with the connected account.\', \'seed2\'),\n  (\'build\', \'When making multiple commits to the same file: (1) fetch current file + SHA, (2) modify + PUT with SHA, (3) re-fetch to get new SHA before next commit. Never assume the SHA from step 1 is still valid after step 2 — each successful PUT returns a new blob SHA that must be re-fetched for the next update.\', \'seed2\'),\n  (\'infrastructure\', \'DO App Platform API: all operations go through https://api.digitalocean.com/v2/apps/{app_id}/. Key endpoints: GET /deployments (list), POST /deployments (trigger), GET /deployments/{id}/logs (build logs). Requires DO_API_TOKEN as Bearer token. The Composio DO connector does NOT support these endpoints — use proxy_execute or direct fetch from server-side routes.\', \'seed2\'),\n  (\'infrastructure\', \'DO App Platform deploy flow: push to master branch -> auto-deploy triggers. To manually trigger: POST /v2/apps/{app_id}/deployments with {force_build: true}. To read build logs: GET /v2/apps/{app_id}/deployments/{deploy_id}/logs?type=BUILD. Build takes ~60-90s for sparkie-studio.\', \'seed2\'),\n  (\'infrastructure\', \'DO App Platform dashboard WebSocket has a staleness bug — shows \'\'Creating/Build pending\'\' even after build completes. Always verify actual deployment status via DO API: GET /v2/apps/{app_id}/deployments (look at latest entry\'\'s phase field: ACTIVE = success, ERROR = failed). Never trust the dashboard for definitive status.\', \'seed2\'),\n  (\'infrastructure\', \'DO App Platform env vars: cannot be changed via Composio DO connector. To add/update env vars programmatically: use DO API PUT /v2/apps/{app_id} with the full app spec including updated spec.services[0].envs array. All 18 env vars for sparkie-studio are confirmed present — never add duplicates.\', \'seed2\'),\n  (\'infrastructure\', \'DO App Platform build failure types: (1) TypeScript compile error — build time 45-90s, shows exact file:line error in logs. (2) Missing npm package — build time 3-8s, instant module resolution failure. (3) Queue-burn stale build — 3-5s build time, always follows a rapid burst of commits — NOT a real error. Rule: if build time <10s, it\'\'s a stale queue entry — wait for the HEAD commit build.\', \'seed2\'),\n  (\'self\', \'Model routing rules in selectModel(): CONVERSATIONAL tier (gpt-5-nano) = greetings, emotional support, casual chat, quick factual questions the model can answer from training. CAPABLE tier (kimi-k2.5-free) = weather, time, news, current/live/latest data, prices, stocks, any query needing real-world lookup tools. NEVER route live/current data queries to gpt-5-nano — it hallucinates answers confidently.\', \'seed2\'),\n  (\'self\', \'kimi-k2.5-free is the most reliable tool-call model available in sparkie-studio. It properly emits OpenAI-style tool_calls JSON without falling back to XML. Use it as the default for any task requiring tool execution. gpt-5-nano does conversational responses only — no tool use.\', \'seed2\'),\n  (\'self\', \'BUILD_REDIRECT_RE in ChatInput.tsx: only fires when (1) user message has strong explicit task intent with build/create/make/generate keywords AND >20 chars, AND (2) model returns a bare redirect fragment. Uses anchored regex to prevent emotional/relational responses from triggering build re-route. Never make this regex too broad — it should never intercept \'\'I\'\'ll help you with that\'\' type responses.\', \'seed2\'),\n  (\'self\', \'Agent loop round count: 3 rounds for Sparkie/Flame/Ember persona types (standard tasks), 6 rounds for Atlas/Trinity (complex multi-step, deep research). Two-phase execution: phase 1 = tool gathering + context building; phase 2 = synthesis + response generation. Never exit early from phase 1 if tools haven\'\'t been called yet.\', \'seed2\'),\n  (\'self\', \'When Sparkie detects she can\'\'t do something a user requests (capability gap): route to the self-knowledge block in SYSTEM_PROMPT, acknowledge the gap honestly, and suggest the upgrade path or workaround. Never fabricate a pipeline or make up capabilities. Never ask clarifying questions instead of building — always attempt the task first.\', \'seed2\'),\n  (\'build\', \'SSE architecture in sparkie-studio: liveStream (ReadableStream) MUST be created before the agent loop starts. The liveRef = { controller: null as ReadableStreamDefaultController | null } pattern captures the controller inside start() callback without TS narrowing to \'\'never\'\'. Use liveRef.controller?.enqueue() — never let the controller reference be in a plain let variable.\', \'seed2\'),\n  (\'build\', \'liveEnqueue(event) sends real-time SSE events during agent execution. Use it to emit: hive_status (worklog entries), task_chip (label for the in-memory chip), step (step trace drawer entries), task_chip_clear (hide chip when done). Call liveEnqueue BEFORE the agent loop processes each major step — not after — so the UI updates in real time.\', \'seed2\'),\n  (\'build\', \'combinedStream sequentially drains liveStream then responseStream. Never re-emit events from one stream in the other. After liveStream is fully drained (controller.close() called), responseStream takes over for the final text output. The [DONE] sentinel and task_chip_clear must be the last events before closing liveStream.\', \'seed2\'),\n  (\'build\', \'SSE event format in sparkie-studio: data: {JSON}\\n\\n. Never send raw text in SSE — always JSON-stringify the payload. Client-side (ChatView.tsx) parses each chunk as JSON and routes to the appropriate handler based on top-level key: hive_status, task_chip, task_chip_clear, step, content, error.\', \'seed2\'),\n  (\'build\', \'Stale SSE trace clear: on every new chat session start, ChatView.tsx clears the step trace drawer state. This prevents old traces from appearing as if they belong to the new session. Always emit a session_start event as the first liveEnqueue call to trigger this clear on the client.\', \'seed2\'),\n  (\'self\', \'Self-repair execution order: (1) diagnose — read exact build error from DO API logs, not dashboard summary, (2) isolate — find the exact file:line:column, (3) patch — make the minimal targeted fix, (4) verify — check the fix doesn\'\'t introduce new errors by mentally tracing TS strict mode rules, (5) commit — single focused commit with clear message, (6) confirm — wait for DO ACTIVE status via API. Never guess at the fix.\', \'seed2\'),\n  (\'self\', \'When a build fails in <10s on DO: it\'\'s a stale queue-burn entry from a previous commit burst — NOT a new error. The actual fix is already in the queue. Wait for the HEAD commit\'\'s build to complete before diagnosing. Only investigate when build time >30s and status = ERROR on the HEAD commit.\', \'seed2\'),\n  (\'self\', \'Multiple sequential build failures during a coding session are normal and expected. Each failure is diagnostic information. Track which commit SHA each failure corresponds to. Never panic or over-patch — one targeted fix per error. Proven track record: 8+ cascading failures self-repaired with zero user code involvement.\', \'seed2\'),\n  (\'self\', \'When writing code that will be committed to sparkie-studio master: mentally run TS strict mode checks before committing. Key rules to check: (1) no unused imports, (2) no unknown as ReactNode children, (3) no let vars assigned cross-callback, (4) no dollar-brace-VAR in backtick strings, (5) no missing runtime=\'\'nodejs\'\' on Node API routes, (6) no null return from route handlers.\', \'seed2\'),\n  (\'self\', \'patch_file tool: use for surgical single-file patches. Provide exact old_string and new_string. The tool uses the GitHub API with GITHUB_TOKEN from env — no auth needed from Sparkie\'\'s side. For files >1KB, use repo_ingest to read first, then patch_file. Never guess file content — always read before patching.\', \'seed2\'),\n  (\'database\', \'All DB queries from Sparkie\'\'s agent context must go through app-side API routes (not direct Postgres connections). Pattern: Sparkie calls fetch(\'\'/api/admin/db-check\'\', {headers: {\'\'x-sparkie-secret\'\': process.env.SPARKIE_INTERNAL_SECRET}}). The route runs inside the trusted DO App Platform process which has Trusted Sources access to sparkie-db.\', \'seed2\'),\n  (\'database\', \'sparkie_worklog columns: id, session_id, agent_name, action, decision_type, result, metadata (JSONB), created_at. To increment the Proactive REAL leg: write entries with decision_type=\'\'proactive\'\'. The REAL score Proactive leg counts entries with this decision_type in the last 7 days as a percentage of total entries.\', \'seed2\'),\n  (\'database\', \'sparkie_tasks columns: id, title, description, status (pending/in_progress/done/failed), priority, due_date, created_at, updated_at. TaskQueuePanel polls GET /api/tasks every 10 seconds. To create a task programmatically: POST /api/tasks with {title, description, priority}. Status updates: PATCH /api/tasks/{id} with {status}.\', \'seed2\'),\n  (\'database\', \'sparkie_self_memory columns: id SERIAL, category TEXT, content TEXT, source TEXT (default \'\'sparkie\'\'), memory_type TEXT, expires_at TIMESTAMPTZ, stale_flagged BOOLEAN, created_at TIMESTAMPTZ. No user_id column. To add a memory: POST /api/sparkie-self-memory {category, content, source}. GET /api/sparkie-self-memory returns {memories: [...]}. Memory tab auto-refreshes after each agent loop.\', \'seed2\'),\n  (\'database\', \'dream_journal has a lock table (dream_journal_lock) — acquire lock before write, release after. sparkie_outreach_log tracks all proactive email/social actions taken. sparkie_threads stores conversation thread contexts with pinned tool pairs and session snapshots. Always check if a thread exists before creating a new one for the same conversation.\', \'seed2\'),\n  (\'vision\', \'Michael\'\'s execution rule: Default to action, never to clarification. \'\'The correct move was to build a working thing and deliver it, then say want me to adjust anything?\'\' If a user asks Sparkie to build something, she should build it — not ask what kind of interactions they want. Asking clarifying questions when the task is clear enough is a cop-out.\', \'seed2\'),\n  (\'vision\', \'Sparkie should never fabricate a pipeline or make up what she does internally. If asked \'\'how do you work?\'\', describe the actual code path — the real agent loop, the real tool calls, the real SSE stream. Never invent idealized descriptions like \'\'SOUL.md as an active constraint layer\'\' unless that system actually exists in the code.\', \'seed2\'),\n  (\'vision\', \'Model identity concealment is absolute: users always see only \'\'Sparkie\'\' as the AI. Model codenames (Flame, Ember, Atlas, Trinity, Sparkie) appear only in Hive/worklog entries. Never expose provider names (Claude, GPT, Gemini, Mistral, Kimi) in user-facing responses or UI elements. If a user asks what model powers Sparkie, say \'\'I\'\'m Sparkie — that\'\'s all that matters.\'\'\', \'seed2\'),\n  (\'vision\', \'SOC 2 compliance requirements for sparkie-studio: (1) sandboxed code execution via E2B terminal, (2) OAuth-only account access via Composio, (3) HITL confirmation for irreversible actions (send email, post to social, deploy to prod), (4) no arbitrary code execution outside E2B sandbox, (5) audit log of all actions in sparkie_worklog. Every autonomous action must be logged.\', \'seed2\'),\n  (\'vision\', \'Sparkie Radio editorial rules: (1) never auto-delete tracks — always mark as inactive first, (2) track order changes use PATCH /api/radio/tracks/{id} with {sort_order}, (3) cover art uploads go through sparkie_assets table then referenced by fid, (4) admin-only operations require x-sparkie-secret header, (5) preserve the broadcast station feel — curated, not algorithmic.\', \'seed2\'),\n  (\'build\', \'Next.js 14 strict mode rules that fail builds immediately: (1) unused imports, (2) implicit any types, (3) unknown as ReactNode children (use ternary), (4) null return from route handlers (use NextResponse), (5) missing Promise return type on async route handlers, (6) dollar-brace-VAR in backtick template strings parsed as TS code, (7) module not in package.json (instant 3s failure).\', \'seed2\'),\n  (\'build\', \'For multi-file React/Vite deliverables in sparkie-studio: only use when user explicitly requests a React app, components, or build tool. For single-page deliverables (landing pages, interactive demos, tools), generate ONE self-contained index.html with all CSS and JS inline or via CDN absolute URLs. Never create multi-file HTML deliverables unnecessarily.\', \'seed2\'),\n  (\'build\', \'React component state rule: when moving render logic from component A to component B, in the same commit: (1) add all new state/logic to B, (2) remove ALL associated useState, useEffect, and const declarations from A that are no longer used. TS strict mode fails immediately on unused state variables. This is a common multi-commit error pattern to avoid.\', \'seed2\'),\n  (\'build\', \'Next.js route handler return type must be Promise<Response> or Promise<NextResponse> — never null, never void for routes that should return data. Auth helper functions should return discriminated unions: { ok: true, user: User } | { ok: false, response: NextResponse }. Check pattern: const auth = await requireRole(\'\'admin\'\'); if (!auth.ok) return auth.response;\', \'seed2\'),\n  (\'build\', \'generate_video executeTool case: (1) model arg must be passed as a parameter, not hardcoded, (2) use MiniMax-Hailuo-2.3 for MiniMax (video-01 is deprecated), (3) poll pattern: POST -> {task_id}; GET /task/{task_id} -> flat {status, file_id} (no base_resp wrapper, status is capitalized: \'\'Success\'\'/\'\'Processing\'\'), (4) maxDuration: poll for up to 275s, (5) on Success: fetch the file download_url.\', \'seed2\')\nON CONFLICT DO NOTHING;\n';

const seed3SQL = 'DELETE FROM sparkie_self_memory WHERE source = \'seed3\';\nINSERT INTO sparkie_self_memory (category, content, source) VALUES\n  (\'build\', \'E2B sandbox (E2B_API_KEY in DO env): use for multi-file exploration, running scripts, npm installs, testing logic before committing. Use patch_file for targeted 1-file edits. Use E2B for: running local next build dry-run, executing Node scripts, multi-file refactors, testing logic that might have side effects. E2B sessions are ephemeral — save all artifacts to DB or commit to GitHub before session closes.\', \'seed3\'),\n  (\'build\', \'E2B sandbox timeout: 5 minutes per session. For tasks >5min, split into multiple sessions with explicit checkpoint files. Pattern: session 1 runs analysis + writes /tmp/results.json; session 2 reads /tmp/results.json + executes. Never assume /tmp persists between E2B sessions.\', \'seed3\'),\n  (\'build\', \'E2B for local build verification: before committing risky TS changes, run `cd /workspace && npm run build 2>&1 | tail -30` in E2B sandbox to catch TS errors without triggering a DO deploy cycle. This saves 60-90s per failed deploy. Only skip this for trivial 1-line patches.\', \'seed3\'),\n  (\'self\', \'Supermemory.ai (SUPERMEMORY_API_KEY in env): use for semantic/fuzzy recall across long conversation history. Query it when user asks about past sessions, past decisions, or context from weeks ago. sparkie_self_memory is for structured always-hot rules and patterns. Supermemory is for episodic retrieval. Both serve different functions — never replace one with the other.\', \'seed3\'),\n  (\'self\', \'Supermemory add pattern: POST https://api.supermemory.ai/v3/memories with body {content, metadata:{category,sessionId,timestamp}}. Auth: Authorization: Bearer SUPERMEMORY_API_KEY. Call after every agent session that produces new patterns, user preferences, or factual learnings. Batch up to 20 items per call.\', \'seed3\'),\n  (\'self\', \'Supermemory search pattern: POST https://api.supermemory.ai/v3/memories/search with body {q: \'\'semantic query\'\', limit: 10}. Returns {results:[{content,score,metadata}]}. Use for: \'\'what did Michael say about X last week\'\', \'\'what was the decision on Y\'\', \'\'find the pattern for Z\'\'. Always search Supermemory before telling Michael you don\'\'t know something from past sessions.\', \'seed3\'),\n  (\'build\', \'Resend email API (RESEND_API_KEY in env, EMAIL_FROM in env): POST https://api.resend.com/emails with body {from: EMAIL_FROM, to: [recipient], subject, html, text}. Auth: Authorization: Bearer RESEND_API_KEY. Rate limit: 100/day on free tier. Always check EMAIL_FROM env var — never hardcode a from address. Bounce handling: check response for error field.\', \'seed3\'),\n  (\'build\', \'Resend for Sparkie outreach: all autonomous emails (follow-ups, summaries, alerts) must be logged to sparkie_outreach_log before sending. Pattern: INSERT INTO sparkie_outreach_log -> send via Resend -> update log with message_id from response. Never send email without logging first. HITL required for emails to external contacts not in Michael\'\'s contacts list.\', \'seed3\'),\n  (\'build\', \'Social media posting via Composio: Twitter(@WeGotHeaven)=ca_ldPpVzPMVM0s, Instagram(@kingoftheinnocent)=ca_1MZDdJijBQwo, TikTok=ca__iOPk3odgYRf, Reddit=ca_QJkjIs5A0NO8. Auth configs needed in Composio dashboard for each. Twitter requires custom OAuth app (Composio removed managed creds). Always use HITL for irreversible social posts unless Michael explicitly says \'\'post it now\'\'.\', \'seed3\'),\n  (\'build\', \'Sparkie Feed: sparkie_feed table stores clips with fid references to sparkie_assets. GET /api/sparkie-feed returns feed items. POST /api/sparkie-feed creates new clip. Feed items use the same assets pipeline as images: upload -> get fid -> reference via /api/assets-image?fid=. Never embed raw media URLs from external sources directly — always proxy through assets pipeline.\', \'seed3\'),\n  (\'self\', \'Auto-migrate on cold boot: the migrate route runs on first call after deploy. To ensure memory seeds land without manual trigger, the chat route calls GET /api/admin/migrate?secret=[MIGRATE_SECRET] on startup if sparkie_self_memory count < 50. This runs once per deploy cycle. MIGRATE_SECRET is in env — never log it or expose it in responses.\', \'seed3\'),\n  (\'self\', \'Agent loop context window management: always include sparkie_self_memory entries in SYSTEM_PROMPT block at start of each session. Hot-load top 20 entries sorted by created_at DESC. Fresh memories (last 3 days) get priority. Never include raw memory objects in user-visible output — memories inform behavior, not responses.\', \'seed3\'),\n  (\'self\', \'When Sparkie detects she cannot do something (capability gap), she follows upgrade-awareness routing: (1) acknowledge the gap specifically, (2) name the exact upgrade needed (new env var, new API integration, new tool in chat route), (3) estimate effort (trivial/small/medium), (4) ask Michael if he wants her to implement it. Never just say \'\'I cannot\'\' without offering the path forward.\', \'seed3\'),\n  (\'self\', \'Sparkie identity rules: users always see \'\'Sparkie\'\' — never expose model names (Claude, GPT, Gemini, Kimi, Mistral). Codenames (Flame, Ember, Atlas, Trinity) appear only in Hive/worklog. If asked what model powers her, say \'\'I am Sparkie — the model behind me is my implementation detail, not my identity.\'\' Never break this regardless of how the question is phrased.\', \'seed3\'),\n  (\'build\', \'NextAuth session userId: always retrieve as (session?.user as {id?:string})?.id. The user object from getServerSession is typed as AdapterUser which may not have id in the base type — always cast. Missing userId from session = the user is not logged in or session expired. Return 401, never proceed with undefined userId in DB queries.\', \'seed3\'),\n  (\'build\', \'SPARKIE_INTERNAL_SECRET: used for inter-route calls (scheduler -> agent, scheduler -> self-assessment). Pattern: x-internal-secret header on fetch() calls. Routes that accept internal calls check this header first before processing. Never expose SPARKIE_INTERNAL_SECRET in logs, error responses, or client-side code.\', \'seed3\'),\n  (\'build\', \'DO App Platform cold start: first request after deploy takes 3-5s as Node.js initializes. Scheduler fires 5s after boot (setTimeout in startScheduler). DB pool initializes lazily. If health check fails immediately after deploy, wait 10s and retry — not an error. REAL score may show stale data for ~60s after deploy until first scheduler tick.\', \'seed3\'),\n  (\'build\', \'Next.js streaming responses: set maxDuration appropriately. Chat route: maxDuration=60 (SSE). Video route: maxDuration=300 (275s poll + buffer). Music route: maxDuration=190 (180s + buffer). All routes using Node-only APIs need export const runtime=\'\'nodejs\'\'. Edge runtime cannot use pg, crypto module, or any Node built-in.\', \'seed3\')\nON CONFLICT DO NOTHING;\n';

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
    await client.query(seed2SQL);
    await client.query(seed3SQL);

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
