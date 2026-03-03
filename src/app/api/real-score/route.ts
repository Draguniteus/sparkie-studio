import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

export const runtime = 'nodejs'
export const maxDuration = 10

export interface RealLeg {
  id: 'autonomous' | 'memory' | 'proactive' | 'security'
  label: string
  score: number
  signal: string
  trend: 'up' | 'stable' | 'down'
}

export interface RealScoreResponse {
  total: number
  legs: RealLeg[]
  computed_at: string
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string })?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Leg 1: Autonomous Resolution
    const autoRes = await query<{ completed: string; failed: string }>(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'completed') AS completed,
        COUNT(*) FILTER (WHERE status = 'failed')    AS failed
      FROM sparkie_tasks
      WHERE user_id = $1 AND executor = 'ai' AND created_at > NOW() - INTERVAL '7 days'
    `, [userId])
    const autoRow = autoRes.rows[0] ?? { completed: '0', failed: '0' }
    const autoTotal = parseInt(autoRow.completed) + parseInt(autoRow.failed)
    const autoScore = autoTotal === 0 ? 70
      : Math.round((parseInt(autoRow.completed) / autoTotal) * 100)
    const autoSignal = autoTotal === 0 ? 'No AI tasks run yet — baseline score'
      : `${autoRow.completed}/${autoTotal} tasks resolved autonomously (7d)`

    // Leg 2: Memory Depth
    const memRes = await query<{ count: string; fresh: string }>(`
      SELECT
        COUNT(*) AS count,
        COUNT(*) FILTER (WHERE updated_at > NOW() - INTERVAL '3 days') AS fresh
      FROM sparkie_memories WHERE user_id = $1
    `, [userId]).catch(() => ({ rows: [{ count: '0', fresh: '0' }] }))
    const memRow = memRes.rows[0] ?? { count: '0', fresh: '0' }
    const memCount = parseInt(memRow.count)
    const memFresh = parseInt(memRow.fresh)
    const memBase = Math.min(100, Math.round((memCount / 50) * 80))
    const freshBonus = memCount > 0 ? Math.round((memFresh / memCount) * 20) : 0
    const memScore = Math.min(100, memBase + freshBonus)
    const memSignal = memCount === 0 ? 'No memories stored yet — use Sparkie more to build memory depth'
      : `${memCount} memories, ${memFresh} updated in last 3 days`

    // Leg 3: Proactive Agency
    const proRes = await query<{ proactive: string; total: string }>(`
      SELECT
        COUNT(*) FILTER (WHERE decision_type = 'proactive') AS proactive,
        COUNT(*) AS total
      FROM sparkie_worklog
      WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days'
    `, [userId]).catch(() => ({ rows: [{ proactive: '0', total: '0' }] }))
    const proRow = proRes.rows[0] ?? { proactive: '0', total: '0' }
    const proTotal = parseInt(proRow.total)
    const proActive = parseInt(proRow.proactive)
    const proScore = proTotal < 5 ? 60
      : Math.min(100, Math.round((proActive / proTotal) * 250))
    const proSignal = proTotal < 5 ? 'Not enough worklog history yet'
      : `${proActive} proactive actions out of ${proTotal} total (7d)`

    // Leg 4: Security / HITL coverage
    const secRes = await query<{ approved: string; total: string }>(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'completed') AS approved,
        COUNT(*) AS total
      FROM sparkie_tasks
      WHERE user_id = $1 AND executor = 'human' AND created_at > NOW() - INTERVAL '30 days'
    `, [userId])
    const secRow = secRes.rows[0] ?? { approved: '0', total: '0' }
    const secTotal = parseInt(secRow.total)
    const secApproved = parseInt(secRow.approved)
    const secScore = secTotal === 0 ? 50
      : Math.min(100, 70 + Math.round((secApproved / secTotal) * 30))
    const secSignal = secTotal === 0 ? 'No HITL tasks in 30d — irreversible actions may not be gated'
      : `${secApproved}/${secTotal} gated actions approved by you (30d)`

    const legs: RealLeg[] = [
      { id: 'autonomous', label: 'Autonomous Resolution', score: autoScore, signal: autoSignal, trend: autoScore >= 75 ? 'up' : autoScore >= 50 ? 'stable' : 'down' },
      { id: 'memory',     label: 'Memory Depth',         score: memScore,  signal: memSignal,  trend: memScore >= 60 ? 'up' : 'stable' },
      { id: 'proactive',  label: 'Proactive Agency',     score: proScore,  signal: proSignal,  trend: proScore >= 60 ? 'up' : 'stable' },
      { id: 'security',   label: 'Security (HITL)',      score: secScore,  signal: secSignal,  trend: secScore >= 70 ? 'up' : 'stable' },
    ]
    const total = Math.round(
      Math.pow(legs.reduce((p, l) => p * Math.max(l.score, 1), 1), 1 / legs.length)
    )

    return NextResponse.json({ total, legs, computed_at: new Date().toISOString() } satisfies RealScoreResponse)
  } catch (e) {
    console.error('[real-score] error:', e)
    return NextResponse.json({ error: 'Failed to compute REAL score' }, { status: 500 })
  }
}
