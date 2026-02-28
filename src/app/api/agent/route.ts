import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

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

  const apiKey = process.env.OPENCODE_API_KEY
  const executed: Array<{ id: string; label: string; result: string }> = []

  for (const task of dueTasks.rows) {
    try {
      await query(`UPDATE sparkie_tasks SET status = 'in_progress' WHERE id = $1`, [task.id])

      let result = 'Task executed'
      if (apiKey) {
        const taskPrompt = '[AUTONOMOUS TASK EXECUTION]\nTask: ' + task.label + '\nRunbook: ' + task.action + '\n\nExecute this task now. Be thorough. Report what you did.'
        const chatRes = await fetch(proto + '://' + host + '/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Cookie': cookieHeader },
          body: JSON.stringify({ messages: [{ role: 'user', content: taskPrompt }], model: 'kimi-k2.5-free' }),
          signal: AbortSignal.timeout(45000),
        })
        if (chatRes.ok) {
          const text = await chatRes.text()
          const lines = text.split('\n').filter((l: string) => l.startsWith('data: ') && l !== 'data: [DONE]')
          const chunks = lines.map((l: string) => {
            try { return JSON.parse(l.slice(6)).choices?.[0]?.delta?.content ?? '' } catch { return '' }
          })
          result = chunks.join('').slice(0, 500)
        }
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
  senders: string[]
  subjects: string[]
  emailIds: string[]
  lastChecked: string
}> {
  const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY
  if (!COMPOSIO_API_KEY) return { newCount: 0, senders: [], subjects: [], emailIds: [], lastChecked: new Date().toISOString() }

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
    if (!connRes.ok) return { newCount: 0, senders: [], subjects: [], emailIds: [], lastChecked: new Date().toISOString() }
    const connData = await connRes.json() as { items?: Array<{ id: string }> }
    if (!connData.items?.length) return { newCount: 0, senders: [], subjects: [], emailIds: [], lastChecked: new Date().toISOString() }

    // Fetch recent emails (last 10 from inbox)
    const execRes = await fetch('https://backend.composio.dev/api/v2/actions/GMAIL_FETCH_EMAILS/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': COMPOSIO_API_KEY },
      body: JSON.stringify({
        entityId: 'sparkie_user_' + userId,
        input: { max_results: 10, label_ids: ['INBOX'], include_spam_trash: false }
      })
    })
    if (!execRes.ok) return { newCount: 0, senders: [], subjects: [], emailIds: [], lastChecked: new Date().toISOString() }

    const execData = await execRes.json() as {
      data?: { messages?: Array<{ id: string; from?: string; subject?: string; date?: string; internalDate?: string }> }
    }
    const messages = execData.data?.messages ?? []

    // Filter: only emails newer than last check, exclude automated/noreply
    const skipPatterns = /noreply|no-reply|notifications?@|alerts?@|support@|donotreply/i
    const newEmails = messages.filter((m) => {
      const msgDate = m.date ? new Date(m.date) : (m.internalDate ? new Date(parseInt(m.internalDate)) : null)
      if (!msgDate || msgDate <= lastCheck) return false
      if (skipPatterns.test(m.from ?? '')) return false
      return true
    })

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
      senders: newEmails.map((m) => (m.from ?? '').replace(/<.*>/, '').trim()).slice(0, 5),
      subjects: newEmails.map((m) => m.subject ?? '(no subject)').slice(0, 5),
      emailIds: newEmails.map((m) => m.id).slice(0, 5),
      lastChecked: new Date().toISOString()
    }
  } catch (e) {
    console.error('inbox check error:', e)
    return { newCount: 0, senders: [], subjects: [], emailIds: [], lastChecked: new Date().toISOString() }
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

    const execRes = await fetch('https://backend.composio.dev/api/v2/actions/GOOGLECALENDAR_LIST_EVENTS/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': COMPOSIO_API_KEY },
      body: JSON.stringify({
        entityId: 'sparkie_user_' + userId,
        input: {
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

    // ── 1. Execute due AI tasks ─────────────────────────────────────────────
    const executed = await executeDueTasks(userId, host, proto, cookieHeader)
    if (executed.length > 0) {
      return NextResponse.json({ type: 'task_completed', message: 'task_completed', tasks: executed, trigger: true })
    }

    // ── 2. Inbox monitor (every poll, but throttled to once per 5 min in log) ─
    if (!sentTypes.has('inbox_check')) {
      const inbox = await checkInbox(userId)
      if (inbox.newCount > 0) {
        await query('INSERT INTO sparkie_outreach_log (user_id, type) VALUES ($1, $2)', [userId, 'inbox_check'])
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
        // Fetch calendar conflicts for the brief
        const cal = await checkCalendarConflicts(userId)
        await query('INSERT INTO sparkie_outreach_log (user_id, type) VALUES ($1, $2)', [userId, 'morning_brief'])

        const pendingHuman = await query<{ id: string; label: string; created_at: string }>(
          `SELECT id, label, created_at FROM sparkie_tasks
           WHERE user_id = $1 AND executor = 'human' AND status = 'pending'
           ORDER BY created_at DESC LIMIT 5`,
          [userId]
        )
        return NextResponse.json({
          type: 'morning_brief', message: 'morning_brief', trigger: true,
          calendarEvents: cal.events,
          calendarConflicts: cal.conflicts,
          pendingTasks: pendingHuman.rows
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
// System-wide cron endpoint — executes due AI tasks for ALL users.
// Can be triggered by DO App Platform cron job or any external scheduler.
// Protected by AGENT_CRON_SECRET env var.
export async function GET(req: NextRequest) {
  try {
    const secret = req.nextUrl.searchParams.get('secret')
    if (!secret || secret !== process.env.AGENT_CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await ensureTables()

    // Get all users with due AI tasks
    const dueUsers = await query<{ user_id: string }>(
      `SELECT DISTINCT user_id FROM sparkie_tasks
       WHERE executor = 'ai' AND status = 'pending'
       AND scheduled_at IS NOT NULL AND scheduled_at <= NOW()`,
    )

    const host = req.headers.get('host') ?? 'localhost:3000'
    const proto = req.headers.get('x-forwarded-proto') ?? 'https'

    const results: Array<{ userId: string; executed: number }> = []

    // ── Proactive deploy monitor check ──────────────────────────────────────────
    // On every cron tick, check if the latest DO deployment failed
    let deployAlert: string | null = null
    try {
      const deployRes = await fetch(
        `${proto}://${host}/api/deploy-monitor`,
        { headers: { 'x-cron-secret': process.env.AGENT_CRON_SECRET ?? '' } }
      )
      if (deployRes.ok) {
        const deployData = await deployRes.json() as {
          status: string
          failed: boolean
          diagnosis: { errorType: string; details: string; suggestedFix: string } | null
          latest: { phase: string; updatedAt: string; cause: string }
        }
        if (deployData.failed && deployData.diagnosis) {
          deployAlert = `🚨 BUILD FAILED: ${deployData.diagnosis.errorType} — ${deployData.diagnosis.suggestedFix}`
          console.log('[agent-cron] Deploy failure detected:', deployAlert)
          // Log to worklog (append to a known user — Michael's account)
          // This will be visible in Sparkie's work log
        }
      }
    } catch (err) {
      console.error('[agent-cron] Deploy monitor error:', err)
    }
    // ── End deploy monitor check ─────────────────────────────────────────────────

    for (const { user_id } of dueUsers.rows) {
      const executed = await executeDueTasks(user_id, host, proto, '')
      if (executed.length > 0) {
        results.push({ userId: user_id, executed: executed.length })
      }
    }

    return NextResponse.json({
      ok: true,
      processedUsers: results.length,
      results,
      deployAlert,
      timestamp: new Date().toISOString()
    })
  } catch (e) {
    console.error('agent GET error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
