import { NextRequest, NextResponse } from 'next/server'
import { Sandbox } from '@e2b/code-interpreter'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

export const runtime = 'nodejs'
export const maxDuration = 300

// Session store — sandbox + PTY pid + SSE clients per session
const sessions = new Map<string, {
  sbx: Sandbox
  ptyPid: number | null
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

// POST /api/terminal — create session, send input, or resize
export async function POST(req: NextRequest) {
  const apiKey = process.env.E2B_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'E2B_API_KEY not set' }, { status: 500 })
  }

  const authSession = await getServerSession(authOptions)
  if (!authSession?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as {
    action: 'create' | 'input' | 'resize' | 'sync-files'
    sessionId?: string
    data?: string
    cols?: number
    rows?: number
  }

  // Create new terminal session
  if (body.action === 'create') {
    const sessionId = `term_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    try {
      const sbx = await Sandbox.create({ apiKey, timeoutMs: 30 * 60 * 1000 })

      // Write project files into the sandbox before the shell starts.
      // Files arrive as { name, content } pairs; they are written under
      // /home/user/<projectRoot>/ where projectRoot is derived from the
      // first path that contains a '/' separator (e.g. "sparkie" from
      // "sparkie/src/App.tsx"), or "project" if all files are at the root.
      const files = (body as typeof body & { files?: { name: string; content: string }[] }).files ?? []
      if (files.length > 0) {
        // Derive project root from first file that has a path separator
        const firstNested = files.find(f => f.name.includes('/'))
        const projectRoot = firstNested ? firstNested.name.split('/')[0] : 'project'
        await Promise.all(
          files.map(f => {
            // If file.name already starts with projectRoot, use as-is; otherwise prefix it
            const filePath = f.name.startsWith(projectRoot + '/')
              ? `/home/user/${f.name}`
              : `/home/user/${projectRoot}/${f.name}`
            return sbx.files.write(filePath, f.content)
          })
        )
      }

      const sess = {
        sbx,
        ptyPid: null as number | null,
        clients: new Set<{ send: (data: string) => void; close: () => void }>(),
        createdAt: Date.now(),
      }
      sessions.set(sessionId, sess)

      // Create PTY — output broadcasts to all subscribed SSE clients
      // Rolling buffer for server URL detection — PTY output is chunked,
      // the URL may arrive split across multiple onData calls.
      let urlScanBuf = ''
      let serverUrlBroadcast = false

      const pty = await sbx.pty.create({
        onData: (data: Uint8Array) => {
          const text = Buffer.from(data).toString('utf-8')
          sess.clients.forEach(c => c.send(sseEvent('output', text)))

          // Detect when Vite (or any dev server) prints its local URL.
          // Use sbx.getHost(port) to get the public E2B proxy URL.
          if (!serverUrlBroadcast) {
            urlScanBuf = (urlScanBuf + text).slice(-400)
            const portMatch = urlScanBuf.match(/localhost:([0-9]{2,5})/)
                           ?? urlScanBuf.match(/127\.0\.0\.1:([0-9]{2,5})/)
            if (portMatch) {
              const port = parseInt(portMatch[1], 10)
              serverUrlBroadcast = true
              urlScanBuf = ''
              try {
                const publicHost = sbx.getHost(port)
                const publicUrl = `https://${publicHost}`
                sess.clients.forEach(c => c.send(sseEvent('server-url', publicUrl)))
              } catch (e) {
                // getHost failed — fall back to a best-guess URL format
                const sandboxId = (sbx as unknown as { sandboxId?: string }).sandboxId ?? ''
                if (sandboxId) {
                  const publicUrl = `https://${port}-${sandboxId}.e2b.app`
                  sess.clients.forEach(c => c.send(sseEvent('server-url', publicUrl)))
                }
              }
            }
          }
        },
        cols: 80,
        rows: 24,
        timeoutMs: 0,
      })

      sess.ptyPid = pty.pid

      return NextResponse.json({
        sessionId,
        wsUrl: `/api/terminal?sessionId=${sessionId}`,
      })
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 })
    }
  }

  // Send input to running session
  if (body.action === 'input' && body.sessionId && body.data) {
    const sess = sessions.get(body.sessionId)
    if (!sess) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    if (sess.ptyPid === null) return NextResponse.json({ error: 'Terminal not ready' }, { status: 503 })
    try {
      await sess.sbx.pty.sendInput(sess.ptyPid, Buffer.from(body.data, 'utf-8'))
    } catch (_) { /* ignore */ }
    return NextResponse.json({ ok: true })
  }

  // Resize terminal
  if (body.action === 'resize' && body.sessionId && body.cols && body.rows) {
    const sess = sessions.get(body.sessionId)
    if (!sess) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    if (sess.ptyPid === null) return NextResponse.json({ ok: true })
    try {
      await sess.sbx.pty.resize(sess.ptyPid, { cols: body.cols, rows: body.rows })
    } catch (_) { /* ignore */ }
    return NextResponse.json({ ok: true })
  }

  // Sync files into an existing session sandbox (called just before firing run command)
  if (body.action === 'sync-files' && body.sessionId) {
    const sess = sessions.get(body.sessionId)
    if (!sess) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    const files = (body as typeof body & { files?: { name: string; content: string }[] }).files ?? []
    if (files.length > 0) {
      const firstNested = files.find(f => f.name.includes('/'))
      const projectRoot = firstNested ? firstNested.name.split('/')[0] : 'project'
      await Promise.all(
        files.map(f => {
          const filePath = f.name.startsWith(projectRoot + '/')
            ? `/home/user/${f.name}`
            : `/home/user/${projectRoot}/${f.name}`
          return sess.sbx.files.write(filePath, f.content)
        })
      )
    }
    return NextResponse.json({ ok: true, synced: files.length })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

// GET /api/terminal — SSE stream; client subscribes to PTY output broadcast
// No shell spawned here — PTY already running from POST create.
// This is pure pub/sub: add client to broadcast set, stream PTY output.
export async function GET(req: NextRequest) {
  const apiKey = process.env.E2B_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'E2B_API_KEY not set' }, { status: 500 })

  const authSession = await getServerSession(authOptions)
  if (!authSession?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const sessionId = url.searchParams.get('sessionId')

  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })

  const sess = sessions.get(sessionId)
  if (!sess) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => {
        try { controller.enqueue(encoder.encode(data)) } catch {}
      }
      const close = () => { try { controller.close() } catch {} }

      const client = { send, close }
      sess.clients.add(client)

      // Immediately signal connected — PTY is already running
      send(sseEvent('connected', 'Shell ready'))

      // Keep-alive ping every 15s
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
