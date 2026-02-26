import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

export const runtime = 'nodejs'
export const maxDuration = 30

const COMPOSIO_BASE = 'https://backend.composio.dev/api/v1'

function composioHeaders() {
  return {
    'x-api-key': process.env.COMPOSIO_API_KEY ?? '',
    'Content-Type': 'application/json',
  }
}

// POST /api/connectors/action
// body: { actionSlug: 'GMAIL_SEND_EMAIL', input: { to, subject, body } }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { actionSlug, input } = await req.json() as { actionSlug: string; input: Record<string, unknown> }
  if (!actionSlug) return NextResponse.json({ error: 'actionSlug required' }, { status: 400 })

  const entityId = `sparkie_user_${userId}`

  const res = await fetch(`${COMPOSIO_BASE}/actions/execute/${actionSlug}`, {
    method: 'POST',
    headers: composioHeaders(),
    body: JSON.stringify({ entityId, input: input ?? {} }),
    signal: AbortSignal.timeout(25000),
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: `Action failed: ${res.status}`, detail: text }, { status: 500 })
  }

  const data = await res.json()
  return NextResponse.json(data)
}
