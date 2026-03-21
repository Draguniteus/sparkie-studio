import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { getBehaviorRuleCount, listBehaviorRules } from '@/lib/behaviorRules'
import { getCausalGraphStats } from '@/lib/causalModel'
import { loadActiveGoals, getGoalCount } from '@/lib/goalEngine'
import { getReflectionCount } from '@/lib/selfReflection'
import { query } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string })?.id
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const [ruleCount, causalStats, goalCount, reflectionCount, goals, rules] = await Promise.allSettled([
      getBehaviorRuleCount(),
      getCausalGraphStats(),
      getGoalCount(),
      getReflectionCount(7),
      loadActiveGoals(5),
      listBehaviorRules(true),
    ])

    // Count parallel executions today (tool sessions with multiple tools)
    const parallelRes = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM sparkie_worklog
       WHERE user_id = $1 AND type = 'tool_call'
       AND created_at > CURRENT_DATE`,
      [userId]
    ).catch(() => ({ rows: [{ count: '0' }] }))

    const stats = {
      goalCount: goalCount.status === 'fulfilled' ? goalCount.value : 0,
      ruleCount: ruleCount.status === 'fulfilled' ? ruleCount.value : 0,
      causalNodes: causalStats.status === 'fulfilled' ? causalStats.value.nodes : 0,
      causalEdges: causalStats.status === 'fulfilled' ? causalStats.value.edges : 0,
      reflectionCount: reflectionCount.status === 'fulfilled' ? reflectionCount.value : 0,
      perceptionActive: true,
      lastPerceptionAt: new Date().toISOString(),
      parallelExecutionsToday: parseInt(parallelRes.rows[0]?.count ?? '0'),
    }

    return NextResponse.json({
      stats,
      goals: goals.status === 'fulfilled' ? goals.value : [],
      rules: rules.status === 'fulfilled' ? rules.value.slice(0, 5) : [],
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
