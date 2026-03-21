import { query } from '@/lib/db'
import { writeWorklog } from '@/lib/worklog'
import { runAuthHealthSweep } from '@/lib/authHealth'
import { classifyHeartbeatSignal } from '@/lib/signalQueue'
import { pruneToolCache } from '@/lib/toolCallWrapper'
import { loadReadyDeferredIntents, markDeferredIntentSurfaced } from '@/lib/timeModel'
import { runTTLDecaySweep } from '@/lib/knowledgeTTL'
import { computeUserModel } from '@/lib/userModel'

// ── Proactive inbox/calendar loop (Phase 6) ────────────────────────────────
const COMPOSIO_BASE = 'https://backend.composio.dev/api/v3'
const COMPOSIO_KEY  = process.env.COMPOSIO_API_KEY ?? ''
const INTERNAL_BASE = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'

// ── Phase 4: Topic Routing ─────────────────────────────────────────────────
// Classifies incoming emails and routes them to matching sparkie_topics by fingerprint/aliases.
// Honors each topic's notification_policy (immediate/defer/auto).

async function routeEmailToTopic(
  userId: string,
  emailId: string,
  subject: string,
  fromEmail: string,
  snippet: string
): Promise<string | null> {
  try {
    // Fetch all active topics for this user
    const topics = await query<{
      id: string
      name: string
      fingerprint: string
      aliases: string[]
      notification_policy: string
    }>(
      `SELECT id, name, fingerprint, aliases, notification_policy
       FROM sparkie_topics
       WHERE user_id = $1 AND status = 'active'
       ORDER BY updated_at DESC LIMIT 50`,
      [userId]
    )

    if (topics.rows.length === 0) return null

    const emailText = `${subject} ${fromEmail} ${snippet}`.toLowerCase()

    // Score each topic by keyword overlap
    let bestMatch: { id: string; name: string; score: number; policy: string } | null = null

    for (const topic of topics.rows) {
      let score = 0
      const fp = (topic.fingerprint ?? '').toLowerCase()
      const aliases: string[] = Array.isArray(topic.aliases) ? topic.aliases : []

      // Fingerprint match — split on spaces and check each word
      for (const word of fp.split(/\s+/).filter(w => w.length > 3)) {
        if (emailText.includes(word)) score += 2
      }

      // Alias match
      for (const alias of aliases) {
        const al = alias.toLowerCase()
        if (emailText.includes(al)) score += 3
      }

      // Topic name match
      for (const word of topic.name.toLowerCase().split(/\s+/).filter(w => w.length > 3)) {
        if (emailText.includes(word)) score += 1
      }

      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { id: topic.id, name: topic.name, score, policy: topic.notification_policy ?? 'auto' }
      }
    }

    if (!bestMatch || bestMatch.score < 2) return null

    // Check if already linked
    const existing = await query<{ id: string }>(
      `SELECT id FROM sparkie_topic_threads
       WHERE topic_id = $1 AND source_type = 'email' AND source_id = $2 LIMIT 1`,
      [bestMatch.id, emailId]
    )
    if (existing.rows.length > 0) return bestMatch.id

    // Link the email to the topic
    await query(
      `INSERT INTO sparkie_topic_threads (topic_id, source_type, source_id, summary, created_at)
       VALUES ($1, 'email', $2, $3, NOW())
       ON CONFLICT DO NOTHING`,
      [bestMatch.id, emailId, `Auto-routed: ${subject.slice(0, 120)}`]
    )

    // Update topic's updated_at
    await query(
      `UPDATE sparkie_topics SET updated_at = NOW() WHERE id = $1`,
      [bestMatch.id]
    )

    // Log based on notification policy
    const logPriority = bestMatch.policy === 'immediate' ? 'P1'
                       : bestMatch.policy === 'defer'     ? 'P3'
                       : 'P2'

    await writeWorklog(userId, 'decision', `📎 Email routed to topic "${bestMatch.name}": ${subject.slice(0, 80)}`, {
      decision_type: 'proactive',
      reasoning: `Email matched topic fingerprint/aliases with score ${bestMatch.score}. Notification policy: ${bestMatch.policy}.`,
      signal_priority: logPriority,
      topic_id: bestMatch.id,
      email_id: emailId,
      status: 'done',
      conclusion: `Email automatically linked to topic "${bestMatch.name}" with match score ${bestMatch.score}`,
    })

    return bestMatch.id
  } catch (e) {
    console.error('[scheduler] routeEmailToTopic error:', e)
    return null
  }
}


async function proactiveInboxSweep(userId: string): Promise<void> {
  if (!COMPOSIO_KEY) return

  // 1. Fetch last 5 unread emails via Composio Gmail connector
  let emailsJson: string
  let messages: Array<{ subject: string; from: string; snippet: string; id: string }> = []
  try {
    const entityId = `sparkie_user_${userId}`
    const emailRes = await fetch(`${COMPOSIO_BASE}/actions/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': COMPOSIO_KEY },
      body: JSON.stringify({
        actionName: 'GMAIL_FETCH_EMAILS',
        input: { query: 'is:unread', max_results: 5 },
        entityId,
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (!emailRes.ok) return
    const emailData = await emailRes.json() as { data?: { messages?: Array<{ subject: string; from: string; snippet: string; id: string }> } }
    messages = emailData?.data?.messages ?? []
    emailsJson = JSON.stringify(messages.slice(0, 3))
    // Write a proactive entry even when inbox is empty — the act of checking IS proactive
    if (messages.length === 0) {
      await writeWorklog(userId, 'proactive_signal', '📬 Inbox checked — no unread emails', {
        status: 'done', decision_type: 'proactive',
        reasoning: 'Proactive inbox sweep ran: inbox clear',
        signal_priority: 'P3',
        conclusion: 'Inbox sweep complete — no unread emails found',
      }).catch(() => {})
      return
    }
  } catch { return }

  // Phase 4: Route each email to matching topic
  for (const msg of messages.slice(0, 5)) {
    if (msg.id && msg.subject) {
      routeEmailToTopic(userId, msg.id, msg.subject, msg.from ?? '', msg.snippet ?? '').catch(() => {})
    }
  }

  // 2. Check if we already have a pending inbox task for this user (debounce)
  try {
    const existing = await query<{ id: string }>(
      `SELECT id FROM sparkie_tasks WHERE user_id = $1 AND label LIKE 'Inbox sweep%' AND status = 'pending' AND created_at > NOW() - INTERVAL '30 minutes'`,
      [userId]
    )
    if (existing.rows.length > 0) return // already queued

    // 3. Create autonomous task to draft responses to urgent emails
    const taskId = `proactive_inbox_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    await query(
      `INSERT INTO sparkie_tasks (id, user_id, action, label, payload, status, executor, trigger_type, scheduled_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', 'ai', 'manual', NOW())`,
      [taskId, userId,
        `Review these unread emails and take appropriate action: ${emailsJson}. For each: (1) if urgent, draft a reply using the user's email account via GMAIL_CREATE_EMAIL_DRAFT. (2) if informational, just log a worklog summary. (3) if low-priority newsletter, skip. Report what you did.`,
        'Inbox sweep — autonomous email review',
        JSON.stringify({ email_count: JSON.parse(emailsJson).length, source: 'proactive_scheduler' })
      ]
    )

    await writeWorklog(userId, 'proactive_signal', `📬 Found ${JSON.parse(emailsJson).length} unread emails — queued autonomous review`, {
      status: 'running',
      decision_type: 'proactive',
      reasoning: 'Proactive inbox sweep found unread messages; autonomous draft task created',
      signal_priority: 'P2',
      conclusion: `Found ${JSON.parse(emailsJson).length} unread email(s) — autonomous review task queued`,
    })
  } catch { /* non-critical */ }
}

async function proactiveCalendarSweep(userId: string): Promise<void> {
  if (!COMPOSIO_KEY) return
  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  try {
    const entityId = `sparkie_user_${userId}`
    const calRes = await fetch(`${COMPOSIO_BASE}/actions/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': COMPOSIO_KEY },
      body: JSON.stringify({
        actionName: 'GOOGLECALENDAR_LIST_EVENTS',
        input: { timeMin: now.toISOString(), timeMax: in24h.toISOString(), maxResults: 5 },
        entityId,
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (!calRes.ok) return
    const calData = await calRes.json() as { data?: { items?: Array<{ summary: string; start?: { dateTime?: string }; attendees?: unknown[] }> } }
    const events = calData?.data?.items ?? []
    // Write a proactive entry even when calendar is clear — the act of checking IS proactive
    if (events.length === 0) {
      await writeWorklog(userId, 'proactive_signal', '📅 Calendar checked — clear for next 24h', {
        status: 'done', decision_type: 'proactive',
        reasoning: 'Proactive calendar sweep ran: no upcoming events',
        signal_priority: 'P3',
        conclusion: 'Calendar sweep complete — schedule is clear for the next 24 hours',
      }).catch(() => {})
      return
    }

    // Surface calendar events to worklog (no task creation needed — just awareness)
    const eventSummary = events.slice(0, 3).map(e => `${e.summary} at ${e.start?.dateTime ?? 'TBD'}`).join('; ')
    await writeWorklog(userId, 'proactive_signal', `📅 ${events.length} upcoming event${events.length > 1 ? 's' : ''} in next 24h: ${eventSummary}`, {
      status: 'done',
      decision_type: 'proactive',
      reasoning: 'Proactive calendar sweep surfaced upcoming events',
      signal_priority: 'P3',
      conclusion: `Calendar sweep surfaced ${events.length} upcoming event${events.length > 1 ? 's' : ''} in the next 24 hours`,
    })
  } catch { /* non-critical */ }
}


// ── Deployment health sweep ───────────────────────────────────────────────────
// Runs every ~10 ticks (~10 min). Detects failed DO builds and auto-retries transient failures.
const DO_TOKEN = process.env.DO_API_TOKEN ?? ''
const DO_APP_ID_DEPLOY = 'fb3d58ac-f1b5-4e65-89b5-c12834d8119a'

interface DODeployment {
  id: string
  phase: string
  cause: string
  progress?: { steps?: Array<{ name: string; status: string; reason?: string }> }
}

async function deploymentHealthSweep(userId: string): Promise<void> {
  if (!DO_TOKEN) return
  try {
    const res = await fetch(
      `https://api.digitalocean.com/v2/apps/${DO_APP_ID_DEPLOY}/deployments?page=1&per_page=3`,
      {
        headers: { Authorization: `Bearer ${DO_TOKEN}` },
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!res.ok) return
    const data = await res.json() as { deployments?: DODeployment[] }
    const deployments = data.deployments ?? []
    if (deployments.length === 0) return

    const latest = deployments[0]

    if (latest.phase === 'ERROR' || latest.phase === 'FAILED') {
      // Avoid duplicate handling
      const existing = await query<{ id: string }>(
        `SELECT id FROM sparkie_worklog WHERE user_id = $1 AND type = 'error'
         AND metadata::text LIKE $2 LIMIT 1`,
        [userId, `%${latest.id}%`]
      ).catch(() => ({ rows: [] as { id: string }[] }))
      if (existing.rows.length > 0) return

      const failReason = latest.progress?.steps?.find(s => s.status === 'ERROR')?.reason ?? 'Unknown error'
      await writeWorklog(userId, 'error', `🚨 Deployment failed: ${failReason}`, {
        status: 'anomaly',
        decision_type: 'escalate',
        deployment_id: latest.id,
        reasoning: `DO deployment phase=${latest.phase} cause=${latest.cause}`,
        signal_priority: 'P1',
        conclusion: `Deployment ${latest.id.slice(0, 8)} failed — reason: ${failReason.slice(0, 80)}`,
      })

      // Auto-retry only if previous deployment was healthy (transient failure heuristic)
      const prevPhase = deployments[1]?.phase
      if (prevPhase && prevPhase !== 'ERROR' && prevPhase !== 'FAILED') {
        await fetch(
          `https://api.digitalocean.com/v2/apps/${DO_APP_ID_DEPLOY}/deployments`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${DO_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ force_build: true }),
            signal: AbortSignal.timeout(8000),
          }
        )
        await writeWorklog(userId, 'task_executed', `🔁 Auto-retried deployment after transient build failure`, {
          status: 'done',
          decision_type: 'action',
          deployment_id: latest.id,
          reasoning: 'Previous deployment healthy — auto-redeploy triggered for transient failure',
          signal_priority: 'P1',
          conclusion: 'Auto-retry deployment triggered after detecting a transient build failure',
        })
      }
    } else if (latest.phase === 'ACTIVE') {
      const prevPhase = deployments[1]?.phase
      if (prevPhase === 'ERROR' || prevPhase === 'FAILED') {
        const existing = await query<{ id: string }>(
          `SELECT id FROM sparkie_worklog WHERE user_id = $1 AND type = 'task_executed'
           AND metadata::text LIKE $2 AND content LIKE '%recovered%' LIMIT 1`,
          [userId, `%${latest.id}%`]
        ).catch(() => ({ rows: [] as { id: string }[] }))
        if (existing.rows.length === 0) {
          await writeWorklog(userId, 'task_executed', `✅ Deployment recovered — now ACTIVE`, {
            status: 'done',
            decision_type: 'proactive',
            deployment_id: latest.id,
            reasoning: 'Deployment phase transitioned from ERROR/FAILED to ACTIVE',
            signal_priority: 'P2',
            conclusion: `Deployment ${latest.id.slice(0, 8)} recovered and is now ACTIVE after a previous failure`,
          })
        }
      }
    }
  } catch { /* non-critical */ }
}



const INTERNAL_SECRET = process.env.SPARKIE_INTERNAL_SECRET ?? ''
const SCHEDULER_INTERVAL_MS = 60_000 // 1 minute

// ── Cron expression parser ────────────────────────────────────────────────────
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

  const candidate = new Date(after.getTime() + 60_000)
  candidate.setSeconds(0, 0)
  const limit = new Date(after.getTime() + 365 * 24 * 60 * 60 * 1000)

  while (candidate < limit) {
    if (
      matchField(monthExpr, candidate.getMonth() + 1, 1, 12) &&
      matchField(domExpr,   candidate.getDate(),        1, 31) &&
      matchField(dowExpr,   candidate.getDay(),          0, 6)  &&
      matchField(hourExpr,  candidate.getHours(),        0, 23) &&
      matchField(minExpr,   candidate.getMinutes(),      0, 59)
    ) {
      return new Date(candidate)
    }
    candidate.setTime(candidate.getTime() + 60_000)
  }
  return new Date(after.getTime() + 24 * 60 * 60 * 1000)
}

// ── Advisory lock: only one server instance runs each heartbeat tick ──────────
async function withHeartbeatLock(fn: () => Promise<void>): Promise<void> {
  const LOCK_KEY = 7_463_289_412
  try {
    const lockRes = await query<{ locked: boolean }>(
      `SELECT pg_try_advisory_lock($1) AS locked`, [LOCK_KEY]
    )
    if (!lockRes.rows[0]?.locked) return
    try {
      await fn()
    } finally {
      await query(`SELECT pg_advisory_unlock($1)`, [LOCK_KEY])
    }
  } catch (e) {
    console.error('[scheduler] lock error:', e)
  }
}

// ── Loop detection: prevent infinite retry loops ──────────────────────────────
interface LoopTracker {
  tool: string
  argsHash: string
  count: number
  lastSeen: number
}
const loopTracker = new Map<string, LoopTracker>()

function detectLoop(taskId: string, tool: string, args: string): boolean {
  const key = `${taskId}:${tool}`
  const existing = loopTracker.get(key)
  const now = Date.now()

  if (existing && existing.argsHash === args && now - existing.lastSeen < 120_000) {
    existing.count++
    existing.lastSeen = now
    if (existing.count >= 3) {
      console.warn(`[scheduler] Loop detected: ${tool} called ${existing.count}x for task ${taskId}`)
      return true
    }
  } else {
    loopTracker.set(key, { tool, argsHash: args, count: 1, lastSeen: now })
  }
  return false
}

function clearLoopTracker(taskId: string): void {
  for (const key of loopTracker.keys()) {
    if (key.startsWith(taskId + ':')) loopTracker.delete(key)
  }
}

// ── Execute due AI tasks for a single user ────────────────────────────────────
async function executeUserTasks(
  userId: string,
  baseUrl: string
): Promise<Array<{ id: string; label: string; result: string }>> {
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

  const executed: Array<{ id: string; label: string; result: string }> = []

  // Execute tasks in parallel batches of 3 for speed
  const runTask = async (task: typeof dueTasks.rows[0]) => {
    // Loop detection: check if this task has been retried too many times recently
    if (detectLoop(task.id, 'task_execution', task.label.slice(0, 50))) {
      await writeWorklog(userId, 'error', `⏸ Task paused: "${task.label}" — loop detected (3+ retries in 2 min). Holding for review.`, {
        taskLabel: task.label,
        taskId: task.id,
        status: 'blocked',
        decision_type: 'hold',
        reasoning: 'Same task attempted 3+ times in quick succession — pausing to prevent infinite loop',
        conclusion: `Task "${task.label.slice(0, 60)}" blocked — infinite loop detected after 3+ retries`,
      })
      await query(`UPDATE sparkie_tasks SET status = 'failed' WHERE id = $1`, [task.id])
      return undefined
    }

    try {
      await query(`UPDATE sparkie_tasks SET status = 'in_progress' WHERE id = $1`, [task.id])

      let result = 'Task executed (chat API unavailable)'

      if (INTERNAL_SECRET) {
        const taskPrompt = [
          '[AUTONOMOUS TASK EXECUTION — PROACTIVE HEARTBEAT]',
          `Task: ${task.label}`,
          `Runbook: ${task.action}`,
          '',
          'Execute this task now. Be thorough and specific. Report exactly what was done.',
        ].join('\n')

        try {
          const chatRes = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-internal-user-id': userId,
              'x-internal-secret': INTERNAL_SECRET,
            },
            body: JSON.stringify({
              messages: [{ role: 'user', content: taskPrompt }],
              // model field omitted — chat/route.ts uses server-side selectModel() and ignores client model param
            }),
            signal: AbortSignal.timeout(45_000),
          })

          if (chatRes.ok) {
            const text = await chatRes.text()
            const lines = text.split('\n').filter(
              (l: string) => l.startsWith('data: ') && l !== 'data: [DONE]'
            )
            const chunks = lines.map((l: string) => {
              try { return JSON.parse(l.slice(6)).choices?.[0]?.delta?.content ?? '' }
              catch { return '' }
            })
            result = chunks.join('').trim().slice(0, 800) || 'Task completed'
          }
        } catch (e) {
          console.error(`[scheduler] chat call failed for task ${task.id}:`, e)
          result = 'Task execution error — chat call failed'
        }
      }

      // Re-queue cron tasks; complete delay/manual tasks
      if (task.trigger_type === 'cron') {
        const expr = (task.trigger_config as { expression?: string }).expression ?? '0 9 * * 1'
        const nextTime = nextCronTime(expr)
        await query(
          `UPDATE sparkie_tasks SET status = 'pending', scheduled_at = $2 WHERE id = $1`,
          [task.id, nextTime.toISOString()]
        )
      } else {
        await query(
          `UPDATE sparkie_tasks SET status = 'completed', resolved_at = NOW() WHERE id = $1`,
          [task.id]
        )
      }

      clearLoopTracker(task.id)

      // Classify signal priority for worklog
      const priority = classifyHeartbeatSignal('task_complete', { label: task.label })

      await writeWorklog(userId, 'task_executed', result, {
        taskLabel: task.label,
        taskId: task.id,
        trigger: task.trigger_type,
        status: 'done',
        decision_type: 'action',
        signal_priority: priority,
        conclusion: `Task "${task.label.slice(0, 60)}" executed successfully via ${task.trigger_type} trigger`,
      })

      return { id: task.id, label: task.label, result }
    } catch (e) {
      await query(`UPDATE sparkie_tasks SET status = 'failed' WHERE id = $1`, [task.id])
      await writeWorklog(userId, 'error', `Task failed: ${task.label}`, {
        taskLabel: task.label, taskId: task.id,
        status: 'anomaly',
        decision_type: 'escalate',
        reasoning: e instanceof Error ? e.message : String(e),
        conclusion: `Task "${task.label.slice(0, 60)}" failed with error — marked as failed and requires attention`,
      })
      console.error(`[scheduler] Task ${task.id} failed:`, e)
    }
  }

  // Batch execution — 3 tasks at a time
  for (let i = 0; i < dueTasks.rows.length; i += 3) {
    const batch = dueTasks.rows.slice(i, i + 3)
    const results = await Promise.allSettled(batch.map(t => runTask(t)))
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) executed.push(r.value)
    }
  }

  return executed
}

// ── Heartbeat tick ────────────────────────────────────────────────────────────
async function heartbeatTick(baseUrl: string): Promise<void> {
  await withHeartbeatLock(async () => {
    try {
      // ── Stale in_progress recovery: tasks stuck > 5 min → reset to pending ──────
      await query(
        `UPDATE sparkie_tasks SET status = 'pending'
         WHERE status = 'in_progress'
           AND created_at < NOW() - INTERVAL '5 minutes'`
      ).catch(() => {})

      const dueUsers = await query<{ user_id: string }>(

        `SELECT DISTINCT user_id FROM sparkie_tasks
         WHERE executor = 'ai' AND status = 'pending'
         AND scheduled_at IS NOT NULL AND scheduled_at <= NOW()`
      )

      // Auth health sweep — once every 10 ticks (10 minutes) per user
      const authCheckUsers = await query<{ user_id: string }>(
        `SELECT DISTINCT user_id FROM sparkie_tasks WHERE executor = 'ai' LIMIT 20`
      )
      const shouldRunAuthCheck = Math.floor(Date.now() / 1000) % 600 < 60 // true once per ~10 min
      if (shouldRunAuthCheck && authCheckUsers.rows.length > 0) {
        for (const { user_id } of authCheckUsers.rows.slice(0, 3)) {
          runAuthHealthSweep(user_id).catch(() => {})
        }
      }

      // Prune expired tool cache entries
      pruneToolCache()
      // Deployment health sweep — once every ~10 ticks (10 min)
      if (shouldRunAuthCheck) {
        const sweepUser = dueUsers.rows[0]?.user_id ?? authCheckUsers.rows[0]?.user_id
        if (sweepUser) deploymentHealthSweep(sweepUser).catch(() => {})
      }


      // ── Proactive inbox + calendar sweeps ──────────────────────────────────
      // Run once every 5 ticks (~5 min) for all active users to avoid hammering APIs
      const activeUsers = await query<{ user_id: string }>(
        `SELECT DISTINCT user_id FROM user_sessions WHERE last_seen_at > NOW() - INTERVAL '7 days'`
      ).catch(() => ({ rows: [] as { user_id: string }[] }))

      const shouldRunProactive = Math.floor(Date.now() / 1000) % 300 < 60
      if (shouldRunProactive) {
        // Run for active users independently of whether they have pending tasks
        // (proactive = acting WITHOUT being asked — never gate on task queue)
        const sweepTargets = activeUsers.rows.length > 0
          ? activeUsers.rows.slice(0, 2)
          : dueUsers.rows.slice(0, 2)
        for (const { user_id } of sweepTargets) {
          proactiveInboxSweep(user_id).catch(() => {})
          proactiveCalendarSweep(user_id).catch(() => {})
        }
      }

      // ── Surface ready deferred intents ─────────────────────────────────────
      // Check all active users for deferred intents that are now ready

      for (const { user_id } of activeUsers.rows.slice(0, 10)) {
        const readyIntents = await loadReadyDeferredIntents(user_id)
        for (const intent of readyIntents) {
          // Surface as worklog entry + mark as surfaced
          await writeWorklog(user_id, 'decision', intent.intent, {
            decision_type: 'proactive',
            reasoning: `Deferred intent from ${intent.createdAt.toLocaleDateString()}: "${intent.sourceMsg.slice(0, 80)}"`,
            signal_priority: intent.dueAt && intent.dueAt < new Date() ? 'P1' : 'P2',
            conclusion: `Deferred intent surfaced and ready for action: "${intent.intent.slice(0, 80)}"`,
          })
          await markDeferredIntentSurfaced(intent.id)
        }
      }

      // ── TTL decay sweep — flag stale self-memory entries ────────────────────
      const staleFlagged = await runTTLDecaySweep().catch(() => 0)
      if (staleFlagged > 0) {
        console.log(`[scheduler] TTL sweep: ${staleFlagged} stale memories flagged`)
      }

      // ── Morning brief sweep (daily 12:00-13:00 UTC = 7-8am EST) ─────────────
      // Triggers proactive morning_brief via /api/agent for all active users
      const now = new Date()
      const isMorningBriefWindow = now.getUTCHours() === 12 && Math.floor(Date.now() / 1000) % 300 < 60
      if (isMorningBriefWindow) {
        for (const { user_id } of activeUsers.rows.slice(0, 3)) {
          writeWorklog(user_id, 'proactive_signal', '☀️ Morning brief fired — preparing your daily summary', {
            decision_type: 'proactive', signal_priority: 'P1',
            reasoning: 'Daily 12:00 UTC morning brief window',
            conclusion: 'Morning brief dispatched to agent for delivery',
          }).catch(() => {})
          // Fire proactive outreach check via agent route to trigger morning_brief
          fetch(`${baseUrl}/api/agent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
            body: JSON.stringify({ currentHour: 8, userId: user_id, force_morning_brief: true }),
          }).catch(() => {})
        }
      }

      // ── Communications health sweep (daily 06:00 UTC) ──────────────────────
      const isCommHealthWindow = now.getUTCHours() === 6 && Math.floor(Date.now() / 1000) % 300 < 60
      if (isCommHealthWindow) {
        for (const { user_id } of activeUsers.rows.slice(0, 3)) {
          runAuthHealthSweep(user_id).catch(() => {})
          writeWorklog(user_id, 'auth_check', 'Communications health sweep ran', { decision_type: 'proactive', reasoning: 'Daily 06:00 UTC sweep', signal_priority: 'P3', conclusion: 'Daily 06:00 UTC communications health sweep completed' }).catch(() => {})
        }
      }

      // ── Weekly self-assessment (Sunday 23:00 UTC) ─────────────────────────────
      const isSundayNight = now.getUTCDay() === 0 && now.getUTCHours() === 23
      if (isSundayNight) {
        for (const { user_id } of activeUsers.rows.slice(0, 5)) {
          fetch(`${baseUrl}/api/self-assessment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
            body: JSON.stringify({ userId: user_id }),
          }).catch(() => {})
        }
      }

      // ── Behavioral model compute (weekly, Saturday 02:00 UTC) ─────────────────
      const isSaturdayEarly = now.getUTCDay() === 6 && now.getUTCHours() === 2
      if (isSaturdayEarly) {
        for (const { user_id } of activeUsers.rows.slice(0, 10)) {
          computeUserModel(user_id).catch(() => {})
        }
      }

      if (dueUsers.rows.length === 0) return

      console.log(`[scheduler] Tick: ${dueUsers.rows.length} user(s) with due tasks`)

      for (const { user_id } of dueUsers.rows) {
        const results = await executeUserTasks(user_id, baseUrl)
        if (results.length > 0) {
          console.log(`[scheduler] Executed ${results.length} task(s) for user ${user_id}`)
        }
      }
    } catch (e) {
      console.error('[scheduler] tick error:', e)
    }
  })
}

// ── Exports for external cron handler ─────────────────────────────────────────
// The GET /api/agent cron endpoint calls these directly so it can run all sweeps
// for every active user without needing the in-process scheduler to be running.
export { proactiveInboxSweep, proactiveCalendarSweep, deploymentHealthSweep }

// ── Bootstrap ─────────────────────────────────────────────────────────────────
let _started = false

export function startScheduler(baseUrl: string): void {
  if (_started) return
  _started = true

  console.log(`[scheduler] Heartbeat scheduler started — ${SCHEDULER_INTERVAL_MS / 1000}s interval, base: ${baseUrl}`)

  // ── Startup auth self-check ────────────────────────────────────────────────
  // Verifies all critical env vars and internal auth are wired correctly.
  // Results logged to server console; failures are non-fatal (scheduler continues).
  setTimeout(async () => {
    const checks: Array<{ name: string; ok: boolean; note?: string }> = []

    // 1. SPARKIE_INTERNAL_SECRET set?
    const hasSecret = !!process.env.SPARKIE_INTERNAL_SECRET
    checks.push({ name: 'SPARKIE_INTERNAL_SECRET', ok: hasSecret, note: hasSecret ? 'set' : 'MISSING — internal auth broken' })

    // 2. MINIMAX_API_KEY set?
    checks.push({ name: 'MINIMAX_API_KEY', ok: !!process.env.MINIMAX_API_KEY, note: process.env.MINIMAX_API_KEY ? 'set' : 'MISSING — build/chat broken' })

    // 3. COMPOSIO_API_KEY set?
    checks.push({ name: 'COMPOSIO_API_KEY', ok: !!COMPOSIO_KEY, note: COMPOSIO_KEY ? 'set' : 'MISSING — Gmail/Calendar broken' })

    // 4. SUPERMEMORY_API_KEY set?
    checks.push({ name: 'SUPERMEMORY_API_KEY', ok: !!process.env.SUPERMEMORY_API_KEY, note: process.env.SUPERMEMORY_API_KEY ? 'set' : 'MISSING — memory disabled' })

    // 5. Test internal worklog POST (proves x-internal-secret auth works end-to-end)
    if (hasSecret) {
      try {
        const wlRes = await fetch(`${baseUrl}/api/worklog`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.SPARKIE_INTERNAL_SECRET! },
          body: JSON.stringify({ type: 'action', content: 'Startup auth self-check passed ✓', user_id: 'system', metadata: { source: 'scheduler_startup' } }),
        })
        checks.push({ name: 'internal /api/worklog POST', ok: wlRes.ok, note: `HTTP ${wlRes.status}` })
      } catch (e) {
        checks.push({ name: 'internal /api/worklog POST', ok: false, note: String(e) })
      }
    }

    // 6. Test internal /api/admin/deploy GET (proves requireRole bypass works)
    if (hasSecret) {
      try {
        const depRes = await fetch(`${baseUrl}/api/admin/deploy`, {
          headers: { 'x-internal-secret': process.env.SPARKIE_INTERNAL_SECRET! },
        })
        checks.push({ name: 'internal /api/admin/deploy GET', ok: depRes.ok, note: `HTTP ${depRes.status}` })
      } catch (e) {
        checks.push({ name: 'internal /api/admin/deploy GET', ok: false, note: String(e) })
      }
    }

    const passed = checks.filter(c => c.ok).length
    const failed = checks.filter(c => !c.ok)
    console.log(`[scheduler:auth-check] ${passed}/${checks.length} checks passed`)
    for (const c of checks) {
      console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}: ${c.note ?? ''}`)
    }
    if (failed.length > 0) {
      console.warn('[scheduler:auth-check] FAILURES:', failed.map(c => c.name).join(', '))
    }
  }, 8_000)

  // Auto-migrate: ensure all memory seeds are loaded on cold boot
  // Runs once 3s after boot — idempotent (DELETE WHERE source='seedX' + INSERT ON CONFLICT DO NOTHING)
  setTimeout(async () => {
    try {
      const secret = process.env.MIGRATE_SECRET
      if (secret) {
        const res = await fetch(`${baseUrl}/api/admin/migrate?secret=${secret}`)
        if (res.ok) console.log('[scheduler] Auto-migrate: memory seeds loaded')
        else console.warn('[scheduler] Auto-migrate: non-ok response', res.status)
      }
    } catch (e) {
      console.warn('[scheduler] Auto-migrate failed (non-fatal):', e)
    }
  }, 3_000)

  // Skill bootstrap: ensure all built-in skills are seeded in the DB.
  // Idempotent (ON CONFLICT DO UPDATE). Runs 6s after boot.
  setTimeout(async () => {
    try {
      const secret = process.env.MIGRATE_SECRET
      if (!secret) { console.warn('[scheduler:skills] MIGRATE_SECRET not set — skipping skill bootstrap'); return }
      const res = await fetch(`${baseUrl}/api/skills/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret }),
      })
      if (res.ok) {
        const data = await res.json() as { results?: Array<{ name: string; status: string }> }
        const seeded = (data.results ?? []).filter(r => r.status === 'seeded').length
        console.log(`[scheduler:skills] Bootstrap complete — ${seeded} skill(s) seeded/updated`)
        await writeWorklog('system', 'action', `Skill bootstrap: ${seeded} skill(s) seeded/updated`, { source: 'scheduler_startup', conclusion: `Startup skill bootstrap complete — ${seeded} skill(s) seeded or updated in the database` }).catch(() => {})
      } else {
        console.warn('[scheduler:skills] Skill seed failed:', res.status)
      }
    } catch (e) {
      console.warn('[scheduler:skills] Skill bootstrap error (non-fatal):', e)
    }
  }, 6_000)

  // Fire once 5s after boot (catches tasks due during downtime)
  setTimeout(() => heartbeatTick(baseUrl), 5_000)

  // Then every 60s
  setInterval(() => heartbeatTick(baseUrl), SCHEDULER_INTERVAL_MS)
}
