import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

export const runtime = 'nodejs'

// Sparkie's persistent working memory — key-value store that survives restarts/deploys.
// Used by autonomous tasks to checkpoint state across executions.
//
// GET  /api/workspace?key=<key>           → { value, updated_at } or { error: 'not found' }
// POST /api/workspace { key, value }      → { ok: true }
// DELETE /api/workspace?key=<key>         → { ok: true }
// GET  /api/workspace (no key)            → { entries: [{key, value, updated_at}] } (owner only, last 100)

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS sparkie_workspace (
      id         SERIAL PRIMARY KEY,
      user_id    TEXT NOT NULL,
      key        TEXT NOT NULL,
      value      TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, key)
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS idx_workspace_user_key ON sparkie_workspace(user_id, key)`)
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await ensureTable()
    const key = req.nextUrl.searchParams.get('key')

    if (!key) {
      // List all entries for this user (owner-level access, last 100)
      const result = await query(
        `SELECT key, value, updated_at FROM sparkie_workspace
         WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 100`,
        [userId]
      )
      return NextResponse.json({ entries: result.rows })
    }

    const result = await query(
      `SELECT value, updated_at FROM sparkie_workspace WHERE user_id = $1 AND key = $2`,
      [userId, key]
    )
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    return NextResponse.json({ value: result.rows[0].value, updated_at: result.rows[0].updated_at })
  } catch (err) {
    console.error('GET /api/workspace error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await ensureTable()
    const body = await req.json()
    const { key, value } = body as { key?: string; value?: string }
    if (!key?.trim()) return NextResponse.json({ error: 'key required' }, { status: 400 })
    if (value === undefined || value === null) return NextResponse.json({ error: 'value required' }, { status: 400 })

    await query(
      `INSERT INTO sparkie_workspace (user_id, key, value, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, key) DO UPDATE SET value = $3, updated_at = NOW()`,
      [userId, key.trim(), String(value)]
    )
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('POST /api/workspace error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await ensureTable()
    const key = req.nextUrl.searchParams.get('key')
    if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })

    await query(
      `DELETE FROM sparkie_workspace WHERE user_id = $1 AND key = $2`,
      [userId, key]
    )
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
