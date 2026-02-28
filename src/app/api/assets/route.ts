import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

export const runtime = 'nodejs'

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS sparkie_assets (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      TEXT NOT NULL,
      name         TEXT NOT NULL,
      content      TEXT NOT NULL,
      asset_type   TEXT NOT NULL DEFAULT 'other',
      source       TEXT NOT NULL DEFAULT 'agent',
      chat_id      TEXT,
      chat_title   TEXT,
      file_id      TEXT,
      language     TEXT DEFAULT '',
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS idx_sparkie_assets_user_id ON sparkie_assets(user_id)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_sparkie_assets_created ON sparkie_assets(user_id, created_at DESC)`)
}

// GET /api/assets — load all assets for the current user
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return NextResponse.json({ assets: [] })

  try {
    await ensureTable()
    const result = await query(
      `SELECT id, name, content, asset_type, source, chat_id, chat_title, file_id, language, created_at
       FROM sparkie_assets
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 500`,
      [userId]
    )
    const assets = (result.rows as any[]).map(r => ({
      id: r.id,
      name: r.name,
      content: r.content,
      assetType: r.asset_type,
      source: r.source,
      chatId: r.chat_id ?? '',
      chatTitle: r.chat_title ?? '',
      fileId: r.file_id ?? '',
      language: r.language ?? '',
      createdAt: new Date(r.created_at),
    }))
    return NextResponse.json({ assets })
  } catch (err) {
    console.error('GET /api/assets error:', err)
    return NextResponse.json({ assets: [] })
  }
}

// POST /api/assets — save a single asset
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await ensureTable()
    const body = await req.json()
    const { name, content, assetType, source, chatId, chatTitle, fileId, language } = body

    if (!name || !content) {
      return NextResponse.json({ error: 'name and content are required' }, { status: 400 })
    }

    const result = await query(
      `INSERT INTO sparkie_assets (user_id, name, content, asset_type, source, chat_id, chat_title, file_id, language)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, created_at`,
      [userId, name, content, assetType ?? 'other', source ?? 'agent',
       chatId ?? null, chatTitle ?? null, fileId ?? null, language ?? '']
    )
    const row = (result.rows as any[])[0]
    return NextResponse.json({ id: row.id, createdAt: row.created_at })
  } catch (err) {
    console.error('POST /api/assets error:', err)
    return NextResponse.json({ error: 'Failed to save asset' }, { status: 500 })
  }
}

// DELETE /api/assets — clear all assets for the user (or a single one via ?id=)
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await ensureTable()
    const { searchParams } = new URL(req.url)
    const assetId = searchParams.get('id')

    if (assetId) {
      await query(`DELETE FROM sparkie_assets WHERE id = $1 AND user_id = $2`, [assetId, userId])
    } else {
      await query(`DELETE FROM sparkie_assets WHERE user_id = $1`, [userId])
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/assets error:', err)
    return NextResponse.json({ error: 'Failed to delete assets' }, { status: 500 })
  }
}
