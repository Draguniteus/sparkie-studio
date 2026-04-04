// WebSocket endpoint — actual handling is done by server.js (Node HTTP server)
// This file exists so Next.js routing doesn't 404 this path.
// WebSocket upgrades are handled by the Node HTTP server in server.js.
import { NextResponse } from 'next/server'
export async function GET() {
  return new NextResponse('WebSocket endpoint — connect via WS at /api/proactive-ws', { status: 426 })
}
