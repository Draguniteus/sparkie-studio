import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

export const runtime = 'nodejs'

const ALLOWED_TABLES = new Set([
  'sparkie_worklog', 'sparkie_tasks', 'sparkie_feed', 'user_memories',
  'sparkie_skills', 'sparkie_assets', 'sparkie_radio_tracks', 'chat_messages',
  'dream_journal', 'dream_journal_lock', 'user_sessions', 'sparkie_outreach_log',
  'user_identity_files', 'users',
])

function isSelectOnly(sql: string): boolean {
  const clean = sql.trim().toUpperCase()
  return (
    clean.startsWith('SELECT') &&
    !clean.includes('INSERT') && !clean.includes('UPDATE') &&
    !clean.includes('DELETE') && !clean.includes('DROP') &&
    !clean.includes('TRUNCATE') && !clean.includes('ALTER') &&
    !clean.includes('CREATE') && !clean.includes('GRANT') &&
    !clean.includes('EXEC') && !clean.includes('EXECUTE')
  )
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let rawSql: string
  try {
    const body = await req.json() as { sql?: string }
    rawSql = body.sql ?? ''
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!rawSql || !isSelectOnly(rawSql)) {
    return NextResponse.json({ error: 'Only SELECT queries are permitted' }, { status: 400 })
  }

  const mentionsAllowed = Array.from(ALLOWED_TABLES).some(t =>
    rawSql.toLowerCase().includes(t)
  )
  if (!mentionsAllowed) {
    return NextResponse.json(
      { error: 'Query must reference at least one Sparkie table' },
      { status: 400 }
    )
  }

  // Enforce LIMIT cap
  const limitMatch = rawSql.match(/\bLIMIT\s+(\d+)/i)
  const existingLimit = limitMatch ? parseInt(limitMatch[1]) : null
  let safeSQL = rawSql.replace(/;\s*$/, '')
  if (!existingLimit) {
    safeSQL += ' LIMIT 20'
  } else if (existingLimit > 100) {
    safeSQL = safeSQL.replace(/\bLIMIT\s+\d+/i, 'LIMIT 100')
  }

  try {
    const result = await query(safeSQL)
    return NextResponse.json({ rows: result.rows, rowCount: result.rowCount })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
