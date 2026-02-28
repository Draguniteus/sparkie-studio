import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

export const runtime = 'nodejs'

async function ensureColumn() {
  // Add preferences JSONB column to users table if it doesn't exist
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'`).catch(() => {})
}

// GET /api/user/preferences
export async function GET() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return NextResponse.json({ preferences: {} })

  try {
    await ensureColumn()
    const result = await query(
      `SELECT preferences FROM users WHERE id = $1`,
      [userId]
    )
    const prefs = (result.rows as any[])[0]?.preferences ?? {}
    return NextResponse.json({ preferences: prefs })
  } catch (err) {
    console.error('GET /api/user/preferences error:', err)
    return NextResponse.json({ preferences: {} })
  }
}

// PATCH /api/user/preferences — merge partial update
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await ensureColumn()
    const body = await req.json()

    // Merge into existing preferences using PostgreSQL jsonb ||
    await query(
      `UPDATE users SET preferences = COALESCE(preferences, '{}') || $1::jsonb WHERE id = $2`,
      [JSON.stringify(body), userId]
    )
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('PATCH /api/user/preferences error:', err)
    return NextResponse.json({ error: 'Failed to save preferences' }, { status: 500 })
  }
}
