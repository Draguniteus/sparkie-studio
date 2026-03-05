import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

// NOTE: must be nodejs runtime to use pg (no edge)
export const runtime = 'nodejs'

export async function GET() {
  const start = Date.now()
  let dbOk = false
  let dbMs = -1
  let dbError: string | null = null

  try {
    const dbStart = Date.now()
    await query('SELECT 1')
    dbMs = Date.now() - dbStart
    dbOk = true
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err)
  }

  const status = dbOk ? 200 : 503
  return NextResponse.json(
    {
      ok: dbOk,
      t: Date.now(),
      uptime_ms: Date.now() - start,
      db: { ok: dbOk, latency_ms: dbMs, error: dbError },
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? 'unknown',
    },
    { status }
  )
}
