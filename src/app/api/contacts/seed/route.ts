import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export const runtime = 'nodejs'

const MIGRATE_SECRET = process.env.MIGRATE_SECRET ?? ''

// ── Seed contacts for a specific user ────────────────────────────────────────
// Called once to pre-populate known contacts. Auth'd by MIGRATE_SECRET.
export async function POST(req: NextRequest) {
  const { secret, userId, contacts } = await req.json().catch(() => ({})) as {
    secret?: string
    userId?: string
    contacts?: Array<{
      email: string
      display_name?: string
      notes?: string
      cc_preference?: string
      response_sla?: string
      priority?: string
    }>
  }

  if (!secret || secret !== MIGRATE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 })
  }
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return NextResponse.json({ error: 'contacts array required' }, { status: 400 })
  }

  // Ensure table exists
  await query(`
    CREATE TABLE IF NOT EXISTS sparkie_contacts (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         TEXT NOT NULL,
      email           TEXT NOT NULL,
      display_name    TEXT DEFAULT '',
      notes           TEXT DEFAULT '',
      cc_preference   TEXT DEFAULT '',
      response_sla    TEXT DEFAULT '',
      priority        TEXT DEFAULT 'normal',
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, email)
    )
  `).catch(() => {})

  const results: Array<{ email: string; status: string }> = []

  for (const c of contacts) {
    if (!c.email) continue
    try {
      await query(
        `INSERT INTO sparkie_contacts (user_id, email, display_name, notes, cc_preference, response_sla, priority)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, email) DO UPDATE SET
           display_name  = COALESCE($3, sparkie_contacts.display_name),
           notes         = COALESCE($4, sparkie_contacts.notes),
           cc_preference = COALESCE($5, sparkie_contacts.cc_preference),
           response_sla  = COALESCE($6, sparkie_contacts.response_sla),
           priority      = COALESCE($7, sparkie_contacts.priority),
           updated_at    = NOW()`,
        [userId, c.email, c.display_name ?? '', c.notes ?? '', c.cc_preference ?? '', c.response_sla ?? 'normal', c.priority ?? 'normal']
      )
      results.push({ email: c.email, status: 'saved' })
    } catch (e) {
      results.push({ email: c.email, status: `error: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  return NextResponse.json({ ok: true, results })
}
