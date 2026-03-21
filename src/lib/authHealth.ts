/**
 * authHealth.ts
 * Phase 1: Auth state verification.
 * 
 * Heartbeat-integrated auth health checker. Pings all connected services
 * with a lightweight request to verify tokens are alive before tasks depend on them.
 * Failures surface immediately in the worklog with reconnect context.
 */

import { query } from '@/lib/db'
import { writeWorklog } from '@/lib/worklog'

export interface AuthStatus {
  service: string
  healthy: boolean
  checked_at: string
  error?: string
  reconnect_url?: string
}

/** Run auth health sweep for a user. Called from heartbeat tick. */
export async function runAuthHealthSweep(userId: string): Promise<AuthStatus[]> {
  const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY
  if (!COMPOSIO_API_KEY) return []

  const results: AuthStatus[] = []
  const services = ['gmail', 'google-calendar', 'github']

  for (const service of services) {
    try {
      const connRes = await fetch(
        `https://backend.composio.dev/api/v3/connected_accounts?user_id=sparkie_user_${userId}&status=ACTIVE&toolkit_slug=${service}&limit=1`,
        { headers: { 'x-api-key': COMPOSIO_API_KEY }, signal: AbortSignal.timeout(5000) }
      )

      if (!connRes.ok) {
        results.push({
          service,
          healthy: false,
          checked_at: new Date().toISOString(),
          error: `HTTP ${connRes.status}`,
          reconnect_url: '/connectors'
        })
        continue
      }

      const connData = await connRes.json() as { items?: Array<{ id: string; status: string }> }
      const conn = connData.items?.[0]
      const healthy = !!conn && conn.status === 'ACTIVE'
      results.push({
        service,
        healthy,
        checked_at: new Date().toISOString(),
        error: healthy ? undefined : 'No active connection found',
        reconnect_url: healthy ? undefined : '/connectors'
      })
    } catch (e) {
      results.push({
        service,
        healthy: false,
        checked_at: new Date().toISOString(),
        error: e instanceof Error ? e.message : String(e),
        reconnect_url: '/connectors'
      })
    }
  }

  // Also check Groq/Deepgram keys (no API call needed — just verify env var present)
  const groqHealthy = !!process.env.GROQ_API_KEY
  const deepgramHealthy = !!process.env.DEEPGRAM_API_KEY
  results.push({ service: 'groq_stt', healthy: groqHealthy, checked_at: new Date().toISOString() })
  results.push({ service: 'deepgram_stt', healthy: deepgramHealthy, checked_at: new Date().toISOString() })

  // ── Social pipeline checks — Composio-connected social accounts ─────────────
  const socialSlugs = ['twitter', 'discord', 'slack', 'instagram', 'reddit', 'tiktok']
  for (const slug of socialSlugs) {
    try {
      const socRes = await fetch(
        `https://backend.composio.dev/api/v3/connected_accounts?user_id=sparkie_user_${userId}&status=ACTIVE&toolkit_slug=${slug}&limit=1`,
        { headers: { 'x-api-key': COMPOSIO_API_KEY }, signal: AbortSignal.timeout(4000) }
      )
      if (!socRes.ok) {
        results.push({ service: slug, healthy: false, checked_at: new Date().toISOString(), error: `HTTP ${socRes.status}`, reconnect_url: '/connectors' })
        continue
      }
      const socData = await socRes.json() as { items?: Array<{ status: string }> }
      const healthy = !!socData.items?.length && socData.items[0].status === 'ACTIVE'
      results.push({ service: slug, healthy, checked_at: new Date().toISOString(), error: healthy ? undefined : 'No active connection', reconnect_url: healthy ? undefined : '/connectors' })
    } catch (e) {
      results.push({ service: slug, healthy: false, checked_at: new Date().toISOString(), error: String(e), reconnect_url: '/connectors' })
    }
  }

  // ── Email pipeline — Resend API key check ──────────────────────────────────
  const resendHealthy = !!process.env.RESEND_API_KEY
  results.push({
    service: 'resend_email',
    healthy: resendHealthy,
    checked_at: new Date().toISOString(),
    error: resendHealthy ? undefined : 'RESEND_API_KEY not set — Resend email disabled',
    reconnect_url: resendHealthy ? undefined : '/settings',
  })

  // Log a social_health_check worklog entry with summary
  const socialResults = results.filter(r => [...socialSlugs, 'resend_email'].includes(r.service))
  const socialHealthy = socialResults.filter(r => r.healthy).map(r => r.service)
  const socialFailed = socialResults.filter(r => !r.healthy).map(r => r.service)
  await writeWorklog(userId, 'auth_check',
    `Communications health sweep: ${socialHealthy.length} connected (${socialHealthy.join(', ') || 'none'})${socialFailed.length > 0 ? ` | ${socialFailed.length} not connected: ${socialFailed.join(', ')}` : ''}`,
    {
      decision_type: 'proactive',
      status: socialFailed.length > 3 ? 'anomaly' : 'done',
      signal_priority: socialFailed.includes('gmail') || socialFailed.includes('resend_email') ? 'P1' : 'P3',
      source: 'communications_health_sweep',
      conclusion: socialFailed.length === 0
        ? `Auth health check passed — all ${socialHealthy.length} communication service(s) connected`
        : `Auth health check complete — ${socialHealthy.length} connected, ${socialFailed.length} not connected (${socialFailed.join(', ')})`,
    } as Record<string, unknown>
  ).catch(() => {})

  // Store auth health state
  try {
    const stateRow = await query(
      `SELECT content FROM user_identity_files WHERE user_id = $1 AND file_type = 'heartbeat_state'`,
      [userId]
    )
    let state: Record<string, unknown> = {}
    try { state = JSON.parse(stateRow.rows[0]?.content ?? '{}') } catch { state = {} }
    state.auth_health = results
    state.auth_health_checked_at = new Date().toISOString()
    await query(
      `INSERT INTO user_identity_files (user_id, file_type, content, updated_at)
       VALUES ($1, 'heartbeat_state', $2, NOW())
       ON CONFLICT (user_id, file_type) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
      [userId, JSON.stringify(state)]
    )
  } catch { /* non-critical */ }

  // Surface any failures to worklog
  const failed = results.filter(r => !r.healthy && r.reconnect_url)
  for (const f of failed) {
    await writeWorklog(userId, 'auth_check', `⚠️ ${f.service} connection appears broken — head to Connectors to reconnect`, {
      service: f.service,
      error: f.error,
      status: 'anomaly',
      decision_type: 'escalate',
      reasoning: `Pre-flight auth sweep detected ${f.service} is not connected. Tasks requiring this service will fail until reconnected.`,
      signal_priority: 'P0',
      conclusion: `${f.service} connection is broken — reconnection required at /connectors to restore functionality`,
    })
  }

  return results
}

/** Quick pre-flight check before a task that requires specific services */
export async function preflightCheck(userId: string, requiredServices: string[]): Promise<{
  ok: boolean
  missing: string[]
}> {
  const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY
  if (!COMPOSIO_API_KEY) return { ok: true, missing: [] } // can't check, assume ok

  const missing: string[] = []
  for (const service of requiredServices) {
    try {
      const connRes = await fetch(
        `https://backend.composio.dev/api/v3/connected_accounts?user_id=sparkie_user_${userId}&status=ACTIVE&toolkit_slug=${service}&limit=1`,
        { headers: { 'x-api-key': COMPOSIO_API_KEY }, signal: AbortSignal.timeout(4000) }
      )
      if (!connRes.ok) { missing.push(service); continue }
      const connData = await connRes.json() as { items?: Array<{ status: string }> }
      if (!connData.items?.length || connData.items[0].status !== 'ACTIVE') {
        missing.push(service)
      }
    } catch {
      missing.push(service)
    }
  }

  return { ok: missing.length === 0, missing }
}
