import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

export const runtime = 'nodejs'

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS sparkie_topics (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      name        TEXT NOT NULL,
      fingerprint TEXT,
      summary     TEXT,
      notification_policy TEXT DEFAULT 'auto',
      status      TEXT DEFAULT 'active',
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {})
  await query(`CREATE INDEX IF NOT EXISTS idx_sparkie_topics_user ON sparkie_topics(user_id, status)`).catch(() => {})
  await query(`
    CREATE TABLE IF NOT EXISTS sparkie_topic_links (
      id          SERIAL PRIMARY KEY,
      topic_id    TEXT NOT NULL REFERENCES sparkie_topics(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL,
      source_id   TEXT NOT NULL,
      summary     TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {})
  await query(`CREATE INDEX IF NOT EXISTS idx_sparkie_topic_links ON sparkie_topic_links(topic_id)`).catch(() => {})

  // Phase 2 column migration — adds resumption tracking fields
  await query(`ALTER TABLE sparkie_topics ADD COLUMN IF NOT EXISTS last_state TEXT`).catch(() => {})
  await query(`ALTER TABLE sparkie_topics ADD COLUMN IF NOT EXISTS last_round INT DEFAULT 0`).catch(() => {})
  await query(`ALTER TABLE sparkie_topics ADD COLUMN IF NOT EXISTS step_count INT DEFAULT 0`).catch(() => {})
  await query(`ALTER TABLE sparkie_topics ADD COLUMN IF NOT EXISTS original_request TEXT`).catch(() => {})
  await query(`ALTER TABLE sparkie_topics ADD COLUMN IF NOT EXISTS topic_type TEXT DEFAULT 'chat'`).catch(() => {})
  await query(`ALTER TABLE sparkie_topics ADD COLUMN IF NOT EXISTS cognition_state JSONB DEFAULT '{}'`).catch(() => {})
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string })?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const topicId = req.nextUrl.searchParams.get('id')
  await ensureTable()

  if (topicId) {
    const [topicRes, linksRes] = await Promise.all([
      query<{ id: string; name: string; fingerprint: string; summary: string; notification_policy: string; status: string; created_at: string; updated_at: string; topic_type: string; last_round: number; step_count: number; original_request: string }>(
        `SELECT id, name, fingerprint, summary, notification_policy, status, created_at, updated_at, topic_type, last_round, step_count, original_request FROM sparkie_topics WHERE id = $1 AND user_id = $2`,
        [topicId, userId]
      ),
      query<{ id: number; source_type: string; source_id: string; summary: string; created_at: string }>(
        `SELECT id, source_type, source_id, summary, created_at FROM sparkie_topic_links WHERE topic_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [topicId]
      ),
    ])
    if (topicRes.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ topic: topicRes.rows[0], links: linksRes.rows })
  }

  const res = await query<{ id: string; name: string; fingerprint: string; summary: string; notification_policy: string; status: string; updated_at: string; topic_type: string; last_round: number; step_count: number; original_request: string }>(
    `SELECT id, name, fingerprint, summary, notification_policy, status, updated_at, topic_type, last_round, step_count, original_request FROM sparkie_topics WHERE user_id = $1 AND status = 'active' ORDER BY updated_at DESC LIMIT 30`,
    [userId]
  )
  return NextResponse.json({ topics: res.rows })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string })?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await ensureTable()
  const body = await req.json() as {
    action: 'create' | 'update' | 'archive' | 'link' | 'resume' | 'seed' | 'update_state' | 'find_build'
    id?: string
    name?: string
    fingerprint?: string
    summary?: string
    notification_policy?: string
    topic_id?: string
    source_type?: string
    source_id?: string
    last_state?: string
    last_round?: number
    step_count?: number
    original_request?: string
    topic_type?: string
  }

  if (body.action === 'create') {
    if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })
    const id = `topic_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    await query(
      `INSERT INTO sparkie_topics (id, user_id, name, fingerprint, summary, notification_policy, topic_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, userId, body.name, body.fingerprint ?? '', body.summary ?? '', body.notification_policy ?? 'auto', body.topic_type ?? 'chat']
    )
    return NextResponse.json({ ok: true, id, action: 'created' })
  }

  if (body.action === 'update') {
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const fields: string[] = []
    const params: unknown[] = []
    if (body.name)    { fields.push(`name = $${params.length + 1}`);    params.push(body.name) }
    if (body.summary) { fields.push(`summary = $${params.length + 1}`); params.push(body.summary) }
    if (body.fingerprint) { fields.push(`fingerprint = $${params.length + 1}`); params.push(body.fingerprint) }
    if (body.notification_policy) { fields.push(`notification_policy = $${params.length + 1}`); params.push(body.notification_policy) }
    if (body.topic_type) { fields.push(`topic_type = $${params.length + 1}`); params.push(body.topic_type) }
    if (fields.length === 0) return NextResponse.json({ ok: true, action: 'noop' })
    fields.push(`updated_at = NOW()`)
    params.push(body.id, userId)
    await query(
      `UPDATE sparkie_topics SET ${fields.join(', ')} WHERE id = $${params.length - 1} AND user_id = $${params.length}`,
      params
    )
    return NextResponse.json({ ok: true, action: 'updated' })
  }

  if (body.action === 'archive') {
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    await query(`UPDATE sparkie_topics SET status = 'archived', updated_at = NOW() WHERE id = $1 AND user_id = $2`, [body.id, userId])
    return NextResponse.json({ ok: true, action: 'archived' })
  }

  if (body.action === 'link') {
    if (!body.topic_id || !body.source_type || !body.source_id) {
      return NextResponse.json({ error: 'topic_id, source_type, source_id required' }, { status: 400 })
    }
    // Verify topic belongs to user
    const topicCheck = await query(`SELECT id FROM sparkie_topics WHERE id = $1 AND user_id = $2`, [body.topic_id, userId])
    if (topicCheck.rows.length === 0) return NextResponse.json({ error: 'Topic not found' }, { status: 404 })
    await query(
      `INSERT INTO sparkie_topic_links (topic_id, source_type, source_id, summary) VALUES ($1, $2, $3, $4)`,
      [body.topic_id, body.source_type, body.source_id, body.summary ?? '']
    )
    await query(`UPDATE sparkie_topics SET updated_at = NOW() WHERE id = $1`, [body.topic_id])
    return NextResponse.json({ ok: true, action: 'linked' })
  }

  if (body.action === 'resume') {
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const topicRes = await query<{ id: string; name: string; summary: string; last_state: string; last_round: number; step_count: number; fingerprint: string; original_request: string }>(
      `SELECT id, name, summary, last_state, last_round, step_count, fingerprint, original_request FROM sparkie_topics WHERE id = $1 AND user_id = $2`,
      [body.id, userId]
    )
    if (topicRes.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await query(`UPDATE sparkie_topics SET updated_at = NOW() WHERE id = $1`, [body.id]).catch(() => {})
    return NextResponse.json({ ok: true, topic: topicRes.rows[0], action: 'resumed' })
  }

  if (body.action === 'update_state') {
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const params: unknown[] = []
    const fields: string[] = []
    if (body.last_state !== undefined) { fields.push(`last_state = $${params.length + 1}`); params.push(body.last_state) }
    if (body.last_round !== undefined) { fields.push(`last_round = $${params.length + 1}`); params.push(body.last_round) }
    if (body.step_count !== undefined) { fields.push(`step_count = $${params.length + 1}`); params.push(body.step_count) }
    if (body.original_request !== undefined) { fields.push(`original_request = $${params.length + 1}`); params.push(body.original_request) }
    if (fields.length === 0) return NextResponse.json({ ok: true, action: 'noop' })
    fields.push(`updated_at = NOW()`)
    params.push(body.id, userId)
    await query(`UPDATE sparkie_topics SET ${fields.join(', ')} WHERE id = $${params.length - 1} AND user_id = $${params.length}`, params)
    return NextResponse.json({ ok: true, action: 'state_updated' })
  }

  if (body.action === 'find_build') {
    // Find an active build topic matching a fingerprint (for build resume)
    if (!body.fingerprint) return NextResponse.json({ error: 'fingerprint required' }, { status: 400 })
    const rows = await query<{
      id: string; name: string; summary: string; fingerprint: string
      last_state: string; last_round: number; step_count: number; original_request: string
    }>(
      `SELECT id, name, summary, fingerprint, last_state, last_round, step_count, original_request
       FROM sparkie_topics
       WHERE user_id = $1 AND topic_type = 'build' AND status = 'active' AND fingerprint = $2
       ORDER BY updated_at DESC LIMIT 1`,
      [userId, body.fingerprint]
    )
    if (rows.rows.length === 0) return NextResponse.json({ found: false })
    return NextResponse.json({ found: true, topic: rows.rows[0] })
  }

  if (body.action === 'seed') {
    // Idempotent — only seeds if 0 topics exist for this user
    const countRes = await query<{ count: string }>(`SELECT COUNT(*) as count FROM sparkie_topics WHERE user_id = $1`, [userId])
    if (parseInt(countRes.rows[0]?.count ?? '0') > 0) {
      return NextResponse.json({ ok: true, action: 'already_seeded' })
    }
    const defaultTopics = [
      {
        name: 'Sparkie Studio Development',
        fingerprint: 'sparkie studio build deploy nextjs typescript route api component',
        summary: 'Building and deploying Sparkie Studio — the AI IDE at sparkie-studio-mhouq.ondigitalocean.app. Ongoing development of features, bug fixes, and the CIP engine.',
      },
      {
        name: 'DigitalOcean Deployment & Infrastructure',
        fingerprint: 'digitalocean deploy server infrastructure docker container nodejs nextjs production',
        summary: 'Sparkie Studio production deployment on DigitalOcean App Platform — deployments, env vars, build pipeline, server.js configuration.',
      },
      {
        name: 'Music & Creative Projects — Dragunit EU',
        fingerprint: 'music audio ace dragunit creative beats studio production track song',
        summary: 'Michael\'s music production under Dragunit EU, creative audio projects, ACE music generation.',
      },
      {
        name: 'CIP Engine & AI Cognition',
        fingerprint: 'cip cognitive layers behavior rules causal graph goals reflection perception emotional',
        summary: 'Sparkie\'s Complex Information Processing engine — 7 cognitive layers, behavior rules, causal graph, goal persistence, self-reflection.',
      },
    ]
    for (const t of defaultTopics) {
      const id = `topic_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      await query(
        `INSERT INTO sparkie_topics (id, user_id, name, fingerprint, summary, status) VALUES ($1, $2, $3, $4, $5, 'active')`,
        [id, userId, t.name, t.fingerprint, t.summary]
      ).catch(() => {})
    }
    return NextResponse.json({ ok: true, action: 'seeded', count: defaultTopics.length })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
