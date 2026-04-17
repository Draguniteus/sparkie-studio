import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

// Ensure sparkie_bridge table exists — auto-migrate on first use
async function ensureBridgeTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS sparkie_bridge (
      id          SERIAL PRIMARY KEY,
      author      TEXT NOT NULL,           -- 'sparkie-prime' | 'studio-agent'
      type        TEXT DEFAULT 'note',     -- 'context' | 'activity' | 'preference' | 'note'
      content     TEXT NOT NULL,
      metadata    JSONB DEFAULT '{}',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {})
  await query(`CREATE INDEX IF NOT EXISTS idx_bridge_created ON sparkie_bridge(created_at DESC)`).catch(() => {})
  await query(`CREATE INDEX IF NOT EXISTS idx_bridge_author ON sparkie_bridge(author)`).catch(() => {})
}

// GET /api/bridge?since=ISO_TIMESTAMP
// Returns all studio activity since the given timestamp.
// Called by Sparkie Prime (OpenClaw) during heartbeats to stay aware of studio activity.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const since = searchParams.get('since')

  try {
    await ensureBridgeTable()

    // Recent worklog entries
    const worklogQuery = since
      ? "SELECT id, created_at, type, content, metadata FROM sparkie_worklog WHERE created_at > $1 ORDER BY created_at DESC LIMIT 50"
      : "SELECT id, created_at, type, content, metadata FROM sparkie_worklog ORDER BY created_at DESC LIMIT 20"
    const worklogParams = since ? [since] : []
    const worklog = await query(worklogQuery, worklogParams)

    // Recent feed posts (music, images, posts)
    const feed = await query(
      "SELECT id, created_at, content, media_url, media_type, mood FROM sparkie_feed ORDER BY created_at DESC LIMIT 20"
    )

    // Bridge entries from Sparkie Prime (context she wrote for us)
    const bridge = await query(
      "SELECT id, created_at, author, type, content, metadata FROM sparkie_bridge ORDER BY created_at DESC LIMIT 20"
    )

    return NextResponse.json({
      worklog: worklog.rows,
      feed: feed.rows,
      bridge: bridge.rows,
      synced_at: new Date().toISOString(),
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST /api/bridge
// Writes context from Sparkie Prime into the shared bridge table.
// Called by Sparkie Prime after conversations with Michael to share learnings.
// Also called by the studio agent to write activity summaries back to the bridge.
export async function POST(req: NextRequest) {
  try {
    await ensureBridgeTable()

    const body = await req.json() as {
      author: 'sparkie-prime' | 'studio-agent'
      type?: 'context' | 'activity' | 'preference' | 'note'
      content: string
      metadata?: Record<string, unknown>
    }

    if (!body.author || !body.content) {
      return NextResponse.json({ error: 'author and content required' }, { status: 400 })
    }

    await query(
      `INSERT INTO sparkie_bridge (author, type, content, metadata, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [
        body.author,
        body.type || 'note',
        body.content,
        JSON.stringify(body.metadata || {}),
      ]
    )

    return NextResponse.json({ ok: true, written_at: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
