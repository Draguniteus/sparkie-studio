import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

// Sparkie's own self-annotation memory — she learns about herself and the user
// over time. Stored separately from user_memories (which is user-scoped by auth).
// This table is server-trust only — no auth required, called by agent route.

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS sparkie_self_memory (
      id          SERIAL PRIMARY KEY,
      category    TEXT NOT NULL DEFAULT 'self',
      content     TEXT NOT NULL,
      source      TEXT DEFAULT 'sparkie',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {})
  await query(`
    CREATE INDEX IF NOT EXISTS idx_sparkie_self_memory_category
    ON sparkie_self_memory(category)
  `).catch(() => {})
}

// GET — load Sparkie's memories (optionally filtered by category)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const limit = parseInt(searchParams.get('limit') || '50')

  try {
    await ensureTable()
    const rows = category
      ? await query(
          'SELECT id, category, content, source, created_at FROM sparkie_self_memory WHERE category = $1 ORDER BY created_at DESC LIMIT $2',
          [category, limit]
        )
      : await query(
          'SELECT id, category, content, source, created_at FROM sparkie_self_memory ORDER BY created_at DESC LIMIT $1',
          [limit]
        )
    return NextResponse.json({ memories: rows.rows })
  } catch (e) {
    return NextResponse.json({ memories: [], error: String(e) })
  }
}

// POST — Sparkie saves a memory about herself or the user
export async function POST(req: NextRequest) {
  try {
    const { category = 'self', content, source = 'sparkie' } = await req.json() as {
      category?: string
      content: string
      source?: string
    }
    if (!content?.trim()) {
      return NextResponse.json({ error: 'content required' }, { status: 400 })
    }
    await ensureTable()
    await query(
      'INSERT INTO sparkie_self_memory (category, content, source) VALUES ($1, $2, $3)',
      [category, content, source]
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// DELETE — remove a specific memory by id
export async function DELETE(req: NextRequest) {
  const { id } = await req.json() as { id: number }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  try {
    await query('DELETE FROM sparkie_self_memory WHERE id = $1', [id])
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
