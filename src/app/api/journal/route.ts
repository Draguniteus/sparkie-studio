import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import crypto from 'crypto'

export const runtime = 'nodejs'

// PBKDF2-based passcode hashing — no external dependencies
function hashPasscode(passcode: string): string {
  const salt = 'sparkie_journal_salt_v1'
  return crypto.pbkdf2Sync(passcode, salt, 100000, 32, 'sha256').toString('hex')
}

function verifyPasscode(passcode: string, hash: string): boolean {
  return hashPasscode(passcode) === hash
}

// Auto-create tables + migrate on first use
async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS dream_journal (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL,
      title TEXT,
      content TEXT NOT NULL,
      mood TEXT DEFAULT 'neutral',
      category TEXT DEFAULT 'night_dreams',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, [])
  // Migrate: add category column if it doesn't exist
  await query(`
    ALTER TABLE dream_journal ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'night_dreams'
  `, []).catch(() => {})
  await query(`
    CREATE TABLE IF NOT EXISTS dream_journal_lock (
      user_id TEXT PRIMARY KEY,
      passcode_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, [])
}

// GET /api/journal?action=entries|lock_status
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureTable()
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action') ?? 'entries'

  if (action === 'lock_status') {
    const res = await query<{ passcode_hash: string }>(
      'SELECT passcode_hash FROM dream_journal_lock WHERE user_id = $1',
      [session.user.email]
    )
    return NextResponse.json({ hasPasscode: res.rows.length > 0 })
  }

  // entries
  const res = await query<{ id: string; title: string; content: string; mood: string; category: string; created_at: string }>(
    'SELECT id, title, content, mood, category, created_at FROM dream_journal WHERE user_id = $1 ORDER BY created_at DESC',
    [session.user.email]
  )
  return NextResponse.json({ entries: res.rows })
}

// POST /api/journal — action: create | set_passcode | verify_passcode | delete | update | remove_passcode
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureTable()
  const body = await req.json()
  const { action } = body

  if (action === 'set_passcode') {
    const { passcode } = body
    if (!passcode || String(passcode).length < 4 || String(passcode).length > 6) {
      return NextResponse.json({ error: 'Passcode must be 4-6 digits' }, { status: 400 })
    }
    const hash = hashPasscode(String(passcode))
    await query(
      `INSERT INTO dream_journal_lock (user_id, passcode_hash) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET passcode_hash = $2`,
      [session.user.email, hash]
    )
    return NextResponse.json({ success: true })
  }

  if (action === 'verify_passcode') {
    const { passcode } = body
    const res = await query<{ passcode_hash: string }>(
      'SELECT passcode_hash FROM dream_journal_lock WHERE user_id = $1',
      [session.user.email]
    )
    if (!res.rows.length) return NextResponse.json({ valid: false })
    const valid = verifyPasscode(String(passcode), res.rows[0].passcode_hash)
    return NextResponse.json({ valid })
  }

  if (action === 'remove_passcode') {
    const { passcode } = body
    const res = await query<{ passcode_hash: string }>(
      'SELECT passcode_hash FROM dream_journal_lock WHERE user_id = $1',
      [session.user.email]
    )
    if (!res.rows.length) return NextResponse.json({ error: 'No passcode set' }, { status: 400 })
    const valid = verifyPasscode(String(passcode), res.rows[0].passcode_hash)
    if (!valid) return NextResponse.json({ error: 'Wrong passcode' }, { status: 403 })
    await query('DELETE FROM dream_journal_lock WHERE user_id = $1', [session.user.email])
    return NextResponse.json({ success: true })
  }

  if (action === 'create') {
    const { title, content, category, mood } = body
    if (!content?.trim()) return NextResponse.json({ error: 'Content required' }, { status: 400 })
    const res = await query<{ id: string; created_at: string }>(
      `INSERT INTO dream_journal (user_id, title, content, category, mood)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
      [session.user.email, title?.trim() || null, content.trim(), category || 'night_dreams', mood || 'neutral']
    )
    return NextResponse.json({
      entry: {
        id: res.rows[0].id,
        created_at: res.rows[0].created_at,
        title,
        content,
        category: category || 'night_dreams',
        mood: mood || 'neutral'
      }
    })
  }

  if (action === 'delete') {
    const { id } = body
    await query('DELETE FROM dream_journal WHERE id = $1 AND user_id = $2', [id, session.user.email])
    return NextResponse.json({ success: true })
  }

  if (action === 'update') {
    const { id, title, content, category, mood } = body
    await query(
      'UPDATE dream_journal SET title=$1, content=$2, category=$3, mood=$4, updated_at=NOW() WHERE id=$5 AND user_id=$6',
      [title?.trim() || null, content.trim(), category || 'night_dreams', mood || 'neutral', id, session.user.email]
    )
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
