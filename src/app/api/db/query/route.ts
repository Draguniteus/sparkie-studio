import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { sql as pgSql } from '@vercel/postgres'

export const runtime = 'nodejs'

// Only these tables are allowed via this endpoint
const ALLOWED_TABLES = new Set([
  'sparkie_worklog', 'sparkie_tasks', 'sparkie_feed', 'user_memories',
  'sparkie_skills', 'sparkie_assets', 'sparkie_radio_tracks', 'chat_messages',
  'dream_journal', 'dream_journal_lock', 'user_sessions', 'sparkie_outreach_log',
  'user_identity_files', 'users',
])

function isSelectOnly(sql: string): boolean {
  const clean = sql.trim().toUpperCase()
  return clean.startsWith('SELECT') && 
    !clean.includes('INSERT') && !clean.includes('UPDATE') && 
    !clean.includes('DELETE') && !clean.includes('DROP') && 
    !clean.includes('TRUNCATE') && !clean.includes('ALTER')
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { sql: rawSql } = await req.json() as { sql: string }

  if (!rawSql || !isSelectOnly(rawSql)) {
    return NextResponse.json({ error: 'Only SELECT queries are permitted' }, { status: 400 })
  }

  // Verify query references only allowed tables
  const mentionsAllowed = Array.from(ALLOWED_TABLES).some(t => 
    rawSql.toLowerCase().includes(t)
  )
  if (!mentionsAllowed) {
    return NextResponse.json({ error: 'Query must reference at least one Sparkie table' }, { status: 400 })
  }

  try {
    const result = await pgSql.query(rawSql)
    return NextResponse.json({ rows: result.rows, rowCount: result.rowCount })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
