/**
 * toolCallWrapper.ts
 * Phase 1: Tool layer observability.
 * Wraps every Composio/external tool call with:
 *   - Duration tracking
 *   - Success/failure logging to sparkie_tool_log
 *   - In-memory result cache (TTL-based, keyed by tool+args hash)
 *   - Failure rate tracking (triggers worklog alert at >30% failure in 24h)
 */

import { query } from '@/lib/db'

// ── In-memory cache (keyed by hash) ──────────────────────────────────────────
const toolCache = new Map<string, { result: string; expires: number }>()

const TOOL_CACHE_TTL: Record<string, number> = {
  default: 60_000,       // 1 minute
  get_weather: 300_000,  // 5 minutes
  web_search: 120_000,   // 2 minutes
  search_reddit: 120_000,
  search_twitter: 60_000,
}

function hashArgs(tool: string, args: Record<string, unknown>): string {
  try {
    return tool + ':' + JSON.stringify(args)
  } catch {
    return tool + ':?' + Date.now()
  }
}

async function ensureToolLogTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS sparkie_tool_log (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      tool TEXT NOT NULL,
      args_hash TEXT,
      duration_ms INT,
      success BOOLEAN NOT NULL DEFAULT true,
      error_code TEXT,
      cached BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {})
  await query(`CREATE INDEX IF NOT EXISTS idx_tool_log_tool_time ON sparkie_tool_log(tool, created_at DESC)`).catch(() => {})
}

/**
 * Wrapped tool executor.
 * Usage: const result = await callTool('web_search', { query: '...' }, () => actualFetch(...), userId)
 */
export async function callTool(
  tool: string,
  args: Record<string, unknown>,
  executor: () => Promise<string>,
  userId?: string
): Promise<string> {
  const cacheKey = hashArgs(tool, args)
  const ttl = TOOL_CACHE_TTL[tool] ?? TOOL_CACHE_TTL.default
  const now = Date.now()

  // ── Cache hit ───────────────────────────────────────────────────────────────
  const cached = toolCache.get(cacheKey)
  if (cached && cached.expires > now) {
    // Log cache hit (fire-and-forget)
    ensureToolLogTable().then(() =>
      query(
        `INSERT INTO sparkie_tool_log (id, user_id, tool, args_hash, duration_ms, success, cached) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [crypto.randomUUID(), userId ?? null, tool, cacheKey.slice(0, 200), 0, true, true]
      )
    ).catch(() => {})
    return cached.result
  }

  // ── Execute ─────────────────────────────────────────────────────────────────
  const start = Date.now()
  let result = ''
  let success = true
  let errorCode: string | null = null

  try {
    result = await executor()
    // Cache successful results
    toolCache.set(cacheKey, { result, expires: now + ttl })
  } catch (e) {
    success = false
    errorCode = e instanceof Error ? e.message.slice(0, 100) : String(e).slice(0, 100)
    result = `Tool error (${tool}): ${errorCode}`
  }

  const duration = Date.now() - start

  // ── Log (fire-and-forget) ─────────────────────────────────────────────────
  ensureToolLogTable().then(() =>
    query(
      `INSERT INTO sparkie_tool_log (id, user_id, tool, args_hash, duration_ms, success, error_code, cached)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [crypto.randomUUID(), userId ?? null, tool, cacheKey.slice(0, 200), duration, success, errorCode, false]
    )
  ).catch(() => {})

  // ── Failure rate check (async, non-blocking) ─────────────────────────────
  if (!success) {
    checkToolFailureRate(tool).catch(() => {})
  }

  if (!success) throw new Error(result)
  return result
}

/** Check if a tool's failure rate in the last 24h exceeds 30% — logs anomaly to worklog */
async function checkToolFailureRate(tool: string): Promise<void> {
  try {
    await ensureToolLogTable()
    const res = await query<{ total: string; failures: string }>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN success = false THEN 1 ELSE 0 END) AS failures
       FROM sparkie_tool_log
       WHERE tool = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
      [tool]
    )
    const row = res.rows[0]
    const total = parseInt(row?.total ?? '0')
    const failures = parseInt(row?.failures ?? '0')
    if (total >= 5 && failures / total > 0.3) {
      // Log anomaly to worklog — find a userId for this tool
      const userRes = await query<{ user_id: string }>(
        `SELECT user_id FROM sparkie_tool_log WHERE tool = $1 AND user_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
        [tool]
      )
      const uid = userRes.rows[0]?.user_id
      if (uid) {
        const { writeWorklog } = await import('@/lib/worklog')
        await writeWorklog(uid, 'error', `⚠️ Tool anomaly: ${tool} has ${Math.round(failures/total*100)}% failure rate in last 24h (${failures}/${total} calls)`, {
          tool,
          status: 'anomaly',
          decision_type: 'escalate',
          reasoning: `Failure threshold exceeded: ${failures}/${total} calls failed in 24h`
        })
      }
    }
  } catch { /* non-critical */ }
}

/** Clean expired cache entries (call periodically) */
export function pruneToolCache(): void {
  const now = Date.now()
  for (const [key, val] of toolCache.entries()) {
    if (val.expires < now) toolCache.delete(key)
  }
}
