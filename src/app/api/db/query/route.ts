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
  // CIP engine tables
  'sparkie_goals', 'sparkie_behavior_rules', 'sparkie_causal_graph',
  'sparkie_self_reflections', 'sparkie_self_memory', 'sparkie_topics',
  'sparkie_dream_journal',
  // Schema introspection
  'information_schema',
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
  // Allow server-to-server calls via internal secret (e.g. from query_database tool in chat route)
  const internalSecret = req.headers.get('x-internal-secret')
  const isInternalCall = internalSecret && internalSecret === process.env.SPARKIE_INTERNAL_SECRET
  if (!isInternalCall) {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
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

  // Enforce LIMIT cap — robust pattern handles trailing punctuation/whitespace after number
  const limitMatch = rawSql.match(/\bLIMIT\s+(\d+)/i)
  const existingLimit = limitMatch ? parseInt(limitMatch[1]) : null
  let safeSQL = rawSql.replace(/;\s*$/, '').trim()
  if (!existingLimit) {
    safeSQL += ' LIMIT 20'
  } else if (existingLimit > 100) {
    safeSQL = safeSQL.replace(/\bLIMIT\s+\d+/i, 'LIMIT 100')
  }
  // If model provided a reasonable limit (<=100), keep it — don't double-apply LIMIT

  try {
    const result = await query(safeSQL)
    return NextResponse.json({ rows: result.rows, rowCount: result.rowCount })
  } catch (e) {
    // NEVER swallow — always surface the real PostgreSQL error so Sparkie reports it accurately
    const err = e as { message?: string; code?: string }
    const msg = err.message ?? String(e)
    console.error('[db/query] SQL error:', msg, '| code:', err.code, '| sql:', safeSQL.slice(0, 200))
    return NextResponse.json({ error: msg, code: err.code }, { status: 400 })
  }
}
