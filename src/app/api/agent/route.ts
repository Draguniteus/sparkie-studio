import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import { proactiveInboxSweep, proactiveCalendarSweep, deploymentHealthSweep } from '@/lib/scheduler'
import { runTTLDecaySweep } from '@/lib/knowledgeTTL'
import { writeWorklog } from '@/lib/worklog'
import { classifySignalImpact } from '@/lib/signalQueue'
import { getAttempts, formatAttemptBlock } from '@/lib/attemptHistory'
import type { WebSocket } from 'ws'

// ── Push proactive events to WebSocket clients via server.js global registry ─────
// server.js maintains global.__proactiveClients = Array<{ ws: WebSocket, userId: string }>
declare global {
  // eslint-disable-next-line no-var
  var __proactiveClients: Array<{ ws: WebSocket | null; userId: string; sseSend?: (data: string) => void }> | undefined
}

function pushProactiveEvent(userId: string, event: { type: string; subtype: string; data: Record<string, unknown>; timestamp: number }): void {
  const clients: Array<{ ws: { readyState: number; send: (d: string) => void } | null; userId: string }> = global.__proactiveClients ?? []
  for (const c of clients) {
    if (c.userId === userId && c.ws && c.ws.readyState === 1 /* OPEN */) {
      try { c.ws.send(JSON.stringify(event)) } catch (e) { console.error('[proactive push error]', e) }
    }
  }
}

export const runtime = 'nodejs'
export const maxDuration = 60

// ── Helpers ─────────────────────────────────────────────────────────────────

async function ensureTables() {
  await query(`CREATE TABLE IF NOT EXISTS sparkie_outreach_log (
    id SERIAL PRIMARY KEY, user_id TEXT NOT NULL,
    type TEXT NOT NULL, sent_at TIMESTAMPTZ DEFAULT NOW()
  )`).catch(() => {})
  await query(`CREATE INDEX IF NOT EXISTS idx_outreach_user ON sparkie_outreach_log(user_id, sent_at)`).catch(() => {})
  await query(`CREATE TABLE IF NOT EXISTS sparkie_tasks (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, action TEXT NOT NULL, label TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'pending',
    executor TEXT NOT NULL DEFAULT 'human', trigger_type TEXT DEFAULT 'manual',
    trigger_config JSONB DEFAULT '{}', scheduled_at TIMESTAMPTZ, why_human TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(), resolved_at TIMESTAMPTZ
  )`).catch(() => {})
  await query(`ALTER TABLE sparkie_tasks ADD COLUMN IF NOT EXISTS executor TEXT NOT NULL DEFAULT 'human'`).catch(() => {})
  await query(`ALTER TABLE sparkie_tasks ADD COLUMN IF NOT EXISTS trigger_type TEXT DEFAULT 'manual'`).catch(() => {})
  await query(`ALTER TABLE sparkie_tasks ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ`).catch(() => {})
  await query(`ALTER TABLE sparkie_tasks ADD COLUMN IF NOT EXISTS depends_on TEXT`).catch(() => {})
}

/**
 * Compute next scheduled_at from a 5-field cron expression (no npm needed).
 * Handles: exact values, wildcards, step expressions (e.g. every-n), comma lists, ranges.
 * Scans forward minute-by-minute up to 1 year; falls back to +24h if nothing found.
 */
function nextCronTime(expression: string, after: Date = new Date()): Date {
  const parts = expression.trim().split(/\s+/)
  if (parts.length < 5) return new Date(after.getTime() + 24 * 60 * 60 * 1000)
  const [minExpr, hourExpr, domExpr, monthExpr, dowExpr] = parts

  function matchField(expr: string, value: number, min: number, max: number): boolean {
    if (expr === '*') return true
    for (const segment of expr.split(',')) {
      if (segment.includes('/')) {
        const [rangeStr, stepStr] = segment.split('/')
        const step = parseInt(stepStr)
        const rangeStart = rangeStr === '*' ? min : parseInt(rangeStr.split('-')[0])
        const rangeEnd   = rangeStr === '*' ? max : (rangeStr.includes('-') ? parseInt(rangeStr.split('-')[1]) : max)
        for (let v = rangeStart; v <= rangeEnd; v += step) {
          if (v === value) return true
        }
      } else if (segment.includes('-')) {
        const [lo, hi] = segment.split('-').map(Number)
        if (value >= lo && value <= hi) return true
      } else {
        if (parseInt(segment) === value) return true
      }
    }
    return false
  }

  // Scan forward 1 minute at a time, up to 1 year
  const candidate = new Date(after.getTime() + 60_000)
  candidate.setSeconds(0, 0)
  const limit = new Date(after.getTime() + 365 * 24 * 60 * 60 * 1000)

  while (candidate < limit) {
    const min   = candidate.getMinutes()
    const hour  = candidate.getHours()
    const dom   = candidate.getDate()
    const month = candidate.getMonth() + 1 // 1-12
    const dow   = candidate.getDay()       // 0=Sun

    if (
      matchField(monthExpr, month, 1, 12) &&
      matchField(domExpr,   dom,   1, 31) &&
      matchField(dowExpr,   dow,   0, 6)  &&
      matchField(hourExpr,  hour,  0, 23) &&
      matchField(minExpr,   min,   0, 59)
    ) {
      return new Date(candidate)
    }
    candidate.setTime(candidate.getTime() + 60_000)
  }

  // Fallback: +24h
  return new Date(after.getTime() + 24 * 60 * 60 * 1000)
}

/** Execute due AI tasks for a given userId — shared by POST and GET handlers */
async function executeDueTasks(userId: string, host: string, proto: string, cookieHeader: string) {
  // Build work context from active topics for signal classification
  const activeTopics = await query<{ id: string; name: string; cognition_state: Record<string, unknown> }>(
    `SELECT id, name, cognition_state FROM sparkie_topics WHERE user_id = $1 AND status = 'active' LIMIT 10`,
    [userId]
  )
  const workContext = activeTopics.rows.map(t => t.name).join(' ')

  const dueTasks = await query<{
    id: string; label: string; action: string; trigger_type: string; trigger_config: Record<string, unknown>
  }>(
    `SELECT id, label, action, trigger_type, trigger_config FROM sparkie_tasks
     WHERE user_id = $1 AND executor = 'ai' AND status = 'pending'
     AND scheduled_at IS NOT NULL AND scheduled_at <= NOW()
     ORDER BY scheduled_at ASC LIMIT 5`,
    [userId]
  )

  if (dueTasks.rows.length === 0) return []

  const apiKey = process.env.MINIMAX_API_KEY ?? ''
  const executed: Array<{ id: string; label: string; result: string }> = []

  for (const task of dueTasks.rows) {
    // Classify signal impact before executing — skip if context was invalidated
    const impactSignal = { id: 'pre_exec', type: 'tool_result' as const, priority: 'P2' as const, payload: { taskId: task.id, topicId: activeTopics.rows[0]?.id }, created_at: Date.now(), stale_after: Date.now() + 600000, userId }
    const impact = classifySignalImpact(impactSignal, workContext)
    if (impact === 'cancel' || impact === 'invalidate') {
      await query(`UPDATE sparkie_tasks SET status = 'skipped' WHERE id = $1`, [task.id]).catch(() => {})
      continue
    }
    try {
      await query(`UPDATE sparkie_tasks SET status = 'in_progress' WHERE id = $1`, [task.id])

      let result = 'Task executed'
      if (apiKey) {
        // ── Orchestrator loop ──────────────────────────────────────────────
        // Instead of one-shot /api/chat, we run up to MAX_PASSES sequential
        // passes, feeding each pass's full output back as conversation context.
        // This lets the model execute 40+ tool calls across a long task
        // (e.g. scrape 100 pages, process each, aggregate) instead of capping
        // at ~10 rounds per single chat session.
        const MAX_PASSES = 1    // Single pass — if it doesn't complete in one shot, it won't in two
        const PASS_TIMEOUT_MS = 50_000  // 50s — fits within 60s maxDuration with 10s buffer
        const internalSecret = process.env.SPARKIE_INTERNAL_SECRET ?? ''

        // ── Skill auto-trigger ────────────────────────────────────────────
        // 1. Manual prefix: if action starts with read_skill({name:"..."}), strip it
        //    and add that skill name to the load set.
        // 2. Auto-detect: scan action text for known skill keywords and load those too.
        // All matched skills are deduplicated and loaded in one parallel query batch.
        let skillContext = ''
        let actionRunbook = task.action

        const detectedSkillNames = new Set<string>()

        // Manual read_skill({name:'...'}) prefix (backwards compat)
        const skillMatch = task.action.match(/^\s*read_skill\(\{\s*name:\s*["']([^"']+)["']\s*\}\)\s*;?\s*\n?/)
        if (skillMatch) {
          detectedSkillNames.add(skillMatch[1])
          actionRunbook = task.action.slice(skillMatch[0].length).trimStart()
        }

        // Auto-detect skills from action content
        const SKILL_TRIGGERS: Array<{ keywords: RegExp; skillName: string }> = [
          { keywords: /\b(email|gmail|inbox|reply|send.*mail|draft.*email|read.*email)\b/i, skillName: 'email' },
          { keywords: /\b(tweet|twitter|post.*social|instagram|tiktok|social.*media)\b/i, skillName: 'social' },
          { keywords: /\b(calendar|schedule|event|meeting|google.?calendar)\b/i, skillName: 'calendar' },
          { keywords: /\b(browse|browser|hyperbrowser|scrape|screenshot)\b/i, skillName: 'browser-use' },
        ]
        for (const trigger of SKILL_TRIGGERS) {
          if (trigger.keywords.test(task.action)) {
            detectedSkillNames.add(trigger.skillName)
          }
        }

        // Load all detected skills in parallel
        if (detectedSkillNames.size > 0) {
          const skillLoads = await Promise.all(
            [...detectedSkillNames].map(async (name) => {
              try {
                const row = await query<{ content: string }>(
                  `SELECT content FROM sparkie_skills WHERE name = $1 LIMIT 1`,
                  [name]
                )
                if (row.rows[0]?.content) {
                  console.log('[orchestrator] Loaded skill:', name, '(' + row.rows[0].content.length + ' chars)')
                  return '\n\n--- SKILL CONTEXT: ' + name + ' ---\n' + row.rows[0].content + '\n--- END SKILL CONTEXT ---'
                } else {
                  console.warn('[orchestrator] Skill not found:', name)
                  return ''
                }
              } catch (err) {
                console.error('[orchestrator] Skill load error for', name, ':', err)
                return ''
              }
            })
          )
          skillContext = skillLoads.join('')
        }

        // ── Attempt history injection — learn from past failures before acting ───
        const DOMAIN_PATTERNS: Array<{ keywords: RegExp; domain: string }> = [
          { keywords: /\b(github|git push|commit|branch|pr|pull.request|repo)\b/i, domain: 'github' },
          { keywords: /\b(email|gmail|inbox|send.*mail|draft.*email|reply)\b/i, domain: 'email' },
          { keywords: /\b(calendar|schedule|event|meeting|google.?calendar)\b/i, domain: 'calendar' },
          { keywords: /\b(tweet|twitter|post.*social|instagram|tiktok|social.?post)\b/i, domain: 'social' },
          { keywords: /\b(deploy|do.?deploy|digitalocean|build|rollback)\b/i, domain: 'deploy' },
          { keywords: /\b(image|gen\.|pollinations|stable.?diffusion|midjourney)\b/i, domain: 'image_gen' },
          { keywords: /\b(video|hailuo|minimax.?video|generate.?video)\b/i, domain: 'video_gen' },
          { keywords: /\b(music|suno|ace.?music|generate.?music)\b/i, domain: 'music_gen' },
          { keywords: /\b(search.?web|tavily|web.?search|look.?up)\b/i, domain: 'search' },
          { keywords: /\b(database|query|postgres|sql|read.?db)\b/i, domain: 'database' },
        ]
        let attemptHistoryContext = ''
        const detectedDomains = new Set<string>()
        for (const p of DOMAIN_PATTERNS) {
          if (p.keywords.test(task.action)) detectedDomains.add(p.domain)
        }
        if (detectedDomains.size > 0) {
          const attemptBlocks = await Promise.all(
            [...detectedDomains].map(async (domain) => {
              const attempts = await getAttempts(userId, domain, 5)
              return formatAttemptBlock(attempts)
            })
          )
          attemptHistoryContext = attemptBlocks.filter(b => b.length > 0).join('\n')
          if (attemptHistoryContext) {
            console.log('[orchestrator] Attempt history loaded for domains:', [...detectedDomains].join(', '))
          }
        }

        const hitlRules = '\n\n⚠️ AUTONOMOUS EXECUTION RULES (always apply):\n- HITL required: NEVER send emails, calendar invites, or social posts without create_task → send_card_to_user approval first.\n- Read before write: Always get_github to read file content before patching or committing.\n- Checkpoint: Use workspace_write to save progress between steps on multi-step tasks.\n- On completion: Output a concise summary of exactly what was accomplished.'

        const taskPrompt = '[AUTONOMOUS TASK EXECUTION]\nTask: ' + task.label + skillContext + (attemptHistoryContext ? '\n\n' + attemptHistoryContext : '') + hitlRules + '\n\nRunbook: ' + actionRunbook + '\n\nExecute this task now. Be thorough. Use all tools available. When fully done, output a concise summary of what was accomplished.'

        // Conversation history accumulates across passes
        const conversation: Array<{ role: string; content: string }> = [
          { role: 'user', content: taskPrompt }
        ]

        let finalOutput = ''
        let passCount = 0
        let consecutiveErrors = 0
        const MAX_CONSECUTIVE_ERRORS = 3

        while (passCount < MAX_PASSES) {
          passCount++
          let passOutput = ''
          let hitToolLimit = false

          try {
            const chatRes = await fetch(proto + '://' + host + '/api/chat', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-internal-user-id': userId,
                'x-internal-secret': internalSecret,
                'x-autonomous-task': 'true',
                'x-sparkie-mode': 'agent_sweep',
              },
              body: JSON.stringify({
                messages: conversation,
              }),
              signal: AbortSignal.timeout(PASS_TIMEOUT_MS),
            })

            if (!chatRes.ok) {
              console.error('[orchestrator] pass', passCount, 'HTTP', chatRes.status)
              consecutiveErrors++
              if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                console.error(`[orchestrator] stopping after ${MAX_CONSECUTIVE_ERRORS} consecutive errors`)
                break
              }
              continue
            }

            consecutiveErrors = 0

            // Parse SSE stream — collect content chunks and detect tool-limit signal
            const text = await chatRes.text()
            const sseLines = text.split('\n')
            for (const line of sseLines) {
              if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
              try {
                const evt = JSON.parse(line.slice(6))
                const delta = evt.choices?.[0]?.delta
                if (delta?.content) passOutput += delta.content
                // Detect if the model hit its round cap (it emits a marker in content)
                if (delta?.content && (
                  delta.content.includes('Maximum Effort') ||
                  delta.content.includes('MAX_TOOL_ROUNDS') ||
                  delta.content.includes('round limit')
                )) {
                  hitToolLimit = true
                }
              } catch { /* skip malformed chunks */ }
            }
          } catch (fetchErr) {
            console.error('[orchestrator] pass', passCount, 'error:', fetchErr)
            consecutiveErrors++
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
              console.error(`[orchestrator] stopping after ${MAX_CONSECUTIVE_ERRORS} consecutive errors`)
              break
            }
          }

          if (!passOutput) break

          finalOutput = passOutput // last non-empty pass wins
          conversation.push({ role: 'assistant', content: passOutput })

          // Stop if model didn't hit its tool cap — it completed naturally
          if (!hitToolLimit) break

          // Otherwise continue: prime the next pass to pick up where we left off
          conversation.push({
            role: 'user',
            content: 'You hit your tool execution limit. Continue from where you left off and complete the remaining work.'
          })
        }

        result = finalOutput.slice(0, 1000) || 'Task executed (no output)'
      }

      // Cron tasks re-queue, delay/manual tasks complete
      if (task.trigger_type === 'cron') {
        const expr = (task.trigger_config as { expression?: string }).expression ?? '0 9 * * 1'
        const nextTime = nextCronTime(expr)
        await query(
          `UPDATE sparkie_tasks SET status = 'pending', scheduled_at = $2 WHERE id = $1`,
          [task.id, nextTime.toISOString()]
        )
      } else {
        await query(`UPDATE sparkie_tasks SET status = 'completed', resolved_at = NOW() WHERE id = $1`, [task.id])
      }

      executed.push({ id: task.id, label: task.label, result })
    } catch (e) {
      await query(`UPDATE sparkie_tasks SET status = 'failed' WHERE id = $1`, [task.id])
      console.error('Task ' + task.id + ' failed:', e)
    }
  }

  return executed
}

/** Check Composio for user's Gmail new emails since last check */
async function checkInbox(userId: string): Promise<{
  newCount: number
  filteredCount: number
  senders: string[]
  subjects: string[]
  emailIds: string[]
  lastChecked: string
}> {
  const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY
  if (!COMPOSIO_API_KEY) return { newCount: 0, filteredCount: 0, senders: [], subjects: [], emailIds: [], lastChecked: new Date().toISOString() }

  try {
    // Get last inbox check time from identity files (heartbeat_state)
    const stateRow = await query(
      `SELECT content FROM user_identity_files WHERE user_id = $1 AND file_type = 'heartbeat_state'`,
      [userId]
    )
    let heartbeatState: { last_inbox_check?: string } = {}
    try { heartbeatState = JSON.parse(stateRow.rows[0]?.content ?? '{}') } catch { heartbeatState = {} }
    const lastCheck = heartbeatState.last_inbox_check
      ? new Date(heartbeatState.last_inbox_check)
      : new Date(Date.now() - 24 * 60 * 60 * 1000) // default: 24h ago

    // Verify user has gmail connected via Composio
    const connRes = await fetch(
      'https://backend.composio.dev/api/v3/connected_accounts?user_id=sparkie_user_' + userId + '&status=ACTIVE&toolkit_slug=gmail&limit=1',
      { headers: { 'x-api-key': COMPOSIO_API_KEY } }
    )
    if (!connRes.ok) return { newCount: 0, filteredCount: 0, senders: [], subjects: [], emailIds: [], lastChecked: new Date().toISOString() }
    const connData = await connRes.json() as { items?: Array<{ id: string }> }
    if (!connData.items?.length) return { newCount: 0, filteredCount: 0, senders: [], subjects: [], emailIds: [], lastChecked: new Date().toISOString() }

    // Fetch recent emails (last 10 from inbox)
    const execRes = await fetch('https://backend.composio.dev/api/v3/tools/execute/GMAIL_FETCH_EMAILS', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': COMPOSIO_API_KEY },
      body: JSON.stringify({
        entity_id: 'sparkie_user_' + userId,
        arguments: { max_results: 10, label_ids: ['INBOX'], include_spam_trash: false }
      }),
      signal: AbortSignal.timeout(20000),
    })
    if (!execRes.ok) return { newCount: 0, filteredCount: 0, senders: [], subjects: [], emailIds: [], lastChecked: new Date().toISOString() }

    const execData = await execRes.json() as {
      data?: { messages?: Array<{ id: string; from?: string; subject?: string; date?: string; internalDate?: string }> }
    }
    const messages = execData.data?.messages ?? []

    // Filter: only emails newer than last check
    // Phase 1: Exclude trash/deleted/spam at both API level (include_spam_trash: false)
    // and client-side (label check + skip patterns)
    const skipPatterns = /noreply|no-reply|notifications?@|alerts?@|support@|donotreply/i
    const skipLabels = new Set(['TRASH', 'DELETED', 'SPAM', 'CATEGORY_PROMOTIONS'])
    const allMessages = messages
    const newEmails = messages.filter((m: { id: string; from?: string; subject?: string; date?: string; internalDate?: string; labelIds?: string[] }) => {
      const msgDate = m.date ? new Date(m.date) : (m.internalDate ? new Date(parseInt(m.internalDate)) : null)
      if (!msgDate || msgDate <= lastCheck) return false
      if (skipPatterns.test(m.from ?? '')) return false
      // Exclude if any skip labels present
      if (m.labelIds?.some((l: string) => skipLabels.has(l))) return false
      return true
    })
    const filteredCount = allMessages.length - newEmails.length

    // Update last check time
    const newState = { ...heartbeatState, last_inbox_check: new Date().toISOString() }
    await query(
      `INSERT INTO user_identity_files (user_id, file_type, content, updated_at)
       VALUES ($1, 'heartbeat_state', $2, NOW())
       ON CONFLICT (user_id, file_type) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
      [userId, JSON.stringify(newState)]
    )

    return {
      newCount: newEmails.length,
      filteredCount,
      senders: newEmails.map((m: { from?: string }) => (m.from ?? '').replace(/<.*>/, '').trim()).slice(0, 5),
      subjects: newEmails.map((m: { subject?: string }) => m.subject ?? '(no subject)').slice(0, 5),
      emailIds: newEmails.map((m: { id: string }) => m.id).slice(0, 5),
      lastChecked: new Date().toISOString()
    }
  } catch (e) {
    console.error('inbox check error:', e)
    return { newCount: 0, filteredCount: 0, senders: [], subjects: [], emailIds: [], lastChecked: new Date().toISOString() }
  }
}

/** Check Google Calendar for today's events and detect conflicts */
async function checkCalendarConflicts(userId: string): Promise<{
  events: Array<{ summary: string; start: string; end: string }>
  conflicts: Array<{ a: string; b: string; time: string }>
}> {
  const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY
  if (!COMPOSIO_API_KEY) return { events: [], conflicts: [] }

  try {
    const connRes = await fetch(
      'https://backend.composio.dev/api/v3/connected_accounts?user_id=sparkie_user_' + userId + '&status=ACTIVE&toolkit_slug=google-calendar&limit=1',
      { headers: { 'x-api-key': COMPOSIO_API_KEY } }
    )
    if (!connRes.ok) return { events: [], conflicts: [] }
    const connData = await connRes.json() as { items?: Array<{ id: string }> }
    if (!connData.items?.length) return { events: [], conflicts: [] }

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)

    const execRes = await fetch('https://backend.composio.dev/api/v3/tools/execute/GOOGLECALENDAR_LIST_EVENTS', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': COMPOSIO_API_KEY },
      body: JSON.stringify({
        entity_id: 'sparkie_user_' + userId,
        arguments: {
          calendar_id: 'primary',
          time_min: todayStart.toISOString(),
          time_max: todayEnd.toISOString(),
          max_results: 20,
          single_events: true,
          order_by: 'startTime'
        }
      })
    })
    if (!execRes.ok) return { events: [], conflicts: [] }

    const execData = await execRes.json() as {
      data?: { items?: Array<{ summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }> }
    }
    const items = execData.data?.items ?? []

    const events = items
      .filter((e) => e.start?.dateTime) // timed events only
      .map((e) => ({
        summary: e.summary ?? 'Untitled Event',
        start: e.start?.dateTime ?? '',
        end: e.end?.dateTime ?? ''
      }))

    // Detect overlaps
    const conflicts: Array<{ a: string; b: string; time: string }> = []
    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const aStart = new Date(events[i].start).getTime()
        const aEnd = new Date(events[i].end).getTime()
        const bStart = new Date(events[j].start).getTime()
        const bEnd = new Date(events[j].end).getTime()
        if (aStart < bEnd && bStart < aEnd) {
          const timeStr = new Date(Math.max(aStart, bStart)).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
          conflicts.push({ a: events[i].summary, b: events[j].summary, time: timeStr })
        }
      }
    }

    return { events, conflicts }
  } catch (e) {
    console.error('calendar check error:', e)
    return { events: [], conflicts: [] }
  }
}

/** Quick deploy status check via DO API — returns 'ACTIVE', 'BUILDING', 'FAILED', or 'UNKNOWN' */
async function checkDeployStatus(): Promise<{ phase: string; url: string }> {
  const DO_API_TOKEN = process.env.DO_API_TOKEN
  const APP_ID = 'fb3d58ac-f1b5-4e65-89b5-c12834d8119a'
  if (!DO_API_TOKEN) return { phase: 'UNKNOWN', url: '' }
  try {
    const res = await fetch(
      `https://api.digitalocean.com/v2/apps/${APP_ID}/deployments?per_page=1`,
      { headers: { Authorization: 'Bearer ' + DO_API_TOKEN }, signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) return { phase: 'UNKNOWN', url: '' }
    const data = await res.json() as {
      deployments?: Array<{ phase?: string; progress?: { success_steps?: number; total_steps?: number } }>
    }
    const latest = data.deployments?.[0]
    return { phase: latest?.phase ?? 'UNKNOWN', url: '' }
  } catch {
    return { phase: 'UNKNOWN', url: '' }
  }
}

// ── POST /api/agent ──────────────────────────────────────────────────────────
// Called by client every 60s when tab is focused.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user as { id?: string } | undefined)?.id
    if (!userId) return NextResponse.json({ message: null, type: null })

    const { currentHour } = await req.json() as { currentHour?: number }
    await ensureTables()

    const hour = currentHour ?? new Date().getHours()

    const sentToday = await query<{ type: string }>(
      `SELECT type FROM sparkie_outreach_log WHERE user_id = $1 AND sent_at > NOW() - INTERVAL '12 hours'`,
      [userId]
    )
    const sentTypes = new Set(sentToday.rows.map((r) => r.type))

    const host = req.headers.get('host') ?? 'localhost:3000'
    const proto = req.headers.get('x-forwarded-proto') ?? 'https'
    const cookieHeader = req.headers.get('cookie') ?? ''

    // ── 0. Recover stuck in_progress tasks (same as GET cron) ──────────────
    await query(
      `UPDATE sparkie_tasks SET status = 'pending'
       WHERE user_id = $1 AND status = 'in_progress' AND created_at < NOW() - INTERVAL '5 minutes'`,
      [userId]
    ).catch((e) => console.error('[agent POST] stuck task recovery error:', e))

    // ── 1. Execute due AI tasks ─────────────────────────────────────────────
    const executed = await executeDueTasks(userId, host, proto, cookieHeader)
    if (executed.length > 0) {
      // Push via WebSocket for real-time delivery to connected clients
      pushProactiveEvent(userId, { type: 'proactive', subtype: 'task_completed', data: { tasks: executed }, timestamp: Date.now() })
      return NextResponse.json({ type: 'task_completed', message: 'task_completed', tasks: executed, trigger: true })
    }

    // ── 2. Inbox monitor (every poll, but throttled to once per 5 min in log) ─
    if (!sentTypes.has('inbox_check')) {
      const inbox = await checkInbox(userId)
      if (inbox.newCount > 0) {
        await query('INSERT INTO sparkie_outreach_log (user_id, type) VALUES ($1, $2)', [userId, 'inbox_check'])
        pushProactiveEvent(userId, { type: 'proactive', subtype: 'inbox_check', data: { newCount: inbox.newCount, senders: inbox.senders, subjects: inbox.subjects }, timestamp: Date.now() })
        return NextResponse.json({ type: 'inbox_check', message: 'inbox_check', trigger: true, ...inbox })
      }
    }

    // ── 3. Morning brief (8–11am, once per 12h window) ─────────────────────
    if (hour >= 8 && hour < 11 && !sentTypes.has('morning_brief')) {
      const recentActivity = await query<{ last_seen_at: Date }>(
        'SELECT last_seen_at FROM user_sessions WHERE user_id = $1', [userId]
      )
      const lastSeen = recentActivity.rows[0]?.last_seen_at
      const hoursSince = lastSeen ? (Date.now() - new Date(lastSeen).getTime()) / 3600000 : 999

      if (hoursSince > 5) {
        // Fetch all morning brief components in parallel
        const [cal, inbox, deploy, pendingHumanResult] = await Promise.all([
          checkCalendarConflicts(userId),
          checkInbox(userId),
          checkDeployStatus(),
          query<{ id: string; label: string; created_at: string }>(
            `SELECT id, label, created_at FROM sparkie_tasks
             WHERE user_id = $1 AND executor = 'human' AND status = 'pending'
             ORDER BY created_at DESC LIMIT 5`,
            [userId]
          ),
        ])

        await query('INSERT INTO sparkie_outreach_log (user_id, type) VALUES ($1, $2)', [userId, 'morning_brief'])

        pushProactiveEvent(userId, { type: 'proactive', subtype: 'morning_brief', data: {
          calendarEvents: cal.events, calendarConflicts: cal.conflicts,
          pendingTasks: pendingHumanResult.rows, inboxNewCount: inbox.newCount,
          inboxSenders: inbox.senders, deployPhase: deploy.phase,
        }, timestamp: Date.now() })
        return NextResponse.json({
          type: 'morning_brief', message: 'morning_brief', trigger: true,
          calendarEvents: cal.events,
          calendarConflicts: cal.conflicts,
          pendingTasks: pendingHumanResult.rows,
          inboxNewCount: inbox.newCount,
          inboxSenders: inbox.senders,
          deployPhase: deploy.phase,
        })
      }
    }

    // ── 4. Inactivity check-in (3+ days away, once per 12h) ───────────────
    if (!sentTypes.has('checkin')) {
      const sessions = await query<{ last_seen_at: Date }>(
        'SELECT last_seen_at FROM user_sessions WHERE user_id = $1', [userId]
      )
      const lastSeen = sessions.rows[0]?.last_seen_at
      if (lastSeen) {
        const daysSince = (Date.now() - new Date(lastSeen).getTime()) / (1000 * 60 * 60 * 24)
        if (daysSince >= 3) {
          const memories = await query<{ content: string }>(
            'SELECT content FROM user_memories WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3', [userId]
          )
          const memoryHints = memories.rows.map((r) => r.content).join('; ')
          await query('INSERT INTO sparkie_outreach_log (user_id, type) VALUES ($1, $2)', [userId, 'checkin'])
          pushProactiveEvent(userId, { type: 'proactive', subtype: 'checkin', data: { daysSince: Math.floor(daysSince), memoryHints }, timestamp: Date.now() })
          return NextResponse.json({
            type: 'checkin', message: 'checkin', trigger: true,
            daysSince: Math.floor(daysSince), memoryHints
          })
        }
      }
    }

    // ── 5. Pending human tasks nudge ───────────────────────────────────────
    const pendingHuman = await query<{ id: string; label: string; created_at: string }>(
      `SELECT id, label, created_at FROM sparkie_tasks
       WHERE user_id = $1 AND executor = 'human' AND status = 'pending'
       ORDER BY created_at DESC LIMIT 5`,
      [userId]
    )
    if (pendingHuman.rows.length > 0 && !sentTypes.has('pending_tasks')) {
      return NextResponse.json({
        message: null, type: null, trigger: false, pendingTasks: pendingHuman.rows
      })
    }

    return NextResponse.json({ message: null, type: null, trigger: false })
  } catch {
    return NextResponse.json({ message: null, type: null, trigger: false })
  }
}

// ── GET /api/agent?secret=X ──────────────────────────────────────────────────
// External cron endpoint (cron-job.org every 15 min).
// Runs ALL proactive sweeps for every active user — inbox, calendar, deployment,
// TTL decay, and any due AI tasks. Does NOT require a logged-in session.
// Protected by AGENT_CRON_SECRET env var.
export async function GET(req: NextRequest) {
  try {
    const secret = req.nextUrl.searchParams.get('secret')
    if (!secret || secret !== process.env.AGENT_CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await ensureTables()

    const host  = req.headers.get('host') ?? 'localhost:3000'
    const proto = req.headers.get('x-forwarded-proto') ?? 'https'

    // ── Recover stuck in_progress tasks before anything else ─────────────────
    await query(
      `UPDATE sparkie_tasks SET status = 'pending'
       WHERE status = 'in_progress' AND created_at < NOW() - INTERVAL '5 minutes'`
    ).catch(() => {})

    // ── Issue 5: Clean up stale GMAIL_MODIFY_MESSAGE failures on agent startup ──
    await query(
      `UPDATE sparkie_tasks SET status = 'failed' WHERE status = 'pending' AND label LIKE '%GMAIL_MODIFY_MESSAGE%'`
    ).catch(() => {})

    // ── Get ALL active users (seen within 30 days) ────────────────────────────
    // This is the primary fix: we must process EVERY active user, not just those
    // who happen to have due AI tasks in sparkie_tasks.
    let userIds: string[] = []

    const sessionUsers = await query<{ user_id: string }>(
      `SELECT DISTINCT user_id FROM user_sessions
       WHERE last_seen_at > NOW() - INTERVAL '30 days'`
    ).catch(() => ({ rows: [] as { user_id: string }[] }))

    userIds = sessionUsers.rows.map(r => r.user_id)

    // Fallback: derive user IDs from sparkie tables if user_sessions is empty
    // (handles case where user_sessions hasn't been written yet)
    if (userIds.length === 0) {
      const fallback = await query<{ user_id: string }>(
        `SELECT DISTINCT user_id FROM (
           SELECT user_id FROM sparkie_tasks
           UNION
           SELECT user_id FROM sparkie_outreach_log
           UNION
           SELECT user_id FROM user_identity_files
         ) u LIMIT 20`
      ).catch(() => ({ rows: [] as { user_id: string }[] }))
      userIds = fallback.rows.map(r => r.user_id)
    }

    console.log(`[agent-cron] Processing ${userIds.length} active user(s)`)

    // ── Global: TTL decay sweep (once per cron tick, not per-user) ────────────
    const staleFlagged = await runTTLDecaySweep().catch(() => 0)
    if (staleFlagged > 0) {
      console.log(`[agent-cron] TTL sweep: ${staleFlagged} stale memories flagged`)
    }

    // ── Global: deploy monitor check ──────────────────────────────────────────
    let deployAlert: string | null = null
    try {
      const deployRes = await fetch(
        `${proto}://${host}/api/deploy-monitor`,
        { headers: { 'x-cron-secret': process.env.AGENT_CRON_SECRET ?? '' } }
      )
      if (deployRes.ok) {
        const deployData = await deployRes.json() as {
          failed: boolean
          diagnosis: { errorType: string; suggestedFix: string } | null
        }
        if (deployData.failed && deployData.diagnosis) {
          deployAlert = `🚨 BUILD FAILED: ${deployData.diagnosis.errorType} — ${deployData.diagnosis.suggestedFix}`
          console.log('[agent-cron] Deploy failure detected:', deployAlert)
        }
      }
    } catch (err) {
      console.error('[agent-cron] Deploy monitor error:', err)
    }

    // ── Per-user sweeps ───────────────────────────────────────────────────────
    const results: Array<{ userId: string; tasksExecuted: number; sweeps: string[] }> = []

    for (const userId of userIds) {
      const sweepsRun: string[] = []
      try {
        // 1. Inbox sweep — checks Gmail via Composio, queues autonomous review tasks
        await proactiveInboxSweep(userId).catch(() => {})
        sweepsRun.push('inbox')

        // 2. Calendar sweep — surfaces upcoming events to worklog
        await proactiveCalendarSweep(userId).catch(() => {})
        sweepsRun.push('calendar')

        // 3. Deployment health sweep — detects DO build failures, auto-retries transients
        await deploymentHealthSweep(userId).catch(() => {})
        sweepsRun.push('deployment')

        // 4. Execute any due AI tasks for this user
        const executed = await executeDueTasks(userId, host, proto, '')
        if (executed.length > 0) sweepsRun.push(`${executed.length}_tasks`)

        // 4b. L6 proactive work queue — process queued AI actions from topic cognition
        try {
          const topicsWithWork = await query<{ id: string; name: string; cognition_state: Record<string, unknown> }>(
            `SELECT id, name, cognition_state FROM sparkie_topics
             WHERE user_id = $1 AND status = 'active'
             AND cognition_state IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM jsonb_object_keys(COALESCE(cognition_state->'L6_action_chain', '{}')) AS k(k) WHERE k = 'ai'
             )`,
            [userId]
          )
          for (const topic of topicsWithWork.rows) {
            const chain = (topic.cognition_state?.L6_action_chain as { ai?: string[]; user?: string[]; waiting?: string[] }) ?? {}
            const aiActions = chain.ai ?? []
            if (aiActions.length > 0) {
              const nextAction = aiActions[0]
              const taskId = `l6_task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
              await query(
                `INSERT INTO sparkie_tasks (id, user_id, action, label, payload, status, executor, trigger_type, depends_on)
                 VALUES ($1, $2, $3, $4, '{}', 'pending', 'ai', 'manual', NULL)`,
                [taskId, userId, nextAction, `L6 queued: ${nextAction.slice(0, 80)}`]
              ).catch(() => {})
              const remaining = aiActions.slice(1)
              await query(
                `UPDATE sparkie_topics SET cognition_state = jsonb_set(cognition_state, '{L6_action_chain,ai}', $1), updated_at = NOW() WHERE id = $2`,
                [JSON.stringify(remaining), topic.id]
              ).catch(() => {})
              sweepsRun.push('l6_queue')
            }
          }
        } catch (e) { console.error('[agent-cron] L6 queue error:', e) }

        // 5. Log the cron sweep to worklog so it's visible in Sparkie's brain
        await writeWorklog(
          userId,
          'cron_sweep',
          `🕐 Cron sweep complete — inbox ✓ calendar ✓ deployment ✓${executed.length > 0 ? ` · ${executed.length} task(s) executed` : ''}${staleFlagged > 0 ? ` · ${staleFlagged} stale memories flagged` : ''}`,
          {
            status: 'done',
            decision_type: 'proactive',
            reasoning: 'External cron tick (cron-job.org, every 15 min) — running all proactive sweeps server-side',
            signal_priority: 'P3',
            conclusion: `Cron sweep finished — inbox, calendar, and deployment checked${executed.length > 0 ? `; ${executed.length} task(s) executed` : ''}`,
          }
        ).catch(() => {})

        results.push({ userId, tasksExecuted: executed.length, sweeps: sweepsRun })
        console.log(`[agent-cron] User ${userId}: sweeps=${sweepsRun.join(',')}`)
      } catch (userErr) {
        console.error(`[agent-cron] Error processing user ${userId}:`, userErr)
      }
    }

    return NextResponse.json({
      ok: true,
      processedUsers: userIds.length,
      results,
      deployAlert,
      staleFlagged,
      timestamp: new Date().toISOString(),
    })
  } catch (e) {
    console.error('agent GET error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
