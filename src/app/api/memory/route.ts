import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

// Ensure table exists on first use — safe to run multiple times
async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS user_memories (
      id          SERIAL PRIMARY KEY,
      user_id     TEXT NOT NULL,
      category    TEXT NOT NULL DEFAULT 'general',
      content     TEXT NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_user_memories_user_id ON user_memories(user_id)
  `)
  // Ensure session tracking table
  await query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id            SERIAL PRIMARY KEY,
      user_id       TEXT NOT NULL UNIQUE,
      last_seen_at  TIMESTAMPTZ DEFAULT NOW(),
      session_count INTEGER DEFAULT 1,
      first_seen_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
}

// GET /api/memory — load all memories for current user
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ memories: [] })
  }
  const userId = (session.user as { id?: string }).id
  if (!userId) return NextResponse.json({ memories: [] })

  try {
    await ensureTable()
    const result = await query(
      'SELECT id, category, content, created_at FROM user_memories WHERE user_id = $1 ORDER BY created_at ASC',
      [userId]
    )
    return NextResponse.json({ memories: result.rows })
  } catch {
    return NextResponse.json({ memories: [] })
  }
}

// POST /api/memory — save a memory
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = (session.user as { id?: string }).id
  if (!userId) return NextResponse.json({ error: 'No user id' }, { status: 401 })

  const { category = 'general', content } = await req.json()
  if (!content) return NextResponse.json({ error: 'content required' }, { status: 400 })

  try {
    await ensureTable()
    await query(
      'INSERT INTO user_memories (user_id, category, content) VALUES ($1, $2, $3)',
      [userId, category, content]
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// DELETE /api/memory?id=X — remove a specific memory
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as { id?: string }).id
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await query('DELETE FROM user_memories WHERE id = $1 AND user_id = $2', [id, userId])
  return NextResponse.json({ ok: true })
}
