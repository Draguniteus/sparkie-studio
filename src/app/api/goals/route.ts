import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { createGoal, listGoals, updateGoalProgress, completeGoal } from '@/lib/goalEngine'

export const runtime = 'nodejs'

/**
 * GET /api/goals — List goals (filter by status via ?status=active)
 * POST /api/goals — Create a new goal
 * PATCH /api/goals — Update goal progress/status
 * DELETE /api/goals — Complete/remove a goal
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const status = req.nextUrl.searchParams.get('status') as 'active' | 'blocked' | 'completed' | 'abandoned' | null
  const goals = await listGoals(status ?? undefined)
  return NextResponse.json({ goals })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { title, description, type, priority, successCriteria, checkEveryNSessions } = await req.json() as {
    title: string
    description?: string
    type?: 'fix' | 'build' | 'monitor' | 'learn' | 'relationship'
    priority?: 'P0' | 'P1' | 'P2' | 'P3'
    successCriteria?: string
    checkEveryNSessions?: number
  }

  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

  const id = await createGoal(
    title,
    description ?? '',
    type ?? 'monitor',
    priority ?? 'P2',
    successCriteria ?? '',
    checkEveryNSessions ?? 1
  )
  return NextResponse.json({ ok: true, id })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, progress, status } = await req.json() as {
    id: string
    progress?: string
    status?: 'active' | 'blocked' | 'completed' | 'abandoned'
  }

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  if (progress) {
    await updateGoalProgress(id, progress)
  }
  if (status === 'completed') {
    await completeGoal(id, progress ?? 'Manually completed')
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json() as { id: string }
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  await completeGoal(id, 'Deleted')
  return NextResponse.json({ ok: true })
}
