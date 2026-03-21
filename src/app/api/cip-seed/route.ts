import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { createGoal, getGoalCount } from '@/lib/goalEngine'
import { createBehaviorRule, getBehaviorRuleCount } from '@/lib/behaviorRules'
import { addCausalLink, getCausalGraphStats } from '@/lib/causalModel'

export const runtime = 'nodejs'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const goalCount = await getGoalCount().catch(() => 0)
  const ruleCount = await getBehaviorRuleCount().catch(() => 0)
  const causalStats = await getCausalGraphStats().catch(() => ({ nodes: 0, edges: 0 }))

  const seeded: string[] = []

  // Only seed goals if none exist
  if (goalCount === 0) {
    await createGoal(
      'Improve Sparkie\'s causal knowledge graph',
      'Expand the causal graph by observing recurring event pairs during tool execution — aim for 20+ high-confidence edges.',
      'build', 'P2',
      'sparkie_causal_graph has 20+ edges with confidence >= 0.7',
      2
    ).catch(() => {})
    await createGoal(
      'Complete a 7-day daily reflection streak',
      'Run self-reflection every day for 7 consecutive days to build long-term growth awareness.',
      'monitor', 'P3',
      '7 consecutive reflection_date entries in sparkie_self_reflections',
      1
    ).catch(() => {})
    await createGoal(
      'Establish proactive behavior rule library',
      'Build up 10+ active behavior rules from observed patterns so Sparkie preempts recurring issues.',
      'build', 'P2',
      'sparkie_behavior_rules has 10+ active rules with confidence >= 0.6',
      1
    ).catch(() => {})
    seeded.push('3 default goals')
  }

  // Only seed behavior rules if none exist
  if (ruleCount === 0) {
    await createBehaviorRule(
      'user message contains an error or stack trace',
      'query the causal graph for known causes of this error type before proposing a fix',
      'Prevents blind retry loops — known error patterns often have documented root causes',
      0.85
    ).catch(() => {})
    await createBehaviorRule(
      'deployment is triggered via trigger_deploy',
      'schedule a health check 5 minutes after triggering to confirm the deploy succeeded',
      'Catches silent deploy failures that only surface after the process exits',
      0.80
    ).catch(() => {})
    await createBehaviorRule(
      'emotional state shows frustration or urgency',
      'acknowledge the feeling first, then shorten the response and lead with the solution',
      'Users in a frustrated state need immediate relief, not long explanations',
      0.90
    ).catch(() => {})
    await createBehaviorRule(
      'same tool is called 2+ times with identical arguments',
      'halt the loop and report the loop detection to the user instead of retrying blindly',
      'Loop detection prevents wasted tokens and circular failures',
      0.95
    ).catch(() => {})
    seeded.push('4 default behavior rules')
  }

  // Only seed causal links if graph is empty
  if (causalStats.edges === 0) {
    const links: [string, string, number][] = [
      ['missing npm dependency', 'npm install failure', 0.95],
      ['syntax error in config file', 'build failure', 0.90],
      ['API rate limit exceeded', 'tool call timeout', 0.85],
      ['database connection refused', 'query failure', 0.92],
      ['environment variable missing', 'app crash on startup', 0.95],
      ['TypeScript type error', 'build failure', 0.88],
      ['port already in use', 'server start failure', 0.90],
    ]
    for (const [cause, effect, conf] of links) {
      await addCausalLink(cause, effect, conf).catch(() => {})
    }
    seeded.push('7 default causal links')
  }

  return NextResponse.json({
    success: true,
    seeded,
    message: seeded.length > 0
      ? `Seeded: ${seeded.join(', ')}`
      : 'CIP already has data — no seeding needed',
  })
}
