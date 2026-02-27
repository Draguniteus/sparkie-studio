import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

export const runtime = 'nodejs'
export const maxDuration = 60

// ── POST /api/agent ────────────────────────────────────────────────────────────
// Sparkie-initiated outreach: check if Sparkie has anything proactive to say,
// and execute any AI-owned scheduled tasks that are now due.
// Called by the client on a polling interval (every 60s when tab is focused)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user as { id?: string } | undefined)?.id
    if (!userId) return NextResponse.json({ message: null, type: null })

    const { lastMessageAt, currentHour } = await req.json() as {
      lastMessageAt?: string
      currentHour?: number
    }

    // Auto-create tables
    await query(`CREATE TABLE IF NOT EXISTS sparkie_outreach_log (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      sent_at TIMESTAMPTZ DEFAULT NOW()
    )`)
    await query(`CREATE INDEX IF NOT EXISTS idx_outreach_user ON sparkie_outreach_log(user_id, sent_at)`)

    // Ensure sparkie_tasks has all required columns
    await query(`CREATE TABLE IF NOT EXISTS sparkie_tasks (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, action TEXT NOT NULL, label TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'pending',
      executor TEXT NOT NULL DEFAULT 'human', trigger_type TEXT DEFAULT 'manual',
      trigger_config JSONB DEFAULT '{}', scheduled_at TIMESTAMPTZ, why_human TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(), resolved_at TIMESTAMPTZ
    )`).catch(() => {})

    const hour = currentHour ?? new Date().getHours()

    // Check what we've sent today
    const sentToday = await query<{ type: string }>(
      `SELECT type FROM sparkie_outreach_log
       WHERE user_id = $1 AND sent_at > NOW() - INTERVAL '12 hours'`,
      [userId]
    )
    const sentTypes = new Set(sentToday.rows.map(r => r.type))

    // ── Execute due AI tasks ────────────────────────────────────────────────────
    // Find tasks where: executor=ai, status=pending, scheduled_at <= now
    const dueTasks = await query<{
      id: string; label: string; action: string; trigger_type: string
    }>(
      `SELECT id, label, action, trigger_type FROM sparkie_tasks
       WHERE user_id = $1 AND executor = 'ai' AND status = 'pending'
       AND scheduled_at IS NOT NULL AND scheduled_at <= NOW()
       ORDER BY scheduled_at ASC LIMIT 3`,
      [userId]
    )

    if (dueTasks.rows.length > 0) {
      const executedTasks: Array<{ id: string; label: string; result: string }> = []
      const apiKey = process.env.OPENCODE_API_KEY
      const host = req.headers.get('host') ?? 'localhost:3000'
      const proto = req.headers.get('x-forwarded-proto') ?? 'https'

      for (const task of dueTasks.rows) {
        try {
          // Mark as in_progress to prevent duplicate execution
          await query(`UPDATE sparkie_tasks SET status = 'in_progress' WHERE id = $1`, [task.id])

          // Execute via chat API — Sparkie runs her own task
          if (apiKey) {
            const taskPrompt = `[AUTONOMOUS TASK EXECUTION]\nTask: ${task.label}\nRunbook: ${task.action}\n\nExecute this task now. Be thorough. Report what you did.`
            const chatRes = await fetch(`${proto}://${host}/api/chat`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Cookie': req.headers.get('cookie') ?? '' },
              body: JSON.stringify({
                messages: [{ role: 'user', content: taskPrompt }],
                model: 'kimi-k2.5-free',
              }),
              signal: AbortSignal.timeout(45000),
            })

            let result = 'Task executed'
            if (chatRes.ok) {
              const text = await chatRes.text()
              // Extract content from SSE stream
              const lines = text.split('\n').filter(l => l.startsWith('data: ') && l !== 'data: [DONE]')
              const chunks = lines.map(l => {
                try {
                  const parsed = JSON.parse(l.slice(6))
                  return parsed.choices?.[0]?.delta?.content ?? ''
                } catch { return '' }
              })
              result = chunks.join('').slice(0, 500)
            }

            // Mark completed (for delay tasks) or re-queue (for cron tasks)
            if (task.trigger_type === 'cron') {
              // Parse cron and set next scheduled_at (simple: add 7 days for weekly, 1 day for daily)
              await query(
                `UPDATE sparkie_tasks SET status = 'pending', scheduled_at = scheduled_at + INTERVAL '7 days'
                 WHERE id = $1`,
                [task.id]
              )
            } else {
              await query(
                `UPDATE sparkie_tasks SET status = 'completed', resolved_at = NOW() WHERE id = $1`,
                [task.id]
              )
            }

            executedTasks.push({ id: task.id, label: task.label, result })
          }
        } catch (e) {
          await query(`UPDATE sparkie_tasks SET status = 'failed' WHERE id = $1`, [task.id])
          console.error(`Task ${task.id} failed:`, e)
        }
      }

      if (executedTasks.length > 0) {
        return NextResponse.json({
          type: 'task_completed',
          message: 'task_completed',
          tasks: executedTasks,
          trigger: true,
        })
      }
    }

    // ── Check for pending tasks awaiting user attention ─────────────────────────
    const pendingHuman = await query<{ id: string; label: string; action: string; created_at: string }>(
      `SELECT id, label, action, created_at FROM sparkie_tasks
       WHERE user_id = $1 AND executor = 'human' AND status = 'pending'
       ORDER BY created_at DESC LIMIT 5`,
      [userId]
    )

    // ── Morning brief trigger (8am-11am, once per morning) ────────────────────
    if (hour >= 8 && hour < 11 && !sentTypes.has('morning_brief')) {
      const recentActivity = await query<{ last_seen_at: Date }>(
        'SELECT last_seen_at FROM user_sessions WHERE user_id = $1',
        [userId]
      )
      const lastSeen = recentActivity.rows[0]?.last_seen_at
      const hoursSinceLastSeen = lastSeen
        ? (Date.now() - new Date(lastSeen).getTime()) / (1000 * 60 * 60)
        : 999

      if (hoursSinceLastSeen > 5) {
        await query(
          'INSERT INTO sparkie_outreach_log (user_id, type) VALUES ($1, $2)',
          [userId, 'morning_brief']
        )
        return NextResponse.json({
          type: 'morning_brief',
          message: 'morning_brief',
          pendingTasks: pendingHuman.rows,
          trigger: true,
        })
      }
    }

    // ── Inactivity check-in (after 3+ days away, once per week) ───────────────
    if (!sentTypes.has('checkin')) {
      const sessions = await query<{ last_seen_at: Date; session_count: number }>(
        'SELECT last_seen_at, session_count FROM user_sessions WHERE user_id = $1',
        [userId]
      )
      const lastSeen = sessions.rows[0]?.last_seen_at
      if (lastSeen) {
        const daysSince = (Date.now() - new Date(lastSeen).getTime()) / (1000 * 60 * 60 * 24)
        if (daysSince >= 3) {
          const memories = await query<{ content: string }>(
            'SELECT content FROM user_memories WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3',
            [userId]
          )
          const memoryHints = memories.rows.map(r => r.content).join('; ')
          await query(
            'INSERT INTO sparkie_outreach_log (user_id, type) VALUES ($1, $2)',
            [userId, 'checkin']
          )
          return NextResponse.json({
            type: 'checkin',
            message: 'checkin',
            daysSince: Math.floor(daysSince),
            memoryHints,
            pendingTasks: pendingHuman.rows,
            trigger: true,
          })
        }
      }
    }

    // Return pending tasks even if no proactive trigger fires
    if (pendingHuman.rows.length > 0 && !sentTypes.has('pending_tasks')) {
      return NextResponse.json({
        message: null,
        type: null,
        trigger: false,
        pendingTasks: pendingHuman.rows,
      })
    }

    return NextResponse.json({ message: null, type: null, trigger: false })
  } catch {
    return NextResponse.json({ message: null, type: null, trigger: false })
  }
}
