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
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string })?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const topicId = req.nextUrl.searchParams.get('id')
  await ensureTable()

  if (topicId) {
    const [topicRes, linksRes] = await Promise.all([
      query<{ id: string; name: string; fingerprint: string; summary: string; notification_policy: string; status: string; created_at: string; updated_at: string }>(
        `SELECT id, name, fingerprint, summary, notification_policy, status, created_at, updated_at FROM sparkie_topics WHERE id = $1 AND user_id = $2`,
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

  const res = await query<{ id: string; name: string; fingerprint: string; summary: string; notification_policy: string; status: string; updated_at: string }>(
    `SELECT id, name, fingerprint, summary, notification_policy, status, updated_at FROM sparkie_topics WHERE user_id = $1 AND status = 'active' ORDER BY updated_at DESC LIMIT 30`,
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
    action: 'create' | 'update' | 'archive' | 'link'
    id?: string
    name?: string
    fingerprint?: string
    summary?: string
    notification_policy?: string
    topic_id?: string
    source_type?: string
    source_id?: string
  }

  if (body.action === 'create') {
    if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })
    const id = `topic_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    await query(
      `INSERT INTO sparkie_topics (id, user_id, name, fingerprint, summary, notification_policy)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, userId, body.name, body.fingerprint ?? '', body.summary ?? '', body.notification_policy ?? 'auto']
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

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
