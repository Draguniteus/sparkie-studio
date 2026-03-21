import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { writeWorklog } from '@/lib/worklog'

// Called by heartbeat weekly job (Sunday 23:00) or manually by Sparkie
// POST /api/self-assessment { userId }
export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json() as { userId: string }
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

    const res = await query<{
      type: string; content: string; metadata: Record<string, unknown>; created_at: Date
    }>(
      `SELECT type, content, metadata, created_at FROM sparkie_worklog
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days'
       ORDER BY created_at DESC`,
      [userId]
    ).catch(() => ({ rows: [] }))

    const entries = res.rows
    if (entries.length === 0) {
      return NextResponse.json({ ok: true, message: 'No worklog entries this week' })
    }

    // Compute metrics
    const total = entries.length
    const byType = entries.reduce<Record<string, number>>((acc, e) => {
      acc[e.type] = (acc[e.type] ?? 0) + 1
      return acc
    }, {})
    const errors = byType['error'] ?? 0
    const tasks  = byType['task_executed'] ?? 0
    const decisions = byType['decision'] ?? 0
    const toolCalls = byType['tool_call'] ?? 0
    const anomalies = entries.filter((e) => (e.metadata as Record<string,unknown>)?.status === 'anomaly').length
    const blockedTasks = entries.filter((e) => (e.metadata as Record<string, unknown>)?.status === 'blocked').length
    const successRate = total > 0 ? Math.round(((total - errors - anomalies) / total) * 100) : 100

    // Build summary
    const lines = [
      `## WEEKLY SELF-ASSESSMENT`,
      `Period: last 7 days | Total entries: ${total}`,
      ``,
      `### Activity`,
      `- Tasks executed: ${tasks}`,
      `- Tool calls: ${toolCalls}`,
      `- Decisions made: ${decisions}`,
      `- Errors: ${errors}`,
      `- Anomalies: ${anomalies}`,
      `- Blocked tasks: ${blockedTasks}`,
      `- Overall success rate: ${successRate}%`,
      ``,
      `### Health`,
      errors > 2
        ? `⚠️ Error rate elevated (${errors} errors). Review recent failures.`
        : `✅ Error rate nominal.`,
      blockedTasks > 0
        ? `⚠️ ${blockedTasks} task(s) were blocked by loop detection — review runbooks.`
        : `✅ No loop-detected blocks.`,
      successRate >= 90
        ? `✅ Strong week — performing well.`
        : `⚠️ Success rate below 90% — something needs attention.`,
      ``,
      `### Drift Detection`,
      `Entry distribution: ${Object.entries(byType).map(([k,v]) => `${k}:${v}`).join(', ')}`,
    ].join('\n')

    // Write to worklog as special entry
    await writeWorklog(userId, 'decision', lines.slice(0, 500), {
      decision_type: 'proactive',
      reasoning: `Weekly self-assessment — ${successRate}% success rate, ${total} entries, ${errors} errors`,
      signal_priority: errors > 5 || successRate < 80 ? 'P1' : 'P3',
      conclusion: `Weekly self-assessment complete — ${successRate}% success rate across ${total} entries with ${errors} error(s)`,
    })

    // Also persist to sparkie_self_memory
    await query(
      `INSERT INTO sparkie_self_memory (category, content, source)
       VALUES ($1, $2, $3)`,
      ['self_assessment', lines, 'scheduler']
    ).catch(() => {})

    return NextResponse.json({ ok: true, metrics: { total, errors, tasks, successRate } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
