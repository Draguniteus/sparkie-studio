import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

export const runtime = 'nodejs'

// Ensure table exists (idempotent — safe to call every request)
async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      TEXT NOT NULL,
      role         TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content      TEXT NOT NULL,
      msg_type     TEXT DEFAULT 'text',
      metadata     JSONB,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(user_id, created_at)`)
}

// GET /api/messages — load the user's full chat history (last 200 messages)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return NextResponse.json({ messages: [] })

  try {
    await ensureTable()
    const result = await query<{
      id: string; role: string; content: string; msg_type: string; metadata: Record<string, unknown> | null; created_at: string
    }>(
      `SELECT id, role, content, msg_type, metadata, created_at
       FROM chat_messages
       WHERE user_id = $1
       ORDER BY created_at ASC
       LIMIT 200`,
      [userId]
    )
    const messages = (result.rows as any[]).map(r => ({
      id: r.id,
      role: r.role as 'user' | 'assistant',
      content: r.content,
      type: r.msg_type ?? 'text',
      ...(r.metadata ?? {}),
    }))
    return NextResponse.json({ messages })
  } catch (err) {
    console.error('GET /api/messages error:', err)
    return NextResponse.json({ messages: [] })
  }
}

// POST /api/messages — save one message
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    const { role, content, type, ...rest } = await req.json()
    if (!role || !content) return NextResponse.json({ ok: false, error: 'role and content required' }, { status: 400 })

    await ensureTable()
    const metadata = Object.keys(rest).length > 0 ? rest : null
    const result = await query<{ id: string }>(
      `INSERT INTO chat_messages (user_id, role, content, msg_type, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [userId, role, content, type ?? 'text', metadata ? JSON.stringify(metadata) : null]
    )
    const id = (result.rows as any[])[0]?.id
    return NextResponse.json({ ok: true, id })
  } catch (err) {
    console.error('POST /api/messages error:', err)
    return NextResponse.json({ ok: false, error: 'DB error' }, { status: 500 })
  }
}

// DELETE /api/messages — clear all messages for user (optional utility)
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return NextResponse.json({ ok: false }, { status: 401 })

  try {
    await ensureTable()
    await query(`DELETE FROM chat_messages WHERE user_id = $1`, [userId])
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
