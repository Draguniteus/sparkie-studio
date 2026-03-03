import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import {
  ensureDeferredIntentsSchema,
  loadReadyDeferredIntents,
  markDeferredIntentSurfaced,
  saveDeferredIntent,
} from '@/lib/timeModel'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response('Unauthorized', { status: 401 })
  const userId = (session.user as { id?: string }).id ?? session.user.email ?? ''
  if (!userId) return new Response('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('mode') ?? 'ready'

  try {
    await ensureDeferredIntentsSchema()

    if (mode === 'all') {
      const res = await query(
        `SELECT * FROM sparkie_deferred_intents WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [userId]
      )
      return Response.json({ intents: res.rows })
    }

    // Default: only ready ones
    const intents = await loadReadyDeferredIntents(userId)
    return Response.json({ intents })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response('Unauthorized', { status: 401 })
  const userId = (session.user as { id?: string }).id ?? session.user.email ?? ''
  if (!userId) return new Response('Unauthorized', { status: 401 })

  try {
    const { intent, sourceMsg, notBefore, dueAt } = await req.json()
    if (!intent) return Response.json({ error: 'intent required' }, { status: 400 })

    await saveDeferredIntent(
      userId,
      intent,
      sourceMsg ?? '',
      notBefore ? new Date(notBefore) : new Date(),
      dueAt ? new Date(dueAt) : null
    )
    return Response.json({ success: true })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response('Unauthorized', { status: 401 })
  const userId = (session.user as { id?: string }).id ?? session.user.email ?? ''
  if (!userId) return new Response('Unauthorized', { status: 401 })

  try {
    const { id, status } = await req.json()
    if (!id || !status) return Response.json({ error: 'id and status required' }, { status: 400 })

    const allowed = ['pending', 'surfaced', 'completed', 'dismissed']
    if (!allowed.includes(status)) return Response.json({ error: 'invalid status' }, { status: 400 })

    if (status === 'surfaced') {
      await markDeferredIntentSurfaced(id)
    } else {
      await query(
        `UPDATE sparkie_deferred_intents SET status = $1 WHERE id = $2 AND user_id = $3`,
        [status, id, userId]
      )
    }
    return Response.json({ success: true })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
