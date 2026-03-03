import { NextRequest, NextResponse } from 'next/server'
import { saveAttempt, getAttempts, AttemptType } from '@/lib/attemptHistory'

// GET /api/attempt-history?userId=...&domain=...&limit=5
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId') ?? ''
  const domain = searchParams.get('domain') ?? ''
  const limit = parseInt(searchParams.get('limit') ?? '5')
  if (!userId) return NextResponse.json({ attempts: [], error: 'userId required' })
  const attempts = await getAttempts(userId, domain, limit)
  return NextResponse.json({ attempts })
}

// POST /api/attempt-history
// Body: { userId, domain, attemptType, summary, outcome, lesson, ttlDays? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      userId: string
      domain: string
      attemptType: AttemptType
      summary: string
      outcome: string
      lesson: string
      ttlDays?: number
    }
    const { userId, domain, attemptType, summary, outcome, lesson, ttlDays } = body
    if (!userId || !domain || !summary || !outcome || !lesson) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    await saveAttempt(userId, domain, attemptType ?? 'failure', summary, outcome, lesson, ttlDays)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
