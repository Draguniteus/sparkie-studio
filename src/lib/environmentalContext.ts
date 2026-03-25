import { query } from '@/lib/db'

export interface EnvironmentalContext {
  deploymentStatus: 'live' | 'deploying' | 'failed' | 'unknown'
  serverHealth: 'healthy' | 'degraded' | 'down'
  currentEnvironment: 'production' | 'staging' | 'development'
  userActivityState: 'active' | 'idle' | 'away' | 'asleep'
  lastUserSeenMs: number          // ms since last activity
  userMode: 'building' | 'thinking' | 'reviewing' | 'unknown'
  lastDeploySha: string
  lastDeployStatus: 'success' | 'failed' | 'unknown'
  autonomyLevel: 'light' | 'normal' | 'heavy' | 'maximum'
}

// ── User activity tracking ────────────────────────────────────────────────────
export async function recordUserActivity(userId: string): Promise<void> {
  try {
    await query(
      `INSERT INTO user_identity_files (user_id, file_type, content, updated_at)
       VALUES ($1, 'last_activity', $2, NOW())
       ON CONFLICT (user_id, file_type) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
      [userId, JSON.stringify({ ts: new Date().toISOString() })]
    )
  } catch { /* non-fatal */ }
}

async function getLastUserActivity(userId: string): Promise<number> {
  try {
    const res = await query<{ updated_at: string }>(
      `SELECT updated_at FROM user_identity_files WHERE user_id = $1 AND file_type = 'last_activity'`,
      [userId]
    )
    if (!res.rows[0]) return Infinity
    return Date.now() - new Date(res.rows[0].updated_at).getTime()
  } catch { return Infinity }
}

function classifyActivityState(msSince: number): EnvironmentalContext['userActivityState'] {
  if (msSince < 2 * 60 * 1000)    return 'active'   // < 2 min
  if (msSince < 30 * 60 * 1000)   return 'idle'     // < 30 min
  if (msSince < 3 * 60 * 60 * 1000) return 'away'   // < 3 hours
  return 'asleep'
}

function getAutonomyLevel(state: EnvironmentalContext['userActivityState']): EnvironmentalContext['autonomyLevel'] {
  switch (state) {
    case 'active':  return 'light'    // User watching — check in fast
    case 'idle':    return 'normal'   // Standard autonomy
    case 'away':    return 'heavy'    // Batch + deliver on return
    case 'asleep':  return 'maximum'  // Full autonomy, deliver on wake
  }
}

// ── Server health check via DO API ────────────────────────────────────────────
async function checkServerHealth(): Promise<'healthy' | 'degraded' | 'down'> {
  try {
    const composioKey = process.env.COMPOSIO_API_KEY
    if (!composioKey) return 'healthy'

    // Check our own API health via a known-good endpoint
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    try {
      const res = await fetch(`${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/api/health`, {
        signal: controller.signal,
        headers: { 'x-internal': 'health-check' }
      })
      clearTimeout(timeout)
      return res.ok ? 'healthy' : 'degraded'
    } catch {
      clearTimeout(timeout)
      return 'down'
    }
  } catch { return 'healthy' } // Assume healthy if check fails
}

// ── Get last deploy status from worklog ─────────────────────────────────────
async function getLastDeployInfo(): Promise<{ sha: string; status: 'success' | 'failed' | 'unknown' }> {
  try {
    const res = await query<{ content: string; metadata: Record<string, unknown> }>(
      `SELECT content, metadata FROM sparkie_worklog
       WHERE type = 'code_push' ORDER BY created_at DESC LIMIT 1`
    )
    if (!res.rows[0]) return { sha: 'unknown', status: 'unknown' }
    const meta = (res.rows[0].metadata ?? {}) as { commit_sha?: string; deploy_status?: string }
    return {
      sha: meta.commit_sha ?? 'unknown',
      status: (meta.deploy_status ?? 'unknown') as 'success' | 'failed' | 'unknown'
    }
  } catch { return { sha: 'unknown', status: 'unknown' } }
}

// ── Build full environmental context ────────────────────────────────────────
export async function buildEnvironmentalContext(userId: string): Promise<EnvironmentalContext> {
  try {
    const [msSince, deployInfo] = await Promise.all([
      getLastUserActivity(userId),
      getLastDeployInfo(),
    ])

    const userActivityState = classifyActivityState(msSince)
    const autonomyLevel = getAutonomyLevel(userActivityState)
    const lastUserSeenMs = msSince === Infinity ? -1 : msSince

    return {
      deploymentStatus: 'live',
      serverHealth: 'healthy', // Populated by heartbeat, not per-request (too slow)
      currentEnvironment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      userActivityState,
      lastUserSeenMs,
      userMode: 'unknown', // Will be inferred by Sparkie from message content
      lastDeploySha: deployInfo.sha,
      lastDeployStatus: deployInfo.status,
      autonomyLevel,
    }
  } catch {
    return {
      deploymentStatus: 'unknown',
      serverHealth: 'healthy',
      currentEnvironment: 'production',
      userActivityState: 'active' as EnvironmentalContext['userActivityState'],
      lastUserSeenMs: -1,
      userMode: 'unknown',
      lastDeploySha: 'unknown',
      lastDeployStatus: 'unknown',
      autonomyLevel: 'normal',
    }
  }
}

// ── Format env context for prompt injection ───────────────────────────────────
export function formatEnvContextBlock(ctx: EnvironmentalContext): string {
  const minsAgo = ctx.lastUserSeenMs >= 0
    ? ctx.lastUserSeenMs < 60000
      ? `${Math.round(ctx.lastUserSeenMs / 1000)}s ago`
      : `${Math.round(ctx.lastUserSeenMs / 60000)}m ago`
    : 'unknown'

  return `## ENVIRONMENT
- Deployment: ${ctx.currentEnvironment} (${ctx.deploymentStatus})
- Last deploy: ${ctx.lastDeploySha} — ${ctx.lastDeployStatus}
- User last seen: ${minsAgo} (${ctx.userActivityState})
- Autonomy level: ${ctx.autonomyLevel}
- User mode: ${ctx.userMode}
${ctx.autonomyLevel === 'light' ? '→ User is watching — respond fast, check in before long tasks' : ''}
${ctx.autonomyLevel === 'heavy' || ctx.autonomyLevel === 'maximum' ? '→ User is away — batch work, deliver summary on return' : ''}`
}

// ── Debounce / presence signal ─────────────────────────────────────────────────
// Check if we should debounce (user just sent rapid-fire messages)
export async function shouldDebounce(userId: string, debounceMs = 800): Promise<boolean> {
  try {
    const res = await query<{ created_at: string }>(
      `SELECT created_at FROM chat_messages WHERE user_id = $1 ORDER BY created_at DESC LIMIT 2`,
      [userId]
    )
    if (res.rows.length < 2) return false
    const gap = new Date(res.rows[0].created_at).getTime() - new Date(res.rows[1].created_at).getTime()
    return gap < debounceMs
  } catch { return false }
}

// ── Conflict detection: is user actively editing a recently changed file? ─────
export async function detectFileConflict(
  userId: string,
  targetFilePath: string
): Promise<{ conflict: boolean; reason: string }> {
  try {
    const msSince = await getLastUserActivity(userId)
    if (msSince > 30 * 1000) return { conflict: false, reason: '' } // User idle > 30s — safe

    // Check if this file was recently pushed in worklog
    const res = await query<{ created_at: string; content: string }>(
      `SELECT created_at, content FROM sparkie_worklog
       WHERE user_id = $1 AND type = 'code_push'
       AND metadata->>'file_path' = $2
       AND created_at > NOW() - INTERVAL '5 minutes'
       ORDER BY created_at DESC LIMIT 1`,
      [userId, targetFilePath]
    )
    if (res.rows.length > 0) {
      return {
        conflict: true,
        reason: `File ${targetFilePath} was modified ${Math.round((Date.now() - new Date(res.rows[0].created_at).getTime()) / 1000)}s ago — user may be actively editing`
      }
    }
    return { conflict: false, reason: '' }
  } catch { return { conflict: false, reason: '' } }
}
