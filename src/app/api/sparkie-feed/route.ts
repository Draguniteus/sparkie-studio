import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

async function ensureFeedTable() {
  await query(`CREATE TABLE IF NOT EXISTS sparkie_feed (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    media_url TEXT,
    media_type TEXT DEFAULT 'none',
    mood TEXT DEFAULT '',
    likes INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    code_html TEXT,
    code_title TEXT,
    companion_image_url TEXT
  )`).catch(() => {})
  await query(`ALTER TABLE sparkie_feed ADD COLUMN IF NOT EXISTS code_html TEXT`).catch(() => {})
  await query(`ALTER TABLE sparkie_feed ADD COLUMN IF NOT EXISTS code_title TEXT`).catch(() => {})
  await query(`ALTER TABLE sparkie_feed ADD COLUMN IF NOT EXISTS companion_image_url TEXT`).catch(() => {})
}

export async function GET() {
  await ensureFeedTable()
  try {
    const result = await query(
      `SELECT id, content, media_url, media_type, mood, likes, created_at, code_html, code_title, companion_image_url
       FROM sparkie_feed ORDER BY created_at DESC LIMIT 50`
    )
    return NextResponse.json({ posts: result.rows })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  await ensureFeedTable()
  try {
    const { id } = await req.json() as { id: number }
    await query(`UPDATE sparkie_feed SET likes = likes + 1 WHERE id = $1`, [id])
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  await ensureFeedTable()
  try {
    const body = await req.json() as {
      content: string
      media_url?: string
      media_type?: string
      mood?: string
      code_html?: string
      code_title?: string
      companion_image_url?: string
    }
    const { content, media_url, media_type = 'none', mood = '', code_html, code_title, companion_image_url } = body
    if (!content?.trim()) {
      return NextResponse.json({ error: 'content required' }, { status: 400 })
    }
    const result = await query(
      `INSERT INTO sparkie_feed (content, media_url, media_type, mood, code_html, code_title, companion_image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [content, media_url ?? null, media_type, mood, code_html ?? null, code_title ?? null, companion_image_url ?? null]
    )
    return NextResponse.json({ ok: true, id: (result.rows as { id: number }[])[0]?.id })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
