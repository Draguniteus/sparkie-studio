import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

export const runtime = 'nodejs'

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS sparkie_worklog (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {})
  await query(`CREATE INDEX IF NOT EXISTS idx_worklog_user_time ON sparkie_worklog(user_id, created_at DESC)`).catch(() => {})
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ entries: [], stats: { emails: 0, messages: 0 } })

  await ensureTable()
  const userId = (session.user as { id?: string }).id ?? session.user.email ?? ''
  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '60'), 200)
  const offset = parseInt(searchParams.get('offset') ?? '0')

  const result = await query(
    `SELECT id, type, content, metadata, created_at FROM sparkie_worklog
     WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  )

  const statsRes = await query(
    `SELECT
       COALESCE(SUM(CASE WHEN type IN ('email_processed','email_skipped') THEN 1 ELSE 0 END), 0) AS email_count,
       COALESCE(SUM(CASE WHEN type = 'message_batch' THEN COALESCE((metadata->>'count')::int, 1) ELSE 0 END), 0) AS total_msgs
     FROM sparkie_worklog WHERE user_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
    [userId]
  ).catch(() => ({ rows: [{ email_count: 0, total_msgs: 0 }] }))

  const stats = statsRes.rows[0] ?? {}
  return NextResponse.json({
    entries: result.rows,
    stats: {
      emails: parseInt(String(stats.email_count ?? 0)),
      messages: parseInt(String(stats.total_msgs ?? 0)),
    },
  })
}

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-internal-key')
  const isInternal = apiKey === process.env.OPENCODE_API_KEY

  let userId: string
  let body: { type: string; content: string; metadata?: Record<string, unknown>; user_id?: string }

  if (isInternal) {
    body = await req.json() as typeof body
    userId = body.user_id ?? ''
    if (!userId) return NextResponse.json({ error: 'user_id required' }, { status: 400 })
  } else {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    userId = (session.user as { id?: string }).id ?? session.user.email ?? ''
    body = await req.json() as typeof body
  }

  await ensureTable()
  const id = crypto.randomUUID()
  await query(
    `INSERT INTO sparkie_worklog (id, user_id, type, content, metadata) VALUES ($1, $2, $3, $4, $5)`,
    [id, userId, body.type, body.content, JSON.stringify(body.metadata ?? {})]
  )
  return NextResponse.json({ id, success: true })
}
