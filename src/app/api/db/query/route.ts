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
  // Strip string literals and line comments so keywords inside quotes don't trigger false positives
  const stripped = sql
    .replace(/'[^']*'/g, "''")           // single-quoted strings
    .replace(/"[^"]*"/g, '""')           // double-quoted identifiers
    .replace(/--[^\n]*/g, '')             // line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
  const clean = stripped.trim().toUpperCase()
  const FORBIDDEN = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'TRUNCATE', 'ALTER', 'CREATE', 'GRANT', 'REVOKE', 'EXEC', 'EXECUTE', 'COPY', 'pg_']
  const startsOk = clean.startsWith('SELECT') || clean.startsWith('WITH')
  const noForbidden = !FORBIDDEN.some(kw => clean.includes(kw))
  return startsOk && noForbidden
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

  // Enforce LIMIT cap — only add LIMIT if SQL doesn't already have one.
  // Uses case-insensitive scan so it catches "limit 20", "LIMIT 5", etc.
  let safeSQL = rawSql.replace(/;\s*$/, '').trim()
  const hasLimit = /\bLIMIT\b/i.test(safeSQL)
  if (!hasLimit) {
    safeSQL += ' LIMIT 20'
  } else {
    // Cap existing high limits at 100 to prevent abuse
    const highLimitMatch = safeSQL.match(/\bLIMIT\s+(\d+)/i)
    if (highLimitMatch && parseInt(highLimitMatch[1]) > 100) {
      safeSQL = safeSQL.replace(/\bLIMIT\s+\d+/i, 'LIMIT 100')
    }
  }

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
