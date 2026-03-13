import { NextRequest, NextResponse } from 'next/server'
import { sessions } from '@/lib/terminalSessions'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('sessionId')

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
  }

  const sess = sessions.get(sessionId)
  if (!sess) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  return NextResponse.json({
    logs: sess.logBuffer ?? [],
    previewUrl: sess.previewSent ? sess.previewUrl : null,
    buildDone: sess.buildDone ?? false,
  })
}
