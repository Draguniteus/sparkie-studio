import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

export const runtime = 'nodejs'
export const maxDuration = 60

async function ensureUploadsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS sparkie_uploads (
      id          SERIAL PRIMARY KEY,
      file_id     TEXT NOT NULL UNIQUE,
      user_id     TEXT NOT NULL,
      filename    TEXT NOT NULL,
      mime_type   TEXT NOT NULL DEFAULT 'application/octet-stream',
      size_bytes  INTEGER NOT NULL DEFAULT 0,
      content     TEXT NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {})
  await query(`CREATE INDEX IF NOT EXISTS idx_sparkie_uploads_user ON sparkie_uploads(user_id)`).catch(() => {})
  await query(`CREATE INDEX IF NOT EXISTS idx_sparkie_uploads_file_id ON sparkie_uploads(file_id)`).catch(() => {})
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string })?.id
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    await ensureUploadsTable()

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const MAX_SIZE = 10 * 1024 * 1024 // 10 MB
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 413 })
    }

    // MIME type whitelist — reject executables and scripts
    const ALLOWED_MIME_PREFIXES = ['image/', 'text/', 'application/json', 'application/xml', 'application/pdf',
      'application/msword', 'application/vnd.', 'audio/', 'video/']
    const BLOCKED_EXTENSIONS = /\.(exe|sh|bat|cmd|ps1|msi|dll|so|dmg|app|bin|run|jar|py|rb|pl)$/i
    const mimeType = file.type || 'application/octet-stream'
    const allowed = ALLOWED_MIME_PREFIXES.some(p => mimeType.startsWith(p))
    const blocked = BLOCKED_EXTENSIONS.test(file.name)
    if (!allowed || blocked) {
      return NextResponse.json({ error: 'File type not allowed' }, { status: 415 })
    }

    const bytes = await file.arrayBuffer()
    const b64 = Buffer.from(bytes).toString('base64')
    const dataUrl = `data:${file.type || 'application/octet-stream'};base64,${b64}`
    const fileId = crypto.randomUUID()

    await query(
      `INSERT INTO sparkie_uploads (file_id, user_id, filename, mime_type, size_bytes, content)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [fileId, userId, file.name, file.type || 'application/octet-stream', file.size, dataUrl]
    )

    // Also register in sparkie_assets so browser_screenshot etc. can reference it
    await query(
      `INSERT INTO sparkie_assets (user_id, name, content, asset_type, source, file_id, chat_title, chat_id, language)
       VALUES ($1, $2, $3, $4, 'upload', $5, '', '', '')
       ON CONFLICT DO NOTHING`,
      [userId, file.name, dataUrl, file.type.startsWith('image/') ? 'image' : 'document', fileId]
    ).catch((e) => console.error('[upload] asset insert error:', e))

    return NextResponse.json({
      ok: true,
      fileId,
      filename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    })
  } catch (e) {
    console.error('[upload] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string })?.id
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const fileId = req.nextUrl.searchParams.get('file_id')
  if (!fileId) return NextResponse.json({ error: 'file_id required' }, { status: 400 })

  try {
    await ensureUploadsTable()
    const res = await query(
      `SELECT filename, mime_type, size_bytes, content FROM sparkie_uploads WHERE file_id = $1 AND user_id = $2`,
      [fileId, userId]
    )
    if (res.rows.length === 0) return NextResponse.json({ error: 'File not found' }, { status: 404 })
    const row = res.rows[0] as { filename: string; mime_type: string; size_bytes: number; content: string }

    // For text/code files, return content directly
    if (row.mime_type.startsWith('text/') || ['application/json', 'application/xml'].includes(row.mime_type)) {
      const b64 = row.content.split(',')[1] ?? row.content
      const text = Buffer.from(b64, 'base64').toString('utf-8')
      return NextResponse.json({ ok: true, filename: row.filename, mimeType: row.mime_type, sizeBytes: row.size_bytes, text })
    }

    return NextResponse.json({
      ok: true, filename: row.filename, mimeType: row.mime_type,
      sizeBytes: row.size_bytes, dataUrl: row.content,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
