import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

type IdentityFileType = 'user' | 'memory' | 'session' | 'heartbeat'
const VALID_TYPES: IdentityFileType[] = ['user', 'memory', 'session', 'heartbeat']

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS user_identity_files (
      id          SERIAL PRIMARY KEY,
      user_id     TEXT NOT NULL,
      file_type   TEXT NOT NULL,
      content     TEXT NOT NULL DEFAULT '',
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT user_identity_files_user_type_unique UNIQUE (user_id, file_type)
    )
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_user_identity_files_user_id
    ON user_identity_files(user_id)
  `)
}

// GET /api/identity?type=user|memory|session|heartbeat|all
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = (session.user as { id?: string }).id
  if (!userId) return NextResponse.json({ error: 'No user id' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') ?? 'all'

  try {
    await ensureTable()

    if (type === 'all') {
      const result = await query(
        'SELECT file_type, content, updated_at FROM user_identity_files WHERE user_id = $1',
        [userId]
      )
      const files: Record<string, string> = {}
      for (const row of result.rows) {
        files[row.file_type] = row.content
      }
      return NextResponse.json({ files })
    }

    if (!VALID_TYPES.includes(type as IdentityFileType)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }

    const result = await query(
      'SELECT content, updated_at FROM user_identity_files WHERE user_id = $1 AND file_type = $2',
      [userId, type]
    )
    const content = result.rows[0]?.content ?? ''
    return NextResponse.json({ content, type })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PUT /api/identity?type=user|memory|session|heartbeat
// Body: { content: string }
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = (session.user as { id?: string }).id
  if (!userId) return NextResponse.json({ error: 'No user id' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')

  if (!type || !VALID_TYPES.includes(type as IdentityFileType)) {
    return NextResponse.json({ error: 'Invalid or missing type' }, { status: 400 })
  }

  const body = await req.json()
  const content: string = body.content ?? ''

  try {
    await ensureTable()
    await query(
      `INSERT INTO user_identity_files (user_id, file_type, content, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, file_type)
       DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
      [userId, type, content]
    )
    return NextResponse.json({ ok: true, type })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PATCH /api/identity?type=memory — append a memory entry (convenience endpoint)
// Body: { entry: string }  → appends "- {entry}\n" to MEMORY.md
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = (session.user as { id?: string }).id
  if (!userId) return NextResponse.json({ error: 'No user id' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') ?? 'memory'

  if (!VALID_TYPES.includes(type as IdentityFileType)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  const body = await req.json()
  const entry: string = body.entry ?? ''
  if (!entry.trim()) return NextResponse.json({ error: 'entry required' }, { status: 400 })

  try {
    await ensureTable()
    // Get current content
    const current = await query(
      'SELECT content FROM user_identity_files WHERE user_id = $1 AND file_type = $2',
      [userId, type]
    )
    const existing: string = current.rows[0]?.content ?? ''
    const timestamp = new Date().toISOString().split('T')[0]
    const newEntry = `- [${timestamp}] ${entry.trim()}`
    const updated = existing ? `${existing}\n${newEntry}` : newEntry

    await query(
      `INSERT INTO user_identity_files (user_id, file_type, content, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, file_type)
       DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
      [userId, type, updated]
    )
    return NextResponse.json({ ok: true, type, entry: newEntry })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
