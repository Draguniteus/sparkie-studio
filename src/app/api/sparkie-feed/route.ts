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
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`).catch(() => {})
}

export async function GET() {
  await ensureFeedTable()
  try {
    const result = await query(
      `SELECT id, content, media_url, media_type, mood, likes, created_at
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
