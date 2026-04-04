import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

export const runtime = 'nodejs'

/**
 * POST /api/cards — Route a card action to the appropriate handler.
 * Called by the frontend when a SparkieCard button is clicked.
 *
 * Body: { actionId: string, cardType: string, metadata?: Record<string, unknown> }
 *
 * For email_draft/calendar_event: routes to /api/tasks PATCH (existing HITL flow)
 * For cta: opens URL
 * For a2ui: routes to specified thread URL
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string })?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { actionId, cardType, metadata } = await req.json() as {
    actionId: string
    cardType: string
    metadata?: Record<string, unknown>
  }

  // email_draft or calendar_event: call /api/tasks to execute the HITL action
  if (cardType === 'email_draft' || cardType === 'calendar_event') {
    const taskId = metadata?.taskId as string | undefined
    if (!taskId) return NextResponse.json({ error: 'taskId required in metadata' }, { status: 400 })
    try {
      const res = await fetch(req.nextUrl.origin + '/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') ?? '' },
        body: JSON.stringify({ task_id: taskId, status: 'completed' }),
      })
      const data = await res.json()
      return NextResponse.json({ ok: true, result: data })
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 })
    }
  }

  // cta: open URL
  if (cardType === 'cta') {
    const url = metadata?.url as string | undefined
    if (url) {
      return NextResponse.json({ ok: true, action: 'open_url', url })
    }
    return NextResponse.json({ error: 'url required in metadata for cta actions' }, { status: 400 })
  }

  // a2ui: route to thread URL
  if (cardType === 'a2ui') {
    const threadUrl = metadata?.threadUrl as string | undefined
    if (threadUrl) {
      return NextResponse.json({ ok: true, action: 'route_to_thread', threadUrl })
    }
    return NextResponse.json({ error: 'threadUrl required in metadata for a2ui actions' }, { status: 400 })
  }

  return NextResponse.json({ error: 'Unknown card type or action' }, { status: 400 })
}
