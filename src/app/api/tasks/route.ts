import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

export const runtime = 'nodejs'

async function ensureTable() {
  await query(`CREATE TABLE IF NOT EXISTS sparkie_tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    label TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending',
    executor TEXT NOT NULL DEFAULT 'human',
    trigger_type TEXT DEFAULT 'manual',
    trigger_config JSONB DEFAULT '{}',
    scheduled_at TIMESTAMPTZ,
    why_human TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
  )`)
  await query(`CREATE INDEX IF NOT EXISTS idx_sparkie_tasks_user ON sparkie_tasks(user_id, status)`)
  // Add missing columns to existing tables gracefully
  await query(`ALTER TABLE sparkie_tasks ADD COLUMN IF NOT EXISTS executor TEXT NOT NULL DEFAULT 'human'`).catch(() => {})
  await query(`ALTER TABLE sparkie_tasks ADD COLUMN IF NOT EXISTS trigger_type TEXT DEFAULT 'manual'`).catch(() => {})
  await query(`ALTER TABLE sparkie_tasks ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ`).catch(() => {})
}

// POST /api/tasks — create a new pending task
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user as { id?: string } | undefined)?.id
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await ensureTable()
    const { id, action, label, payload } = await req.json() as {
      id: string; action: string; label: string; payload: Record<string, unknown>
    }
    if (!id || !action || !label) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

    await query(
      `INSERT INTO sparkie_tasks (id, user_id, action, label, payload, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       ON CONFLICT (id) DO NOTHING`,
      [id, userId, action, label, JSON.stringify(payload)]
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('tasks POST error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// GET /api/tasks?id=xxx — get single task
// GET /api/tasks?status=all|pending&limit=N — list tasks for TaskQueuePanel
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user as { id?: string } | undefined)?.id
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await ensureTable()
    const id = req.nextUrl.searchParams.get('id')
    const statusFilter = req.nextUrl.searchParams.get('status')
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '30'), 100)

    // Single task lookup
    if (id) {
      const res = await query<{ id: string; status: string; action: string; label: string; payload: unknown }>(
        `SELECT id, status, action, label, payload FROM sparkie_tasks WHERE id = $1 AND user_id = $2`,
        [id, userId]
      )
      if (res.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json(res.rows[0])
    }

    // List tasks for queue panel
    let whereClause = 'user_id = $1'
    const params: unknown[] = [userId]

    if (statusFilter && statusFilter !== 'all') {
      whereClause += ' AND status = $2'
      params.push(statusFilter)
    } else {
      // Default: show recent tasks (all statuses, last 7 days)
      whereClause += ` AND created_at > NOW() - INTERVAL '7 days'`
    }

    const res = await query(
      `SELECT id, label, action, status, executor, trigger_type, scheduled_at, created_at, resolved_at, payload
       FROM sparkie_tasks WHERE ${whereClause}
       ORDER BY
         CASE status WHEN 'pending' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
         created_at DESC
       LIMIT $${params.length + 1}`,
      [...params, limit]
    )

    return NextResponse.json({ tasks: res.rows })
  } catch (e) {
    console.error('tasks GET error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// PATCH /api/tasks — respond to a task (approve/reject) or update status
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user as { id?: string } | undefined)?.id
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await ensureTable()
    const { id, status } = await req.json() as { id: string; status: string }
    if (!id || !status) return NextResponse.json({ error: 'Missing id or status' }, { status: 400 })

    const validStatuses = ['approved', 'rejected', 'completed', 'failed', 'skipped', 'pending']
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    // Map approved → completed for human tasks
    const resolvedStatus = status === 'approved' ? 'completed' : status === 'rejected' ? 'skipped' : status
    const setResolved = ['completed', 'skipped', 'failed'].includes(resolvedStatus)

    await query(
      `UPDATE sparkie_tasks SET status = $1 ${setResolved ? ', resolved_at = NOW()' : ''}
       WHERE id = $2 AND user_id = $3`,
      [resolvedStatus, id, userId]
    )

    return NextResponse.json({ ok: true, status: resolvedStatus })
  } catch (e) {
    console.error('tasks PATCH error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
