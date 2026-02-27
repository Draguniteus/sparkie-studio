import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import crypto from 'crypto'

export const runtime = 'nodejs'

function hashPasscode(passcode: string): string {
  const salt = 'sparkie_journal_salt_v1'
  return crypto.pbkdf2Sync(passcode, salt, 100000, 32, 'sha256').toString('hex')
}

function verifyPasscode(passcode: string, hash: string): boolean {
  return hashPasscode(passcode) === hash
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?(li|p|div|h[1-6])[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS dream_journal (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL,
      title TEXT,
      content TEXT NOT NULL,
      category TEXT DEFAULT 'night_dreams',
      mood TEXT DEFAULT 'neutral',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, [])
  await query(`ALTER TABLE dream_journal ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'night_dreams'`, []).catch(() => {})
  await query(`ALTER TABLE dream_journal ADD COLUMN IF NOT EXISTS title TEXT`, []).catch(() => {})
  await query(`
    CREATE TABLE IF NOT EXISTS dream_journal_lock (
      user_id TEXT PRIMARY KEY,
      passcode_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, [])
}

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

  if (action === 'get_entry') {
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const res = await query<{ id: string; title: string; content: string; category: string; created_at: string }>(
      'SELECT id, title, content, category, created_at FROM dream_journal WHERE id = $1 AND user_id = $2',
      [id, session.user.email]
    )
    if (!res.rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const entry = res.rows[0]
    return NextResponse.json({ entry: { ...entry, plainText: stripHtml(entry.content) } })
  }

  if (action === 'search') {
    const q = searchParams.get('q') || ''
    const category = searchParams.get('category') || ''
    let sql = `SELECT id, title, content, category, created_at FROM dream_journal WHERE user_id = $1`
    const params: string[] = [session.user.email]
    if (q) {
      params.push(`%${q}%`)
      sql += ` AND (LOWER(title) LIKE LOWER($${params.length}) OR LOWER(content) LIKE LOWER($${params.length}))`
    }
    if (category) {
      params.push(category)
      sql += ` AND category = $${params.length}`
    }
    sql += ` ORDER BY created_at DESC LIMIT 10`
    const res = await query<{ id: string; title: string; content: string; category: string; created_at: string }>(sql, params)
    return NextResponse.json({
      entries: res.rows.map(e => ({ ...e, plainText: stripHtml(e.content).slice(0, 500) }))
    })
  }

  // entries (default)
  const res = await query<{ id: string; title: string; content: string; category: string; created_at: string }>(
    'SELECT id, title, content, category, created_at FROM dream_journal WHERE user_id = $1 ORDER BY created_at DESC',
    [session.user.email]
  )
  return NextResponse.json({ entries: res.rows })
}

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
      `INSERT INTO dream_journal_lock (user_id, passcode_hash) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET passcode_hash = $2`,
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
    return NextResponse.json({ valid: verifyPasscode(String(passcode), res.rows[0].passcode_hash) })
  }

  if (action === 'remove_passcode') {
    const { passcode } = body
    const res = await query<{ passcode_hash: string }>(
      'SELECT passcode_hash FROM dream_journal_lock WHERE user_id = $1',
      [session.user.email]
    )
    if (!res.rows.length) return NextResponse.json({ error: 'No passcode set' }, { status: 400 })
    if (!verifyPasscode(String(passcode), res.rows[0].passcode_hash)) {
      return NextResponse.json({ error: 'Wrong passcode' }, { status: 403 })
    }
    await query('DELETE FROM dream_journal_lock WHERE user_id = $1', [session.user.email])
    return NextResponse.json({ success: true })
  }

  if (action === 'create') {
    const { title, content, category } = body
    if (!title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 })
    if (!content?.trim() || content === '<br>') return NextResponse.json({ error: 'Content required' }, { status: 400 })
    const res = await query<{ id: string; created_at: string }>(
      `INSERT INTO dream_journal (user_id, title, content, category) VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
      [session.user.email, title.trim(), content, category || 'night_dreams']
    )
    return NextResponse.json({
      entry: { id: res.rows[0].id, created_at: res.rows[0].created_at, title, content, category: category || 'night_dreams' }
    })
  }

  if (action === 'delete') {
    await query('DELETE FROM dream_journal WHERE id = $1 AND user_id = $2', [body.id, session.user.email])
    return NextResponse.json({ success: true })
  }

  if (action === 'update') {
    const { id, title, content, category } = body
    await query(
      'UPDATE dream_journal SET title=$1, content=$2, category=$3, updated_at=NOW() WHERE id=$4 AND user_id=$5',
      [title?.trim() || null, content, category || 'night_dreams', id, session.user.email]
    )
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
