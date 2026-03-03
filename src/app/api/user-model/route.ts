import { NextRequest, NextResponse } from 'next/server'
import { getUserModel, ingestSessionSignal, computeUserModel } from '@/lib/userModel'

// GET /api/user-model?userId=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId') ?? ''
  if (!userId) return NextResponse.json({ model: null, error: 'userId required' })
  const model = await getUserModel(userId)
  return NextResponse.json({ model })
}

// POST /api/user-model — ingest a session signal or trigger compute
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      userId: string
      action: 'ingest' | 'compute'
      signal?: {
        hourOfDay: number
        responseTimeMs?: number
        isFollowUp: boolean
        satisfactionWord?: string
        messageLength: number
        usedTools: boolean
      }
    }
    if (!body.userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
    if (body.action === 'compute') {
      await computeUserModel(body.userId)
      return NextResponse.json({ ok: true, action: 'computed' })
    }
    if (body.action === 'ingest' && body.signal) {
      await ingestSessionSignal(body.userId, body.signal)
      return NextResponse.json({ ok: true, action: 'ingested' })
    }
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
