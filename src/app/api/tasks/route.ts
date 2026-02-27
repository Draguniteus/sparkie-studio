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
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
  )`)
  await query(`CREATE INDEX IF NOT EXISTS idx_sparkie_tasks_user ON sparkie_tasks(user_id, status)`)
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

// GET /api/tasks?id=xxx — get task status
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user as { id?: string } | undefined)?.id
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await ensureTable()
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const res = await query<{ id: string; status: string; action: string; label: string; payload: unknown }>(
      `SELECT id, status, action, label, payload FROM sparkie_tasks WHERE id = $1 AND user_id = $2`,
      [id, userId]
    )
    if (res.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(res.rows[0])
  } catch (e) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// PATCH /api/tasks — respond to a task (approve/reject)
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user as { id?: string } | undefined)?.id
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await ensureTable()
    const { id, status } = await req.json() as { id: string; status: 'approved' | 'rejected' }
    if (!id || !['approved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const res = await query(
      `UPDATE sparkie_tasks SET status = $1, resolved_at = NOW()
       WHERE id = $2 AND user_id = $3 AND status = 'pending'
       RETURNING id, status, action, label, payload`,
      [status, id, userId]
    )
    if (res.rows.length === 0) return NextResponse.json({ error: 'Task not found or already resolved' }, { status: 404 })
    return NextResponse.json(res.rows[0])
  } catch (e) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
