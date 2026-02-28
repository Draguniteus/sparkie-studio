import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

export const runtime = 'nodejs'

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS sparkie_radio_tracks (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      title      TEXT NOT NULL,
      artist     TEXT,
      src        TEXT NOT NULL,
      type       TEXT DEFAULT 'url',
      cover_url  TEXT,
      added_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS idx_radio_tracks_user ON sparkie_radio_tracks(user_id, added_at DESC)`)
}

// GET /api/radio/tracks — load user's saved radio stations
export async function GET() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return NextResponse.json({ tracks: [] })

  try {
    await ensureTable()
    const result = await query(
      `SELECT id, title, artist, src, type, cover_url, added_at
       FROM sparkie_radio_tracks WHERE user_id = $1 ORDER BY added_at ASC`,
      [userId]
    )
    const tracks = (result.rows as any[]).map(r => ({
      id: r.id,
      title: r.title,
      artist: r.artist ?? undefined,
      src: r.src,
      type: r.type ?? 'url',
      coverUrl: r.cover_url ?? undefined,
      addedAt: new Date(r.added_at),
    }))
    return NextResponse.json({ tracks })
  } catch (err) {
    console.error('GET /api/radio/tracks error:', err)
    return NextResponse.json({ tracks: [] })
  }
}

// POST /api/radio/tracks — save one or replace all tracks
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await ensureTable()
    const body = await req.json()

    // If body.tracks is an array — replace all (sync full state)
    if (Array.isArray(body.tracks)) {
      await query(`DELETE FROM sparkie_radio_tracks WHERE user_id = $1`, [userId])
      for (const t of body.tracks) {
        await query(
          `INSERT INTO sparkie_radio_tracks (id, user_id, title, artist, src, type, cover_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET title=$3, artist=$4, src=$5, type=$6, cover_url=$7`,
          [t.id, userId, t.title, t.artist ?? null, t.src, t.type ?? 'url', t.coverUrl ?? null]
        )
      }
      return NextResponse.json({ ok: true })
    }

    // Single track upsert
    const { id, title, artist, src, type, coverUrl } = body
    if (!id || !title || !src) return NextResponse.json({ error: 'id, title, src required' }, { status: 400 })
    await query(
      `INSERT INTO sparkie_radio_tracks (id, user_id, title, artist, src, type, cover_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET title=$3, artist=$4, src=$5, type=$6, cover_url=$7`,
      [id, userId, title, artist ?? null, src, type ?? 'url', coverUrl ?? null]
    )
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('POST /api/radio/tracks error:', err)
    return NextResponse.json({ error: 'Failed to save track' }, { status: 500 })
  }
}

// DELETE /api/radio/tracks?id=X — remove one track (or all if no id)
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await ensureTable()
    const { searchParams } = new URL(req.url)
    const trackId = searchParams.get('id')
    if (trackId) {
      await query(`DELETE FROM sparkie_radio_tracks WHERE id = $1 AND user_id = $2`, [trackId, userId])
    } else {
      await query(`DELETE FROM sparkie_radio_tracks WHERE user_id = $1`, [userId])
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
