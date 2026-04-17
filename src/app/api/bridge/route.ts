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
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.email as string

  const { searchParams } = new URL(req.url)
  const since = searchParams.get('since')

  try {
    // Bridge entries written FOR this user (from sparkie-prime or from the studio agent)
    const bridgeQuery = since
      ? "SELECT id, author, type, content, metadata, created_at FROM sparkie_bridge WHERE user_id = $1 AND created_at > $2 ORDER BY created_at DESC LIMIT 30"
      : "SELECT id, author, type, content, metadata, created_at FROM sparkie_bridge WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30"
    const bridgeParams = since ? [userId, since] : [userId]
    const bridge = await query(bridgeQuery, bridgeParams)

    // Recent worklog for this user
    const worklogQuery = since
      ? "SELECT id, created_at, type, content, metadata FROM sparkie_worklog WHERE user_id = $1 AND created_at > $2 ORDER BY created_at DESC LIMIT 20"
      : "SELECT id, created_at, type, content, metadata FROM sparkie_worklog WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20"
    const worklogParams = since ? [userId, since] : [userId]
    const worklog = await query(worklogQuery, worklogParams)

    // Recent feed posts for this user
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

// POST /api/bridge
// Writes cross-agent context to the bridge. Primarily used by Sparkie Prime (OpenClaw)
// to share learnings about Michael with the Studio Agent.
//
// Auth: Requires a valid session. Entries are tagged to the authenticated user's user_id.
// This means entries from sparkie-prime are ONLY visible to Michael's session.
//
// OpenClaw (Sparkie Prime) authenticates via x-sparkie-secret header:
//   POST with header x-sparkie-secret: <SPARKIE_INTERNAL_SECRET value>
export async function POST(req: NextRequest) {
  const secretHeader = req.headers.get('x-sparkie-secret') ?? ''
  const isOpenClaw = secretHeader.length > 0 &&
    secretHeader === process.env.SPARKIE_INTERNAL_SECRET

  const session = await getServerSession(authOptions)

  // Allow either session auth OR OpenClaw secret header
  if (!session?.user?.email && !isOpenClaw) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Sparkie Prime (OpenClaw) writes as 'sparkie-prime' with a fixed placeholder user_id
  // Studio Agent writes as 'studio-agent' with the session user's email
  const userId = isOpenClaw ? 'sparkie-prime' : (session!.user!.email as string)

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

    // Guard: only sparkie-prime or studio-agent can write here
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
