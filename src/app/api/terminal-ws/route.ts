import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

// WebSocket upgrades for this path are handled by the custom Node server (server.js).
// This route exists only to satisfy Next.js App Router static analysis.
// Regular HTTP requests receive 426 Upgrade Required.
export async function GET(_req: NextRequest) {
  return new NextResponse('WebSocket upgrade required', {
    status: 426,
    headers: { 'Upgrade': 'websocket' },
  })
}
