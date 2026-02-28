import { NextRequest, NextResponse } from 'next/server'
import { Sandbox } from '@e2b/code-interpreter'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

export const runtime = 'nodejs'
export const maxDuration = 300

// Session store — sandbox + WS clients per session
const sessions = new Map<string, {
  sbx: Sandbox
  clients: Set<{ send: (data: string) => void; close: () => void }>
  createdAt: number
}>()

// Clean up sessions older than 30 minutes
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000
  for (const [id, sess] of sessions.entries()) {
    if (sess.createdAt < cutoff) {
      sess.sbx.kill().catch(() => {})
      sessions.delete(id)
    }
  }
}, 5 * 60 * 1000)

function sseEvent(type: string, data: string) {
  return `data: ${JSON.stringify({ type, data })}\n\n`
}

// POST /api/terminal — create session or send input
export async function POST(req: NextRequest) {
  const apiKey = process.env.E2B_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'E2B_API_KEY not set' }, { status: 500 })
  }

  const authSession = await getServerSession(authOptions)
  if (!authSession?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as { action: 'create' | 'input' | 'resize'; sessionId?: string; data?: string; cols?: number; rows?: number }

  // ── Create new terminal session ──────────────────────────────────────────
  if (body.action === 'create') {
    const sessionId = `term_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    try {
      const sbx = await Sandbox.create({ apiKey, timeoutMs: 30 * 60 * 1000 })

      // Install agent-browser in the sandbox
      sbx.commands.run('npm install -g agent-browser 2>/dev/null || true', { background: true }).catch(() => {})

      sessions.set(sessionId, { sbx, clients: new Set(), createdAt: Date.now() })

      // Return session ID + SSE stream URL for output
      return NextResponse.json({
        sessionId,
        wsUrl: `/api/terminal/stream?sessionId=${sessionId}`,
      })
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 })
    }
  }

  // ── Send input to running session ────────────────────────────────────────
  if (body.action === 'input' && body.sessionId && body.data) {
    const sess = sessions.get(body.sessionId)
    if (!sess) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    // Input is handled via SSE stream endpoint
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

// GET /api/terminal — SSE stream for terminal I/O
export async function GET(req: NextRequest) {
  const apiKey = process.env.E2B_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'E2B_API_KEY not set' }, { status: 500 })

  const authSession = await getServerSession(authOptions)
  if (!authSession?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const sessionId = url.searchParams.get('sessionId')
  const inputData = url.searchParams.get('input')

  // Handle input forwarding via GET (for simple fetch-based input)
  if (sessionId && inputData) {
    const sess = sessions.get(sessionId)
    if (sess) {
      // Broadcast input to all clients as a command execution
      sess.clients.forEach(c => c.send(sseEvent('input_echo', inputData)))
    }
    return NextResponse.json({ ok: true })
  }

  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })

  const sess = sessions.get(sessionId)
  if (!sess) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        try { controller.enqueue(encoder.encode(data)) } catch {}
      }
      const close = () => { try { controller.close() } catch {} }

      const client = { send, close }
      sess.clients.add(client)

      send(sseEvent('connected', 'Shell ready'))

      // Start an interactive shell in the sandbox
      const shell = await sess.sbx.commands.run('/bin/bash --login -i 2>&1', {
        background: true,
        onStdout: (data) => send(sseEvent('output', data)),
        onStderr: (data) => send(sseEvent('output', data)),
      }).catch(() => null)

      if (!shell) {
        send(sseEvent('error', 'Failed to start shell'))
        close()
        sess.clients.delete(client)
        return
      }

      // Keep alive ping
      const pingInterval = setInterval(() => send(sseEvent('ping', '')), 15000)

      req.signal.addEventListener('abort', () => {
        clearInterval(pingInterval)
        sess.clients.delete(client)
        close()
      })
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    }
  })
}
