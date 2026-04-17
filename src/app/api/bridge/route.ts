import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

// ── sparkie_bridge — shared mind between Sparkie Prime (OpenClaw) and Studio Agent ─
// Each user gets their own bridge entries. Entries are scoped by user_id so multiple
// users don't see each other's cross-agent context.

// GET /api/bridge?since=ISO_TIMESTAMP
// Returns bridge entries + worklog + feed for the authenticated user.
// Called by: Sparkie Prime (OpenClaw) during heartbeats, or Studio Agent at session start.
export async function GET(req: NextRequest) {
  // Allow OpenClaw (Sparkie Prime) to read via x-sparkie-secret header
  const secret = req.headers.get('x-sparkie-secret')
  const isOpenClaw = secret && secret === process.env.SPARKIE_INTERNAL_SECRET

  if (!isOpenClaw) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = session.user.email as string
    const { searchParams } = new URL(req.url)
    const since = searchParams.get('since')

    try {
      const bridgeQuery = since
        ? "SELECT id, author, type, content, metadata, created_at FROM sparkie_bridge WHERE user_id = $1 AND created_at > $2 ORDER BY created_at DESC LIMIT 30"
        : "SELECT id, author, type, content, metadata, created_at FROM sparkie_bridge WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30"
      const bridgeParams = since ? [userId, since] : [userId]
      const bridge = await query(bridgeQuery, bridgeParams)

      const worklogQuery = since
        ? "SELECT id, created_at, type, content, metadata FROM sparkie_worklog WHERE user_id = $1 AND created_at > $2 ORDER BY created_at DESC LIMIT 20"
        : "SELECT id, created_at, type, content, metadata FROM sparkie_worklog WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20"
      const worklogParams = since ? [userId, since] : [userId]
      const worklog = await query(worklogQuery, worklogParams)

      const feed = await query(
        "SELECT id, created_at, content, media_url, media_type, mood FROM sparkie_feed WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20",
        [userId]
      )

      return NextResponse.json({
        user_id: userId,
        bridge: bridge.rows,
        worklog: worklog.rows,
        feed: feed.rows,
        synced_at: new Date().toISOString(),
      })
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 })
    }
  }

  // OpenClaw path — read ALL recent entries (for heartbeat monitoring)
  try {
    const { searchParams } = new URL(req.url)
    const since = searchParams.get('since')
    const sinceClause = since ? `AND created_at > '${since}'` : ''
    const bridge = await query(
      `SELECT id, user_id, author, type, content, metadata, created_at FROM sparkie_bridge WHERE 1=1 ${sinceClause} ORDER BY created_at DESC LIMIT 50`,
      []
    )
    const worklog = await query(
      `SELECT id, user_id, created_at, type, content, metadata FROM sparkie_worklog WHERE 1=1 ${sinceClause} ORDER BY created_at DESC LIMIT 50`,
      []
    )
    return NextResponse.json({
      source: 'sparkie-prime',
      bridge: bridge.rows,
      worklog: worklog.rows,
      synced_at: new Date().toISOString(),
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST /api/bridge
// Writes cross-agent context to the bridge. Primarily used by Sparkie Prime (OpenClaw)
// to share learnings about Michael with the Studio Agent.
//
// Auth: x-sparkie-secret header (from OpenClaw/Sparkie Prime) OR valid session (browser).
// Entries are tagged to the authenticated user's user_id — or to 'draguniteus@gmail.com'
// when using the secret header (since OpenClaw is Michael's local agent).
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-sparkie-secret')
  const isOpenClaw = secret && secret === process.env.SPARKIE_INTERNAL_SECRET

  if (isOpenClaw) {
    // OpenClaw path — write as sparkie-prime, tagged to Michael's account
    try {
      const body = await req.json() as {
        author: string
        type?: string
        content: string
        metadata?: Record<string, unknown>
      }
      if (!body.author || !body.content) {
        return NextResponse.json({ error: 'author and content required' }, { status: 400 })
      }
      if (!['sparkie-prime', 'studio-agent'].includes(body.author)) {
        return NextResponse.json({ error: 'invalid author' }, { status: 400 })
      }
      // OpenClaw always writes to Michael's account
      const michaelUserId = 'draguniteus@gmail.com'
      await query(
        `INSERT INTO sparkie_bridge (user_id, author, type, content, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [michaelUserId, body.author, body.type || 'note', body.content, JSON.stringify(body.metadata || {})]
      )
      return NextResponse.json({ ok: true, user_id: michaelUserId, written_at: new Date().toISOString(), via: 'sparkie-prime' })
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 })
    }
  }

  // Browser session path
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.email as string

  try {
    const body = await req.json() as {
      author: 'sparkie-prime' | 'studio-agent'
      type?: 'context' | 'activity' | 'preference' | 'note'
      content: string
      metadata?: Record<string, unknown>
    }

    if (!body.author || !body.content) {
      return NextResponse.json({ error: 'author and content required' }, { status: 400 })
    }

    if (!['sparkie-prime', 'studio-agent'].includes(body.author)) {
      return NextResponse.json({ error: 'invalid author' }, { status: 400 })
    }

    await query(
      `INSERT INTO sparkie_bridge (user_id, author, type, content, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        userId,
        body.author,
        body.type || 'note',
        body.content,
        JSON.stringify(body.metadata || {}),
      ]
    )

    return NextResponse.json({ ok: true, user_id: userId, written_at: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
