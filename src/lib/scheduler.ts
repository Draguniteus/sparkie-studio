import { query } from '@/lib/db'
import { writeWorklog } from '@/lib/worklog'

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

  for (const task of dueTasks.rows) {
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
              model: 'kimi-k2.5-free',
            }),
            signal: AbortSignal.timeout(50_000),
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

      // Write to worklog so user sees the result in the Worklog panel
      await writeWorklog(userId, 'task_executed', result, {
        taskLabel: task.label,
        taskId: task.id,
        trigger: task.trigger_type,
      })

      executed.push({ id: task.id, label: task.label, result })
      console.log(`[scheduler] Task "${task.label}" completed for user ${userId}`)
    } catch (e) {
      await query(`UPDATE sparkie_tasks SET status = 'failed' WHERE id = $1`, [task.id])
      await writeWorklog(userId, 'error', `Task failed: ${task.label}`, {
        taskLabel: task.label, taskId: task.id
      })
      console.error(`[scheduler] Task ${task.id} failed:`, e)
    }
  }

  return executed
}

// ── Heartbeat tick ────────────────────────────────────────────────────────────
async function heartbeatTick(baseUrl: string): Promise<void> {
  await withHeartbeatLock(async () => {
    try {
      const dueUsers = await query<{ user_id: string }>(
        `SELECT DISTINCT user_id FROM sparkie_tasks
         WHERE executor = 'ai' AND status = 'pending'
         AND scheduled_at IS NOT NULL AND scheduled_at <= NOW()`
      )

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

// ── Bootstrap ─────────────────────────────────────────────────────────────────
let _started = false

export function startScheduler(baseUrl: string): void {
  if (_started) return
  _started = true

  console.log(`[scheduler] Heartbeat scheduler started — ${SCHEDULER_INTERVAL_MS / 1000}s interval, base: ${baseUrl}`)

  // Fire once 5s after boot (catches tasks due during downtime)
  setTimeout(() => heartbeatTick(baseUrl), 5_000)

  // Then every 60s
  setInterval(() => heartbeatTick(baseUrl), SCHEDULER_INTERVAL_MS)
}
